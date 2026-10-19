# Đối chiếu nội dung Word với ngân hàng v6

Nguồn chính là bản `GỘP CHỦ NGHĨA XÃ HỘI KHOA HỌC - BÀI 1 2 3 4 5 6.docx` người dùng gửi. Bản trong repo khớp SHA256 với bản nguồn. Việc đối chiếu kiểm tra độ đầy đủ của câu hỏi, lựa chọn, đáp án theo Word, mệnh đề Đúng/Sai và nội dung bảng; không thay thế việc thẩm định kiến thức trong nguồn.

## Kết quả kiểm tra độc lập

Đọc trực tiếp XML trong Word tìm được **233 mục bài tập**, **25 bảng kéo thả** và **4 mục không đánh số**. Cả 233 mục đều có vị trí tương ứng trong ngân hàng. Không có bảng hoặc đoạn nội dung nằm ngoài các mục đã nhận diện.

Bốn câu khuyết số đang nằm trên web tại:

- Bài 3, Câu 31: quan hệ giữa dân chủ xã hội chủ nghĩa và nhà nước xã hội chủ nghĩa.
- Bài 4, Câu 45: ghép các nội dung về liên minh giai cấp, tầng lớp.
- Bài 5, Câu 38: ghép các phát biểu về quyền dân tộc.
- Bài 5, Câu 39: ghép các phát biểu về tôn giáo, tín ngưỡng.

## Vì sao các tổng số khác nhau

Đếm trong Word trước khi gộp: **185 câu chọn đáp án + 23 cụm Đúng/Sai + 25 bài kéo thả = 233 mục**. Nếu tách mỗi cụm Đúng/Sai thành bốn mệnh đề, tổng là **185 + 92 + 25 = 302**.

Năm mục dùng chung một câu trên web: Bài 1 câu nguồn 20/26, Bài 1 cụm 33/36, Bài 2 câu 7/10, Bài 3 câu 5/10, và hai cụm Đúng/Sai cùng mang số 38 ở Bài 3. Hai cụm Đúng/Sai lặp có cùng mệnh đề và đáp án nhưng đổi thứ tự. Ba cặp câu chọn đáp án có cách hỏi hoặc lựa chọn khác nhau; mọi phiên bản đều được giữ và có thể chọn để làm trong cùng một mục.

Riêng nguồn Word chính sau khi gộp thành các mục không lặp: **228 mục = 182 câu chọn đáp án + 21 cụm Đúng/Sai + 25 bài kéo thả**. Tách 21 cụm thành 84 mệnh đề thì có **291 đơn vị**, theo cùng cách đếm “mỗi mệnh đề là một câu”. Tổng theo bài khi dùng cách này:

- Bài 1: 31 chọn đáp án + 16 mệnh đề + 4 kéo thả = **51**.
- Bài 2: 31 chọn đáp án + 20 mệnh đề + 3 kéo thả = **54**.
- Bài 3: 31 chọn đáp án + 16 mệnh đề + 4 kéo thả = **51**.
- Bài 4: 36 chọn đáp án + 16 mệnh đề + 5 kéo thả = **57**.
- Bài 5: 30 chọn đáp án + 8 mệnh đề + 7 kéo thả = **45**.
- Bài 6: 23 chọn đáp án + 8 mệnh đề + 2 kéo thả = **33**.

Ngân hàng toàn web có thêm 10 mục riêng từ hai tài liệu bổ sung, nên hiển thị **238 mục bài tập**. Nếu tách mệnh đề Đúng/Sai, toàn web có **304 đơn vị**. Tab TX là nhãn trên 12 câu đã có, không cộng thêm bản sao.

Bảng người dùng gửi cộng các hàng thành **292**, và cột kéo thả cộng thành **30**; các tổng ghi 291 và 29 trong bảng đó không khớp phép cộng từng hàng. Cách phân loại trong bảng cũng khác kết quả đọc trực tiếp Word ở trên.

Chạy `python audit_word_coverage.py` để tái kiểm tra. Tệp `word-coverage-report.json` chứa ánh xạ từng mục theo vị trí XML sang mã câu và số câu trên web. Bộ test cố ý xoá phiên bản thay thế để xác nhận việc thiếu nội dung sẽ bị phát hiện.
