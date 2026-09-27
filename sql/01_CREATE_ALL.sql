-- AZALAS SPORT V2. ĐỌC README. CHỈ CHẠY SAU RESET TRÊN azalas-test.
-- Transaction: bất kỳ lỗi nào đều rollback toàn bộ schema mới.
BEGIN;

-- ============= BEGIN MODULE 01_CORE.sql =============
-- AZALAS V1.1 / CORE (24-09-2026)
-- Chay MOT LAN sau 00_RESET. Khong luu ton kho, khong bat danh muc SP truoc.
-- Scope: Auth/roles, khach, kho dieu phoi, tao don, CT don, soan hang,
-- bang cho hoa don, mau du lieu hoa don/hang tra. Rap/phu lieu lam migration sau.

CREATE TYPE public.az_role AS ENUM ('OWNER','ADMIN','MEMBER');
CREATE TYPE public.az_order_type AS ENUM ('THUONG','KHACH_DAT');
CREATE TYPE public.az_order_status AS ENUM ('MOI','DANG_SOAN','NO_DON','DA_SOAN','DA_XOA');
CREATE TYPE public.az_return_status AS ENUM ('CHUA_DUYET','DA_DUYET','DA_XOA');
CREATE TYPE public.az_invoice_status AS ENUM ('CHUA_CHOT','DA_GUI','DA_XOA');

CREATE TABLE public.az_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  phone text,
  avatar_path text,
  role public.az_role NOT NULL DEFAULT 'MEMBER',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX az_profiles_role_idx ON public.az_profiles(role);

CREATE TABLE public.az_customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  phone text, address text, transport_station text, transport_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.az_profiles(id)
);
CREATE INDEX az_customers_name_idx ON public.az_customers(name);

CREATE TABLE public.az_warehouses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{2,12}$'),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.az_warehouses(code,name) VALUES
 ('TX','Tân Xuân'), ('CK','Cá Koi');

CREATE TABLE public.daily_counters (
  biz_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ORDER','INVOICE')),
  last_no bigint NOT NULL CHECK(last_no > 0),
  PRIMARY KEY (biz_date,kind)
);

-- Nhom don goc: moi lan khach dat hang, 1 ma ngay + STT.
CREATE TABLE public.order_groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  root_code text NOT NULL UNIQUE,
  customer_id bigint NOT NULL REFERENCES public.az_customers(id),
  customer_name text NOT NULL, customer_phone text, customer_address text,
  transport_station text, transport_phone text,
  order_type public.az_order_type NOT NULL,
  delivery_date date,
  is_urgent boolean NOT NULL DEFAULT false,
  creator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.az_profiles(id)
);
CREATE INDEX order_groups_customer_idx ON public.order_groups(customer_id,created_at DESC);

-- Don con theo kho: 2 kho => 2 don, 1 kho => 1 don ma goc.
CREATE TABLE public.order_units (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES public.order_groups(id),
  warehouse_id bigint REFERENCES public.az_warehouses(id),
  order_code text NOT NULL UNIQUE,
  status public.az_order_status NOT NULL DEFAULT 'MOI',
  started_by uuid REFERENCES public.az_profiles(id),
  started_by_name text, started_at timestamptz,
  completed_by uuid REFERENCES public.az_profiles(id),
  completed_at timestamptz, packing_note text,
  deferred_by uuid REFERENCES public.az_profiles(id),
  deferred_by_name text, deferred_at timestamptz,
  deleted_by uuid REFERENCES public.az_profiles(id),
  deleted_at timestamptz, delete_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id,warehouse_id)
);
CREATE UNIQUE INDEX order_units_one_customer_order_idx
 ON public.order_units(group_id) WHERE warehouse_id IS NULL;
CREATE INDEX order_units_board_idx ON public.order_units(status,warehouse_id,created_at,id);

