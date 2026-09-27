AZALAS SPORT V2.4 - BAN SUA TAO DON / ANH DON / NGAY GIAO / THEM KHO

Day la bo PROJECT DAY DU dua tren AZALAS Sport V2.4 dang chay, KHONG PHAI SQL RESET.
Chi sua file app/azalas/orders/new/new-order-form.tsx va THEM file sql/08_ORDER_DELIVERY_RULES.sql.
Cac phan He hoa don, nhan su, cong no, rap, ton kho... giu nguyen nhu V2.4.

1. SAO LUU
- Sao luu/commit project V2.4 dang chay truoc.
- Khong xoa du lieu Supabase. KHONG CHAY LAI file 00/01/02/04/06.

2. CODE
- Giai nen zip vao MOT THU MUC MOI, mo thu muc co package.json trong VS Code.
- Tao .env.local cung cap voi package.json (copy file .env.local cu tren may hoac tu dien URL + publishable key).
- Khong chia se .env.local hoac service-role key; khong can key secret trong frontend.
- Dung server cu neu dang chay cong 3000.
- Chay npm install, npm run check:syntax, npm run typecheck, npm run dev.

3. SQL BO SUNG, KHONG XOA DU LIEU
- Tren Supabase project azalas-test -> SQL Editor, CHI chay sql/08_ORDER_DELIVERY_RULES.sql MOT LAN.
- SQL tao trigger INSERT tren public.order_groups: don THUONG tu lay ngay VN, KHACH_DAT khong duoc bo trong.
- KHONG sua cac don cu. Khong reset database, khong tao bucket moi.

4. KIEM THU
- Chon 2 anh PNG/JPG/WEBP: xem truoc 2 anh, bam de zoom, xoa 1 anh; file goc con lai duoc upload.
- Chon THUONG: ngay giao la hom nay theo gio VN, khong can chon.
- Chon KHACH_DAT: ngay giao trong; phai chon ngay moi cho bam Tao don.
- Bam + Them kho: MOI hien o ten kho -> Luu kho/Huy.
- Luu don co anh: chi ve /azalas (Tong quan) SAU KHI tat ca anh duoc upload va gan voi don.
- Neu upload bi loi: MA DON DA TAO, bam 'Thu luu anh con thieu', TUYET DOI khong bam Tao don lan nua.

ANH CU: Neu anh cua don cu chua tung upload thanh cong, khi cai code moi anh do khong tu xuat hien; can bo sung lai trong Chi tiet don.

Gioi han: ho tro JPG, PNG, WEBP toi da 8 MB moi anh, khong gioi han so anh theo form. Dung anh goc de upload, anh xem truoc chi nam tren trinh duyet.
