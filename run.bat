@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [X] Python topilmadi. https://www.python.org/downloads/ dan o'rnating
  echo     O'rnatishda "Add python.exe to PATH" belgisini qo'ying!
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [!] ffmpeg topilmadi. O'rnatish: winget install Gyan.FFmpeg
  echo     Keyin bu oynani yopib, run.bat ni qayta ishga tushiring.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo [!] .env fayli yaratildi. Uni Notepad'da ochib BOT_TOKEN ni yozing va saqlang.
  notepad .env
)

if not exist .venv (
  echo Virtual muhit yaratilmoqda...
  python -m venv .venv
)

call .venv\Scripts\activate.bat
echo Kutubxonalar o'rnatilmoqda/yangilanmoqda...
pip install -q -U -r requirements.txt

echo Bot ishga tushmoqda... (to'xtatish uchun Ctrl+C)
python -m bot.main
pause
