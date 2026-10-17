@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem --- Mos Python versiyasini topish (3.10 - 3.14) ---
rem Python 3.15 juda yangi: ba'zi kutubxonalar uchun tayyor paketlar hali yo'q.
set "PY="
for %%V in (3.13 3.12 3.14 3.11 3.10) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>nul && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,14) else 1)" >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo.
  echo [X] Mos Python topilmadi. Python 3.13 kerak.
  echo     Yuklab olish: https://www.python.org/downloads/windows/
  echo     Ro'yxatdan eng yangi "Python 3.13.x" ni toping va "Windows installer ^(64-bit^)" ni yuklang.
  echo     O'rnatishda "Add python.exe to PATH" belgisini qo'ying.
  echo     Python 3.15 ni o'chirish shart emas - bot 3.13 ni o'zi topadi.
  echo.
  pause
  exit /b 1
)
echo Python: %PY%

rem --- Eski/mos kelmaydigan virtual muhitni qayta yaratish ---
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe -c "import sys; sys.exit(0 if sys.version_info[:2] <= (3,14) else 1)" >nul 2>nul
  if errorlevel 1 (
    echo Eski virtual muhit o'chirilmoqda...
    rmdir /s /q .venv
  )
)
if not exist .venv\Scripts\python.exe (
  echo Virtual muhit yaratilmoqda...
  %PY% -m venv .venv
  if errorlevel 1 ( echo [X] Virtual muhit yaratilmadi. & pause & exit /b 1 )
)

if not exist .env (
  copy .env.example .env >nul
  echo [!] .env fayli yaratildi. Notepad'da BOT_TOKEN ni yozing va saqlang.
  notepad .env
)

echo Kutubxonalar o'rnatilmoqda/yangilanmoqda...
.venv\Scripts\python.exe -m pip install -q --upgrade pip
.venv\Scripts\python.exe -m pip install -q -U --only-binary=pydantic-core,aiohttp -r requirements.txt
if errorlevel 1 (
  echo.
  echo [X] Kutubxonalarni o'rnatib bo'lmadi. Yuqoridagi xatoni rasmga olib yuboring.
  pause
  exit /b 1
)

echo.
echo Bot ishga tushmoqda... (to'xtatish uchun Ctrl+C)
.venv\Scripts\python.exe -m bot.main
pause
