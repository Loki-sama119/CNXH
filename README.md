# Ôn tập Chủ nghĩa xã hội khoa học v6

Ứng dụng trắc nghiệm chạy trực tiếp trong trình duyệt, có phản hồi đúng/sai, lọc theo bài, xáo trộn, kéo thả, lịch sử và ôn lại câu sai. Dữ liệu đã được đối chiếu trực tiếp với [Google Docs nguồn](https://docs.google.com/document/d/1cu38LJeR8I9mVD7imaGD2i-kYiMH0cSk6t9UoXA1Wdc/edit?tab=t.0) ngày 20/10/2026.

Ngân hàng có **đúng 255 câu** (gồm 233 câu chuẩn từ file GỘP gốc, 19 câu từ file `CNKHXH BAI6.docx`, và 3 câu mới cùng 12 câu bài tập trong `cac_cau_con_thieu_to_do.docx`), phân loại chuẩn xác theo từng chuyên đề:
- **Bài 1**: 41 câu (Câu 1 đến Câu 41)
- **Bài 2**: 41 câu (Câu 1 đến Câu 41, bổ sung câu so sánh giai đoạn thấp/cao của CSCN)
- **Bài 3**: 46 câu (Câu 1 đến Câu 46, bổ sung 5 câu về Dân chủ & Nhà nước từ `CNKHXH BAI6.docx`)
- **Bài 4**: 47 câu (Câu 1 đến Câu 47, bổ sung 2 câu về Cơ cấu XH & Trí thức từ `CNKHXH BAI6.docx`)
- **Bài 5**: 53 câu (Câu 1 đến Câu 53, bổ sung 12 câu từ `CNKHXH BAI6.docx` và 2 câu từ `cac_cau_con_thieu_to_do.docx`)
- **Bài 6**: 27 câu (Câu 1 đến Câu 27, bảo lưu 100% 14 câu về Gia đình đã có đầy đủ)
- **Kiểm Tra TX (12 câu)**: Gồm trọn vẹn 12 bài tập của Bài kiểm tra thường xuyên 1 (5 câu) và 2 (7 câu).

Các dạng bài: 167 câu một đáp án, 39 câu nhiều đáp án, 24 bài Đúng/Sai, 18 bài ghép vế và 7 bài phân loại hai cột.

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
