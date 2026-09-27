# CHECKLIST TEST AZALAS V2 TRÊN `azalas-test`

- [ ] 00 RESET chạy đúng project, 01 CREATE ALL thành công, 02 SET OWNER đúng tài khoản, 03 VERIFY danh sách bảng; 4 bucket đều PRIVATE.
- [ ] `.env.local` có URL + publishable key, không có service_role/secret; `npm run check:syntax` và `npm run dev` chạy được.
- [ ] OWNER đăng nhập, trang `/azalas` có sidebar PC, menu mobile, ngày hiện tại, avatar mở hồ sơ; nút Back đi lên đúng màn trước.
- [ ] Khách hàng: tạo khách tên bắt buộc, SĐT/địa chỉ/chành xe; tìm lại khách.
- [ ] Tạo đơn Thường: tick TX + CK; một mã gốc, hai mã con TX/CK riêng; ảnh Ctrl+V/upload xem được trong chi tiết.
- [ ] Soạn riêng TX rồi xác nhận; CK chưa soạn không xuất hiện trong danh sách hóa đơn. Soạn xong CK sau thì nó xuất hiện **sau**; hóa đơn TX đã chốt không bị đổi.
- [ ] Chi tiết đơn: gấp ưu tiên mỗi kho, mới/đang soạn/nợ đơn/khách đặt; lưu nháp, soạn tiếp; MEMBER không thể xóa.
- [ ] Hóa đơn: lập từ TX, kiểm số lượng/giá, nhập thanh toán, lưu nháp; upload ảnh PNG **thành công** mới chốt; ảnh nằm trong Đã gửi và có thể copy Zalo.
- [ ] Thanh toán/hàng trả: lập phiếu, duyệt, cấn trừ chỉ một lần; không cho dùng phiếu chưa duyệt; không cho thanh toán vượt số tiền.
- [ ] Kho ảnh: xem ảnh đơn theo khách/mã và bấm ảnh xem lớn.
- [ ] Rập: tạo mã rập, đơn rập, nhập phần hàng, tìm kiếm tiến độ; MEMBER chỉ thấy tiến độ hạn chế, không thấy giá vốn/tiền công hay nút sửa/khóa.
- [ ] Phụ liệu: tạo đối tác, ghi nhập, thanh toán, kiểm tra danh sách theo phân hệ; không coi đây là quy trình chốt tháng hoàn chỉnh.
- [ ] Nhân sự: OWNER kích hoạt MEMBER; MEMBER đăng nhập không vào được Tạo đơn, Hóa đơn, Khách hàng, Nhân sự; backend RPC cũng từ chối.
- [ ] Di động: input không tự phóng to (font ≥ 16px), bảng không tràn trang, menu mở/đóng được, ảnh phóng to/thoát, Back đúng.
- [ ] Chạy lại trên dữ liệu TEST đa dạng trước khi dùng thật; nếu lỗi, giữ ảnh lỗi và log terminal, **không reset lại Supabase ngay**.
