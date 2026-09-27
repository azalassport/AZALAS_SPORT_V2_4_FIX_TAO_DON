-- AZALAS V1 / STEP 5A: NEN TANG HOA DON (TEST)
-- CHI CHAY SAU KHI DA CAI DATABASE V1 (01, 02, 03).
-- KHONG RESET, KHONG DROP BANG DON HANG, KHONG XOA DU LIEU TEST.
-- Chua trien khai HANG TRA duyet, thu no SAU khi chot, sua/xoa hoa don DA_GUI.
-- HANG_TRA khong duoc ghi thanh toan cho toi khi co phieu tra da duyet lien ket.
BEGIN;

-- 1) Bo sung snapshot no cu va thoi diem cap nhat ban nhap cho anh chung tu.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.az_profiles(id);
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS old_debt_snapshot numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE UNIQUE INDEX IF NOT EXISTS az_invoice_image_path_unique_v1
  ON public.invoices(invoice_image_path) WHERE invoice_image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS az_invoice_customer_status_v1
  ON public.invoices(customer_id,status,finalized_at DESC);

-- 2) So du no dang hach toan = tong hoa don DA_GUI + phu thu - thanh toan.
-- Doan nay KHONG tu coi phieu hang tra chua duyet la tien thanh toan.
CREATE OR REPLACE FUNCTION public.az_customer_balance(p_customer_id bigint)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_balance numeric(18,2);
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen xem cong no'; END IF;
  SELECT COALESCE(SUM(i.subtotal + COALESCE((
      SELECT SUM(CASE WHEN p.method='CONG_THEM' THEN p.amount ELSE -p.amount END)
      FROM public.invoice_payments p WHERE p.invoice_id=i.id
    ),0)),0)::numeric(18,2)
    INTO v_balance
  FROM public.invoices i
  WHERE i.customer_id=p_customer_id AND i.status='DA_GUI';
  RETURN COALESCE(v_balance,0);
END $fn$;

-- 3) Danh sach don DA_SOAN CHUA NAM TRONG BAT KY BAN NHAP / HOA DON NAO.
CREATE OR REPLACE FUNCTION public.az_invoice_ready_units()
RETURNS TABLE(
  unit_id bigint, order_code text, customer_id bigint, customer_name text,
  warehouse_name text, completed_at timestamptz, packer_name text,
  subtotal numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT u.id, u.order_code, g.customer_id, g.customer_name,
    COALESCE(w.name,'Khách đặt'), u.completed_at, COALESCE(u.started_by_name,''),
    COALESCE((SELECT SUM(oi.line_total) FROM public.order_items oi WHERE oi.unit_id=u.id),0)
  FROM public.order_units u
  JOIN public.order_groups g ON g.id=u.group_id
  LEFT JOIN public.az_warehouses w ON w.id=u.warehouse_id
  WHERE public.az_is_manager()
    AND u.status='DA_SOAN'
    AND EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.unit_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM public.invoice_order_links l WHERE l.unit_id=u.id)
  ORDER BY u.completed_at ASC NULLS LAST,u.id ASC
  LIMIT 500
$fn$;

