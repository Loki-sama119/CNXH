# Ôn tập Nghiệp vụ thư ký văn phòng

Ứng dụng trắc nghiệm ôn thi tương tác phản hồi tức thì xây dựng từ tài liệu chuẩn: `NGHIỆP VỤ THƯ KÝ VP (1).docx`.

Toàn bộ dữ liệu ngân hàng câu hỏi được chuẩn hóa theo môn **Nghiệp vụ thư ký văn phòng**.

## Ngân hàng câu hỏi

Ngân hàng gồm tổng cộng **276 câu hỏi trắc nghiệm** (100% dạng 4 lựa chọn A, B, C, D với 1 đáp án đúng chuẩn xác định từ chữ tô đỏ trong văn bản gốc):

- **Bài 1**: 31 câu
- **Bài 2**: 34 câu
- **Bài 3**: 30 câu
- **Bài 4**: 33 câu
- **Bài 5**: 30 câu
- **Bài 6**: 30 câu
- **Bài 7**: 35 câu
- **Bài 8**: 32 câu
- **Bài 9**: 21 câu

## Cách sử dụng

1. Mở trực tiếp file `index.html` hoặc nhấp đúp file `run_app.bat`. Ứng dụng chạy ngoại tuyến (offline) hoàn toàn trên trình duyệt, không cần Internet.
2. Nếu muốn chạy qua Local Server:
   ```powershell
   python -m http.server 8080
   ```
   Sau đó mở http://localhost:8080 trên trình duyệt.

## Tính năng nổi bật
- **Phản hồi tức thì**: Chọn phương án là biết ngay Đúng / Sai kèm âm thanh và hiệu ứng sinh động.
- **Lọc theo bài học**: Chọn luyện tập theo từng bài từ Bài 1 đến Bài 9 hoặc luyện tập tất cả 276 câu.
- **Xáo trộn câu hỏi & đáp án**: Shuffle ngẫu nhiên giúp tránh học vẹt vị trí đáp án.
- **Bảng điều hướng câu hỏi**: Bảng câu hỏi trực quan hiển thị trạng thái chưa làm / đúng / sai và nhảy nhanh đến câu bất kỳ.
- **Ôn lại câu làm sai**: Mục ôn tập và đối chiếu đáp án chi tiết các câu đã chọn sai sau khi hoàn thành.
- **Lịch sử làm bài & Bảng xếp hạng**: Tự động lưu tiến trình và vinh danh điểm số theo từng phạm vi bài học.
- **Giao diện hiện đại**: Hỗ trợ chế độ Sáng / Tối (Dark / Light Mode), tương thích hoàn hảo từ di động đến máy tính để bàn.

## Xây dựng và kiểm tra

Yêu cầu Python 3.10+ và Node.js 20+:

```powershell
python -m pip install -r requirements.txt
python import_questions.py
python verify_questions.py
python audit_word_coverage.py
python -m unittest discover -s tests -p "test_*.py" -v
npm test
```
