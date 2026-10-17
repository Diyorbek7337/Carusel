import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from './config.js';
import { ensureYtDlp } from './ytdlp.js';
import { download, cleanupDir, DownloadError, FileTooLarge } from './downloader.js';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
// Ketma-ket kelgan xabarlardagi havolalarni shuncha vaqt yig'ib, bitta tugma chiqaramiz
const COLLECT_MS = 2000;
// Bitta guruhdagi eng ko'p havola soni
const MAX_LINKS = 200;
// Bir vaqtning o'zida nechta yuklash ishlashi (butun bot bo'yicha)
const MAX_PARALLEL = 3;

const HELP =
  "👋 Salom! Menga video havolasini yuboring, men uni yuklab beraman.\n\n" +
  "📦 Bir nechta havolani bitta xabarda yoki ketma-ket yuborsangiz, " +
  "hammasini bitta tugma bilan yuklab beraman.\n\n" +
  "Qo'llab-quvvatlanadi: YouTube, Instagram (Reels/post), TikTok, Facebook, " +
  'Pinterest (video va rasm), X (Twitter), Vimeo, Reddit va yana 1000+ sayt.\n\n' +
  `⚠️ Har bir fayl ${config.maxFileMb} MB dan oshmasligi kerak.\n` +
  "Faqat o'zingizga tegishli yoki yuklab olishga ruxsat berilgan kontentni yuklang.";

/** Xabar matni, izohi va yashirin havolalaridan (text_link) barcha URL'larni oladi. */
function extractUrls(msg) {
  const text = msg.text ?? msg.caption ?? '';
  const entities = msg.entities ?? msg.caption_entities ?? [];
  const urls = [];
  for (const e of entities) {
    if (e.type === 'text_link' && e.url) urls.push(e.url);
  }
  for (const m of text.matchAll(URL_RE)) {
    urls.push(m[0].replace(/[.,;:!?)\]]+$/, '')); // jumla oxiridagi tinish belgilarini olib tashlaymiz
  }
  return urls;
}

// --- Navbat: bir vaqtda MAX_PARALLEL tadan ortiq yuklash bo'lmasin ---
let active = 0;
const waiters = [];
async function limited(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

// --- Havolalarni yig'ish ---
// chatId -> { urls: Set, timer, replyTo }
const collecting = new Map();
// tugma kaliti -> havolalar ro'yxati (callback_data 64 baytdan oshmasligi kerak)
const batches = new Map();

const bot = new Bot(config.token, config.apiRoot ? { client: { apiRoot: config.apiRoot } } : undefined);
// Telegram "juda tez" (429) desa, kutib qayta yuboradi
bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 60 }));

bot.command(['start', 'help'], (ctx) => ctx.reply(HELP));

bot.on(['message:text', 'message:caption'], async (ctx) => {
  const urls = extractUrls(ctx.message);
  if (urls.length === 0) {
    return ctx.reply("Iltimos, video havolasini yuboring (https://... bilan boshlanadigan).");
  }

  const chatId = ctx.chat.id;
  let entry = collecting.get(chatId);
  if (!entry) {
    entry = { urls: new Set(), timer: null, replyTo: ctx.message.message_id };
    collecting.set(chatId, entry);
  }
  for (const u of urls) entry.urls.add(u); // Set takrorlarni o'zi olib tashlaydi
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    collecting.delete(chatId);
    offerBatch(chatId, [...entry.urls], entry.replyTo).catch((e) => console.error('Tugma xatosi:', e.message));
  }, COLLECT_MS);
});

async function offerBatch(chatId, urls, replyTo) {
  let note = '';
  if (urls.length > MAX_LINKS) {
    note = `\n⚠️ Faqat birinchi ${MAX_LINKS} tasi olinadi.`;
    urls = urls.slice(0, MAX_LINKS);
  }
  const key = crypto.randomBytes(8).toString('hex');
  batches.set(key, urls);
  if (batches.size > 2000) {
    for (const k of [...batches.keys()].slice(0, 500)) batches.delete(k);
  }

  const n = urls.length;
  const kb =
    n === 1
      ? new InlineKeyboard().text('🎬 Video', `v:${key}`).text('🎵 Audio (MP3)', `a:${key}`)
      : new InlineKeyboard().text(`🎬 Hammasini video (${n})`, `v:${key}`).row().text(`🎵 Hammasini audio (${n})`, `a:${key}`);
  const text = n === 1 ? 'Qaysi formatda yuklab beray?' : `📦 ${n} ta havola topildi. Qaysi formatda yuklab beray?${note}`;

  await bot.api.sendMessage(chatId, text, {
    reply_markup: kb,
    reply_parameters: { message_id: replyTo, allow_sending_without_reply: true },
  });
}

