@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [X] Node.js topilmadi.
  echo     https://nodejs.org saytidan "LTS" versiyani yuklab o'rnating,
  echo     keyin bu oynani yopib start.bat ni qayta ishga tushiring.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo [!] .env fayli yaratildi. Notepad'da BOT_TOKEN ni yozing, saqlang va Notepad'ni yoping.
  notepad .env
)

if not exist node_modules (
  echo Kutubxonalar o'rnatilmoqda, biroz kuting...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo [X] npm install xato berdi. Yuqoridagi xatoni rasmga olib yuboring.
    pause
    exit /b 1
  )
)

node src/index.js
pause