-- 4) Chon 1+ don da soan CUNG KHACH, tao chung tu NHAP va dong hoa don SNAPSHOT.
-- De hinh chup hien DUNG ma hoa don, can tao ban nhap truoc khi chup.
CREATE OR REPLACE FUNCTION public.az_invoice_prepare(p_unit_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_ids bigint[]; v_uid bigint; v_unit record;
  v_customer_id bigint := NULL; v_customer_name text;
  v_total numeric(18,2) := 0; v_part numeric(18,2); v_count integer;
  v_day date := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_counter bigint; v_code text; v_invoice_id bigint; v_old numeric(18,2);
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc tao hoa don'; END IF;
  IF p_unit_ids IS NULL OR cardinality(p_unit_ids) NOT BETWEEN 1 AND 20
     OR array_position(p_unit_ids,NULL) IS NOT NULL
  THEN RAISE EXCEPTION 'Chon tu 1 den 20 don hop le'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids FROM unnest(p_unit_ids) AS t(x);
  IF cardinality(v_ids) <> cardinality(p_unit_ids) THEN
    RAISE EXCEPTION 'Danh sach don bi trung';
  END IF;

  -- Khoa cac don theo ID tang dan: ngan hai nguoi dong thoi lap cung mot don.
  FOREACH v_uid IN ARRAY v_ids LOOP
    SELECT u.id,u.status,g.customer_id,g.customer_name INTO v_unit
    FROM public.order_units u JOIN public.order_groups g ON g.id=u.group_id
    WHERE u.id=v_uid FOR UPDATE OF u;
    IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay don ID %',v_uid; END IF;
    IF v_unit.status <> 'DA_SOAN' THEN RAISE EXCEPTION 'Don ID % chua soan xong',v_uid; END IF;
    IF EXISTS(SELECT 1 FROM public.invoice_order_links l WHERE l.unit_id=v_uid) THEN
      RAISE EXCEPTION 'Don ID % da duoc dua vao hoa don; hay mo ban nhap cu',v_uid;
    END IF;
    IF v_customer_id IS NULL THEN
      v_customer_id := v_unit.customer_id;
      v_customer_name := v_unit.customer_name;
    ELSIF v_customer_id <> v_unit.customer_id THEN
      RAISE EXCEPTION 'Khong duoc gop don cua hai khach khac nhau';
    END IF;
    SELECT COUNT(*),COALESCE(SUM(line_total),0)::numeric(18,2)
      INTO v_count,v_part FROM public.order_items WHERE unit_id=v_uid;
    IF v_count=0 THEN RAISE EXCEPTION 'Don ID % chua co hang da soan',v_uid; END IF;
    v_total := v_total+v_part;
  END LOOP;

  v_old := public.az_customer_balance(v_customer_id);
  INSERT INTO public.daily_counters(biz_date,kind,last_no)
    VALUES(v_day,'INVOICE',1)
  ON CONFLICT(biz_date,kind)
    DO UPDATE SET last_no=public.daily_counters.last_no+1
  RETURNING last_no INTO v_counter;
  v_code := 'HD'||to_char(v_day,'DDMMYYYY')||
    CASE WHEN length(v_counter::text)<4 THEN lpad(v_counter::text,4,'0') ELSE v_counter::text END;

  INSERT INTO public.invoices(
    invoice_code,customer_id,customer_name,subtotal,old_debt_snapshot,
    created_by,draft_updated_at
  ) VALUES(v_code,v_customer_id,v_customer_name,v_total,v_old,auth.uid(),clock_timestamp())
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_order_links(invoice_id,unit_id)
  SELECT v_invoice_id,x FROM unnest(v_ids) AS t(x);
  INSERT INTO public.invoice_lines(
    invoice_id,source_item_id,product_name,color,size,quantity,unit_price
  )
  SELECT v_invoice_id,oi.id,oi.product_name,oi.color,oi.size,oi.quantity,oi.unit_price
  FROM public.order_items oi
  WHERE oi.unit_id=ANY(v_ids)
  ORDER BY oi.unit_id,oi.line_no;

  RETURN jsonb_build_object(
    'invoice_id',v_invoice_id,'invoice_code',v_code,
    'subtotal',v_total,'old_debt',v_old,'unit_ids',to_jsonb(v_ids),
    'status','CHUA_CHOT'
  );
END $fn$;

-- 5) Thay TOAN BO thanh toan cua ban nhap; chi hon: TM, CK, Cong them.
-- Hang tra chi duoc dung sau khi co quy trinh duyet va chong su dung trung phieu.
CREATE OR REPLACE FUNCTION public.az_invoice_set_payments(
  p_invoice_id bigint,p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE; v_row jsonb;
  v_method text; v_amount numeric(18,2); v_date date; v_reason text;
  v_n integer:=0; v_extras numeric(18,2):=0; v_paid numeric(18,2):=0;
  v_due numeric(18,2);
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc sua thanh toan'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status<>'CHUA_CHOT' THEN
    RAISE EXCEPTION 'Chi sua duoc hoa don chua chot';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments)<>'array'
     OR jsonb_array_length(p_payments)>30 THEN
    RAISE EXCEPTION 'Danh sach thanh toan khong hop le';
  END IF;
  -- Kiem tra het truoc khi ghi; SQL transaction tu rollback neu mot dong sai.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_n:=v_n+1;
    v_method := v_row->>'method';
    IF v_method NOT IN ('CHUYEN_KHOAN','TIEN_MAT','CONG_THEM') OR v_method IS NULL THEN
      RAISE EXCEPTION 'Phuong thuc dong % chua ho tro; Hang Tra can phieu da duyet',v_n;
    END IF;
    IF (v_row->>'amount') IS NULL OR
       (v_row->>'amount') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'So tien dong % khong hop le',v_n;
    END IF;
    v_amount:=(v_row->>'amount')::numeric(18,2);
    IF v_amount<=0 THEN RAISE EXCEPTION 'So tien phai lon hon 0'; END IF;
    IF (v_row->>'payment_date') IS NULL OR
       (v_row->>'payment_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Ngay thanh toan dong % khong hop le (YYYY-MM-DD)',v_n;
    END IF;
    v_date:=(v_row->>'payment_date')::date;
    IF v_date>(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
      RAISE EXCEPTION 'Khong nhap ngay thanh toan trong tuong lai';
    END IF;
    v_reason:=NULLIF(BTRIM(COALESCE(v_row->>'reason','')),'');
    IF v_method='CONG_THEM' AND v_reason IS NULL THEN
      RAISE EXCEPTION 'Cong them phai co ly do o dong %',v_n;
    END IF;
    IF v_method='CONG_THEM' THEN v_extras:=v_extras+v_amount;
    ELSE v_paid:=v_paid+v_amount; END IF;
  END LOOP;
  v_due:=v_invoice.subtotal+v_invoice.old_debt_snapshot+v_extras;
  IF v_paid>GREATEST(v_due,0) THEN
    RAISE EXCEPTION 'Tong tien da tra vuot so tien phai thanh toan';
  END IF;

  DELETE FROM public.invoice_payments WHERE invoice_id=p_invoice_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.invoice_payments(
      invoice_id,payment_date,method,amount,reason,created_by
    ) VALUES (
      p_invoice_id,(v_row->>'payment_date')::date,v_row->>'method',
      (v_row->>'amount')::numeric(18,2),NULLIF(BTRIM(COALESCE(v_row->>'reason','')),''),auth.uid()
    );
  END LOOP;
  UPDATE public.invoices SET draft_updated_at=clock_timestamp()
  WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,'subtotal',v_invoice.subtotal,
    'old_debt',v_invoice.old_debt_snapshot,'extras',v_extras,'paid',v_paid,
    'remaining',v_due-v_paid);
END $fn$;

-- 6) Neu no cu thay doi sau khi ban nhap duoc tao, lam moi va BAT BUOC CHUP LAI.
CREATE OR REPLACE FUNCTION public.az_invoice_refresh_balance(p_invoice_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_invoice public.invoices%ROWTYPE; v_old numeric(18,2);
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status<>'CHUA_CHOT' THEN
    RAISE EXCEPTION 'Hoa don khong con o trang thai chua chot';
  END IF;
  PERFORM 1 FROM public.az_customers WHERE id=v_invoice.customer_id FOR UPDATE;
  v_old:=public.az_customer_balance(v_invoice.customer_id);
  IF v_old<>v_invoice.old_debt_snapshot THEN
    UPDATE public.invoices SET old_debt_snapshot=v_old,draft_updated_at=clock_timestamp()
      WHERE id=p_invoice_id;
  END IF;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,'old_debt',v_old);
