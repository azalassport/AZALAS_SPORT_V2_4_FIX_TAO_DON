# AZALAS SPORT V2.4 TEST — KHÔI PHỤC PHIẾU CÔNG NỢ + 6 NHÓM NHÂN SỰ

Bản **trọn bộ project** dựa trên AZALAS Sport V2.3. Toàn bộ các phần Tạo đơn, Soạn hàng, Hóa đơn, Hàng trả, Rập, Phụ liệu, Kho ảnh, Tồn kho từ V2.3 vẫn giữ nguyên; bổ sung giao diện và backend của hai phần bị thiếu sau khi đối chiếu Code.gs / Index.html TEST bạn gửi.

**Chỉ dùng trên Supabase `azalas-test`. Chưa được đối soát với dữ liệu tiền và lương thật.** Bản này khôi phục các nghiệp vụ chính, không phải tuyên bố mọi ngóc ngách của 77.000+ dòng Apps Script đã được chuyển nguyên xi.

## 1. CÀI LÊN PROJECT V2.3 ĐANG CHẠY — KHÔNG RESET DATABASE

1. GitHub Desktop: tạo commit sao lưu V2.3 hoặc copy nguyên thư mục sang nơi khác. Không lưu `.env.local` vào Git.
2. Giải nén ZIP. Có thể mở thư mục V2.4 mới bằng VS Code thay vì chép đè lên project cũ. Đặt file `.env.local` hiện đang chạy vào thư mục mới **trên máy của bạn**. Không gửi URL/key qua chat.
3. Trên Supabase Dashboard, chọn **đúng project `azalas-test`** → SQL Editor → New query → dán **TOÀN BỘ** `sql/06_RESTORE_PHIEU_CONG_NO_NHAN_SU.sql` → Run. Đây là SQL bổ sung, **không xóa khách, hóa đơn, phiếu hàng trả, rập, tồn kho hoặc tài khoản**.
4. Chạy `sql/07_VERIFY_HR_CONG_NO.sql`; lưu ý SQL Editor thường chỉ hiển thị kết quả câu SELECT cuối, cần chạy từng SELECT để xem hết.
5. Chạy `npm install` nếu mở thư mục mới, tiếp theo `npm run check:syntax`, `npm run typecheck`, rồi `npm run dev`. Không mở song song hai server cùng cổng 3000. Truy cập `http://localhost:3000`.

**KHÔNG chạy lại** `00_RESET_TEST_ONLY.sql`, `01_CREATE_ALL.sql`, `02_SET_OWNER.sql` hay `04_UPGRADE_V2_2_KHO_SAN_PHAM_TAI_CHINH.sql` khi chỉ nâng cấp từ V2.3 đang chạy. Không cần tạo thêm bucket Storage cho phiếu công nợ/nhân sự: phiếu này lưu dữ liệu trong Postgres.

## 2. KHÁCH HÀNG → CHI TIẾT → ＋/－ TẠO PHIẾU CÔNG NỢ

- Thêm nhiều dòng **Mua nợ / Cộng thêm** và **Trả tiền / Trừ nợ**, mỗi dòng có ngày, số tiền, lý do; thêm hoặc xóa dòng trước khi chốt.
- **Xem trước phiếu**, chụp ảnh PNG và thử sao chép để Ctrl + V qua Zalo (có nút tải PNG nếu clipboard bị chặn). Chỉ hiện/cho bấm Chốt phiếu sau khi chụp thành công. Ảnh phiếu này dùng để gửi khách và không được upload vào Storage; nhật ký phiếu và từng dòng mới là chứng từ dữ liệu lưu trong Postgres.
- Ghi header/chi tiết phiếu cùng lúc bằng một RPC PostgreSQL (`az_create_debt_slip`) và khóa bản ghi khách chống hai thao tác cùng lúc. Client giữ `request_key` để lần thử lại sau lỗi mạng **không ghi trùng phiếu**.
- Tự cộng phiếu vào `az_customer_balance`, vì vậy trang Khách hàng, Hóa đơn và các RPC liên quan đều đọc số dư đã điều chỉnh. Hóa đơn **đã chốt và ảnh chứng từ đã lưu không bị sửa ngược**. Nếu phiếu chốt trong lúc hóa đơn đang mở, luồng chốt sẽ yêu cầu làm mới nợ cũ/chụp lại ảnh.
- Lịch sử 40 phiếu gần nhất và từng dòng công nợ trong Chi tiết khách.
- **Điểm khác bản Apps Script cũ:** nếu khách trả vượt nợ, giữ số âm làm **tiền khách dư** thay vì làm mất chênh lệch. Cần quy tắc xử lý/hoàn tiền trước khi dùng tiền thật.

