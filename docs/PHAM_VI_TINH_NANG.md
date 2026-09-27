# AZALAS V2.3 TEST — PHẠM VI VÀ CHỨC NĂNG

Tài liệu này ngăn việc nhầm một giao diện đã dựng với nghiệp vụ đã chuyển hoàn toàn. Mọi phần mới chỉ được xác nhận sau khi kiểm tra trên `azalas-test`.

| Phân hệ | Đã có trong bộ code mới | Chưa đạt tương đương 1:1 hoặc cần kiểm thử |
|---|---|---|
| Tài khoản | Supabase Auth, OWNER/ADMIN/MEMBER, profile, avatar, đổi mật khẩu cũ + nhập mới hai lần; duyệt MEMBER | Kiểm thử email xác nhận, phục hồi tài khoản và lịch sử cấp quyền |
| Khách hàng | Thêm/sửa, mã khách, chành xe, khách và công nợ từ hóa đơn đã chốt | Các chế độ báo cáo và bộ lọc khách chuyên sâu của app cũ |
| Tạo đơn | Ngày giờ server, mã DDMMYYYY0001, hai kho TX/CK, đơn Khách đặt, gấp, ảnh upload/chọn/dán, ghi chú | Tải hàng loạt ảnh có retry khi internet chập chờn, tích hợp ảnh nâng cao |
| Chi tiết đơn/Soạn | Đơn Mới/Đang Soạn/Nợ đơn/Khách đặt, ưu tiên Gấp; bắt đầu/soạn tiếp/lưu nháp/soạn xong; nhập sản phẩm không cần tồn; xóa mềm theo role | Phân công theo kho chi tiết, thông báo realtime, đối chiếu thao tác trên thiết bị đồng thời |
| Hóa đơn | Đơn TX/CK chốt độc lập; gộp đơn cùng khách đã soạn; hóa đơn nháp, chỉnh giá/số lượng, reset, thanh toán, nợ cũ, ảnh PNG lưu Storage trước chốt, Đã gửi/Đã xóa | In hóa đơn mẫu nhiều định dạng, quy trình kế toán đối soát nhiều ngoại lệ, vận hành thanh toán sau chốt cần test kỹ |
| Hàng trả | MEMBER lập phiếu; manager duyệt; phiếu duyệt cấn trừ tối đa một lần trong hóa đơn | Đổi trả hàng thực tế và mọi phân loại tình trạng hàng từ code cũ |
| Kho ảnh | Thư viện ảnh đơn theo khách/mã, ảnh zoom, tìm kiếm | Chức năng chuyển ảnh và tối ưu thumbnail quy mô lớn |
| Rập | Danh mục, nhà may, thợ cắt, đơn rập, nhập số lượng, tiến độ, khách đặt theo ngày, lịch sử manager, ảnh ghi chú | **Ép chốt công nợ xưởng/thợ cắt** và toàn bộ bảng thanh toán chuyên ngành của code cũ CHƯA chuyển. Nút Khóa tiến độ không phải Ép chốt tiền. Tính tỷ lệ size/lớp cần đối soát số liệu thực tế. |
| Phụ liệu | Nhật ký nhập và thanh toán theo Dây kéo, Thêu, In, Vải | Quy trình chốt tháng theo từng đối tác, tính chi phí/vải và giá vốn chuyên biệt CHƯA chuyển đủ |
| Nhân sự | Tài khoản/role, hồ sơ nhân viên, chấm công, ứng lương | Bảng lương đầy đủ, ca/kỳ công, phúc lợi và báo cáo nhân sự của app cũ |
| Báo cáo | Có đường dẫn/khung và phân quyền | **Triển khai sau**, theo yêu cầu người dùng |
| Vận chuyển | Không tạo màn riêng | Bỏ theo quyết định mới; cần xác nhận trước khi tái bổ sung trạng thái vận chuyển |

## Nguyên tắc dữ liệu

