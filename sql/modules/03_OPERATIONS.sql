-- AZALAS SPORT V2 / RẬP, PHỤ LIỆU, NHÂN SỰ, HÀNG TRẢ, TÀI CHÍNH.
-- This module is included in 01_CREATE_ALL.sql; do not run twice.
BEGIN;
ALTER TABLE public.az_customers ADD COLUMN customer_code text GENERATED ALWAYS AS ('KH'||lpad(id::text,6,'0')) STORED;
CREATE UNIQUE INDEX az_customers_code_unique ON public.az_customers(customer_code);
CREATE INDEX az_customers_search_name ON public.az_customers USING gin (to_tsvector('simple',name));
ALTER TABLE public.return_slips ADD COLUMN slip_code text UNIQUE;
ALTER TABLE public.return_slips ADD COLUMN applied_invoice_id bigint REFERENCES public.invoices(id);
ALTER TABLE public.return_items ADD COLUMN item_condition text NOT NULL DEFAULT 'Hàng tốt';
ALTER TABLE public.invoice_payments ADD COLUMN return_slip_id bigint UNIQUE REFERENCES public.return_slips(id);

-- Mã rập và đối tác sản xuất.
CREATE TABLE public.pattern_catalog(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,code text NOT NULL UNIQUE CHECK(length(btrim(code))>0),
 product_name text NOT NULL,cost_price numeric(16,2) NOT NULL DEFAULT 0 CHECK(cost_price>=0),
 image_path text,notes text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sewing_houses(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL UNIQUE,phone text,address text,note text,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.cutters(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL UNIQUE,phone text,note text,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.sewing_rates(
 pattern_id bigint NOT NULL REFERENCES public.pattern_catalog(id),house_id bigint NOT NULL REFERENCES public.sewing_houses(id),
 unit_price numeric(16,2) NOT NULL CHECK(unit_price>=0),updated_at timestamptz DEFAULT now(),PRIMARY KEY(pattern_id,house_id)
);
CREATE TABLE public.pattern_notes(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,pattern_id bigint NOT NULL REFERENCES public.pattern_catalog(id),
 note text NOT NULL DEFAULT '',image_path text,created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES public.az_profiles(id)
);
CREATE TABLE public.pattern_jobs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_code text UNIQUE,
 order_type public.az_order_type NOT NULL,customer_id bigint REFERENCES public.az_customers(id),
 order_group_id bigint REFERENCES public.order_groups(id),pattern_id bigint NOT NULL REFERENCES public.pattern_catalog(id),
 pattern_code text NOT NULL,product_name text NOT NULL,brand text,
 size_range text,size_ratio text,layer_count integer NOT NULL DEFAULT 1 CHECK(layer_count>0),
 planned_qty integer NOT NULL CHECK(planned_qty>0),received_qty integer NOT NULL DEFAULT 0 CHECK(received_qty>=0),
 cut_date date,sewing_house_id bigint REFERENCES public.sewing_houses(id),cutter_id bigint REFERENCES public.cutters(id),
 sewing_price numeric(16,2) NOT NULL DEFAULT 0 CHECK(sewing_price>=0),
 status text NOT NULL DEFAULT 'MOI' CHECK(status IN ('MOI','DA_CAT','DANG_MAY','GIAO_DO','DA_NHAN','DA_CHOT','DA_XOA')),
 note text,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES public.az_profiles(id),
 closed_at timestamptz,closed_by uuid REFERENCES public.az_profiles(id),deleted_at timestamptz
);
CREATE INDEX pattern_jobs_list ON public.pattern_jobs(sewing_house_id,created_at DESC);
CREATE INDEX pattern_jobs_customer ON public.pattern_jobs(customer_id,cut_date);
CREATE TABLE public.pattern_receipts(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id bigint NOT NULL REFERENCES public.pattern_jobs(id),
 qty integer NOT NULL CHECK(qty>0),received_at timestamptz NOT NULL DEFAULT now(),
 note text,received_by uuid NOT NULL REFERENCES public.az_profiles(id)
);
CREATE TABLE public.pattern_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id bigint NOT NULL REFERENCES public.pattern_jobs(id),
 action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb,actor_id uuid NOT NULL REFERENCES public.az_profiles(id),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pattern_job_images(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id bigint NOT NULL REFERENCES public.pattern_jobs(id),storage_path text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),uploaded_by uuid NOT NULL REFERENCES public.az_profiles(id)
);

-- Phụ liệu: ghi nhận nhập, thanh toán đối tác theo từng loại; không tự suy ra giá vốn nếu chưa chốt.
CREATE TABLE public.supply_partners(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL UNIQUE,category text NOT NULL
 CHECK(category IN ('DAY_KEO','THEU','IN','VAI')),phone text,note text,is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.supply_entries(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,category text NOT NULL CHECK(category IN ('DAY_KEO','THEU','IN','VAI')),
 partner_id bigint REFERENCES public.supply_partners(id),entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
 item_name text NOT NULL,quantity numeric(16,2) NOT NULL CHECK(quantity>0),unit text NOT NULL DEFAULT 'cái',
 unit_price numeric(16,2) NOT NULL DEFAULT 0 CHECK(unit_price>=0),
 total numeric(18,2) GENERATED ALWAYS AS(quantity*unit_price) STORED,
 note text,created_by uuid NOT NULL REFERENCES public.az_profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX supply_entries_partner_idx ON public.supply_entries(partner_id,entry_date DESC);
CREATE TABLE public.supply_payments(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,partner_id bigint NOT NULL REFERENCES public.supply_partners(id),
 paid_at date NOT NULL,method text NOT NULL CHECK(method IN ('TIEN_MAT','CHUYEN_KHOAN')),
 amount numeric(18,2) NOT NULL CHECK(amount>0),note text,
 created_by uuid NOT NULL REFERENCES public.az_profiles(id),created_at timestamptz NOT NULL DEFAULT now()
);

-- Nhân viên: hồ sơ, chấm công và ứng lương riêng khỏi tài khoản Auth.
CREATE TABLE public.employees(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid UNIQUE REFERENCES public.az_profiles(id),
 full_name text NOT NULL,phone text,position text,start_date date,base_salary numeric(16,2) NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT true,note text
);
CREATE TABLE public.attendance(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public.employees(id),
 work_date date NOT NULL,shift text NOT NULL DEFAULT 'CA_NGAY',work_units numeric(5,2) NOT NULL DEFAULT 1 CHECK(work_units>=0),
 note text,created_by uuid NOT NULL REFERENCES public.az_profiles(id),UNIQUE(employee_id,work_date,shift)
);
CREATE TABLE public.salary_advances(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public.employees(id),
 advance_date date NOT NULL,amount numeric(16,2) NOT NULL CHECK(amount>0),note text,created_by uuid NOT NULL REFERENCES public.az_profiles(id)
);

-- Quyền đọc. MEMBER chỉ được nhìn tiến độ rập; không nhìn catalog giá vốn, nhà may, thợ cắt, công nợ phụ liệu.
DO $tables$
DECLARE nm text;
BEGIN
 FOREACH nm IN ARRAY ARRAY['pattern_notes','pattern_catalog','sewing_houses','cutters','sewing_rates','pattern_jobs','pattern_receipts',
  'pattern_events','pattern_job_images','supply_partners','supply_entries','supply_payments','employees','attendance','salary_advances'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',nm);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',nm);
 END LOOP;
END $tables$;
CREATE POLICY az_pattern_notes_read ON public.pattern_notes FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_pattern_notes_insert ON public.pattern_notes FOR INSERT TO authenticated WITH CHECK(public.az_is_manager() AND created_by=auth.uid());
GRANT INSERT ON public.pattern_notes TO authenticated;
CREATE POLICY az_pattern_catalog_read ON public.pattern_catalog FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_houses_read ON public.sewing_houses FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_cutters_read ON public.cutters FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_rates_read ON public.sewing_rates FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_patterns_read ON public.pattern_jobs FOR SELECT TO authenticated USING(public.az_is_staff());
CREATE POLICY az_pattern_receipts_read ON public.pattern_receipts FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_pattern_events_read ON public.pattern_events FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_pattern_images_read ON public.pattern_job_images FOR SELECT TO authenticated USING(public.az_is_staff());
CREATE POLICY az_supply_partners_read ON public.supply_partners FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_supply_entries_read ON public.supply_entries FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_supply_payments_read ON public.supply_payments FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_employees_read ON public.employees FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_attendance_read ON public.attendance FOR SELECT TO authenticated USING(public.az_is_manager());
CREATE POLICY az_advances_read ON public.salary_advances FOR SELECT TO authenticated USING(public.az_is_manager());
-- Standard manager CRUD for reference data; no MEMBER writes to privileged tables.
DO $crud$
DECLARE nm text;
BEGIN
 FOREACH nm IN ARRAY ARRAY['pattern_catalog','sewing_houses','cutters','sewing_rates',
  'supply_partners','supply_entries','supply_payments','employees','attendance','salary_advances'] LOOP
  EXECUTE format('CREATE POLICY az_%s_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.az_is_manager())',nm,nm);
  EXECUTE format('CREATE POLICY az_%s_update ON public.%I FOR UPDATE TO authenticated USING (public.az_is_manager()) WITH CHECK (public.az_is_manager())',nm,nm);
  EXECUTE format('GRANT INSERT,UPDATE ON public.%I TO authenticated',nm);
 END LOOP;
END $crud$;
-- Identity sequence permissions for manager direct insert.
GRANT USAGE ON SEQUENCE public.pattern_notes_id_seq,public.pattern_catalog_id_seq,public.sewing_houses_id_seq,public.cutters_id_seq,
 public.pattern_jobs_id_seq,public.pattern_receipts_id_seq,public.pattern_events_id_seq,public.pattern_job_images_id_seq,
 public.supply_partners_id_seq,public.supply_entries_id_seq,public.supply_payments_id_seq,
 public.employees_id_seq,public.attendance_id_seq,public.salary_advances_id_seq TO authenticated;


-- Customer edits preserve order_groups snapshot on already-created orders.
CREATE FUNCTION public.az_update_customer(p_id bigint,p_name text,p_phone text,p_address text,
 p_transport_station text,p_transport_phone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen sua khach'; END IF;
 IF nullif(btrim(coalesce(p_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Ten khach bat buoc'; END IF;
 UPDATE public.az_customers SET name=btrim(p_name),phone=nullif(btrim(p_phone),''),address=nullif(btrim(p_address),''),
 transport_station=nullif(btrim(p_transport_station),''),transport_phone=nullif(btrim(p_transport_phone),'')
 WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay khach'; END IF;
END $fn$;

-- Return slips: staff can create, manager approves, only manager soft deletes.
CREATE FUNCTION public.az_create_return(p_customer_id bigint,p_reason text,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;v_line jsonb;v_n int:=0;v_name text;v_qty integer;v_price numeric(16,2);
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Tai khoan chua duoc kich hoat'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.az_customers WHERE id=p_customer_id) THEN RAISE EXCEPTION 'Khong tim thay khach'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Danh sach hang tra khong hop le'; END IF;
 INSERT INTO public.return_slips(customer_id,reason,created_by) VALUES(p_customer_id,nullif(btrim(p_reason),''),auth.uid()) RETURNING id INTO v_id;
 UPDATE public.return_slips SET slip_code='HT'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYMMDD')||lpad(v_id::text,6,'0') WHERE id=v_id;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_n:=v_n+1;v_name:=nullif(btrim(v_line->>'product_name'),'');
  IF v_name IS NULL OR (v_line->>'quantity') !~ '^[0-9]{1,7}$' OR (v_line->>'unit_price') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Dong % khong hop le',v_n; END IF;
  v_qty:=(v_line->>'quantity')::int;v_price:=(v_line->>'unit_price')::numeric;
  IF v_qty<=0 THEN RAISE EXCEPTION 'So luong phai > 0'; END IF;
  INSERT INTO public.return_items(slip_id,line_no,product_name,quantity,unit_price,item_condition)
  VALUES(v_id,v_n,v_name,v_qty,v_price,coalesce(nullif(btrim(v_line->>'item_condition'),''),'Hàng tốt'));
 END LOOP;
 RETURN jsonb_build_object('id',v_id,'slip_code',(SELECT slip_code FROM public.return_slips WHERE id=v_id));
END $fn$;
CREATE FUNCTION public.az_approve_return(p_slip_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.return_slips%ROWTYPE;v_total numeric(18,2);
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi quan ly duoc duyet hang tra'; END IF;
 SELECT * INTO v FROM public.return_slips WHERE id=p_slip_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'CHUA_DUYET' THEN RAISE EXCEPTION 'Phieu khong o trang thai cho duyet'; END IF;
 SELECT COALESCE(SUM(line_total),0) INTO v_total FROM public.return_items WHERE slip_id=p_slip_id;
 IF v_total<=0 THEN RAISE EXCEPTION 'Phieu chua co so tien'; END IF;
 UPDATE public.return_slips SET status='DA_DUYET',approved_at=clock_timestamp(),approved_by=auth.uid() WHERE id=p_slip_id;
 RETURN jsonb_build_object('id',p_slip_id,'total',v_total,'status','DA_DUYET');
END $fn$;
CREATE FUNCTION public.az_delete_return(p_slip_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'MEMBER khong duoc xoa phieu'; END IF;
 UPDATE public.return_slips SET status='DA_XOA',deleted_at=now(),deleted_by=auth.uid()
 WHERE id=p_slip_id AND status='CHUA_DUYET';
 IF NOT FOUND THEN RAISE EXCEPTION 'Chi xoa duoc phieu chua duyet'; END IF;
END $fn$;


-- LIMITED customer picker for MEMBER when creating a return. No phone/address/debt exposed.
CREATE FUNCTION public.az_customer_lookup(p_q text DEFAULT '')
RETURNS TABLE(id bigint,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT c.id,c.name FROM public.az_customers c
 WHERE public.az_is_staff() AND length(btrim(coalesce(p_q,'')))>=2
   AND (c.name ILIKE '%'||btrim(p_q)||'%' OR c.customer_code ILIKE '%'||btrim(p_q)||'%')
 ORDER BY c.name LIMIT 20
$fn$;
CREATE FUNCTION public.az_returns_list()
RETURNS TABLE(id bigint,slip_code text,customer_id bigint,customer_name text,status public.az_return_status,
 reason text,created_at timestamptz,created_by uuid,applied_invoice_id bigint,total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT r.id,r.slip_code,r.customer_id,c.name,r.status,r.reason,r.created_at,r.created_by,r.applied_invoice_id,
 COALESCE((SELECT SUM(i.line_total) FROM public.return_items i WHERE i.slip_id=r.id),0)
 FROM public.return_slips r JOIN public.az_customers c ON c.id=r.customer_id
 WHERE public.az_is_staff() ORDER BY r.created_at DESC LIMIT 400
$fn$;

-- Rập: tạo phiếu và tự gợi ý đơn giá theo cặp nhà may + mã rập. Giá cuối do người lập xác nhận.
CREATE FUNCTION public.az_create_pattern_job(p_data jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;v_cat public.pattern_catalog%ROWTYPE;v_rate numeric(16,2);v_type public.az_order_type;v_house bigint;v_qty integer;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi quan ly duoc tao rap'; END IF;
 SELECT * INTO v_cat FROM public.pattern_catalog WHERE id=(p_data->>'pattern_id')::bigint;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ma rap khong ton tai'; END IF;
 v_type:=(p_data->>'order_type')::public.az_order_type;
 v_house:=NULLIF(p_data->>'sewing_house_id','')::bigint;
 v_qty:=(p_data->>'planned_qty')::integer;
 IF v_qty<1 THEN RAISE EXCEPTION 'So luong phai > 0'; END IF;
 SELECT sr.unit_price INTO v_rate FROM public.sewing_rates sr WHERE sr.pattern_id=v_cat.id AND sr.house_id=v_house;
 INSERT INTO public.pattern_jobs(order_type,customer_id,order_group_id,pattern_id,pattern_code,product_name,brand,
 size_range,size_ratio,layer_count,planned_qty,cut_date,sewing_house_id,cutter_id,sewing_price,note,created_by)
 VALUES(v_type,NULLIF(p_data->>'customer_id','')::bigint,NULLIF(p_data->>'order_group_id','')::bigint,
 v_cat.id,v_cat.code,v_cat.product_name,nullif(btrim(p_data->>'brand'),''),p_data->>'size_range',p_data->>'size_ratio',
 coalesce(NULLIF(p_data->>'layer_count','')::integer,1),v_qty,NULLIF(p_data->>'cut_date','')::date,
 v_house,NULLIF(p_data->>'cutter_id','')::bigint,
 coalesce(NULLIF(p_data->>'sewing_price','')::numeric,v_rate,0),p_data->>'note',auth.uid()) RETURNING id INTO v_id;
 UPDATE public.pattern_jobs SET job_code='RAP'||lpad(v_id::text,7,'0') WHERE id=v_id;
 INSERT INTO public.pattern_events(job_id,action,detail,actor_id) VALUES(v_id,'TAO_RAP',p_data,auth.uid());
 RETURN v_id;
END $fn$;
CREATE FUNCTION public.az_pattern_receive(p_job_id bigint,p_qty integer,p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.pattern_jobs%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen nhap hang rap'; END IF;
 IF p_qty IS NULL OR p_qty<1 THEN RAISE EXCEPTION 'So luong khong hop le'; END IF;
 SELECT * INTO v FROM public.pattern_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR v.status IN ('DA_XOA','DA_CHOT') THEN RAISE EXCEPTION 'Rap khong the nhap'; END IF;
 IF v.received_qty+p_qty>v.planned_qty THEN RAISE EXCEPTION 'Nhap vuot so luong ke hoach'; END IF;
 INSERT INTO public.pattern_receipts(job_id,qty,note,received_by) VALUES(v.id,p_qty,p_note,auth.uid());
 UPDATE public.pattern_jobs SET received_qty=v.received_qty+p_qty,
 status=CASE WHEN v.received_qty+p_qty=v.planned_qty THEN 'DA_NHAN' ELSE 'GIAO_DO' END WHERE id=v.id;
 INSERT INTO public.pattern_events(job_id,action,detail,actor_id) VALUES(v.id,'NHAP',jsonb_build_object('qty',p_qty,'note',p_note),auth.uid());
 RETURN jsonb_build_object('id',v.id,'received_qty',v.received_qty+p_qty,'planned_qty',v.planned_qty);
END $fn$;
CREATE FUNCTION public.az_pattern_update(p_job_id bigint,p_status text,p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.pattern_jobs%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen sua rap'; END IF;
 SELECT * INTO v FROM public.pattern_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR v.status IN ('DA_CHOT','DA_XOA') THEN RAISE EXCEPTION 'Rap khong duoc sua'; END IF;
 IF p_status NOT IN ('MOI','DA_CAT','DANG_MAY','GIAO_DO','DA_NHAN') THEN RAISE EXCEPTION 'Trang thai khong hop le'; END IF;
 UPDATE public.pattern_jobs SET status=p_status,note=coalesce(p_note,note) WHERE id=p_job_id;
 INSERT INTO public.pattern_events(job_id,action,detail,actor_id) VALUES(p_job_id,'SUA_TT',jsonb_build_object('from',v.status,'to',p_status,'note',p_note),auth.uid());
END $fn$;
-- Khóa tiến độ, KHÔNG thay thế nghiệp vụ ép chốt công nợ nhà may/thợ cắt của code cũ.
CREATE FUNCTION public.az_pattern_close(p_job_id bigint,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.pattern_jobs%ROWTYPE;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Can ly do chot'; END IF;
 SELECT * INTO v FROM public.pattern_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR v.status IN ('DA_CHOT','DA_XOA') THEN RAISE EXCEPTION 'Rap khong hop le'; END IF;
 UPDATE public.pattern_jobs SET status='DA_CHOT',closed_at=now(),closed_by=auth.uid() WHERE id=p_job_id;
 INSERT INTO public.pattern_events(job_id,action,detail,actor_id) VALUES(p_job_id,'KHOA_TIEN_DO',jsonb_build_object('reason',p_reason,'received',v.received_qty),auth.uid());
END $fn$;


-- Restricted member progress view; only operational fields, never price/cost or private payment history.
CREATE FUNCTION public.az_pattern_progress()
RETURNS TABLE(id bigint,job_code text,order_type public.az_order_type,pattern_code text,product_name text,
 brand text,planned_qty integer,received_qty integer,status text,cut_date date,delivery_date date,
 house_name text,created_at timestamptz,customer_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT j.id,j.job_code,j.order_type,j.pattern_code,j.product_name,j.brand,
 j.planned_qty,j.received_qty,j.status,j.cut_date,g.delivery_date,h.name,j.created_at,c.name
 FROM public.pattern_jobs j LEFT JOIN public.sewing_houses h ON h.id=j.sewing_house_id
 LEFT JOIN public.order_groups g ON g.id=j.order_group_id
 LEFT JOIN public.az_customers c ON c.id=j.customer_id
 WHERE public.az_is_staff() AND j.status<>'DA_XOA'
 ORDER BY j.created_at DESC LIMIT 500
$fn$;
CREATE FUNCTION public.az_attach_pattern_image(p_job_id bigint,p_path text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pattern_jobs WHERE id=p_job_id) THEN RAISE EXCEPTION 'Khong tim thay rap'; END IF;
 IF p_path IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text OR
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='az-pattern-images' AND name=p_path)
 THEN RAISE EXCEPTION 'Anh chua duoc upload'; END IF;
 INSERT INTO public.pattern_job_images(job_id,storage_path,uploaded_by) VALUES(p_job_id,p_path,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;

-- Avatar + thông tin profile: user chỉ sửa chính mình, tuyệt đối không sửa role/is_active.
CREATE FUNCTION public.az_update_my_profile(p_name text,p_phone text,p_avatar_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Tai khoan chua duoc duyet'; END IF;
 IF nullif(btrim(coalesce(p_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Ten khong duoc trong'; END IF;
 IF p_avatar_path IS NOT NULL AND (split_part(p_avatar_path,'/',1)<>auth.uid()::text OR
   NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='az-avatars' AND name=p_avatar_path)) THEN
   RAISE EXCEPTION 'Avatar chua duoc upload hop le'; END IF;
 UPDATE public.az_profiles SET display_name=btrim(p_name),phone=nullif(btrim(p_phone),'') ,avatar_path=coalesce(p_avatar_path,avatar_path) WHERE id=auth.uid();
END $fn$;
CREATE FUNCTION public.az_manage_member(p_user_id uuid,p_role public.az_role,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE old_role public.az_role;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN quan ly tai khoan'; END IF;
 IF p_role='OWNER' AND (SELECT role FROM public.az_profiles WHERE id=auth.uid())<>'OWNER' THEN RAISE EXCEPTION 'Chi OWNER cap OWNER'; END IF;
 SELECT role INTO old_role FROM public.az_profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tai khoan chua dang ky'; END IF;
 IF old_role='OWNER' AND (SELECT role FROM public.az_profiles WHERE id=auth.uid())<>'OWNER' THEN RAISE EXCEPTION 'Chi OWNER sua tai khoan OWNER'; END IF;
 IF old_role='OWNER' AND (p_role<>'OWNER' OR NOT p_active) AND (SELECT count(*) FROM public.az_profiles WHERE role='OWNER' AND is_active)<2 THEN RAISE EXCEPTION 'Khong duoc vo hieu hoa/ha OWNER cuoi cung'; END IF;
 IF p_user_id=auth.uid() AND (NOT p_active OR p_role NOT IN ('OWNER','ADMIN')) THEN RAISE EXCEPTION 'Khong tu vo hieu hoa tai khoan quan ly'; END IF;
 UPDATE public.az_profiles SET role=p_role,is_active=p_active WHERE id=p_user_id;
END $fn$;

-- Thanh toán phát sinh sau chốt giữ ảnh hóa đơn đã chốt nguyên vẹn.
CREATE FUNCTION public.az_collect_payment(p_invoice_id bigint,p_amount numeric,p_method text,p_payment_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.invoices%ROWTYPE;v_current numeric(18,2);
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 IF p_method NOT IN ('CHUYEN_KHOAN','TIEN_MAT') OR p_amount<=0 OR p_payment_date IS NULL OR p_payment_date>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN RAISE EXCEPTION 'Thong tin thu tien sai'; END IF;
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'DA_GUI' THEN RAISE EXCEPTION 'Chi thu tien tren hoa don da chot'; END IF;
 PERFORM 1 FROM public.az_customers WHERE id=v.customer_id FOR UPDATE;
 v_current:=public.az_customer_balance(v.customer_id);
 IF p_amount>v_current THEN RAISE EXCEPTION 'Tien thu vuot no hien tai cua khach'; END IF;
 INSERT INTO public.invoice_payments(invoice_id,payment_date,method,amount,created_by)
 VALUES(p_invoice_id,p_payment_date,p_method,p_amount,auth.uid());
 RETURN jsonb_build_object('customer_balance',public.az_customer_balance(v.customer_id));
END $fn$;

-- KHÔNG cho MEMBER sửa/xóa bảng nghiệp vụ trực tiếp; RPC kiểm tra role và status.
DO $grants$
DECLARE sig text;
BEGIN
 FOR sig IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND left(p.proname,3)='az_' LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||sig||' FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||sig||' TO authenticated';
 END LOOP;
END $grants$;
-- Extensions need direct SELECT of pattern etc via grants above. 
-- Buckets: private; actual file deletion must use Storage API, not SQL metadata deletion.
-- Tạo thủ công 4 bucket PRIVATE qua Storage Dashboard (xem README). Không sửa storage.buckets trực tiếp.
CREATE POLICY az_pattern_upload_v2 ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='az-pattern-images' AND public.az_is_manager() AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY az_pattern_read_v2 ON storage.objects FOR SELECT TO authenticated USING(bucket_id='az-pattern-images' AND public.az_is_staff());
CREATE POLICY az_avatar_upload_v2 ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='az-avatars' AND public.az_is_staff() AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY az_avatar_read_v2 ON storage.objects FOR SELECT TO authenticated USING(bucket_id='az-avatars' AND public.az_is_staff());
NOTIFY pgrst,'reload schema';
COMMIT;
