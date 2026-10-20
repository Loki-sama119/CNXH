@echo off
chcp 65001 > nul
echo ===================================================
echo   HỆ THỐNG TRẮC NGHIỆM CHỦ NGHĨA XÃ HỘI KHOA HỌC
echo   252 CÂU HỎI THEO TÀI LIỆU WORD MỚI
echo ===================================================
echo Đang mở trang web trên trình duyệt...
start "" "%~dp0index.html"
echo.
echo Đã mở thành công! Bạn có thể làm bài trực tiếp ngay bây giờ.
echo (Nếu muốn chạy qua Local Server: mở cmd và gõ: python -m http.server 8080)
pause