CREATE TABLE public.order_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES public.order_units(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK(line_no > 0),
  product_name text NOT NULL CHECK(length(btrim(product_name)) > 0),
  color text, size text,
  quantity integer NOT NULL CHECK(quantity > 0),
  unit_price numeric(16,2) NOT NULL CHECK(unit_price >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  UNIQUE(unit_id,line_no)
);
CREATE INDEX order_items_unit_idx ON public.order_items(unit_id);

CREATE TABLE public.order_images (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES public.order_groups(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid NOT NULL REFERENCES public.az_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES public.order_units(id) ON DELETE CASCADE,
  from_status public.az_order_status,
  to_status public.az_order_status NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.az_profiles(id),
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_unit_idx ON public.order_status_events(unit_id,created_at DESC);

-- Hoa don: 1 lan chot = 1 chung tu bat bien va 1 anh da luu.
-- Don con chot roi khong tu dong bi sua khi don kho khac soan xong.
CREATE TABLE public.invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_code text NOT NULL UNIQUE,
  customer_id bigint NOT NULL REFERENCES public.az_customers(id),
  customer_name text NOT NULL,
  status public.az_invoice_status NOT NULL DEFAULT 'CHUA_CHOT',
  invoice_image_path text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK(subtotal >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.az_profiles(id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.az_profiles(id),
  CONSTRAINT invoice_image_when_sent CHECK (
    status <> 'DA_GUI' OR (invoice_image_path IS NOT NULL AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
  )
);
CREATE TABLE public.invoice_order_links (
  invoice_id bigint NOT NULL REFERENCES public.invoices(id),
  unit_id bigint NOT NULL UNIQUE REFERENCES public.order_units(id),
  PRIMARY KEY(invoice_id,unit_id)
);
CREATE TABLE public.invoice_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL REFERENCES public.invoices(id),
  source_item_id bigint REFERENCES public.order_items(id),
  product_name text NOT NULL, color text, size text,
  quantity integer NOT NULL CHECK(quantity > 0),
  unit_price numeric(16,2) NOT NULL CHECK(unit_price >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS(quantity * unit_price) STORED
);
CREATE TABLE public.invoice_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL REFERENCES public.invoices(id),
  payment_date date NOT NULL,
  method text NOT NULL CHECK(method IN ('CHUYEN_KHOAN','TIEN_MAT','HANG_TRA','CONG_THEM')),
  amount numeric(18,2) NOT NULL CHECK(amount > 0),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.az_profiles(id),
  CHECK(method <> 'CONG_THEM' OR nullif(btrim(coalesce(reason,'')),'') IS NOT NULL)
);

CREATE TABLE public.return_slips (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES public.az_customers(id),
  status public.az_return_status NOT NULL DEFAULT 'CHUA_DUYET',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.az_profiles(id),
  approved_at timestamptz, approved_by uuid REFERENCES public.az_profiles(id),
  deleted_at timestamptz, deleted_by uuid REFERENCES public.az_profiles(id)
);
CREATE TABLE public.return_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slip_id bigint NOT NULL REFERENCES public.return_slips(id),
  line_no integer NOT NULL CHECK(line_no > 0),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0),
  unit_price numeric(16,2) NOT NULL CHECK(unit_price>=0),
  line_total numeric(18,2) GENERATED ALWAYS AS(quantity*unit_price) STORED,
  UNIQUE(slip_id,line_no)
);

-- Danh tinh: moi tai khoan moi la MEMBER *CHUA KICH HOAT*. Chi OWNER/ADMIN
-- duyet tai khoan qua quy trinh quan tri (dang xay). Khong tu phong OWNER.
CREATE FUNCTION public.az_auth_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.az_profiles(id,display_name,role)
  VALUES (NEW.id, coalesce(nullif(btrim(NEW.raw_user_meta_data->>'full_name'),''),split_part(coalesce(NEW.email,''),'@',1)), 'MEMBER')
  ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER az_on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.az_auth_profile();
-- Auth account cu duoc giu, backfill profile. Chu project duoc set bang script 02.
INSERT INTO public.az_profiles(id,display_name,role)
SELECT id,coalesce(nullif(btrim(raw_user_meta_data->>'full_name'),''),split_part(coalesce(email,''),'@',1)),'MEMBER'
FROM auth.users ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.az_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.az_profiles p WHERE p.id=auth.uid() AND p.is_active)
$$;
CREATE FUNCTION public.az_is_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.az_profiles p
 WHERE p.id=auth.uid() AND p.is_active AND p.role IN ('OWNER','ADMIN'))
