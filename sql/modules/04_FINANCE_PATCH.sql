-- AZALAS SPORT V2: HOÁ ĐƠN + HÀNG TRẢ
BEGIN;

-- Override V2: allow only APPROVED, unused return slips as invoice credit.
CREATE OR REPLACE FUNCTION public.az_invoice_set_payments(
  p_invoice_id bigint,p_payments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE; v_row jsonb;
  v_method text; v_amount numeric(18,2); v_date date; v_reason text;
  v_n integer:=0; v_extras numeric(18,2):=0; v_paid numeric(18,2):=0;
  v_due numeric(18,2); v_return public.return_slips%ROWTYPE; v_return_total numeric(18,2); v_slip_id bigint; v_seen bigint[] := ARRAY[]::bigint[];
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
    IF v_method NOT IN ('CHUYEN_KHOAN','TIEN_MAT','CONG_THEM','HANG_TRA') OR v_method IS NULL THEN
      RAISE EXCEPTION 'Phuong thuc dong % khong hop le',v_n;
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
    IF v_method='HANG_TRA' THEN
      IF coalesce(v_row->>'return_slip_id','') !~ '^[0-9]{1,18}$' THEN
        RAISE EXCEPTION 'Hang tra phai chon phieu da duyet';
      END IF;
      v_slip_id:=(v_row->>'return_slip_id')::bigint;
      IF v_slip_id=ANY(v_seen) THEN RAISE EXCEPTION 'Khong dung mot phieu tra hai lan'; END IF;
      v_seen:=array_append(v_seen,v_slip_id);
      SELECT * INTO v_return FROM public.return_slips WHERE id=v_slip_id FOR UPDATE;
      IF NOT FOUND OR v_return.status<>'DA_DUYET' OR v_return.customer_id<>v_invoice.customer_id OR v_return.applied_invoice_id IS NOT NULL THEN
        RAISE EXCEPTION 'Phieu tra khong hop le/da duoc can tru';
      END IF;
      SELECT COALESCE(SUM(line_total),0) INTO v_return_total FROM public.return_items WHERE slip_id=v_slip_id;
      IF v_return_total<>v_amount OR v_amount<=0 THEN RAISE EXCEPTION 'So tien hang tra phai bang tong phieu da duyet'; END IF;
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
      invoice_id,payment_date,method,amount,reason,created_by,return_slip_id
    ) VALUES (
      p_invoice_id,(v_row->>'payment_date')::date,v_row->>'method',
      (v_row->>'amount')::numeric(18,2),NULLIF(BTRIM(COALESCE(v_row->>'reason','')),''),auth.uid(),
      CASE WHEN v_row->>'method'='HANG_TRA' THEN (v_row->>'return_slip_id')::bigint ELSE NULL END
    );
  END LOOP;
  UPDATE public.invoices SET draft_updated_at=clock_timestamp()
  WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,'subtotal',v_invoice.subtotal,
    'old_debt',v_invoice.old_debt_snapshot,'extras',v_extras,'paid',v_paid,
    'remaining',v_due-v_paid);
END $fn$;