END $fn$;

-- 7) CHOT: khoa hoa don + khach; doi chieu no cu; bat buoc anh PRIVATE da upload.
-- Duong dan anh: <auth.uid>/<invoice_id>/<uuid>.png (tao sau khi co ban nhap).
CREATE OR REPLACE FUNCTION public.az_invoice_finalize(
  p_invoice_id bigint,p_image_path text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE; v_image_at timestamptz;
  v_balance numeric(18,2); v_actual numeric(18,2);
  v_extras numeric(18,2); v_paid numeric(18,2);
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc chot hoa don'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status<>'CHUA_CHOT' THEN
    RAISE EXCEPTION 'Hoa don da chot hoac khong ton tai';
  END IF;
  -- Cung mot khach: hai lan chot dong thoi phai xep hang de no cu khong sai.
  PERFORM 1 FROM public.az_customers WHERE id=v_invoice.customer_id FOR UPDATE;
  v_balance:=public.az_customer_balance(v_invoice.customer_id);
  IF v_balance<>v_invoice.old_debt_snapshot THEN
    RAISE EXCEPTION 'No cu da thay doi. Bam Lam moi no cu va chup lai anh hoa don';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.invoice_order_links WHERE invoice_id=p_invoice_id) THEN
    RAISE EXCEPTION 'Hoa don chua chon don';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoice_order_links l
    JOIN public.order_units u ON u.id=l.unit_id
    WHERE l.invoice_id=p_invoice_id AND u.status<>'DA_SOAN'
  ) THEN RAISE EXCEPTION 'Co don khong con o trang thai da soan'; END IF;
  SELECT COALESCE(SUM(line_total),0)::numeric(18,2) INTO v_actual
    FROM public.invoice_lines WHERE invoice_id=p_invoice_id;
  IF v_actual<>v_invoice.subtotal OR NOT EXISTS(
    SELECT 1 FROM public.invoice_lines WHERE invoice_id=p_invoice_id
  ) THEN RAISE EXCEPTION 'Chi tiet va tong tien hoa don khong khop'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoice_payments WHERE invoice_id=p_invoice_id
    AND method='HANG_TRA') THEN
    RAISE EXCEPTION 'Chua ho tro can tru hang tra neu khong co phieu da duyet';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN method='CONG_THEM' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN method<>'CONG_THEM' THEN amount ELSE 0 END),0)
    INTO v_extras,v_paid
  FROM public.invoice_payments WHERE invoice_id=p_invoice_id;
  IF v_paid>GREATEST(v_invoice.subtotal+v_balance+v_extras,0) THEN
    RAISE EXCEPTION 'Thanh toan vuot tong phai thu';
  END IF;
  IF p_image_path IS NULL OR split_part(p_image_path,'/',1)<>auth.uid()::text OR
     split_part(p_image_path,'/',2)<>p_invoice_id::text OR
     p_image_path !~ '\.png$' THEN
    RAISE EXCEPTION 'Duong dan anh khong thuoc hoa don va nguoi dang chot';
  END IF;
  SELECT o.created_at INTO v_image_at
    FROM storage.objects o
    WHERE o.bucket_id='az-invoice-images' AND o.name=p_image_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anh hoa don chua upload thanh cong'; END IF;
  IF v_image_at<v_invoice.draft_updated_at THEN
    RAISE EXCEPTION 'Anh da cu: thanh toan/no cu da doi. Vui long chup va upload lai';
  END IF;
  IF EXISTS(SELECT 1 FROM public.invoices WHERE invoice_image_path=p_image_path) THEN
    RAISE EXCEPTION 'Anh da duoc dung cho mot hoa don khac';
  END IF;
  UPDATE public.invoices
  SET status='DA_GUI',invoice_image_path=p_image_path,
      finalized_at=clock_timestamp(),finalized_by=auth.uid()
  WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,
    'invoice_code',v_invoice.invoice_code,'status','DA_GUI','image_path',p_image_path,
    'remaining',v_invoice.subtotal+v_balance+v_extras-v_paid);
