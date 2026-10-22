@echo off
setlocal
cd /d "%~dp0studio"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum tersedia. Pasang Node.js 20 atau lebih baru dari https://nodejs.org
  pause
  exit /b 1
)
echo.
echo  MOTIF / Short video studio
echo  Buka http://127.0.0.1:4317 di browser.
echo  Biarkan jendela ini terbuka saat studio dipakai.
echo.
node server.mjs
if errorlevel 1 pause
