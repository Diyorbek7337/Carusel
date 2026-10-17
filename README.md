# Video Downloader Telegram Bot

YouTube, Instagram, TikTok, Facebook, Pinterest, X (Twitter), Vimeo, Reddit va 1000+ boshqa saytlardan
video yoki audio (MP3) yuklab beruvchi Telegram bot. Ichida [yt-dlp](https://github.com/yt-dlp/yt-dlp) ishlaydi.

## Imkoniyatlar
- Havolani yuborasiz → **🎬 Video** yoki **🎵 Audio (MP3)** tugmasini tanlaysiz
- Video Telegram'da to'g'ridan-to'g'ri ko'rinadigan MP4 formatda (720p gacha)
- Bir vaqtda 3 ta yuklash, vaqtinchalik fayllar avtomatik o'chiriladi

## O'rnatish

1. [@BotFather](https://t.me/BotFather) da `/newbot` orqali bot yarating va tokenni oling.
2. `.env` fayl yarating:
   ```bash
   cp .env.example .env
   # BOT_TOKEN ni yozing
   ```

### Windows (Docker'siz, eng oson yo'l)
1. [Python 3.13](https://www.python.org/downloads/windows/) o'rnating (3.15 hali mos emas) — o'rnatishda **"Add python.exe to PATH"** belgisini qo'ying.
2. `run.bat` faylini ikki marta bosing. Birinchi marta Notepad ochiladi — `BOT_TOKEN` ni yozib saqlang.

Bot kompyuter yoniq va oyna ochiq turganda ishlaydi.

### Linux / macOS
```bash
./run.sh
```

### Docker bilan (ixtiyoriy)
```bash
docker compose up -d --build
```

## Muhim eslatmalar
- **50 MB cheklovi.** Oddiy Telegram Bot API botlarga 50 MB gacha fayl yuborishga ruxsat beradi.
  Kattaroq fayllar uchun [Local Bot API Server](https://github.com/tdlib/telegram-bot-api) ishga tushiring,
  `.env` da `TELEGRAM_API_URL=http://localhost:8081` va `MAX_FILE_MB=2000` qiling.
- **Instagram / Facebook** ba'zan login talab qiladi. Brauzerdan cookies'ni Netscape formatida eksport qilib
  (masalan "Get cookies.txt LOCALLY" kengaytmasi bilan) `COOKIES_FILE=cookies.txt` ga yozing.
- Saytlar o'zgarib turadi — biror sayt ishlamay qolsa, yt-dlp'ni yangilang: `pip install -U yt-dlp`
  (Docker: `docker compose build --no-cache`).
- Faqat o'zingizga tegishli yoki muallif ruxsat bergan kontentni yuklang; saytlarning foydalanish shartlariga rioya qiling.

## Tuzilma
```
bot/
  config.py      # .env sozlamalari
  downloader.py  # yt-dlp orqali yuklash
  main.py        # Telegram handlerlar (aiogram 3)
```