## 3. NHÂN SỰ — 6 NHÓM NHƯ BẢN CŨ

1. **Nhập công:** chọn nhân viên, tháng/năm, số công thập phân, giờ tăng ca, thưởng. Chặn nhập trùng người/tháng; phiếu sai sửa ở Chỉnh sửa.
2. **Nhập ứng:** chọn nhân viên, ngày, số tiền, lý do; có danh sách ứng theo tháng.
3. **Chỉnh sửa:** đổi giá công theo ngày hiệu lực (và giá tăng ca), sửa phiếu công tháng (để trống ô không sửa), sửa/xóa mềm phiếu ứng; ghi nhật ký thao tác.
4. **Báo cáo:** cá nhân theo khoảng tháng (bảng công và ứng), tổng quát xưởng và phần còn lại.
5. **DS nhân viên:** thêm NV (tên, SĐT, ngày vào, giá công), tra cứu, xem lịch sử công/ứng, sửa SĐT, đánh dấu nghỉ/đi làm lại.
6. **Tài khoản:** chỉ **OWNER / ADMIN / MEMBER**; kích hoạt/tạm khóa và đổi role. Không tạo Auth user bằng secret key trong trình duyệt.

Công thức báo cáo: `số công × giá công có hiệu lực trong tháng + giờ tăng ca × đơn giá tăng ca + thưởng − tiền ứng`. Giá tăng ca mặc định 30 như logic cũ nhưng có thể chỉnh; thống nhất **đơn vị tiền** trước khi nhập (ví dụ dùng VND toàn bộ).

**Dữ liệu V2.3 `attendance` từng ngày (nếu bạn từng nhập thử) không bị xóa và không tự biến thành phiếu công tháng**, vì cấu trúc khác nhau. Dữ liệu Google Sheets cũ cũng không được tự động import. Nếu bạn cần migrate lịch sử cũ sang các bảng mới, đối chiếu riêng trước để tránh tính lương hai lần.

## 4. KIỂM THỬ NHANH

- OWNER: mở khách TEST → tạo phiếu +50.000, −20.000 trong cùng phiếu → xem trước → chốt một lần → tải lại khách phải tăng 30.000, lịch sử có 2 dòng. Bấm reload không được tăng thêm.
- Tạo 1 phiếu trừ vượt nợ **chỉ trên khách TEST**, xác nhận giao diện ghi “Khách dư tiền”.
- Tạo NV TEST, đặt giá công, nhập 23,3 công tháng hiện tại, thêm tăng ca và thưởng; thử nhập lại cùng tháng phải bị chặn.
- Nhập ứng TEST, sửa ứng ở tab Chỉnh sửa, kiểm tra Báo cáo cá nhân và Tổng quát thay đổi đúng. Thử Xóa ứng mềm và kiểm tra báo cáo bỏ khoản đó.
- Tạo tài khoản MEMBER TEST: không vào được Khách hàng/Nhân sự và không gọi được RPC tài chính/nhân sự trực tiếp. ADMIN có quyền quản trị; OWNER cuối cùng không thể tự vô hiệu hóa.

## 5. GIỚI HẠN KIỂM THỬ

Kiểm tra cú pháp/đường dẫn source không thay cho `npm run typecheck`, `npm run build` hoặc thử nghiệp vụ thật với Supabase của bạn. Bản này chưa được xác nhận trực tiếp trên tài khoản Supabase và không tự chạy SQL giúp bạn. Nhân sự V2.4 khôi phục sáu luồng chính nhưng các báo cáo đặc biệt/tùy chỉnh sheet cũ vẫn phải đối soát nếu muốn 1:1 tuyệt đối.

Nếu xuất hiện lỗi, ghi **mã lỗi, URL màn hình và dòng terminal**; đừng reset database hoặc bấm chốt tiền lần thứ hai theo một thao tác mới trước khi kiểm tra lịch sử phiếu.
