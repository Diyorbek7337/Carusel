# Video Downloader Telegram Bot (Node.js)

YouTube, Instagram, TikTok, Facebook, Pinterest, X (Twitter), Vimeo, Reddit va 1000+ boshqa saytlardan
video yoki audio (MP3) yuklab beruvchi Telegram bot.

Hech narsani qo'lda o'rnatish shart emas: yt-dlp va ffmpeg birinchi ishga tushishda avtomatik yuklab olinadi.

## Windows'da ishga tushirish
1. [Node.js](https://nodejs.org) saytidan **LTS** versiyani yuklab o'rnating (hamma joyda "Next" bosaverasiz).
2. [@BotFather](https://t.me/BotFather) da `/newbot` orqali bot yarating va tokenni nusxalang.
3. Loyiha papkasidagi **`start.bat`** ni ikki marta bosing.
   Birinchi marta Notepad ochiladi — `BOT_TOKEN=` dan keyin tokenni yozing, saqlang va Notepad'ni yoping.

"✅ @botingiz ishga tushdi" yozuvi chiqsa — tayyor. Bot kompyuter yoniq va oyna ochiq turganda ishlaydi.

## Linux / macOS
```bash
./start.sh
```

## Imkoniyatlar
- Havolani yuborasiz → **🎬 Video** yoki **🎵 Audio (MP3)** tugmasini tanlaysiz
- Video Telegram'da to'g'ridan-to'g'ri ochiladigan MP4 (720p gacha)
- Bir vaqtda 3 ta yuklash, vaqtinchalik fayllar avtomatik o'chiriladi
- yt-dlp har ishga tushishda o'zini yangilaydi

## Muhim eslatmalar
- **50 MB cheklovi.** Telegram oddiy botlarga 50 MB gacha fayl yuborishga ruxsat beradi. Kattaroq fayllar uchun
  [Local Bot API Server](https://github.com/tdlib/telegram-bot-api) ishga tushirib, `.env` da
  `TELEGRAM_API_URL=http://localhost:8081` va `MAX_FILE_MB=2000` qiling.
- **Instagram / Facebook** ba'zan login so'raydi. Brauzerdan cookies'ni Netscape formatida eksport qilib
  ("Get cookies.txt LOCALLY" kengaytmasi) `COOKIES_FILE=cookies.txt` deb yozing.
- Faqat o'zingizga tegishli yoki muallif ruxsat bergan kontentni yuklang.

## Tuzilma
```
src/
  index.js       # Telegram bot (grammY)
  downloader.js  # yt-dlp orqali yuklash
  ytdlp.js       # yt-dlp'ni avtomatik yuklab olish/yangilash
  config.js      # .env sozlamalari
start.bat        # Windows uchun bir bosishda ishga tushirish
```
