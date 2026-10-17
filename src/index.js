import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config } from './config.js';
import { ensureYtDlp } from './ytdlp.js';
import { download, cleanupDir, DownloadError, FileTooLarge } from './downloader.js';

const URL_RE = /https?:\/\/\S+/;

const HELP =
  "👋 Salom! Menga video havolasini yuboring, men uni yuklab beraman.\n\n" +
  "Qo'llab-quvvatlanadi: YouTube, Instagram (Reels/post), TikTok, Facebook, " +
  'Pinterest, X (Twitter), Vimeo, Reddit va yana 1000+ sayt.\n\n' +
  `⚠️ Fayl hajmi ${config.maxFileMb} MB dan oshmasligi kerak.\n` +
  "Faqat o'zingizga tegishli yoki yuklab olishga ruxsat berilgan kontentni yuklang.";

// callback_data 64 baytdan oshmasligi kerak, shuning uchun havolani xotirada saqlaymiz
const pending = new Map();

// Bir vaqtning o'zida nechta yuklash ishlashi
const MAX_PARALLEL = 3;
let active = 0;
const queue = [];
async function limited(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const bot = new Bot(config.token, config.apiRoot ? { client: { apiRoot: config.apiRoot } } : undefined);

bot.command(['start', 'help'], (ctx) => ctx.reply(HELP));

bot.on('message:text', async (ctx) => {
  const match = ctx.message.text.match(URL_RE);
  if (!match) {
    return ctx.reply("Iltimos, video havolasini yuboring (https://... bilan boshlanadigan).");
  }
  const key = crypto.randomBytes(8).toString('hex');
  pending.set(key, match[0]);
  if (pending.size > 5000) {
    // xotira o'smasligi uchun eng eskilarini o'chiramiz
    for (const k of [...pending.keys()].slice(0, 1000)) pending.delete(k);
  }
  const kb = new InlineKeyboard().text('🎬 Video', `v:${key}`).text('🎵 Audio (MP3)', `a:${key}`);
  await ctx.reply('Qaysi formatda yuklab beray?', {
    reply_markup: kb,
    reply_parameters: { message_id: ctx.message.message_id },
  });
});

bot.callbackQuery(/^([va]):([0-9a-f]{16})$/, async (ctx) => {
  const [, kindCode, key] = ctx.match;
  const url = pending.get(key);
  pending.delete(key);
  if (!url) {
    return ctx.answerCallbackQuery({ text: 'Havola eskirgan, qaytadan yuboring.', show_alert: true });
  }
  const kind = kindCode === 'a' ? 'audio' : 'video';
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('⏳ Yuklab olinmoqda...');
  const chatId = ctx.chat.id;
  const statusId = ctx.callbackQuery.message.message_id;
  const setStatus = (text) => ctx.api.editMessageText(chatId, statusId, text).catch(() => {});

  await limited(async () => {
    let result;
    try {
      await ctx.api.sendChatAction(chatId, kind === 'video' ? 'upload_video' : 'upload_voice').catch(() => {});
      result = await download(url, kind, {
        baseDir: config.downloadDir,
        maxBytes: config.maxFileBytes,
        cookiesFile: config.cookiesFile,
      });
    } catch (e) {
      if (e instanceof FileTooLarge) {
        return setStatus(`❌ Fayl ${config.maxFileMb} MB dan katta. Audio variantini sinab ko'ring.`);
      }
      console.warn(`Yuklab bo'lmadi: ${url}\n  ${e.message}`);
      if (e instanceof DownloadError) {
        return setStatus(
          "❌ Yuklab bo'lmadi. Havola to'g'riligini tekshiring.\n" +
            "Yopiq (private) akkauntlar va ba'zi saytlar qo'llab-quvvatlanmaydi.",
        );
      }
      return setStatus('❌ Kutilmagan xatolik yuz berdi.');
    }

    try {
      await setStatus('📤 Yuborilmoqda...');
      const file = new InputFile(result.path);
      const caption = result.title.slice(0, 1000);
      if (result.kind === 'audio') {
        await ctx.api.sendAudio(chatId, file, { title: result.title.slice(0, 64), duration: result.duration, caption });
      } else {
        await ctx.api.sendVideo(chatId, file, { duration: result.duration, caption, supports_streaming: true });
      }
      await ctx.api.deleteMessage(chatId, statusId).catch(() => {});
    } catch (e) {
      console.error('Yuborishda xato:', e.message);
      await setStatus('❌ Faylni yuborishda xatolik.');
    } finally {
      cleanupDir(result.dir);
    }
  });
});

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
