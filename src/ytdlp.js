// yt-dlp dasturini birinchi ishga tushirishda avtomatik yuklab oladi va yangilab turadi.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(root, 'bin');

const ASSETS = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux',
};

export const ytdlpPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

export async function ensureYtDlp() {
  if (fs.existsSync(ytdlpPath)) {
    // Saytlar tez-tez o'zgaradi, shuning uchun har ishga tushganda yangilashga urinamiz
    selfUpdate();
    return ytdlpPath;
  }
  const asset = ASSETS[process.platform];
  if (!asset) throw new Error(`Bu operatsion tizim qo'llab-quvvatlanmaydi: ${process.platform}`);
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`yt-dlp yuklab olinmoqda: ${url}`);
  fs.mkdirSync(binDir, { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`yt-dlp yuklab olinmadi: HTTP ${res.status}`);
  const tmp = `${ytdlpPath}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, ytdlpPath);
  console.log('yt-dlp tayyor.');
  return ytdlpPath;
}

function selfUpdate() {
  const p = spawn(ytdlpPath, ['-U'], { stdio: 'ignore' });
  p.on('error', () => {});
}
