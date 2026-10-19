# Đối chiếu nội dung Word với ngân hàng v6

Nguồn chính hiện là bản `GỘP CHỦ NGHĨA XÃ HỘI KHOA HỌC - BÀI 1 2 3 4 5 6.docx` xuất trực tiếp từ [Google Docs người dùng cung cấp](https://docs.google.com/document/d/1cu38LJeR8I9mVD7imaGD2i-kYiMH0cSk6t9UoXA1Wdc/edit?tab=t.0), được kiểm tra ngày 20/10/2026. Bản xuất khớp nội dung và màu đánh dấu đáp án với 1.574 phần tử đọc trực tiếp từ Google Docs. Mã SHA256 và lần đồng bộ được lưu trong `google-docs-source.json`. Nội dung câu hỏi và đáp án không thay đổi so với nguồn Word trước đó.

Việc đối chiếu kiểm tra độ đầy đủ của câu hỏi, lựa chọn, đáp án theo Word, mệnh đề Đúng/Sai và nội dung bảng; không thay thế việc thẩm định kiến thức trong nguồn.

## Kết quả kiểm tra độc lập

Đọc trực tiếp XML trong Word tìm được **233 mục bài tập** và **25 bảng kéo thả**. 4 câu trước đây bị khuyết số câu trong bản gốc (`Câu : `) nay đã được điền số câu chuẩn xác trực tiếp vào file Word:

- Bài 3, Câu 32: quan hệ giữa dân chủ xã hội chủ nghĩa và nhà nước xã hội chủ nghĩa.
- Bài 4, Câu 45: ghép các nội dung về liên minh giai cấp, tầng lớp.
- Bài 5, Câu 38: ghép các phát biểu về quyền dân tộc.
- Bài 5, Câu 39: ghép các phát biểu về tôn giáo, tín ngưỡng.

Hiện tại toàn bộ 233 mục bài tập trong file Word đều đã có số câu đầy đủ (0 câu khuyết số), bảo lưu độc lập 100% trong ngân hàng câu hỏi (không gộp bất kỳ câu nào thành biến thể), tương ứng chính xác với từng câu trong file Word.

## Phân bố và đánh số câu theo từng bài
 
- **Bài 1 (41 câu)**: Đánh số từ Câu 1 đến Câu 41, khớp 100% với số thứ tự trong file Word gốc.
- **Bài 2 (41 câu)**: Đánh số từ Câu 1 đến Câu 41 (bổ sung 1 câu so sánh giai đoạn thấp/cao của CSCN từ `cac_cau_con_thieu_to_do.docx`).
- **Bài 3 (46 câu)**: Đánh số tuần tự từ Câu 1 đến Câu 46. Các câu số 29–41 có nhãn `[Gốc: Câu X]`. 5 câu mới bổ sung từ `CNKHXH BAI6.docx` (Câu 42–46) có nhãn `[Gốc: Câu X trong CNKHXH BAI6.docx]`.
- **Bài 4 (47 câu)**: Đánh số tuần tự từ Câu 1 đến Câu 47. Các câu số 34–45 có nhãn `[Gốc: Câu X]`. 2 câu mới bổ sung từ `CNKHXH BAI6.docx` (Câu 46–47) có nhãn `[Gốc: Câu X trong CNKHXH BAI6.docx]`.
- **Bài 5 (53 câu)**: Đánh số tuần tự từ Câu 1 đến Câu 53. Các câu số 29–39 có nhãn `[Gốc: Câu X]`. 12 câu mới bổ sung từ `CNKHXH BAI6.docx` (Câu 40–51). 2 câu mới bổ sung từ `cac_cau_con_thieu_to_do.docx` (Câu 52–53).
- **Bài 6 (27 câu)**: Đánh số từ Câu 1 đến Câu 27, khớp 100% với số thứ tự trong file Word gốc (các câu về gia đình trong file `CNKHXH BAI6.docx` đã được xác minh trùng khớp 100% với các câu có sẵn này).
- **Kiểm Tra TX (12 câu)**: Gồm 12 bài tập thường xuyên (Bài TX 1: 5 câu; Bài TX 2: 7 câu) từ file `cac_cau_con_thieu_to_do.docx`.

Tổng cộng toàn bộ web app có đúng **255 câu bài tập** (233 câu từ file Word gộp gốc + 19 câu mới từ `CNKHXH BAI6.docx` + 3 câu mới từ `cac_cau_con_thieu_to_do.docx`), bảo toàn 100% câu hỏi và đáp án chuẩn. Chạy `python audit_word_coverage.py` và `python verify_questions.py` để kiểm tra tự động.
