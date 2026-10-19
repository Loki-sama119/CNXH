# Ôn tập Chủ nghĩa xã hội khoa học v6

Ứng dụng trắc nghiệm chạy trực tiếp trong trình duyệt, có phản hồi đúng/sai, lọc theo bài, xáo trộn, kéo thả, lịch sử và ôn lại câu sai. Dữ liệu đã được đối chiếu trực tiếp với [Google Docs nguồn](https://docs.google.com/document/d/1cu38LJeR8I9mVD7imaGD2i-kYiMH0cSk6t9UoXA1Wdc/edit?tab=t.0) ngày 20/10/2026.

Ngân hàng có **đúng 233 câu**, khớp 100% từng câu hỏi và phương án trong file Word người dùng gửi:
- **Bài 1**: 41 câu (Câu 1 đến Câu 41)
- **Bài 2**: 40 câu (Câu 1 đến Câu 40)
- **Bài 3**: 41 câu (Câu 1 đến Câu 41)
- **Bài 4**: 45 câu (Câu 1 đến Câu 45)
- **Bài 5**: 39 câu (Câu 1 đến Câu 39)
- **Bài 6**: 27 câu (Câu 1 đến Câu 27)

Các dạng bài: 146 câu một đáp án, 39 câu nhiều đáp án, 23 bài Đúng/Sai, 18 bài ghép vế và 7 bài phân loại hai cột.

## Chạy ứng dụng

Mở `index.html` hoặc nhấp đúp `run_app.bat`. Không cần cài đặt để sử dụng ngoại tuyến. Có thể chạy qua máy chủ:

```powershell
python -m http.server 8080
```

Sau đó mở http://localhost:8080.

## Nguồn dữ liệu và cách đánh số

- `GỘP CHỦ NGHĨA XÃ HỘI KHOA HỌC - BÀI 1 2 3 4 5 6.docx` là bản xuất trực tiếp từ Google Docs nguồn. Toàn bộ 233 bài tập được bảo lưu nguyên vẹn, không gộp bất kỳ câu nào thành biến thể.
- Mọi câu hỏi đều được đánh số tuần tự trong từng bài từ Câu 1 đến hết. Đối với các câu ở Bài 3, Bài 4, Bài 5 có số thứ tự trong bản Word gốc nhảy cóc hoặc chưa đánh số, ứng dụng hiển thị thêm nhãn `[Gốc: Câu X]` hoặc `[Gốc: Chưa đánh số]` để người học dễ dàng đối chiếu trực tiếp với file Word.
- Toàn bộ đáp án đúng (bôi đỏ hoặc ghi chú đáp án) trong file Word đều được giữ chuẩn xác 100%.
- `WORD_COVERAGE.md` và `word-coverage-report.json` đối chiếu độc lập 233 mục trong XML của Word với từng câu trên web, đạt tỷ lệ khớp 233/233 mục (0 lỗi).

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
