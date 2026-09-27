-- AZALAS V1 / 00_RESET_AZALAS_TEST.sql
-- NGUY HIEM: xoa VINH VIEN du lieu cac bang AZALAS trong PUBLIC.
-- CHI CHAY TREN PROJECT SUPABASE TEST (azalas-test), KHONG CHAY PROJECT THAT.
-- KHONG XOA auth.users, KHONG xoa file Storage va KHONG drop schema public.
-- Truoc khi chay: Supabase > Settings > Database > Backups (neu can giu du lieu).
-- Vi Supabase SQL Editor khong phan biet project theo ten trong SQL, ban PHAI
-- tu kiem tra project dang mo. Doi chuoi CHUA_XAC_NHAN o dong duoi thanh:
-- XOA_DU_LIEU_AZALAS_TEST

BEGIN;
DO $reset_guard$
DECLARE
  v_confirm text := 'CHUA_XAC_NHAN'; -- Doi thanh XOA_DU_LIEU_AZALAS_TEST sau khi kiem tra dung project TEST!
BEGIN
  IF v_confirm <> 'XOA_DU_LIEU_AZALAS_TEST' THEN
    RAISE EXCEPTION 'CHUA XAC NHAN: chi chay tren project azalas-test va doi v_confirm.';
  END IF;
END
$reset_guard$;
-- Go trigger profile cu, auth users van duoc giu.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS az_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.az_auth_profile() CASCADE;
DROP FUNCTION IF EXISTS public.azalas_create_test_order(bigint,jsonb,text) CASCADE;


-- V2.4 ONLY if you explicitly reset TEST: restore HR/debt additions are app tables.
DROP TABLE IF EXISTS public.hr_audit_log,public.hr_rate_history,public.hr_monthly_attendance,
 public.az_debt_slip_items,public.az_debt_slips CASCADE;

-- Extension tables V2. Remove them first; never touch unrelated tables.
DROP TABLE IF EXISTS
  public.pattern_events,public.pattern_job_images,public.pattern_receipts,public.pattern_jobs,public.pattern_notes,
  public.sewing_rates,public.pattern_catalog,public.sewing_houses,public.cutters,
  public.supply_payments,public.supply_entries,public.supply_partners,
  public.salary_advances,public.attendance,public.employees
CASCADE;
DROP POLICY IF EXISTS az_pattern_upload_v2 ON storage.objects;
DROP POLICY IF EXISTS az_pattern_read_v2 ON storage.objects;
DROP POLICY IF EXISTS az_avatar_upload_v2 ON storage.objects;
DROP POLICY IF EXISTS az_avatar_read_v2 ON storage.objects;
DROP POLICY IF EXISTS az_order_upload_v1 ON storage.objects;
DROP POLICY IF EXISTS az_order_read_v1 ON storage.objects;
DROP POLICY IF EXISTS az_invoice_upload_v1 ON storage.objects;
DROP POLICY IF EXISTS az_invoice_read_v1 ON storage.objects;

-- V2.2 stock tables: chi xoa neu CHU DONG reset toan bo TEST.
DROP POLICY IF EXISTS az_product_img_insert_v21 ON storage.objects;
DROP POLICY IF EXISTS az_product_img_read_v21 ON storage.objects;
DROP TABLE IF EXISTS public.az_stock_movements,public.az_stock_balances,public.az_product_variants CASCADE;

-- Bang V1 moi (neu ban can reset V1 TEST de chay lai).
DROP TABLE IF EXISTS
  public.invoice_payments, public.invoice_lines, public.invoice_order_links,
  public.invoices, public.return_items, public.return_slips,
  public.order_status_events, public.order_images, public.order_items,
  public.order_units, public.order_groups, public.daily_counters,
  public.az_warehouses, public.az_customers, public.az_profiles
CASCADE;

-- Bang STEP 1-4 cu: du lieu KHACH TEST, DON TEST, SIZE TEST se bi xoa.
DROP TABLE IF EXISTS
  public.order_status_history, public.order_images,
  public.order_items, public.orders, public.product_images,
  public.inventory_transactions, public.inventory,
  public.product_variants, public.products, public.warehouses,
  public.customers, public.user_roles, public.profiles
CASCADE;

-- Xoa ham app V1 neu co. Ham RLS da bi CASCADE khi xoa bang, nhung
-- az_* RPC khong phu thuoc bang moi trong moi truong SQL may man co the con.
DO $cleanup$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND left(p.proname,3)='az_'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END
$cleanup$;

DROP TYPE IF EXISTS public.az_role CASCADE;
DROP TYPE IF EXISTS public.az_order_type CASCADE;
DROP TYPE IF EXISTS public.az_order_status CASCADE;
DROP TYPE IF EXISTS public.az_return_status CASCADE;
DROP TYPE IF EXISTS public.az_invoice_status CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;
-- Enum order_status cu khong biet ten neu ban tu sua STEP3;
-- bang cu da xoa, enum thua khong anh huong schema V1.
COMMIT;

-- Kiem tra: SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public' ORDER BY table_name;
