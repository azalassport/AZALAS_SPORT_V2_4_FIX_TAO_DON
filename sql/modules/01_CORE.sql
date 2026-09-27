-- AZALAS V1.1 / CORE (24-09-2026)
-- Chay MOT LAN sau 00_RESET. Khong luu ton kho, khong bat danh muc SP truoc.
-- Scope: Auth/roles, khach, kho dieu phoi, tao don, CT don, soan hang,
-- bang cho hoa don, mau du lieu hoa don/hang tra. Rap/phu lieu lam migration sau.
BEGIN;

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
COMMIT;
