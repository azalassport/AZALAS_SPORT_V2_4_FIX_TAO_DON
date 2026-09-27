-- AZALAS SPORT V2: Run AFTER 01_CREATE_ALL, 02_SET_OWNER and 4 PRIVATE Storage buckets.
-- One SELECT => Supabase SQL Editor shows ALL checks in the same Results table.
-- Expect: schema_tables 17; owner_active >=1; warehouses CK, TX; storage_buckets 4; legacy_orders NULL.
WITH checks AS (
 SELECT '01_schema_tables'::text AS check_name, count(*)::text AS result
 FROM information_schema.tables WHERE table_schema='public' AND table_name IN
 ('az_profiles','az_customers','az_warehouses','order_groups','order_units','order_items','order_images',
  'invoices','invoice_order_links','invoice_lines','invoice_payments','return_slips','return_items',
  'pattern_catalog','pattern_jobs','supply_entries','employees')
 UNION ALL
 SELECT '02_owner_active',count(*)::text FROM public.az_profiles WHERE role='OWNER' AND is_active
 UNION ALL
 SELECT '03_warehouses',coalesce(string_agg(code||':'||name,', ' ORDER BY code),'MISSING')
 FROM public.az_warehouses WHERE code IN ('TX','CK') AND is_active
 UNION ALL
 SELECT '04_storage_buckets',count(*)::text FROM storage.buckets
 WHERE id IN ('az-order-images','az-invoice-images','az-pattern-images','az-avatars') AND public=false
 UNION ALL
 SELECT '05_legacy_orders',coalesce(to_regclass('public.orders')::text,'NULL')
)
SELECT check_name,result FROM checks ORDER BY check_name;
