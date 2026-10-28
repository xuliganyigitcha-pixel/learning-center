@echo off
setlocal
title O'quv markazi
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.15 yoki yangirog'i kerak. https://nodejs.org
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>24||(major===24&&minor>=15)?0:1)"
if errorlevel 1 (
  echo Node.js 24.15 yoki yangirog'i kerak. https://nodejs.org
  pause
  exit /b 1
)

if not exist "backend\.env" (
  node "backend\scripts\init-env.cjs"
  if errorlevel 1 (pause & exit /b 1)
)

if not exist "backend\node_modules" (
  echo Backend paketlari o'rnatilmoqda...
  pushd backend
  call npm ci
  if errorlevel 1 (popd & pause & exit /b 1)
  popd
)

if not exist "frontend\node_modules" (
  echo Frontend paketlari o'rnatilmoqda...
  pushd frontend
  call npm ci
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
echo Kirish: admin / Admin123!
endlocal
