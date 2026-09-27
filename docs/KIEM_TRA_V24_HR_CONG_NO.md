# Kiểm thử V2.4 — Bản TEST

1. Lưu commit bản V2.3 đang chạy; SQL Editor chỉ chạy 06, sau đó chạy 07 từng SELECT.
2. Khách A TEST: tạo phiếu 2 dòng +50.000 và −20.000 → xem trước → chụp PNG (có thể tải PNG) → chốt → số dư tăng 30.000, có phiếu 2 dòng.
3. Reload trang và thử bấm lại submit khi server bị chậm: request_key chống tạo trùng. Nếu nợ thay đổi giữa preview/chốt thì server yêu cầu tải lại, không ghi phiếu sai ảnh.
4. Nhập nhân viên TEST (tên, ngày vào, giá công) → nhập công tháng 23,3 công + tăng ca và thưởng → lần nhập trùng phải báo lỗi. Sửa riêng thưởng ở Chỉnh sửa phải giữ nguyên công/tăng ca.
5. Nhập ứng 100.000, sửa thành 80.000, xem Báo cáo cá nhân và Tổng quát, xóa mềm ứng; báo cáo không tính phiếu đã xóa.
6. Tài khoản MEMBER không được truy cập Khách hàng/Nhân sự và không được gọi az_create_debt_slip/az_hr_save_month. Tài khoản ADMIN/OWNER có quyền, OWNER cuối cùng không được tự khóa.

Không ghi tiền/lương thật cho đến khi kiểm thử và đối soát dữ liệu gốc.
