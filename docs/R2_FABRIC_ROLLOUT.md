# R2 module Vải — kiểm thử trước khi gộp PR

Mục tiêu: ảnh **mới** của phiếu nhập Vải vào R2 bucket `azalas-images`, còn ảnh đã lưu trong Supabase Storage vẫn hoạt động. Supabase Database tiếp tục giữ các dữ liệu phiếu, công nợ và `document_path`.

## Trạng thái và an toàn

- Không merge PR vào `main` khi Cloudflare Preview chưa chạy thành công.
- Không xóa hoặc chuyển các ảnh Supabase Storage cũ.
- Bucket R2 `azalas-images` là private; Worker binding tên `AZALAS_IMAGES`.
- Không tạo token R2 trong frontend hay commit bất kỳ secret nào.
- `document_path` bắt đầu với `r2:` dùng API R2; đường dẫn cũ không có tiền tố này vẫn sử dụng Supabase Storage.

## Quy trình kiểm thử

1. Preview build chạy qua `npm run typecheck` và `npx cf previews deploy`.
2. Đăng nhập OWNER/ADMIN, tạo một phiếu Vải thử nghiệm với PNG.
3. Xác nhận R2 có tệp mới trong thư mục `<user-id>/vai/`, phiếu Vải được lưu trong Supabase và không tạo tệp ảnh mới trên Supabase Storage.
4. Mở ảnh vừa lưu từ trang Vải và mở một ảnh/PDF cũ của Supabase.
5. Thử MEMBER và tài khoản không đăng nhập: không được phép upload/xem chứng từ tài chính.
6. Kiểm tra thao tác thất bại: không tạo phiếu trùng, không mất ảnh đã lưu, không thay đổi số dư ngoài ý muốn.

## Lưu ý triển khai

Các thay đổi ở PR này chỉ bao gồm chứng từ **Vải**; PDF đối chiếu **In** cùng các module còn lại chưa được chuyển.
