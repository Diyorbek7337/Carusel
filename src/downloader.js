import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { ytdlpPath } from './ytdlp.js';

export class DownloadError extends Error {}

// YouTube uchun yt-dlp'ga JavaScript dvigateli kerak. Sukut bo'yicha u faqat "deno"ni qidiradi,
// biz esa botni ishga tushirgan Node.js'ning o'zini beramiz.
const baseArgs = ['--no-warnings', '--js-runtimes', `node:${process.execPath}`];

// Bu xatolar "sahifada video yo'q" degani (masalan, Pinterest'dagi rasm pin)
const NO_VIDEO_RE = /No video formats found|Requested format is not available/i;
const isYouTube = (url) => /(^|\.)(youtube\.com|youtu\.be)$/i.test(safeHost(url));
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
export class FileTooLarge extends DownloadError {}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

/**
 * Havoladan video yoki audio yuklab oladi.
 * @param {string} url
 * @param {'video'|'audio'} kind
 * @param {{baseDir: string, maxBytes: number, cookiesFile?: string}} opts
 */
export async function download(url, kind, opts) {
  try {
    return await downloadMedia(url, kind, opts);
  } catch (e) {
    // Video topilmasa (masalan, Pinterest'dagi rasm pin), asl rasmni yuklab olamiz
    if (
      kind === 'video' &&
      e instanceof DownloadError &&
      !(e instanceof FileTooLarge) &&
      NO_VIDEO_RE.test(e.message) &&
      !isYouTube(url)
    ) {
      const img = await downloadImage(url, opts).catch(() => null);
      if (img) return img;
    }
    throw e;
  }
}

/** Sahifadagi eng katta rasmni (thumbnail) yuklab oladi. Topilmasa null. */
async function downloadImage(url, { baseDir, maxBytes, cookiesFile }) {
  const args = [url, ...baseArgs, '-J', '--no-playlist', '--ignore-no-formats-error'];
  if (cookiesFile) args.push('--cookies', cookiesFile);
  const { code, out } = await run(ytdlpPath, args);
  if (code !== 0) return null;
  let info;
  try {
    info = JSON.parse(out);
  } catch {
    return null;
  }
  if (info.formats?.length) return null; // video bor ekan, demak boshqa sabab bilan yiqilgan
  const thumbs = (info.thumbnails || []).filter((t) => t.url);
  if (!thumbs.length) return null;
  const best =
    thumbs.find((t) => /\/originals\//.test(t.url)) ||
    thumbs.reduce((a, b) => ((b.width || 0) * (b.height || 0) > (a.width || 0) * (a.height || 0) ? b : a));

  const res = await fetch(best.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new FileTooLarge('Rasm katta');

  const ext = (new URL(best.url).pathname.match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || 'jpg').toLowerCase();
  const workdir = path.join(baseDir, crypto.randomUUID());
  fs.mkdirSync(workdir, { recursive: true });
  const file = path.join(workdir, `image.${ext}`);
  fs.writeFileSync(file, buf);
  return {
    path: file,
    dir: workdir,
    title: info.title || info.description || 'rasm',
    duration: undefined,
    kind: ext === 'gif' ? 'animation' : 'photo',
  };
}

async function downloadMedia(url, kind, { baseDir, maxBytes, cookiesFile }) {
  const workdir = path.join(baseDir, crypto.randomUUID());
  fs.mkdirSync(workdir, { recursive: true });
  const maxMb = Math.floor(maxBytes / 1024 / 1024);

  const args = [
    url,
    ...baseArgs,
    '--no-playlist',
    '--max-filesize', `${maxMb}M`,
    '--retries', '3',
    '--socket-timeout', '30',
    '-o', path.join(workdir, '%(title).80B.%(ext)s'),
    '--print', 'after_move:%(.{filepath,title,duration})j',
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  if (cookiesFile) args.push('--cookies', cookiesFile);

  if (kind === 'audio') {
    args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '192K');
  } else {
    // Telegram'da to'g'ridan-to'g'ri ochiladigan mp4, 720p gacha, hajm chegarasiga sig'adigan
    args.push(
      '-f',
      `bv*[height<=720][ext=mp4][filesize<${maxMb}M]+ba[ext=m4a]/` +
        `b[height<=720][ext=mp4][filesize<${maxMb}M]/` +
        'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
      '--merge-output-format', 'mp4',
    );
  }

  const { code, out, err } = await run(ytdlpPath, args);
  const line = out.trim().split('\n').filter(Boolean).pop();

  // --max-filesize dan katta fayl indamay o'tkazib yuboriladi: exit 0, lekin natija yo'q
  if (code === 0 && !line) {
    cleanupDir(workdir);
    throw new FileTooLarge('Fayl katta');
  }
  if (code !== 0 || !line) {
    cleanupDir(workdir);
    if (/max-filesize|larger than max/i.test(err + out)) throw new FileTooLarge('Fayl katta');
    throw new DownloadError(err.trim().split('\n').pop() || `yt-dlp exit code ${code}`);
  }

  let info;
  try {
    info = JSON.parse(line);
  } catch {
    cleanupDir(workdir);
    throw new DownloadError(`yt-dlp javobini o'qib bo'lmadi: ${line}`);
  }

  if (!info.filepath || !fs.existsSync(info.filepath)) {
    cleanupDir(workdir);
    throw new FileTooLarge('Fayl yuklanmadi (ehtimol hajmi katta)');
  }
  if (fs.statSync(info.filepath).size > maxBytes) {
    cleanupDir(workdir);
    throw new FileTooLarge('Fayl katta');
  }

  return {
    path: info.filepath,
    dir: workdir,
    title: info.title || 'media',
    duration: info.duration ? Math.round(info.duration) : undefined,
    kind,
  };
}

export function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