END $fn$;

-- 8) Huy BAN NHAP chua chot, tra don ve danh sach cho hoa don.
-- File anh upload thu nhung chua chot can don bang Storage API neu khong dung.
CREATE OR REPLACE FUNCTION public.az_invoice_cancel_draft(p_invoice_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_invoice public.invoices%ROWTYPE;
BEGIN
  IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen huy ban nhap'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status<>'CHUA_CHOT' THEN
    RAISE EXCEPTION 'Chi huy duoc ban nhap chua chot';
  END IF;
  DELETE FROM public.invoice_payments WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoice_lines WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoice_order_links WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoices WHERE id=p_invoice_id;
END $fn$;

-- 9) Cap quyen CHI cho authenticated va moi RPC tu kiem tra OWNER/ADMIN.
DO $grants$
DECLARE v_signature text; v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'az_customer_balance','az_invoice_ready_units','az_invoice_prepare',
    'az_invoice_set_payments','az_invoice_refresh_balance',
    'az_invoice_finalize','az_invoice_cancel_draft'
  ] LOOP
    FOR v_signature IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_name
    LOOP
      EXECUTE 'REVOKE ALL ON FUNCTION '||v_signature||' FROM PUBLIC, anon';
      EXECUTE 'GRANT EXECUTE ON FUNCTION '||v_signature||' TO authenticated';
    END LOOP;
  END LOOP;
END $grants$;

NOTIFY pgrst, 'reload schema';
COMMIT;
