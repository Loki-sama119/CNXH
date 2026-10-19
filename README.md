# Ôn tập Chủ nghĩa xã hội khoa học v6

Ứng dụng trắc nghiệm chạy trực tiếp trong trình duyệt, có phản hồi đúng/sai, lọc theo bài, xáo trộn, kéo thả, lịch sử và ôn lại câu sai. Dữ liệu được xây dựng lại từ bản Word cập nhật ngày 19/10/2026.

Ngân hàng có **238 câu duy nhất**: Bài 1 có 39 câu, Bài 2 có 40, Bài 3 có 41, Bài 4 có 46, Bài 5 có 45 và Bài 6 có 27. **12 câu kiểm tra thường xuyên** là nhãn trên câu gốc, không cộng thêm bản sao vào tổng số.

Các dạng bài: 152 câu một đáp án, 39 câu nhiều đáp án, 22 bài Đúng/Sai, 18 bài ghép vế và 7 bài phân loại hai cột.

## Chạy ứng dụng

Mở `index.html` hoặc nhấp đúp `run_app.bat`. Không cần cài đặt để sử dụng ngoại tuyến. Có thể chạy qua máy chủ:

```powershell
python -m http.server 8080
```

Sau đó mở http://localhost:8080.

## Nguồn và cách gộp

- `GỘP CHỦ NGHĨA XÃ HỘI KHOA HỌC - BÀI 1 2 3 4 5 6.docx` là nguồn chính. Toàn bộ 233 bài tập, gồm bốn bài không đánh số, đều được lưu dấu nguồn trong ngân hàng; các bài trùng dùng chung một câu.
- `CNKHXH BAI6.docx` cung cấp bảy bài bổ sung có nội dung riêng. Các câu dân chủ được xếp vào Bài 3, liên minh vào Bài 4, dân tộc và tôn giáo vào Bài 5.
- Phần kiểm tra thường xuyên trong `CHỦ NGHĨA XH-KH (1).docx` bổ sung ba bài và gắn nhãn cho các câu đã có.
- Đáp án được đọc theo màu chữ của từng đoạn ký tự hoặc dòng đáp án ghi rõ trong Word. Các đáp án trong nguồn được giữ nguyên; kiểm thử xác nhận việc trích xuất và chấm điểm theo dữ liệu này.
- Trùng nội dung được nhận diện sau khi bỏ số câu, dấu câu và thứ tự các mệnh đề/cặp ghép. Một số câu diễn đạt lại đã được đối chiếu và gộp rõ trong trình xây dựng. Nếu cùng câu và cùng lựa chọn có đáp án mâu thuẫn, quá trình xây dựng dừng để kiểm tra.
- Các câu được gộp nhưng có cách hỏi hoặc bộ lựa chọn khác được giữ thành các phiên bản trong cùng một mục. Chọn “Các cách hỏi trong tài liệu Word” trước khi trả lời để làm từng phiên bản. Mã câu và tổng số câu không tăng lặp.
- `WORD_COVERAGE.md` giải thích cách đếm; `word-coverage-report.json` đối chiếu độc lập 233 mục trong XML của Word với từng câu trên web, bao gồm bốn câu không đánh số và đầy đủ phương án/mệnh đề/cặp ghép.
- Mã câu dựa trên nội dung, độc lập với số thứ tự hiển thị. `legacy-question-ids.json` quy đổi 263 mã của bản cũ để phần ôn lại câu sai tiếp tục hoạt động.

## Xây dựng lại dữ liệu và kiểm thử

Yêu cầu Python 3.10+ và Node.js 20+ cho công cụ phát triển:

```powershell
python -m pip install -r requirements.txt
python build_merged_questions.py
python verify_questions.py
python audit_word_coverage.py
python -m unittest discover -s tests -p "test_*.py" -v
npm install
```

Trên Windows, bộ test dùng Microsoft Edge đã cài sẵn. Trên Linux/macOS, chạy `npx playwright install chromium` trước `npm test`.

```powershell
npm test
```

Bộ test kiểm tra tính đầy đủ của nguồn, trùng câu, đáp án, số thứ tự, xây dựng lặp lại, toàn bộ 238 câu trên trình duyệt, 40 tổ hợp bộ lọc, 100 lần xáo trộn, lịch sử cũ, tải JSON dự phòng, hẹn giờ chuyển câu, ngoại tuyến và giao diện điện thoại cho cả năm dạng bài. Ảnh kiểm tra được lưu trong `tests/results/` và không đưa lên Git.

Các tệp chạy chính là `index.html`, `style.css`, `script.js`, `questions-data.js` và `questions.json`. `question-build-report.json` ghi số lượng và các bài được gộp khi xây dựng. Chỉ dùng `build_merged_questions.py` để tái tạo dữ liệu v6.
