-- Chay sau 01. Chi tu dong cap OWNER neu project Auth CHI CO 1 tai khoan.
-- Khong xoa hoac reset tai khoan/mat khau da dang ky.
DO $$
DECLARE v_count int; v_id uuid;
BEGIN
 SELECT count(*) INTO v_count FROM auth.users;
 IF v_count<>1 THEN
   RAISE EXCEPTION 'Project co % tai khoan Auth. Khong tu chon OWNER. Xem cach cap thu cong trong README.',v_count;
 END IF;
 SELECT id INTO v_id FROM auth.users LIMIT 1;
 UPDATE public.az_profiles SET role='OWNER',is_active=true WHERE id=v_id;
 RAISE NOTICE 'Da cap OWNER cho user %',v_id;
END $$;
SELECT p.id,p.display_name,p.role,p.is_active
FROM public.az_profiles p ORDER BY p.created_at;

-- NEU CO NHIEU TAI KHOAN: chay truy van nay de xem email (SQL Editor ONLY),
-- sau do thay EMAIL_CUA_BAN bang email cua chinh ban va chay UPDATE ben duoi:
-- SELECT id,email FROM auth.users ORDER BY created_at;
-- UPDATE public.az_profiles SET role='OWNER',is_active=true
-- WHERE id=(SELECT id FROM auth.users WHERE lower(email)=lower('EMAIL_CUA_BAN'));
