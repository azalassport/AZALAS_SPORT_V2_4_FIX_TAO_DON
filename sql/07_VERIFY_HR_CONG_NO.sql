-- CHỈ KIỂM TRA V2.4, KHÔNG CHỈNH SỬA DỮ LIỆU.
SELECT to_regclass('public.az_debt_slips') AS phieu_cong_no,
 to_regclass('public.az_debt_slip_items') AS dong_cong_no,
 to_regclass('public.hr_monthly_attendance') AS cong_thang,
 to_regclass('public.hr_rate_history') AS lich_su_gia,
 to_regclass('public.hr_audit_log') AS lich_su_nhan_su;
SELECT proname AS function_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('az_create_debt_slip','az_customer_balance',
 'az_hr_create_employee','az_hr_set_rate','az_hr_save_month','az_hr_create_advance',
 'az_hr_change_advance','az_hr_update_employee') ORDER BY proname;
SELECT id,display_name,role,is_active FROM public.az_profiles ORDER BY created_at LIMIT 20;
SELECT count(*) AS phieu_no, COALESCE(SUM(total_plus),0) AS tong_tang, COALESCE(SUM(total_minus),0) AS tong_giam FROM public.az_debt_slips;
