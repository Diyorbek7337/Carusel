import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

const token = (process.env.BOT_TOKEN || '').trim();
if (!token || token.includes('your-token')) {
  console.error('\n[X] BOT_TOKEN topilmadi. .env faylini ochib @BotFather bergan tokenni yozing.\n');
  process.exit(1);
}

const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || 'downloads');
fs.mkdirSync(downloadDir, { recursive: true });

const maxFileMb = Number(process.env.MAX_FILE_MB || 50);

export const config = {
  token,
  downloadDir,
  maxFileMb,
  maxFileBytes: maxFileMb * 1024 * 1024,
  apiRoot: (process.env.TELEGRAM_API_URL || '').trim() || undefined,
  cookiesFile: (process.env.COOKIES_FILE || '').trim() || undefined,
};
