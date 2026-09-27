-- AZALAS V2.2: CHI KIEM TRA, KHONG SUA/XOA.
SELECT 'az_product_variants' AS ten, to_regclass('public.az_product_variants') AS bang
UNION ALL SELECT 'az_stock_balances',to_regclass('public.az_stock_balances')
UNION ALL SELECT 'az_stock_movements',to_regclass('public.az_stock_movements');

SELECT p.proname AS ham
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('az_create_warehouse','az_stock_upsert_product','az_stock_set_quantity',
 'az_quick_product_search','az_stock_set_image','az_return_detail','az_customer_debt_page')
ORDER BY p.proname;

SELECT id,name,public FROM storage.buckets
WHERE id IN ('az-order-images','az-invoice-images','az-pattern-images','az-avatars','az-product-images')
ORDER BY id;

SELECT code,name,is_active FROM public.az_warehouses ORDER BY code;
