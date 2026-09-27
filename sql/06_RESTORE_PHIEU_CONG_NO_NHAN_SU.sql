-- AZALAS SPORT V2.4 — CHỈ NÂNG CẤP, KHÔNG RESET, KHÔNG XÓA ĐƠN/KHÁCH.
-- Chạy trên azalas-test ĐÃ cài 01_CREATE_ALL và 04_UPGRADE_V2_2.
-- Khôi phục phiếu công nợ nhiều dòng và nhân sự 6 nhóm. Chỉ OWNER/ADMIN ghi tài chính/nhân sự.
BEGIN;

-- PHIẾU CÔNG NỢ: một phiếu có nhiều dòng cộng/trừ, không trực tiếp sửa số dư.
CREATE TABLE IF NOT EXISTS public.az_debt_slips (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_key uuid NOT NULL UNIQUE,
 slip_code text UNIQUE,
 customer_id bigint NOT NULL REFERENCES public.az_customers(id),
 old_balance numeric(18,2) NOT NULL,
 new_balance numeric(18,2) NOT NULL,
 total_plus numeric(18,2) NOT NULL CHECK(total_plus>=0),
 total_minus numeric(18,2) NOT NULL CHECK(total_minus>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL REFERENCES public.az_profiles(id)
);
CREATE INDEX IF NOT EXISTS az_debt_slips_customer_idx ON public.az_debt_slips(customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.az_debt_slip_items (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 slip_id bigint NOT NULL REFERENCES public.az_debt_slips(id),
 line_no int NOT NULL CHECK(line_no>0),
 direction text NOT NULL CHECK(direction IN ('PLUS','MINUS')),
 entry_date date NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 note text NOT NULL CHECK(length(btrim(note))>0),
 UNIQUE(slip_id,line_no)
);
CREATE INDEX IF NOT EXISTS az_debt_slip_items_slip_idx ON public.az_debt_slip_items(slip_id);
ALTER TABLE public.az_debt_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_debt_slip_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS az_debt_slips_manager_read ON public.az_debt_slips;
CREATE POLICY az_debt_slips_manager_read ON public.az_debt_slips FOR SELECT TO authenticated USING(public.az_is_manager());
DROP POLICY IF EXISTS az_debt_slip_items_manager_read ON public.az_debt_slip_items;
CREATE POLICY az_debt_slip_items_manager_read ON public.az_debt_slip_items FOR SELECT TO authenticated USING(public.az_is_manager());
GRANT SELECT ON public.az_debt_slips,public.az_debt_slip_items TO authenticated;

-- Tính nợ từ HĐ ĐÃ GỬI và các phiếu công nợ chốt. Không cộng hóa đơn nháp.
CREATE OR REPLACE FUNCTION public.az_customer_balance(p_customer_id bigint)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_invoice numeric(18,2);v_adjust numeric(18,2);
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen xem cong no'; END IF;
 SELECT COALESCE(SUM(i.subtotal+COALESCE((
   SELECT SUM(CASE WHEN p.method='CONG_THEM' THEN p.amount ELSE -p.amount END)
   FROM public.invoice_payments p WHERE p.invoice_id=i.id
 ),0)),0)::numeric(18,2) INTO v_invoice
 FROM public.invoices i WHERE i.customer_id=p_customer_id AND i.status='DA_GUI';
 SELECT COALESCE(SUM(CASE WHEN d.direction='PLUS' THEN d.amount ELSE -d.amount END),0)::numeric(18,2)
 INTO v_adjust FROM public.az_debt_slips s JOIN public.az_debt_slip_items d ON d.slip_id=s.id
 WHERE s.customer_id=p_customer_id;
 RETURN coalesce(v_invoice,0)+coalesce(v_adjust,0);
END $fn$;

CREATE OR REPLACE FUNCTION public.az_create_debt_slip(
 p_customer_id bigint,p_items jsonb,p_request_key uuid,p_expected_balance numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_existing public.az_debt_slips%ROWTYPE;v_id bigint;v_line jsonb;v_no int:=0;
 v_old numeric(18,2);v_plus numeric(18,2):=0;v_minus numeric(18,2):=0;
 v_dir text;v_date date;v_amount numeric(18,2);v_note text;v_code text;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc tao phieu cong no'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Thieu ma thao tac'; END IF;
 SELECT * INTO v_existing FROM public.az_debt_slips WHERE request_key=p_request_key;
 IF FOUND THEN
  IF v_existing.customer_id<>p_customer_id THEN RAISE EXCEPTION 'Ma thao tac da duoc dung'; END IF;
  RETURN jsonb_build_object('id',v_existing.id,'slip_code',v_existing.slip_code,'new_balance',v_existing.new_balance,'already_saved',true);
 END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
  RAISE EXCEPTION 'Phieu phai co 1 den 40 dong'; END IF;
 PERFORM 1 FROM public.az_customers WHERE id=p_customer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay khach'; END IF;
 -- Recheck after row lock: two browser retries with the same key cannot create two slips.
 SELECT * INTO v_existing FROM public.az_debt_slips WHERE request_key=p_request_key;
 IF FOUND THEN
  IF v_existing.customer_id<>p_customer_id THEN RAISE EXCEPTION 'Ma thao tac da duoc dung'; END IF;
  RETURN jsonb_build_object('id',v_existing.id,'slip_code',v_existing.slip_code,'new_balance',v_existing.new_balance,'already_saved',true);
 END IF;
 v_old:=public.az_customer_balance(p_customer_id);
 IF p_expected_balance IS NULL OR v_old<>p_expected_balance THEN
  RAISE EXCEPTION 'No cu da thay doi. Tai lai chi tiet khach, xem truoc va chup lai phieu'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_dir:=v_line->>'direction';v_note:=nullif(btrim(v_line->>'note'),'');
  IF (v_dir IS NULL OR v_dir NOT IN ('PLUS','MINUS')) OR v_note IS NULL OR length(v_note)>500
    OR coalesce(v_line->>'amount','') !~ '^[0-9]{1,14}(\.[0-9]{1,2})?$'
    OR coalesce(v_line->>'entry_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION 'Dong % khong hop le',v_no+1;
  END IF;
  v_date:=(v_line->>'entry_date')::date;
  v_amount:=(v_line->>'amount')::numeric(18,2);
  IF v_amount<=0 OR v_date>(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
   RAISE EXCEPTION 'So tien/ngay khong hop le o dong %',v_no+1; END IF;
  IF v_dir='PLUS' THEN v_plus:=v_plus+v_amount; ELSE v_minus:=v_minus+v_amount; END IF;
  v_no:=v_no+1;
 END LOOP;
 -- Nếu trừ vượt nợ, giữ số dư âm minh bạch = KHÁCH DƯ, không đánh mất tiền khách.
 INSERT INTO public.az_debt_slips(request_key,customer_id,old_balance,new_balance,total_plus,total_minus,created_by)
 VALUES(p_request_key,p_customer_id,v_old,v_old+v_plus-v_minus,v_plus,v_minus,auth.uid()) RETURNING id INTO v_id;
 v_code:='CN'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYMMDD')||lpad(v_id::text,6,'0');
 UPDATE public.az_debt_slips SET slip_code=v_code WHERE id=v_id;
 v_no:=0;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_no:=v_no+1;
  INSERT INTO public.az_debt_slip_items(slip_id,line_no,direction,entry_date,amount,note)
  VALUES(v_id,v_no,v_line->>'direction',(v_line->>'entry_date')::date,(v_line->>'amount')::numeric(18,2),btrim(v_line->>'note'));
 END LOOP;
 RETURN jsonb_build_object('id',v_id,'slip_code',v_code,'old_balance',v_old,
  'new_balance',v_old+v_plus-v_minus,'total_plus',v_plus,'total_minus',v_minus);
END $fn$;

-- Nhân sự: 1 phiếu công / nhân viên / tháng; giá công theo ngày hiệu lực.
CREATE TABLE IF NOT EXISTS public.hr_monthly_attendance (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 month_start date NOT NULL CHECK(extract(day from month_start)=1),
 work_units numeric(8,2) NOT NULL CHECK(work_units>=0 AND work_units<=40),
 overtime_hours numeric(9,2) NOT NULL DEFAULT 0 CHECK(overtime_hours>=0 AND overtime_hours<=500),
 bonus numeric(18,2) NOT NULL DEFAULT 0 CHECK(bonus>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL REFERENCES public.az_profiles(id),
 updated_by uuid REFERENCES public.az_profiles(id),
 UNIQUE(employee_id,month_start)
);
CREATE TABLE IF NOT EXISTS public.hr_rate_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 effective_date date NOT NULL,
 daily_rate numeric(18,2) NOT NULL CHECK(daily_rate>=0),
 overtime_rate numeric(18,2) NOT NULL DEFAULT 30 CHECK(overtime_rate>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL REFERENCES public.az_profiles(id)
);
CREATE INDEX IF NOT EXISTS hr_rate_effective_idx ON public.hr_rate_history(employee_id,effective_date DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.hr_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint REFERENCES public.employees(id),
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 actor_id uuid NOT NULL REFERENCES public.az_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.az_profiles(id);
DO $rls$
DECLARE nm text;
BEGIN
 FOREACH nm IN ARRAY ARRAY['hr_monthly_attendance','hr_rate_history','hr_audit_log'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',nm);
  EXECUTE format('DROP POLICY IF EXISTS az_hr_manager_read ON public.%I',nm);
  EXECUTE format('CREATE POLICY az_hr_manager_read ON public.%I FOR SELECT TO authenticated USING(public.az_is_manager())',nm);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',nm);
 END LOOP;
END $rls$;

CREATE OR REPLACE FUNCTION public.az_hr_create_employee(
 p_name text,p_phone text,p_start date,p_daily_rate numeric,p_overtime_rate numeric DEFAULT 30
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;v_name text:=nullif(btrim(p_name),'');
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc them nhan vien'; END IF;
 IF v_name IS NULL OR length(v_name)>180 OR p_start IS NULL OR p_daily_rate IS NULL OR p_daily_rate<0 OR p_overtime_rate<0 THEN RAISE EXCEPTION 'Thong tin nhan vien khong hop le'; END IF;
 IF EXISTS(SELECT 1 FROM public.employees WHERE lower(full_name)=lower(v_name) AND is_active) THEN RAISE EXCEPTION 'Nhan vien dang lam co trung ten'; END IF;
 INSERT INTO public.employees(full_name,phone,start_date,base_salary) VALUES(v_name,nullif(btrim(p_phone),''),p_start,p_daily_rate) RETURNING id INTO v_id;
 INSERT INTO public.hr_rate_history(employee_id,effective_date,daily_rate,overtime_rate,created_by) VALUES(v_id,p_start,p_daily_rate,p_overtime_rate,auth.uid());
 INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id) VALUES(v_id,'CREATE_EMPLOYEE',jsonb_build_object('name',v_name,'start',p_start,'rate',p_daily_rate),auth.uid());
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.az_hr_set_rate(
 p_employee_id bigint,p_effective_date date,p_daily_rate numeric,p_overtime_rate numeric
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF p_effective_date IS NULL OR p_daily_rate IS NULL OR p_daily_rate<0 OR p_overtime_rate IS NULL OR p_overtime_rate<0 THEN RAISE EXCEPTION 'Gia cong khong hop le'; END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay nhan vien'; END IF;
 INSERT INTO public.hr_rate_history(employee_id,effective_date,daily_rate,overtime_rate,created_by)
 VALUES(p_employee_id,p_effective_date,p_daily_rate,p_overtime_rate,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
 VALUES(p_employee_id,'RATE_CHANGE',jsonb_build_object('effective_date',p_effective_date,'daily_rate',p_daily_rate,'overtime_rate',p_overtime_rate),auth.uid());
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.az_hr_save_month(
 p_employee_id bigint,p_month date,p_units numeric,p_overtime numeric,p_bonus numeric,p_edit boolean DEFAULT false
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;v_old public.hr_monthly_attendance%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF p_month IS NULL OR extract(day from p_month)<>1 OR p_units IS NULL OR p_units<0 OR p_units>40 OR p_overtime<0 OR p_overtime>500 OR p_bonus<0 THEN RAISE EXCEPTION 'Thong tin cham cong khong hop le'; END IF;
 PERFORM 1 FROM public.employees WHERE id=p_employee_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nhan vien khong hoat dong'; END IF;
 SELECT * INTO v_old FROM public.hr_monthly_attendance WHERE employee_id=p_employee_id AND month_start=p_month FOR UPDATE;
 IF p_edit THEN
   IF NOT FOUND THEN RAISE EXCEPTION 'Thang nay chua co phieu cong de sua'; END IF;
   UPDATE public.hr_monthly_attendance SET work_units=p_units,overtime_hours=p_overtime,bonus=p_bonus,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=v_old.id;
   v_id:=v_old.id;
   INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
   VALUES(p_employee_id,'EDIT_ATTENDANCE',jsonb_build_object('month',p_month,'old',to_jsonb(v_old),'new_units',p_units,'new_overtime',p_overtime,'new_bonus',p_bonus),auth.uid());
 ELSE
   IF FOUND THEN RAISE EXCEPTION 'Thang nay da nhap cong, vui long vao Chinh sua'; END IF;
   INSERT INTO public.hr_monthly_attendance(employee_id,month_start,work_units,overtime_hours,bonus,created_by)
   VALUES(p_employee_id,p_month,p_units,p_overtime,p_bonus,auth.uid()) RETURNING id INTO v_id;
   INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
   VALUES(p_employee_id,'CREATE_ATTENDANCE',jsonb_build_object('month',p_month,'units',p_units,'overtime',p_overtime,'bonus',p_bonus),auth.uid());
 END IF;
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.az_hr_create_advance(
 p_employee_id bigint,p_date date,p_amount numeric,p_note text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF p_date IS NULL OR p_amount IS NULL OR p_amount<=0 OR length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'Phieu ung khong hop le'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee_id AND is_active) THEN RAISE EXCEPTION 'Nhan vien khong hoat dong'; END IF;
 INSERT INTO public.salary_advances(employee_id,advance_date,amount,note,created_by)
 VALUES(p_employee_id,p_date,p_amount,nullif(btrim(p_note),''),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
 VALUES(p_employee_id,'CREATE_ADVANCE',jsonb_build_object('id',v_id,'date',p_date,'amount',p_amount,'note',p_note),auth.uid());
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.az_hr_change_advance(
 p_advance_id bigint,p_action text,p_new_amount numeric DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.salary_advances%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 SELECT * INTO v FROM public.salary_advances WHERE id=p_advance_id FOR UPDATE;
 IF NOT FOUND OR v.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Khong tim thay phieu ung dang hieu luc'; END IF;
 IF p_action='DELETE' THEN
  UPDATE public.salary_advances SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=p_advance_id;
 ELSIF p_action='EDIT' THEN
  IF p_new_amount IS NULL OR p_new_amount<=0 THEN RAISE EXCEPTION 'So tien ung moi khong hop le'; END IF;
  UPDATE public.salary_advances SET amount=p_new_amount,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=p_advance_id;
 ELSE RAISE EXCEPTION 'Thao tac phieu ung khong hop le'; END IF;
 INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
 VALUES(v.employee_id,'ADVANCE_'||p_action,jsonb_build_object('id',v.id,'old_amount',v.amount,'new_amount',p_new_amount),auth.uid());
END $fn$;

CREATE OR REPLACE FUNCTION public.az_hr_update_employee(
 p_employee_id bigint,p_phone text,p_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.employees%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 SELECT * INTO v FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay nhan vien'; END IF;
 UPDATE public.employees SET phone=nullif(btrim(p_phone),''),is_active=p_active WHERE id=p_employee_id;
 INSERT INTO public.hr_audit_log(employee_id,action,details,actor_id)
 VALUES(p_employee_id,'UPDATE_EMPLOYEE',jsonb_build_object('old_phone',v.phone,'new_phone',p_phone,'old_active',v.is_active,'new_active',p_active),auth.uid());
END $fn$;

-- Gán lại EXECUTE cụ thể, không mở cho anon. Security definer luôn kiểm tra vai trò.
DO $grant$
DECLARE v record;
BEGIN
 FOR v IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('az_customer_balance','az_create_debt_slip','az_hr_create_employee','az_hr_set_rate','az_hr_save_month','az_hr_create_advance','az_hr_change_advance','az_hr_update_employee')
 LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||v.sig||' FROM PUBLIC,anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||v.sig||' TO authenticated';
 END LOOP;
END $grant$;
NOTIFY pgrst,'reload schema';
COMMIT;
