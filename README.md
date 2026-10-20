# Ôn tập Chủ nghĩa xã hội khoa học

Ứng dụng trắc nghiệm dùng tài liệu `CHỦ NGHĨA XH-KH (2).docx` và phần Bài 6 người dùng gửi ngày 20/10/2026 (`BAI_6_NGUOI_DUNG.txt`). Các tài liệu, dữ liệu và công cụ ghép nguồn cũ đã được thay thế.

Ngân hàng có **261 bài tập**: giữ đủ 252 câu trong Word và thêm đúng 9 câu Bài 6 còn thiếu. Tổng gồm 182 câu một đáp án, 38 câu nhiều đáp án, 19 bài Đúng/Sai, 16 bài ghép vế và 6 bài phân loại hai cột. Các câu xuất hiện ở nhiều vị trí trong tài liệu vẫn được giữ riêng để không bỏ sót nguồn.

- Bài 1: 41 câu.
- Bài 2: 45 câu.
- Bài 3: 39 câu.
- Bài 4: 45 câu.
- Bài 5: 39 câu.
- Bài 6: 23 câu về gia đình. Câu 1–20 theo thứ tự danh sách người dùng gửi; câu 21–23 là ba câu khác về gia đình đã có trong Word. Chuyển 14 câu cũ sang đúng mục, giữ nguyên ID, nội dung và đáp án.
- Bổ sung: 29 câu hỗn hợp còn lại từ phần không có tiêu đề trong Word; không gán toàn bộ phần này cho Bài 6.
- Tab Kiểm Tra TX lọc 12 câu đã có trong các bài trên (TX 1: 5 câu, TX 2: 7 câu), không cộng thêm vào tổng.

## Cách sử dụng

Mở `index.html` hoặc nhấp đúp `run_app.bat`. Ứng dụng chạy ngoại tuyến, không cần tải phông chữ từ mạng. Có thể dùng máy chủ cục bộ:

```powershell
python -m http.server 8080
```

Sau đó mở http://localhost:8080.

Đáp án lấy từ phần chữ tô đỏ và các bảng/dòng đáp án trong tài liệu. Với câu ghép vế có đáp án tô đỏ nằm trong phát biểu, cụm đỏ được thay bằng ô trống và đưa vào danh sách lựa chọn. Các mục tô đỏ đứng riêng vẫn được giữ trong danh sách lựa chọn. Câu phân loại được đọc theo cột, không chuyển nhầm thành ghép từng hàng. Không áp dụng các chỉnh sửa nội dung hoặc đáp án từ ngân hàng cũ. Hiệu đính được người dùng duyệt lưu riêng trong `answer-corrections.json`: ngày 20/10/2026, Bài 1 Câu 10 đổi từ C sang **B. Trình độ khoa học kỹ thuật chưa cao**; Bài 4 Câu 40 bổ sung **Tầng lớp phụ nữ** vào cột **Thành phần/yếu tố của liên minh** theo ảnh bảng đáp án. Câu 40 có đủ 8 mục, mỗi cột 4 mục. Word gốc giữ nguyên; `answer_correction` và `category_correction` trong JSON ghi lại căn cứ và phần hiệu đính.

Câu được đánh số tuần tự trong từng mục; nhãn “Gốc: Câu …” cho phép đối chiếu khi số hiển thị khác số trong Word. Nội dung gốc của từng câu và bảng được lưu tại `source_title`, `source_content` và `sources` trong JSON.

Ghi chú “chưa kiểm chứng” của câu TX về số quy luật được giữ nguyên. Câu 40 đã được người dùng cung cấp ảnh xác nhận cột đáp án nên không còn ghi chú thiếu cột cho “Tầng lớp phụ nữ”. Ứng dụng giữ đáp án đã đánh dấu trong nguồn, ngoại trừ các hiệu đính đã được người dùng duyệt nêu trên.

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

Bộ đối chiếu XML độc lập kiểm tra đủ 252/252 bài tập, 15 bảng, nội dung lựa chọn, chữ tô đỏ, đáp án Đúng/Sai, các cặp ghép và phân loại. 16 kiểm thử Python còn kiểm tra các lỗi nhập liệu đặc biệt, tính lặp lại và phát hiện khi nội dung/đáp án bị sửa sai. Bộ kiểm thử trình duyệt thực hiện chấm điểm cả 261 câu, 45 tổ hợp bộ lọc, 100 lần xáo trộn, ôn câu sai, xoá lịch sử cũ, giữ lịch sử mới, tải JSON dự phòng và ngoại tuyến. Toàn bộ câu được kiểm tra tràn ngang ở chiều rộng 320, 390 và 768 px; ảnh giao diện lưu ở `tests/results/` và không đưa lên Git.

Các tệp chạy chính: `index.html`, `style.css`, `script.js`, `questions-data.js`, `questions.json`. `question-build-report.json` lưu số lượng và SHA256 nguồn; `word-coverage-report.json` lưu ánh xạ đối chiếu từng câu.

## Bài 6 bổ sung

Chỉ thêm các câu gốc 1, 7, 11, 12, 13, 15, 18, 19 và 20. Cấu trúc, đáp án và ánh xạ 11 câu tương ứng đã có lưu trong `supplemental-lesson6.json`; `supplementary_questions.py` bổ sung dữ liệu khi xây dựng, đồng thời đối chiếu trực tiếp với văn bản người dùng. Câu 13 giữ đủ bốn phát biểu Đúng/Sai; Câu 20 giữ bảng phân loại hai cột với ba mục mỗi cột, không chuyển thành ghép hàng.

Đáp án theo thứ tự lựa chọn trong văn bản mới: 1 A; 7 D; 11 B,C; 12 B; 13 Sai–Đúng–Sai–Đúng; 15 C,D; 18 B (câu hỏi chọn phát biểu sai); 19 C. Câu 20 theo đúng hai cột người dùng cung cấp. Các đáp án được đối chiếu Chương 7 giáo trình trên website Trường Đại học Tài nguyên và Môi trường TP.HCM; đường dẫn và mục tham chiếu nằm trong `answer_verification`. Các chữ đáp án của 11 câu cũ có thể khác vì thứ tự lựa chọn trong Word khác văn bản mới.
