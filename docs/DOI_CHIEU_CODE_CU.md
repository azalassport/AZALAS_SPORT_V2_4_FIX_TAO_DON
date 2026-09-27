# ĐỐI CHIẾU TỪ CODE.GS + INDEX.HTML TEST SANG AZALAS V2

Hai tệp nguồn user đưa là **bản tham khảo nghiệp vụ và phong cách**, không được copy nguyên `Code.gs`/`Index.html` vào ZIP mới: trong chúng có IDs Google Sheets/Drive và nhiều patch Apps Script phụ thuộc môi trường cũ. Chức năng mới thay Google Sheet bằng PostgreSQL/Supabase Storage/Auth, với mỗi module tách thư mục, component và RPC.

| Màn hình / nghiệp vụ nguồn | Nơi triển khai trong bộ mới |
|---|---|
| `screen-tao-don`, `submitDon`, chọn Tân Xuân/Cá Koi, ảnh Ctrl+V | `app/azalas/orders/new`, `az_create_order`, `az_attach_order_image`, `az-order-images` |
| `screen-ct-don`, Mới/Đang soạn/Nợ đơn/Khách đặt | `app/azalas/orders`, các RPC `az_*order*`, `az_*pack*`, `order_status_events` |
| `screen-soan-chi-tiet`, `saveSoanHang`, ghi chú nhân viên | `app/azalas/orders/[id]/pack`, `order_items`, trạng thái `DA_SOAN` |
| `screen-hoa-don`, `screen-bill-detail`, `groupOrdersForBill`, `savePayment`, chụp ảnh V52 | `app/azalas/invoices`, `invoices` và bảng snapshot dòng hàng/thanh toán, `az_invoice_finalize`, `az-invoice-images` |
| Hàng trả và phiếu duyệt | `app/azalas/returns`, `return_slips`, `return_items`; phiếu duyệt chỉ cấn trừ một lần |
| Khách hàng, V81 chành xe/SĐT chành xe | `app/azalas/customers`, `az_customers` |
| `screen-rap-menu`, `rap-them`, `rap-xem`, nhà may/thợ cắt và mã rập/ảnh | `app/azalas/patterns/*`, `pattern_*`, `sewing_houses`, `cutters` |
| Phụ liệu dây kéo, thêu, Nhật/Tùng in, vải | `app/azalas/materials/*`, `supply_*` (chưa đủ chốt chuyên ngành) |
| `screen-nhan-su`, hồ sơ tài khoản | `app/azalas/staff`, `app/azalas/account`, Supabase Auth |
| CSS nguồn: Inter, chủ đạo xanh `#1e62c1`, nền `#f4f7f9`, thẻ sáng, mobile card | `app/globals.css` + Tailwind v3, AppShell/sidebar + ImageViewer |

**Các thay đổi cố ý theo yêu cầu mới:** Không còn màn Vận chuyển riêng; MEMBER không được Tạo đơn; chỉ 3 role; tách kho độc lập khi soạn và chốt; bắt buộc lưu ảnh rồi mới chốt; không bắt khai báo tồn kho. Nghiệp vụ chỉ có ở code cũ nhưng chưa được bảo toàn đầy đủ được ghi tại `PHAM_VI_TINH_NANG.md`.
