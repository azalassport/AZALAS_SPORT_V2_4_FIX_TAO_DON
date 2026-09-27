@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js chua duoc cai hoac chua co trong PATH. Cai Node.js truoc khi chay.
  pause
  exit /b 1
)
node scripts\check-env.mjs
if errorlevel 1 (
  echo Sua .env.local roi bam file START_AZALAS_WINDOWS.cmd lai.
  pause
  exit /b 1
)
if not exist "node_modules\next\package.json" (
  echo Dang cai Next.js va cac thu vien lan dau. May can ket noi Internet.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)
echo Dang kiem tra cu phap...
call npm run check:syntax
if errorlevel 1 goto :failed
echo.
echo AZALAS Sport se chay tai http://localhost:3000
call npm run dev
if errorlevel 1 goto :failed
exit /b 0
:failed
echo Co loi. Khong xoa SQL hoac database. Gui nguyen dong loi terminal de kiem tra.
pause
exit /b 1