-- Override V2: finalize only when image exists and return credits can be committed atomically.
CREATE OR REPLACE FUNCTION public.az_invoice_finalize(
  p_invoice_id bigint,p_image_path text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE; v_image_at timestamptz;
  v_balance numeric(18,2); v_actual numeric(18,2);
  v_extras numeric(18,2); v_paid numeric(18,2);
  v_credit record;v_return public.return_slips%ROWTYPE;v_return_total numeric(18,2);
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
  -- Hold each return slip until commit, require approved and unconsumed credit.
  FOR v_credit IN SELECT return_slip_id,amount FROM public.invoice_payments
    WHERE invoice_id=p_invoice_id AND method='HANG_TRA' ORDER BY return_slip_id LOOP
    SELECT * INTO v_return FROM public.return_slips WHERE id=v_credit.return_slip_id FOR UPDATE;
    SELECT COALESCE(SUM(line_total),0) INTO v_return_total FROM public.return_items WHERE slip_id=v_credit.return_slip_id;
    IF NOT FOUND OR v_return.status<>'DA_DUYET' OR v_return.customer_id<>v_invoice.customer_id
      OR v_return.applied_invoice_id IS NOT NULL OR v_credit.amount<>v_return_total THEN
      RAISE EXCEPTION 'Phieu hang tra khong con hop le';
    END IF;
  END LOOP;
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
  UPDATE public.return_slips SET applied_invoice_id=p_invoice_id
  WHERE id IN (SELECT return_slip_id FROM public.invoice_payments
    WHERE invoice_id=p_invoice_id AND method='HANG_TRA');
  UPDATE public.invoices
  SET status='DA_GUI',invoice_image_path=p_image_path,
      finalized_at=clock_timestamp(),finalized_by=auth.uid()
  WHERE id=p_invoice_id;
  RETURN jsonb_build_object('invoice_id',p_invoice_id,
    'invoice_code',v_invoice.invoice_code,'status','DA_GUI','image_path',p_image_path,
    'remaining',v_invoice.subtotal+v_balance+v_extras-v_paid);
END $fn$;



-- Restore draft lines from packed order(s). Used by the RESET button before capture.
CREATE FUNCTION public.az_invoice_reset_draft(p_invoice_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.invoices%ROWTYPE;v_subtotal numeric(18,2);v_old numeric(18,2);
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'CHUA_CHOT' THEN RAISE EXCEPTION 'Chi reset ban nhap'; END IF;
 PERFORM 1 FROM public.az_customers WHERE id=v.customer_id FOR UPDATE;
 v_old:=public.az_customer_balance(v.customer_id);
 DELETE FROM public.invoice_payments WHERE invoice_id=p_invoice_id;
 DELETE FROM public.invoice_lines WHERE invoice_id=p_invoice_id;
 INSERT INTO public.invoice_lines(invoice_id,source_item_id,product_name,color,size,quantity,unit_price)
 SELECT p_invoice_id,i.id,i.product_name,i.color,i.size,i.quantity,i.unit_price FROM public.order_items i
 JOIN public.invoice_order_links l ON l.unit_id=i.unit_id WHERE l.invoice_id=p_invoice_id ORDER BY i.unit_id,i.line_no;
 SELECT COALESCE(SUM(line_total),0) INTO v_subtotal FROM public.invoice_lines WHERE invoice_id=p_invoice_id;
 UPDATE public.invoices SET subtotal=v_subtotal,old_debt_snapshot=v_old,draft_updated_at=clock_timestamp() WHERE id=p_invoice_id;
 RETURN jsonb_build_object('subtotal',v_subtotal,'old_debt',v_old);
END $fn$;

CREATE FUNCTION public.az_invoice_edit_line(p_invoice_id bigint,p_line_id bigint,p_name text,p_quantity integer,p_unit_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.invoices%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen sua hoa don'; END IF;
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'CHUA_CHOT' THEN RAISE EXCEPTION 'Chi sua ban nhap chua chot'; END IF;
 IF nullif(btrim(coalesce(p_name,'')),'') IS NULL OR p_quantity<=0 OR p_unit_price<0 OR p_unit_price IS NULL THEN RAISE EXCEPTION 'Dong hang khong hop le'; END IF;
 UPDATE public.invoice_lines SET product_name=btrim(p_name),quantity=p_quantity,unit_price=p_unit_price WHERE id=p_line_id AND invoice_id=p_invoice_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay dong hang'; END IF;
 UPDATE public.invoices SET subtotal=(SELECT COALESCE(SUM(line_total),0) FROM public.invoice_lines WHERE invoice_id=p_invoice_id),draft_updated_at=clock_timestamp() WHERE id=p_invoice_id;
END $fn$;

-- Soft void finalized invoices WITHOUT collected payments / return credit.
-- Paid invoices need separate accounting reversal, and cannot silently be voided.
CREATE FUNCTION public.az_invoice_void(p_invoice_id bigint,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.invoices%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Can ly do xoa'; END IF;
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'DA_GUI' THEN RAISE EXCEPTION 'Hoa don khong o trang thai da gui'; END IF;
 PERFORM 1 FROM public.az_customers WHERE id=v.customer_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.invoice_payments WHERE invoice_id=p_invoice_id AND method<>'CONG_THEM') THEN
  RAISE EXCEPTION 'Hoa don da co thanh toan/hang tra: phai doi soat truoc khi xoa';
 END IF;
 UPDATE public.invoices SET status='DA_XOA',deleted_at=clock_timestamp(),deleted_by=auth.uid(),note=concat_ws(E'\n',note,'XOA MEM: '||p_reason) WHERE id=p_invoice_id;
END $fn$;

DO $grant$
DECLARE sig text;
BEGIN FOR sig IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND left(p.proname,3)='az_' LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||sig||' FROM PUBLIC, anon';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||sig||' TO authenticated';
 END LOOP; END $grant$;
NOTIFY pgrst,'reload schema';
COMMIT;
