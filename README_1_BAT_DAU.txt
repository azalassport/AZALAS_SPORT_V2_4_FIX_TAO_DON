AZALAS Sport V2.4 TEST — bắt đầu nhanh

1. GIỮ BẢN PROJECT V2.3 ĐANG CHẠY, lưu commit/copy dự phòng.
2. Mở thư mục V2.4 có package.json trong VS Code, thêm .env.local của bạn.
3. Supabase azalas-test > SQL Editor: CHỈ CHẠY sql/06_RESTORE_PHIEU_CONG_NO_NHAN_SU.sql.
4. Chạy sql/07_VERIFY_HR_CONG_NO.sql nếu cần kiểm tra.
5. Chạy npm install (nếu thư mục mới) -> npm run check:syntax -> npm run typecheck -> npm run dev.
6. Kiểm tra Khách hàng > Chi tiết > + / - Tạo phiếu công nợ và Nhân sự (6 mục).

KHÔNG RESET SQL cũ. KHÔNG nhập số dư/lương thật khi chưa đối soát.
