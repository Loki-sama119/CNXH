# Ôn tập Chủ nghĩa xã hội khoa học

Ứng dụng trắc nghiệm dùng duy nhất tài liệu `CHỦ NGHĨA XH-KH (2).docx` do người dùng cung cấp ngày 20/10/2026. Các tài liệu, dữ liệu và công cụ ghép nguồn cũ đã được thay thế.

Ngân hàng giữ đủ **252 bài tập** trong tài liệu, gồm 177 câu một đáp án, 36 câu nhiều đáp án, 18 bài Đúng/Sai, 16 bài ghép vế và 5 bài phân loại hai cột. Các câu xuất hiện ở nhiều vị trí trong tài liệu vẫn được giữ riêng để không bỏ sót nguồn.

- Bài 1: 41 câu.
- Bài 2: 45 câu.
- Bài 3: 39 câu.
- Bài 4: 45 câu.
- Bài 5: 39 câu.
- Bổ sung: 43 câu bắt đầu lại từ Câu 1 sau Bài 5 nhưng không có tiêu đề bài trong tài liệu. Không tự đặt tên phần này là Bài 6.
- Tab Kiểm Tra TX lọc 12 câu đã có trong các bài trên (TX 1: 5 câu, TX 2: 7 câu), không cộng thêm vào tổng.

## Cách sử dụng

Mở `index.html` hoặc nhấp đúp `run_app.bat`. Ứng dụng chạy ngoại tuyến, không cần tải phông chữ từ mạng. Có thể dùng máy chủ cục bộ:

```powershell
python -m http.server 8080
```

Sau đó mở http://localhost:8080.

Đáp án lấy từ phần chữ tô đỏ và các bảng/dòng đáp án trong tài liệu. Với câu ghép vế có đáp án tô đỏ nằm trong phát biểu, cụm đỏ được thay bằng ô trống và đưa vào danh sách lựa chọn. Các mục tô đỏ đứng riêng vẫn được giữ trong danh sách lựa chọn. Câu phân loại được đọc theo cột, không chuyển nhầm thành ghép từng hàng. Không áp dụng các chỉnh sửa nội dung hoặc đáp án từ ngân hàng cũ. Hiệu đính được người dùng duyệt lưu riêng trong `answer-corrections.json`: ngày 20/10/2026, Bài 1 Câu 10 đổi từ C sang **B. Trình độ khoa học kỹ thuật chưa cao**. Word gốc giữ nguyên; `answer_correction` trong JSON lưu cả đáp án gốc và đáp án được duyệt.

Câu được đánh số tuần tự trong từng mục; nhãn “Gốc: Câu …” cho phép đối chiếu khi số hiển thị khác số trong Word. Nội dung gốc của từng câu và bảng được lưu tại `source_title`, `source_content` và `sources` trong JSON.

Hai ghi chú của nguồn được giữ rõ trên câu liên quan: Bài 4 Câu 40 có “Tầng lớp phụ nữ” nằm ngoài bảng, không có cột đáp án; câu TX về số quy luật có dòng “chưa kiểm chứng”. Ứng dụng giữ đáp án đã đánh dấu trong nguồn, ngoại trừ hiệu đính đã được người dùng duyệt nêu trên.

Khi chuyển sang ngân hàng mới, lịch sử, bảng điểm và bộ lọc cũ được xoá một lần trên trình duyệt. Kết quả của ngân hàng mới được giữ khi tải lại trang.

## Xây dựng và kiểm tra

Yêu cầu Python 3.10+ và Node.js 20+:

```powershell
python -m pip install -r requirements.txt
python import_questions.py
python verify_questions.py
python audit_word_coverage.py
python -m unittest discover -s tests -p "test_*.py" -v
npm ci --ignore-scripts
npm test
```

Trên Windows, kiểm thử trình duyệt dùng Edge. Trên Linux/macOS, cài Chromium bằng `npx playwright install --with-deps chromium` trước khi chạy `npm test`.

Bộ đối chiếu XML độc lập kiểm tra đủ 252/252 bài tập, 15 bảng, nội dung lựa chọn, chữ tô đỏ, đáp án Đúng/Sai, các cặp ghép và phân loại. 14 kiểm thử Python còn kiểm tra các lỗi nhập liệu đặc biệt, tính lặp lại và phát hiện khi nội dung/đáp án bị sửa sai. Bộ kiểm thử trình duyệt thực hiện chấm điểm cả 252 câu, 40 tổ hợp bộ lọc, 100 lần xáo trộn, ôn câu sai, xoá lịch sử cũ, giữ lịch sử mới, tải JSON dự phòng và ngoại tuyến. Toàn bộ câu được kiểm tra tràn ngang ở chiều rộng 320, 390 và 768 px; ảnh giao diện lưu ở `tests/results/` và không đưa lên Git.

Các tệp chạy chính: `index.html`, `style.css`, `script.js`, `questions-data.js`, `questions.json`. `question-build-report.json` lưu số lượng và SHA256 nguồn; `word-coverage-report.json` lưu ánh xạ đối chiếu từng câu.