- Tồn kho là module riêng: Tạo đơn không bắt buộc khai báo tồn; lúc Soạn hàng có thể tìm tên/mã để chọn biến thể, xem ảnh/màu/size/tồn theo kho. Chỉ biến thể đã chọn mới trừ tồn khi xác nhận Soạn xong; dòng nhập tay không tự trừ.
- Nợ đơn (tạm hoãn soạn) khác công nợ (tiền khách chưa thanh toán).
- Mỗi lần chốt hóa đơn có mã, ảnh và thời gian độc lập. CK hoàn thành sau TX phải tạo hóa đơn khác; không sửa ảnh TX cũ.
- Member được phép vào các màn được cấp nhưng **không có quyền backend cho các RPC của OWNER/ADMIN**.
- Ảnh trong Supabase Storage được quản lý dưới bucket PRIVATE. Đừng xóa hàng từ bảng metadata Storage bằng SQL.

## Bổ sung V2.2 (25/09/2026) — Ghi đè các ghi chú V2 chưa có tồn kho

- Tồn kho đã được bổ sung dưới dạng **module riêng**, không bị loại bỏ: `az_product_variants`, `az_stock_balances`, `az_stock_movements`; giao diện quản lý ở `/azalas/stock`; tra cứu theo tên/mã, màu, size, ảnh, kho trong Soạn hàng. Chỉ dòng được chọn từ danh mục mới tự trừ tồn tại thời điểm bấm **Soạn xong**; dòng nhập tay không tự trừ. Chưa có kiểm kê toàn hệ thống hay đồng bộ nhập hàng xưởng 1:1 với Sheets cũ.
- Rập giữ form hiện tại và tự tính gợi ý số lượng theo tổng tỷ lệ size × số lớp, song chưa tương đương toàn bộ chốt công/xưởng và các trường hợp may thực tế của app cũ.
- Hóa đơn có nhóm theo khách → vào nhóm → tick/bỏ tick đơn để lập hóa đơn; chọn bỏ không được tiêu thụ. Chụp/lưu/copy gộp một nút; quyền clipboard phụ thuộc trình duyệt, có thao tác sao chép lại.
- Hàng trả có màn chi tiết; phiếu đã duyệt của cùng khách có thể chọn vào thanh toán hóa đơn nháp. Không tự giảm công nợ chỉ vì lập phiếu chưa duyệt.
- Công nợ bảng Khách hàng tính theo các hóa đơn **mới đã chốt** và thanh toán trong Supabase, **không tự nhập số dư Sheets cũ**.
- Giao diện cần được đối chiếu trực tiếp với nghiệp vụ thực tế trước khi dùng dữ liệu thật. V2.2 không được mô tả là bản chuyển đổi 1:1 đã nghiệm thu.

## Bổ sung V2.4 (25/09/2026) — Phiếu công nợ và Nhân sự

- Chi tiết khách có **phiếu công nợ nhiều khoản** cùng ngày/lý do, xem trước, chụp và sao chép PNG trước khi chốt, lịch sử phiếu; `az_customer_balance` bao gồm phiếu cộng/trừ đã chốt. Không dùng SQL reset khi nâng cấp. Chênh lệch trừ vượt nợ được lưu thành **khách dư tiền (số âm)** — khác cách cắt về 0 của một số phiên bản code cũ và cần thống nhất nghiệp vụ trước vận hành thật.
- Nhân sự đã tách lại **6 nhóm** Nhập công, Nhập ứng, Chỉnh sửa, Báo cáo, DS nhân viên, Tài khoản. Nhập công **theo tháng**, lịch sử giá công ngày hiệu lực, sửa/xóa mềm ứng và audit; báo cáo cá nhân và tổng quát với công thức cũ. Không tự chuyển dữ liệu chấm công ngày V2.3/Sheets cũ thành công tháng, tránh cộng trùng.
- Phân quyền tài khoản chỉ OWNER/ADMIN/MEMBER; các bảng tiền/lương mới RLS chỉ OWNER/ADMIN, thao tác ghi qua RPC kiểm tra quyền. MEMBER không được tạo phiếu công nợ hay cập nhật nhân sự.
- V2.4 **chưa đồng nghĩa** với bản chuyển đổi 1:1 tất cả lịch sử Sheets, biểu mẫu phụ cấp, duyệt lương, ép chốt rập/xưởng/phụ liệu; phải đối soát phần chuyên ngành trước dữ liệu thật.
