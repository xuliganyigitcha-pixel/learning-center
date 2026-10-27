@echo off
setlocal
title O'quv markazi
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 yoki yangirog'i kerak. https://nodejs.org
  pause
  exit /b 1
)

if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo backend\.env yaratildi. Production uchun JWT secretlarni almashtiring.
)

if not exist "backend\node_modules" (
  echo Backend paketlari o'rnatilmoqda...
  pushd backend
  call npm install
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

if not exist "frontend\node_modules" (
  echo Frontend paketlari o'rnatilmoqda...
  pushd frontend
  call npm install
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

echo Ma'lumotlar bazasi tayyorlanmoqda...
pushd backend
call npx prisma generate
if errorlevel 1 (popd & pause & exit /b 1)
call npx prisma migrate deploy
if errorlevel 1 (popd & pause & exit /b 1)
call npm run prisma:seed
if errorlevel 1 (popd & pause & exit /b 1)
popd

echo Backend va frontend yangi oynalarda ishga tushmoqda...
start "Learning Center API" cmd /k "cd /d ""%~dp0backend"" && npm run start:dev"
start "Learning Center Web" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"
timeout /t 5 /nobreak >nul
start "" http://localhost:3000
echo Tayyor: http://localhost:3000
echo Kirish: superadmin / Admin123!
endlocal