$$;
CREATE FUNCTION public.az_my_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.display_name FROM public.az_profiles p WHERE p.id=auth.uid() AND p.is_active
$$;

-- RPC: Tao don goc va cac don con THEO KHO trong cung 1 transaction.
CREATE FUNCTION public.az_create_order(
 p_customer_id bigint,
 p_order_type public.az_order_type,
 p_warehouse_codes text[] DEFAULT ARRAY[]::text[],
 p_delivery_date date DEFAULT NULL,
 p_is_urgent boolean DEFAULT false,
 p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_c public.az_customers%ROWTYPE;
 v_day date := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 v_no bigint; v_root text; v_gid bigint; v_wh record;
 v_codes text[]; v_children jsonb := '[]'::jsonb; v_uid bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen tao don'; END IF;
 IF p_order_type IS NULL THEN RAISE EXCEPTION 'Chua chon loai don'; END IF;
 SELECT * INTO v_c FROM public.az_customers WHERE id=p_customer_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khach hang khong ton tai'; END IF;
 IF p_order_type='THUONG' THEN
   SELECT array_agg(DISTINCT upper(btrim(code)) ORDER BY upper(btrim(code))) INTO v_codes
   FROM unnest(coalesce(p_warehouse_codes,ARRAY[]::text[])) AS u(code) WHERE btrim(code)<>'';
   IF coalesce(array_length(v_codes,1),0) NOT BETWEEN 1 AND 10 THEN
     RAISE EXCEPTION 'Don thuong phai chon 1-10 kho';
   END IF;
   IF (SELECT count(*) FROM public.az_warehouses WHERE is_active AND code=ANY(v_codes)) <> array_length(v_codes,1)
   THEN RAISE EXCEPTION 'Danh sach kho khong hop le'; END IF;
 ELSE
   IF coalesce(array_length(p_warehouse_codes,1),0)>0 THEN
     RAISE EXCEPTION 'Khach dat khong duoc chon kho';
   END IF;
 END IF;
 INSERT INTO public.daily_counters(biz_date,kind,last_no)
 VALUES(v_day,'ORDER',1)
 ON CONFLICT(biz_date,kind) DO UPDATE SET last_no=daily_counters.last_no+1
 RETURNING last_no INTO v_no;
 v_root := to_char(v_day,'DDMMYYYY') || CASE WHEN length(v_no::text)<4 THEN lpad(v_no::text,4,'0') ELSE v_no::text END;
 INSERT INTO public.order_groups(root_code,customer_id,customer_name,customer_phone,customer_address,
   transport_station,transport_phone,order_type,delivery_date,is_urgent,creator_note,created_by)
 VALUES(v_root,v_c.id,v_c.name,v_c.phone,v_c.address,v_c.transport_station,v_c.transport_phone,
   p_order_type,p_delivery_date,p_is_urgent,nullif(btrim(coalesce(p_note,'')),''),auth.uid())
 RETURNING id INTO v_gid;
 IF p_order_type='KHACH_DAT' THEN
   INSERT INTO public.order_units(group_id,warehouse_id,order_code)
   VALUES(v_gid,NULL,v_root) RETURNING id INTO v_uid;
   v_children := jsonb_build_array(jsonb_build_object('id',v_uid,'order_code',v_root,'warehouse','Khách đặt'));
 ELSE
   FOR v_wh IN SELECT id,code,name FROM public.az_warehouses WHERE code=ANY(v_codes) ORDER BY code LOOP
     INSERT INTO public.order_units(group_id,warehouse_id,order_code)
     VALUES(v_gid,v_wh.id, CASE WHEN array_length(v_codes,1)>1 THEN v_root||'-'||v_wh.code ELSE v_root END)
     RETURNING id INTO v_uid;
     v_children := v_children || jsonb_build_array(jsonb_build_object('id',v_uid,
       'order_code',CASE WHEN array_length(v_codes,1)>1 THEN v_root||'-'||v_wh.code ELSE v_root END,
       'warehouse',v_wh.name));
   END LOOP;
 END IF;
 RETURN jsonb_build_object('group_id',v_gid,'root_code',v_root,'units',v_children);
END $$;

-- RPC: Member duoc soan hang, nhung khong duoc xoa don.
CREATE FUNCTION public.az_start_packing(p_unit_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.order_units%ROWTYPE; v_name text;
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Tai khoan khong hoat dong'; END IF;
 SELECT * INTO v FROM public.order_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay don'; END IF;
 IF v.status='DANG_SOAN' THEN
   IF NOT public.az_is_manager() AND v.started_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Don dang duoc nguoi khac soan';
   END IF;
   RETURN jsonb_build_object('id',v.id,'status',v.status);
 END IF;
 IF v.status NOT IN ('MOI','NO_DON') THEN RAISE EXCEPTION 'Don khong o trang thai co the soan'; END IF;
 v_name := coalesce(nullif(public.az_my_name(),''),'Nhan vien');
 UPDATE public.order_units SET status='DANG_SOAN',started_by=auth.uid(),started_by_name=v_name,
   started_at=now(),deferred_by=NULL,deferred_by_name=NULL,deferred_at=NULL
 WHERE id=v.id;
 INSERT INTO public.order_status_events(unit_id,from_status,to_status,action,actor_id,actor_name)
 VALUES(v.id,v.status,'DANG_SOAN','BAT_DAU_SOAN',auth.uid(),v_name);
 RETURN jsonb_build_object('id',v.id,'status','DANG_SOAN');
END $$;

-- RPC: luu nhap hoac xac nhan soan xong, KHONG kiem tra hay tru ton kho.
CREATE FUNCTION public.az_save_packing(
 p_unit_id bigint, p_lines jsonb, p_note text DEFAULT NULL, p_finish boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.order_units%ROWTYPE; v_row jsonb; v_n int:=0;
 v_q int; v_p numeric(16,2); v_name text; v_total numeric(18,2):=0;
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Khong co quyen soan hang'; END IF;
 SELECT * INTO v FROM public.order_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'DANG_SOAN' THEN RAISE EXCEPTION 'Don chua bat dau soan hoac da hoan tat'; END IF;
 IF NOT public.az_is_manager() AND v.started_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Chi nguoi bat dau soan moi duoc luu don nay';
 END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>200 THEN
   RAISE EXCEPTION 'Danh sach dong san pham khong hop le';
 END IF;
 IF p_finish AND jsonb_array_length(p_lines)=0 THEN
   RAISE EXCEPTION 'Phai co it nhat mot san pham de soan xong';
 END IF;
 DELETE FROM public.order_items WHERE unit_id=p_unit_id;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   v_n:=v_n+1;
   IF nullif(btrim(v_row->>'product_name'),'') IS NULL THEN RAISE EXCEPTION 'Dong % thieu ten SP',v_n; END IF;
   IF (v_row->>'quantity') IS NULL OR (v_row->>'quantity') !~ '^[0-9]{1,9}$' THEN
     RAISE EXCEPTION 'So luong dong % khong hop le',v_n;
   END IF;
   v_q:=(v_row->>'quantity')::int;
   IF v_q<=0 THEN RAISE EXCEPTION 'So luong phai > 0'; END IF;
   IF (v_row->>'unit_price') IS NULL OR (v_row->>'unit_price') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' THEN
     RAISE EXCEPTION 'Don gia dong % khong hop le',v_n;
   END IF;
   v_p:=(v_row->>'unit_price')::numeric(16,2);
   INSERT INTO public.order_items(unit_id,line_no,product_name,color,size,quantity,unit_price)
   VALUES(p_unit_id,v_n,btrim(v_row->>'product_name'),nullif(btrim(v_row->>'color'),''),
     nullif(btrim(v_row->>'size'),''),v_q,v_p);
   v_total:=v_total+v_q*v_p;
 END LOOP;
 UPDATE public.order_units SET packing_note=nullif(btrim(coalesce(p_note,'')),''),
   status=CASE WHEN p_finish THEN 'DA_SOAN'::public.az_order_status ELSE 'DANG_SOAN'::public.az_order_status END,
   completed_by=CASE WHEN p_finish THEN auth.uid() ELSE NULL END,
   completed_at=CASE WHEN p_finish THEN now() ELSE NULL END
 WHERE id=p_unit_id;
 IF p_finish THEN
   v_name:=coalesce(nullif(public.az_my_name(),''),'Nhan vien');
   INSERT INTO public.order_status_events(unit_id,from_status,to_status,action,actor_id,actor_name)
   VALUES(p_unit_id,'DANG_SOAN','DA_SOAN','SOAN_XONG',auth.uid(),v_name);
 END IF;
 RETURN jsonb_build_object('id',p_unit_id,'status',CASE WHEN p_finish THEN 'DA_SOAN' ELSE 'DANG_SOAN' END,
   'items',v_n,'subtotal',v_total);
END $$;

CREATE FUNCTION public.az_defer_order(p_unit_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.order_units%ROWTYPE; v_name text;
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Khong co quyen'; END IF;
 SELECT * INTO v FROM public.order_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND OR v.status NOT IN ('MOI','DANG_SOAN') THEN RAISE EXCEPTION 'Khong the no don'; END IF;
 v_name:=coalesce(nullif(public.az_my_name(),''),'Nhan vien');
 UPDATE public.order_units SET status='NO_DON',deferred_by=auth.uid(),deferred_by_name=v_name,
   deferred_at=now() WHERE id=p_unit_id;
 INSERT INTO public.order_status_events(unit_id,from_status,to_status,action,actor_id,actor_name)
 VALUES(p_unit_id,v.status,'NO_DON','NO_DON',auth.uid(),v_name);
END $$;

CREATE FUNCTION public.az_soft_delete_order(p_unit_id bigint,p_reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.order_units%ROWTYPE; v_name text;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc xoa don'; END IF;
 SELECT * INTO v FROM public.order_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND OR v.status='DA_XOA' THEN RAISE EXCEPTION 'Don khong hop le'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoice_order_links WHERE unit_id=p_unit_id) THEN
   RAISE EXCEPTION 'Don da co hoa don: xu ly qua nghiep vu hoa don';
 END IF;
 v_name:=coalesce(nullif(public.az_my_name(),''),'Quan ly');
 UPDATE public.order_units SET status='DA_XOA',deleted_by=auth.uid(),deleted_at=now(),
   delete_reason=nullif(btrim(coalesce(p_reason,'')),'') WHERE id=p_unit_id;
 INSERT INTO public.order_status_events(unit_id,from_status,to_status,action,actor_id,actor_name)
 VALUES(p_unit_id,v.status,'DA_XOA','XOA_MEM',auth.uid(),v_name);
END $$;

-- RPC: chi gan anh da upload thanh cong; file phai nam trong bucket rieng,
-- duong dan bat dau bang ID nguoi tao (phu hop storage policy).
CREATE FUNCTION public.az_attach_order_image(p_group_id bigint,p_path text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Khong co quyen them anh don'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_groups WHERE id=p_group_id) THEN RAISE EXCEPTION 'Khong co don'; END IF;
 IF p_path IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text OR
   NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='az-order-images' AND o.name=p_path)
 THEN RAISE EXCEPTION 'Anh chua upload thanh cong'; END IF;
 INSERT INTO public.order_images(group_id,storage_path,uploaded_by)
 VALUES(p_group_id,p_path,auth.uid()) ON CONFLICT(storage_path) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT id INTO v_id FROM public.order_images
   WHERE group_id=p_group_id AND storage_path=p_path;
   IF v_id IS NULL THEN RAISE EXCEPTION 'Anh da gan voi don khac'; END IF;
 END IF;
 RETURN v_id;
END $$;

-- RLS: khong cap quyen ghi truc tiep vao bang nghiep vu; chi RPC.
ALTER TABLE public.az_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY az_profile_read ON public.az_profiles FOR SELECT TO authenticated
 USING(id=auth.uid() OR public.az_is_manager());
CREATE POLICY az_customers_read ON public.az_customers FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_customers_insert ON public.az_customers FOR INSERT TO authenticated
 WITH CHECK(public.az_is_manager() AND created_by=auth.uid());
CREATE POLICY az_warehouses_read ON public.az_warehouses FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_order_groups_read ON public.order_groups FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_order_units_read ON public.order_units FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_order_items_read ON public.order_items FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_order_images_read ON public.order_images FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_order_events_read ON public.order_status_events FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_invoices_read ON public.invoices FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_invoice_links_read ON public.invoice_order_links FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_invoice_lines_read ON public.invoice_lines FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_invoice_payments_read ON public.invoice_payments FOR SELECT TO authenticated
 USING(public.az_is_manager());
CREATE POLICY az_return_slips_read ON public.return_slips FOR SELECT TO authenticated
 USING(public.az_is_staff());
CREATE POLICY az_return_items_read ON public.return_items FOR SELECT TO authenticated
 USING(public.az_is_staff());

-- GRANT + RLS la hai lop khac nhau.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON TYPE public.az_role,public.az_order_type,public.az_order_status,
 public.az_return_status,public.az_invoice_status TO authenticated;
GRANT SELECT ON public.az_profiles,public.az_customers,public.az_warehouses,
 public.order_groups,public.order_units,public.order_items,public.order_images,
 public.order_status_events,public.invoices,public.invoice_order_links,
 public.invoice_lines,public.invoice_payments,public.return_slips,public.return_items TO authenticated;
GRANT INSERT ON public.az_customers TO authenticated;
GRANT USAGE ON SEQUENCE public.az_customers_id_seq TO authenticated;
-- Mọi thao tác con lai di qua RPC; khong GRANT UPDATE/DELETE bang.

-- Mac dinh PostgreSQL GRANT EXECUTE cho PUBLIC: thu hoi tren cac RPC/helper.
DO $grants$
DECLARE r record;
BEGIN
 FOR r IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND left(p.proname,3)='az_'
 LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
   EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated';
 END LOOP;
END $grants$;
-- Cho phep Supabase Auth thuc thi trigger tao profile khi co nguoi dang ky.
GRANT EXECUTE ON FUNCTION public.az_auth_profile() TO supabase_auth_admin;

-- Storage: tao 2 bucket PRIVATE qua Supabase Dashboard > Storage:
-- az-order-images, az-invoice-images. Khong xoa/chinh metadata storage bang SQL.
-- Policy chi cho OWNER/ADMIN upload anh don; staff xem anh don qua signed URL.
DROP POLICY IF EXISTS az_order_upload_v1 ON storage.objects;
DROP POLICY IF EXISTS az_order_read_v1 ON storage.objects;
DROP POLICY IF EXISTS az_invoice_upload_v1 ON storage.objects;
DROP POLICY IF EXISTS az_invoice_read_v1 ON storage.objects;
CREATE POLICY az_order_upload_v1 ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='az-order-images' AND public.az_is_manager() AND
   (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY az_order_read_v1 ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='az-order-images' AND public.az_is_staff());
CREATE POLICY az_invoice_upload_v1 ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='az-invoice-images' AND public.az_is_manager() AND
   (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY az_invoice_read_v1 ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='az-invoice-images' AND public.az_is_manager());
NOTIFY pgrst, 'reload schema';
-- ============= END MODULE 01_CORE.sql =============

-- ============= BEGIN MODULE 02_INVOICES.sql =============
-- AZALAS V1 / STEP 5A: NEN TANG HOA DON (TEST)
-- CHI CHAY SAU KHI DA CAI DATABASE V1 (01, 02, 03).
-- KHONG RESET, KHONG DROP BANG DON HANG, KHONG XOA DU LIEU TEST.
-- Chua trien khai HANG TRA duyet, thu no SAU khi chot, sua/xoa hoa don DA_GUI.
-- HANG_TRA khong duoc ghi thanh toan cho toi khi co phieu tra da duyet lien ket.

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
-- ============= END MODULE 02_INVOICES.sql =============

-- ============= BEGIN MODULE 03_OPERATIONS.sql =============
-- AZALAS SPORT V2 / RẬP, PHỤ LIỆU, NHÂN SỰ, HÀNG TRẢ, TÀI CHÍNH.
-- This module is included in 01_CREATE_ALL.sql; do not run twice.
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
-- ============= END MODULE 03_OPERATIONS.sql =============

-- ============= BEGIN MODULE 04_FINANCE_PATCH.sql =============
-- AZALAS SPORT V2: HOÁ ĐƠN + HÀNG TRẢ

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
-- ============= END MODULE 04_FINANCE_PATCH.sql =============

COMMIT;
