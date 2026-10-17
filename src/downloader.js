import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { ytdlpPath } from './ytdlp.js';

export class DownloadError extends Error {}
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
export async function download(url, kind, { baseDir, maxBytes, cookiesFile }) {
  const workdir = path.join(baseDir, crypto.randomUUID());
  fs.mkdirSync(workdir, { recursive: true });
  const maxMb = Math.floor(maxBytes / 1024 / 1024);

  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
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
