@echo off
setlocal
cd /d "%~dp0studio"
where node >nul 2>nul
if errorlevel 1 (
  echo Pasang Node.js 20 atau lebih baru dari https://nodejs.org lalu ulangi.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm belum tersedia. Pasang kembali Node.js dengan npm.
  pause
  exit /b 1
)
echo.
echo  MOTIF / Setup narasi dan renderer
echo  Dependensi diunduh ke folder proyek. Koneksi internet diperlukan.
echo  Login Flow dan pairing Brave dilakukan terpisah dari halaman studio.
echo.
call npm --prefix automation run setup
if errorlevel 1 (
  echo.
  echo Setup belum selesai. Lihat pesan di atas.
  pause
  exit /b 1
)
echo.
echo Setup diperiksa. Tutup jendela studio lama, lalu buka Mulai Studio.cmd.
pause
