# Đối chiếu tài liệu Word mới

Nguồn duy nhất: `CHỦ NGHĨA XH-KH (2).docx`.

SHA256: `c41143f3c5139fa386f1d0fb63c3259f8b880565bd990fa75f13ca427970fea3`.

Đối chiếu ngày 20/10/2026: **252/252 bài tập, 15 bảng**, với **1 hiệu đính đáp án đã được người dùng duyệt**: Bài 1 Câu 10 đổi từ C trong Word gốc sang B trên ứng dụng. Không phát hiện sai lệch ngoài hiệu đính được ghi rõ này.

`audit_word_coverage.py` đọc trực tiếp XML trong DOCX, không gọi lại bộ nhập để tạo đáp án kỳ vọng. Kiểm tra toàn bộ ranh giới câu, tiêu đề, đoạn văn, ô bảng, lựa chọn, chữ tô đỏ, đáp án ghi rõ, các mệnh đề Đúng/Sai, cặp ghép và phân loại cột. Không sử dụng các phép sửa từ hoặc thay đáp án của dữ liệu cũ. Đối với hiệu đính tại `answer-corrections.json`, bộ đối chiếu kiểm tra câu dẫn, đủ bốn lựa chọn, đáp án tô đỏ gốc C và đáp án đã duyệt B; không bỏ qua kiểm tra đáp án.

Bài 1 Câu 34 có ba cụm tô đỏ ngay trong các phát biểu; chúng được thay bằng ô trống đúng vị trí. “Đảng Cộng Sản” tô đỏ đứng riêng được giữ trong danh sách lựa chọn. Các câu chọn nhiều đáp án được đối chiếu với yêu cầu chọn bao nhiêu; các lựa chọn tự đánh số bởi Word vẫn được đọc đủ.

Phần 43 câu bắt đầu lại từ Câu 1 sau Bài 5 không có tiêu đề trong nguồn, nên hiển thị ở mục Bổ sung. 12 câu kiểm tra thường xuyên ở cuối tài liệu được giữ đủ, gắn bài theo nhãn nguồn và lọc được qua tab TX.

Bài 4 Câu 40 có “Tầng lớp phụ nữ” ngoài bảng, không được chỉ định cột; mục này được lưu nguyên và hiện ghi chú, còn các mục trong bảng được chấm theo đúng cột. Dòng “chưa kiểm chứng” ở câu TX về số quy luật được giữ nguyên, cùng đáp án A đã tô đỏ. Đây là ghi chú sẵn có của nguồn.

Chạy lại `python audit_word_coverage.py` để tạo `word-coverage-report.json`, gồm vị trí XML và mã câu trên web cho đủ 252 mục. Kiểm thử có sửa cố ý câu hỏi, lựa chọn, đáp án, cặp ghép, nhóm phân loại và nội dung gốc để xác nhận bộ đối chiếu phát hiện sai lệch.