bot.callbackQuery(/^([va]):([0-9a-f]{16})$/, async (ctx) => {
  const [, kindCode, key] = ctx.match;
  const urls = batches.get(key);
  batches.delete(key);
  if (!urls) {
    return ctx.answerCallbackQuery({ text: 'Havolalar eskirgan, qaytadan yuboring.', show_alert: true });
  }
  await ctx.answerCallbackQuery();

  const kind = kindCode === 'a' ? 'audio' : 'video';
  const chatId = ctx.chat.id;
  const statusId = ctx.callbackQuery.message.message_id;
  const total = urls.length;
  let lastStatus = '';
  const setStatus = async (text) => {
    if (text === lastStatus) return;
    lastStatus = text;
    await ctx.api.editMessageText(chatId, statusId, text).catch(() => {});
  };

  await setStatus(total === 1 ? '⏳ Yuklab olinmoqda...' : `⏳ 0/${total} — navbatda...`);

  const failed = [];
  let ok = 0;
  let done = 0;
  let lastEdit = 0;
  const progress = async (force = false) => {
    if (total === 1) return;
    // Telegram tez-tez tahrirlashni yoqtirmaydi: ko'pi bilan 3 soniyada bir marta yangilaymiz
    if (!force && Date.now() - lastEdit < 3000) return;
    lastEdit = Date.now();
    await setStatus(`⏳ ${done}/${total} tayyor (✅ ${ok}, ❌ ${failed.length})`);
  };

  // Har bir havolani navbat bilan yuklab, darhol yuboramiz
  for (const [i, url] of urls.entries()) {
    const reason = await limited(() => downloadAndSend(ctx, chatId, url, kind, total === 1 ? null : i + 1));
    done++;
    if (reason) failed.push({ url, reason });
    else ok++;
    await progress();
  }

  if (total === 1) {
    if (failed.length) await setStatus(failed[0].reason);
    else await ctx.api.deleteMessage(chatId, statusId).catch(() => {});
    return;
  }

  let summary = `✅ Tayyor: ${ok}/${total} ta yuklandi.`;
  if (failed.length) {
    summary += `\n❌ ${failed.length} tasini yuklab bo'lmadi:\n`;
    const lines = failed.map((f, idx) => `${idx + 1}. ${f.url}`);
    // Xabar 4096 belgidan oshmasligi kerak
    let list = '';
    for (const line of lines) {
      if (summary.length + list.length + line.length > 3900) {
        list += '…';
        break;
      }
      list += line + '\n';
    }
    summary += list;
  }
  await setStatus(summary);
});

/** Bitta havolani yuklab yuboradi. Muvaffaqiyatli bo'lsa null, aks holda xato matnini qaytaradi. */
async function downloadAndSend(ctx, chatId, url, kind, index) {
  let result;
  try {
    await ctx.api.sendChatAction(chatId, kind === 'video' ? 'upload_video' : 'upload_voice').catch(() => {});
    result = await download(url, kind, {
      baseDir: config.downloadDir,
      maxBytes: config.maxFileBytes,
      cookiesFile: config.cookiesFile,
    });
  } catch (e) {
    console.warn(`Yuklab bo'lmadi: ${url}\n  ${e.message}`);
    if (e instanceof FileTooLarge) return `❌ Fayl ${config.maxFileMb} MB dan katta. Audio variantini sinab ko'ring.`;
    if (e instanceof DownloadError) {
      return (
        "❌ Yuklab bo'lmadi. Havola to'g'riligini tekshiring.\n" +
        "Yopiq (private) akkauntlar va ba'zi saytlar qo'llab-quvvatlanmaydi."
      );
    }
    return '❌ Kutilmagan xatolik yuz berdi.';
  }

  try {
    const file = new InputFile(result.path);
    const prefix = index ? `${index}. ` : '';
    const caption = (prefix + result.title).slice(0, 1000);
    if (result.kind === 'audio') {
      await ctx.api.sendAudio(chatId, file, { title: result.title.slice(0, 64), duration: result.duration, caption });
    } else if (result.kind === 'photo') {
      // Rasm 10 MB dan katta yoki formati mos kelmasa, fayl sifatida yuboramiz
      await ctx.api
        .sendPhoto(chatId, file, { caption })
        .catch(() => ctx.api.sendDocument(chatId, new InputFile(result.path), { caption }));
    } else if (result.kind === 'animation') {
      await ctx.api.sendAnimation(chatId, file, { caption });
    } else {
      await ctx.api.sendVideo(chatId, file, { duration: result.duration, caption, supports_streaming: true });
    }
    return null;
  } catch (e) {
    console.error('Yuborishda xato:', e.message);
    return '❌ Faylni yuborishda xatolik.';
  } finally {
    cleanupDir(result.dir);
  }
}

bot.catch((err) => console.error('Bot xatosi:', err.error?.message || err.message));

try {
  await ensureYtDlp();
} catch (e) {
  console.error(`\n[X] yt-dlp yuklab olinmadi: ${e.message}\n    Internetni tekshirib, qayta urinib ko'ring.\n`);
  process.exit(1);
}

bot
  .start({
    onStart: (me) => console.log(`✅ @${me.username} ishga tushdi. To'xtatish uchun Ctrl+C bosing.`),
  })
  .catch((e) => {
    if (e?.error_code === 401 || e?.error_code === 404) {
      console.error("\n[X] BOT_TOKEN noto'g'ri. .env faylidagi tokenni @BotFather'dan qayta nusxalang.\n");
    } else {
      console.error('\n[X] Bot ishga tushmadi:', e?.message || e);
    }
    process.exit(1);
  });
