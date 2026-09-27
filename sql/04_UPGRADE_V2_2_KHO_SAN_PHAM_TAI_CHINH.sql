-- AZALAS V2.2 - NANG CAP KHONG XOA DU LIEU
-- CHAY TREN project azalas-test da cai SQL 01_CREATE_ALL.
-- KHONG CHAY 00_RESET. Tao bucket PRIVATE az-product-images de upload anh SP.
BEGIN;

CREATE TABLE IF NOT EXISTS public.az_product_variants (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 internal_code text NOT NULL UNIQUE CHECK (length(btrim(internal_code)) > 0),
 sales_code text NOT NULL CHECK (length(btrim(sales_code)) > 0),
 product_name text NOT NULL CHECK (length(btrim(product_name)) > 0),
 color text NOT NULL DEFAULT '',
 size text NOT NULL DEFAULT '',
 brand text,
 pattern_code text,
 image_path text,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS az_product_search_name ON public.az_product_variants(product_name);
CREATE INDEX IF NOT EXISTS az_product_search_code ON public.az_product_variants(sales_code);
CREATE TABLE IF NOT EXISTS public.az_stock_balances (
 variant_id bigint NOT NULL REFERENCES public.az_product_variants(id),
 warehouse_id bigint NOT NULL REFERENCES public.az_warehouses(id),
 qty_on_hand bigint NOT NULL DEFAULT 0 CHECK(qty_on_hand >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(variant_id,warehouse_id)
);
CREATE TABLE IF NOT EXISTS public.az_stock_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 variant_id bigint NOT NULL REFERENCES public.az_product_variants(id),
 warehouse_id bigint NOT NULL REFERENCES public.az_warehouses(id),
 qty_delta bigint NOT NULL CHECK(qty_delta<>0),
 reason text NOT NULL,
 order_unit_id bigint REFERENCES public.order_units(id),
 actor_id uuid NOT NULL REFERENCES public.az_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS az_stock_history_variant ON public.az_stock_movements(variant_id,created_at DESC);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id bigint REFERENCES public.az_product_variants(id);
ALTER TABLE public.az_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.az_stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS az_stock_products_read ON public.az_product_variants;
CREATE POLICY az_stock_products_read ON public.az_product_variants FOR SELECT TO authenticated USING(public.az_is_staff());
DROP POLICY IF EXISTS az_stock_balances_read ON public.az_stock_balances;
CREATE POLICY az_stock_balances_read ON public.az_stock_balances FOR SELECT TO authenticated USING(public.az_is_staff());
DROP POLICY IF EXISTS az_stock_history_read ON public.az_stock_movements;
CREATE POLICY az_stock_history_read ON public.az_stock_movements FOR SELECT TO authenticated USING(public.az_is_manager());
GRANT SELECT ON public.az_product_variants,public.az_stock_balances TO authenticated;
GRANT SELECT ON public.az_stock_movements TO authenticated;

-- Them kho tu ten; ma Wxxxxxx sinh tren server, khong trung kho cu TX/CK.
CREATE OR REPLACE FUNCTION public.az_create_warehouse(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;v_code text;v_name text;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc them kho'; END IF;
 v_name:=nullif(btrim(p_name),'');
 IF v_name IS NULL OR length(v_name)>120 THEN RAISE EXCEPTION 'Ten kho phai co tu 1 den 120 ky tu'; END IF;
 IF EXISTS(SELECT 1 FROM public.az_warehouses WHERE lower(name)=lower(v_name)) THEN
   RAISE EXCEPTION 'Ten kho da ton tai';
 END IF;
 v_id:=nextval(pg_get_serial_sequence('public.az_warehouses','id'));
 v_code:='W'||lpad(v_id::text,6,'0');
 INSERT INTO public.az_warehouses(id,code,name) OVERRIDING SYSTEM VALUE VALUES(v_id,v_code,v_name);
 RETURN jsonb_build_object('id',v_id,'code',v_code,'name',v_name);
END $fn$;

CREATE OR REPLACE FUNCTION public.az_stock_upsert_product(
 p_internal_code text,p_sales_code text,p_product_name text,p_color text DEFAULT '',
 p_size text DEFAULT '',p_brand text DEFAULT NULL,p_pattern_code text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc tao danh muc'; END IF;
 IF nullif(btrim(p_internal_code),'') IS NULL OR nullif(btrim(p_sales_code),'') IS NULL OR nullif(btrim(p_product_name),'') IS NULL THEN
   RAISE EXCEPTION 'Nhap ma noi bo, ma ban hang va ten san pham';
 END IF;
 INSERT INTO public.az_product_variants(internal_code,sales_code,product_name,color,size,brand,pattern_code)
 VALUES(upper(btrim(p_internal_code)),upper(btrim(p_sales_code)),btrim(p_product_name),
  coalesce(btrim(p_color),''),coalesce(btrim(p_size),''),nullif(btrim(p_brand),''),nullif(btrim(p_pattern_code),''))
 ON CONFLICT(internal_code) DO UPDATE SET sales_code=excluded.sales_code,product_name=excluded.product_name,
  color=excluded.color,size=excluded.size,brand=excluded.brand,pattern_code=excluded.pattern_code,is_active=true
 RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;

-- Dat so luong TON THUC TE cho mot mau/size/kho. Ghi lich su chenhlech.
CREATE OR REPLACE FUNCTION public.az_stock_set_quantity(
 p_variant_id bigint,p_warehouse_id bigint,p_quantity bigint,p_reason text DEFAULT 'KIEM_KE_TEST'
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_before bigint;v_delta bigint;
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc nhap ton'; END IF;
 IF p_quantity IS NULL OR p_quantity<0 OR p_quantity>100000000 THEN RAISE EXCEPTION 'So luong ton khong hop le'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.az_product_variants WHERE id=p_variant_id AND is_active)
    OR NOT EXISTS(SELECT 1 FROM public.az_warehouses WHERE id=p_warehouse_id AND is_active)
 THEN RAISE EXCEPTION 'San pham hoac kho khong ton tai'; END IF;
 INSERT INTO public.az_stock_balances(variant_id,warehouse_id,qty_on_hand)
 VALUES(p_variant_id,p_warehouse_id,0) ON CONFLICT DO NOTHING;
 SELECT qty_on_hand INTO v_before FROM public.az_stock_balances
 WHERE variant_id=p_variant_id AND warehouse_id=p_warehouse_id FOR UPDATE;
 v_delta:=p_quantity-v_before;
 UPDATE public.az_stock_balances SET qty_on_hand=p_quantity,updated_at=clock_timestamp()
 WHERE variant_id=p_variant_id AND warehouse_id=p_warehouse_id;
 IF v_delta<>0 THEN
  INSERT INTO public.az_stock_movements(variant_id,warehouse_id,qty_delta,reason,actor_id)
  VALUES(p_variant_id,p_warehouse_id,v_delta,coalesce(nullif(btrim(p_reason),''),'DIEU_CHINH_TON'),auth.uid());
 END IF;
 RETURN p_quantity;
END $fn$;

-- TRA NHANH theo ten/ma ban hang/ma noi bo, mau, size; dung stock cua kho dang soan.
CREATE OR REPLACE FUNCTION public.az_quick_product_search(p_q text,p_warehouse_id bigint DEFAULT NULL)
RETURNS TABLE(variant_id bigint,internal_code text,sales_code text,product_name text,color text,size text,
 brand text,image_path text,warehouse_id bigint,warehouse_name text,qty_on_hand bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT v.id,v.internal_code,v.sales_code,v.product_name,v.color,v.size,v.brand,v.image_path,
  w.id,w.name,coalesce(s.qty_on_hand,0)
 FROM public.az_product_variants v
 JOIN public.az_warehouses w ON w.is_active AND (p_warehouse_id IS NULL OR w.id=p_warehouse_id)
 LEFT JOIN public.az_stock_balances s ON s.variant_id=v.id AND s.warehouse_id=w.id
 WHERE public.az_is_staff() AND v.is_active AND length(btrim(coalesce(p_q,'')))>=2 AND
 (v.product_name ILIKE '%'||btrim(p_q)||'%' OR v.sales_code ILIKE '%'||btrim(p_q)||'%' OR
  v.internal_code ILIKE '%'||btrim(p_q)||'%' OR v.color ILIKE '%'||btrim(p_q)||'%')
 ORDER BY v.product_name,v.color,v.size,w.name LIMIT 70;
$fn$;

-- Khi xac nhan SOAN XONG: dong co variant_id se tru ton dung kho, co khoa dong.
-- Dong nhap tay variant_id=NULL van luu duoc, NHUNG KHONG TU TRU TON.
CREATE OR REPLACE FUNCTION public.az_save_packing(
 p_unit_id bigint,p_lines jsonb,p_note text DEFAULT NULL,p_finish boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v public.order_units%ROWTYPE;v_row jsonb;v_n int:=0;v_q int;v_p numeric(16,2);
 v_name text;v_total numeric(18,2):=0;v_vid bigint;v_product public.az_product_variants%ROWTYPE;
 v_stock record;v_remaining bigint;
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Khong co quyen soan hang'; END IF;
 SELECT * INTO v FROM public.order_units WHERE id=p_unit_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'DANG_SOAN' THEN RAISE EXCEPTION 'Don chua bat dau soan hoac da hoan tat'; END IF;
 IF NOT public.az_is_manager() AND v.started_by IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Chi nguoi bat dau soan moi duoc luu don nay'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>200 THEN
  RAISE EXCEPTION 'Danh sach san pham khong hop le'; END IF;
 IF p_finish AND jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Can co san pham de soan xong'; END IF;
 DELETE FROM public.order_items WHERE unit_id=p_unit_id;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_n:=v_n+1;
  IF nullif(btrim(v_row->>'product_name'),'') IS NULL THEN RAISE EXCEPTION 'Dong % thieu ten SP',v_n; END IF;
  IF coalesce(v_row->>'quantity','') !~ '^[0-9]{1,9}$' THEN RAISE EXCEPTION 'SL dong % khong hop le',v_n; END IF;
  v_q:=(v_row->>'quantity')::int;
  IF v_q<=0 THEN RAISE EXCEPTION 'SL phai > 0'; END IF;
  IF coalesce(v_row->>'unit_price','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' THEN
   RAISE EXCEPTION 'Gia dong % khong hop le',v_n; END IF;
  v_p:=(v_row->>'unit_price')::numeric(16,2);
  v_vid:=nullif(v_row->>'variant_id','')::bigint;
  IF v_vid IS NOT NULL THEN
    IF v.warehouse_id IS NULL THEN RAISE EXCEPTION 'Don khach dat chua co kho; khong the tru ton'; END IF;
    SELECT * INTO v_product FROM public.az_product_variants WHERE id=v_vid AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'San pham dong % da bi xoa khoi danh muc',v_n; END IF;
  END IF;
  INSERT INTO public.order_items(unit_id,line_no,product_name,color,size,quantity,unit_price,variant_id)
   VALUES(p_unit_id,v_n,CASE WHEN v_vid IS NULL THEN btrim(v_row->>'product_name') ELSE v_product.product_name END,
   CASE WHEN v_vid IS NULL THEN nullif(btrim(v_row->>'color'),'') ELSE nullif(v_product.color,'') END,
   CASE WHEN v_vid IS NULL THEN nullif(btrim(v_row->>'size'),'') ELSE nullif(v_product.size,'') END,v_q,v_p,v_vid);
  v_total:=v_total+v_q*v_p;
 END LOOP;
 IF p_finish THEN
  FOR v_stock IN SELECT variant_id,SUM(quantity)::bigint AS qty FROM public.order_items
     WHERE unit_id=p_unit_id AND variant_id IS NOT NULL GROUP BY variant_id ORDER BY variant_id LOOP
    UPDATE public.az_stock_balances SET qty_on_hand=qty_on_hand-v_stock.qty,updated_at=clock_timestamp()
     WHERE variant_id=v_stock.variant_id AND warehouse_id=v.warehouse_id AND qty_on_hand>=v_stock.qty
     RETURNING qty_on_hand INTO v_remaining;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khong du ton kho cho bien the ID % / kho ID %. Vui long kiem tra ton',v_stock.variant_id,v.warehouse_id;
    END IF;
    INSERT INTO public.az_stock_movements(variant_id,warehouse_id,qty_delta,reason,order_unit_id,actor_id)
     VALUES(v_stock.variant_id,v.warehouse_id,-v_stock.qty,'SOAN_XONG',p_unit_id,auth.uid());
  END LOOP;
 END IF;
 UPDATE public.order_units SET packing_note=nullif(btrim(coalesce(p_note,'')),''),
 status=CASE WHEN p_finish THEN 'DA_SOAN'::public.az_order_status ELSE 'DANG_SOAN'::public.az_order_status END,
 completed_by=CASE WHEN p_finish THEN auth.uid() ELSE NULL END,
 completed_at=CASE WHEN p_finish THEN now() ELSE NULL END WHERE id=p_unit_id;
 IF p_finish THEN
  v_name:=coalesce(nullif(public.az_my_name(),''),'Nhan vien');
  INSERT INTO public.order_status_events(unit_id,from_status,to_status,action,actor_id,actor_name)
   VALUES(p_unit_id,'DANG_SOAN','DA_SOAN','SOAN_XONG',auth.uid(),v_name);
 END IF;
 RETURN jsonb_build_object('id',p_unit_id,'status',CASE WHEN p_finish THEN 'DA_SOAN' ELSE 'DANG_SOAN' END,
 'items',v_n,'subtotal',v_total);
END $fn$;

-- Anh san pham: bucket PRIVATE az-product-images tao trong Storage Dashboard truoc.
DROP POLICY IF EXISTS az_product_img_insert_v21 ON storage.objects;
CREATE POLICY az_product_img_insert_v21 ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='az-product-images' AND public.az_is_manager()
 AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS az_product_img_read_v21 ON storage.objects;
CREATE POLICY az_product_img_read_v21 ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='az-product-images' AND public.az_is_staff());
CREATE OR REPLACE FUNCTION public.az_stock_set_image(p_variant_id bigint,p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.az_is_manager() THEN RAISE EXCEPTION 'Chi OWNER/ADMIN duoc them anh SP'; END IF;
 IF p_path IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text OR
    NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='az-product-images' AND name=p_path)
 THEN RAISE EXCEPTION 'Anh san pham chua upload thanh cong'; END IF;
 UPDATE public.az_product_variants SET image_path=p_path WHERE id=p_variant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Khong tim thay bien the'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.az_stock_set_image(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.az_stock_set_image(bigint,text) TO authenticated;

-- Gia han quyen cho 5 RPC moi; az_save_packing da ton tai voi quyen cu.
REVOKE ALL ON FUNCTION public.az_create_warehouse(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.az_stock_upsert_product(text,text,text,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.az_stock_set_quantity(bigint,bigint,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.az_quick_product_search(text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.az_create_warehouse(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.az_stock_upsert_product(text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.az_stock_set_quantity(bigint,bigint,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.az_quick_product_search(text,bigint) TO authenticated;
-- V2.2: doc chi tiet phieu tra cho STAFF, khong lo du lieu khach cho MEMBER.
CREATE OR REPLACE FUNCTION public.az_return_detail(p_slip_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_data jsonb;
BEGIN
 IF NOT public.az_is_staff() THEN RAISE EXCEPTION 'Tai khoan chua kich hoat'; END IF;
 SELECT jsonb_build_object(
   'slip',to_jsonb(r)||jsonb_build_object('customer_name',c.name,'created_by_name',p.display_name),
   'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.line_no) FROM public.return_items i WHERE i.slip_id=r.id),'[]'::jsonb)
 ) INTO v_data
 FROM public.return_slips r JOIN public.az_customers c ON c.id=r.customer_id
 LEFT JOIN public.az_profiles p ON p.id=r.created_by WHERE r.id=p_slip_id AND r.status<>'DA_XOA';
 IF v_data IS NULL THEN RAISE EXCEPTION 'Phieu khong ton tai hoac da xoa'; END IF;
 RETURN v_data;
END $fn$;
REVOKE ALL ON FUNCTION public.az_return_detail(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.az_return_detail(bigint) TO authenticated;

-- V2.2: lay so du cong no tren trang khach hang, chi OWNER/ADMIN.
CREATE OR REPLACE FUNCTION public.az_customer_debt_page(p_customer_ids bigint[])
RETURNS TABLE(customer_id bigint,balance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT c.id,public.az_customer_balance(c.id)
 FROM public.az_customers c
 WHERE public.az_is_manager() AND c.id=ANY(coalesce(p_customer_ids,ARRAY[]::bigint[]));
$fn$;
REVOKE ALL ON FUNCTION public.az_customer_debt_page(bigint[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.az_customer_debt_page(bigint[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
