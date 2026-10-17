import asyncio
import logging
import re
import uuid

from aiogram import Bot, Dispatcher, F
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.enums import ChatAction
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .config import load_config
from .downloader import Downloader, DownloadError, FileTooLarge

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("downloader-bot")

URL_RE = re.compile(r"https?://\S+")

config = load_config()
downloader = Downloader(config.download_dir, config.max_file_bytes, config.cookies_file)
dp = Dispatcher()

# callback_data 64 baytdan oshmasligi kerak, shuning uchun havolani xotirada saqlaymiz
pending: dict[str, str] = {}
# Bir vaqtda nechta yuklash ishlashi
semaphore = asyncio.Semaphore(3)

HELP = (
    "👋 Salom! Menga video havolasini yuboring, men uni yuklab beraman.\n\n"
    "Qo'llab-quvvatlanadi: YouTube, Instagram (Reels/post), TikTok, Facebook, "
    "Pinterest, X (Twitter), Vimeo, Reddit va yana 1000+ sayt.\n\n"
    f"⚠️ Fayl hajmi {config.max_file_mb} MB dan oshmasligi kerak.\n"
    "Faqat o'zingizga tegishli yoki yuklab olishga ruxsat berilgan kontentni yuklang."
)


@dp.message(CommandStart())
@dp.message(Command("help"))
async def start(message: Message) -> None:
    await message.answer(HELP)


@dp.message(F.text.regexp(URL_RE))
async def on_link(message: Message) -> None:
    url = URL_RE.search(message.text).group(0)
    key = uuid.uuid4().hex[:16]
    pending[key] = url
    if len(pending) > 5000:  # xotira o'smasligi uchun eskilarini tashlaymiz
        for old in list(pending)[:1000]:
            pending.pop(old, None)
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🎬 Video", callback_data=f"v:{key}"),
                InlineKeyboardButton(text="🎵 Audio (MP3)", callback_data=f"a:{key}"),
            ]
        ]
    )
    await message.reply("Qaysi formatda yuklab beray?", reply_markup=kb)


@dp.message(F.text)
async def on_text(message: Message) -> None:
    await message.answer("Iltimos, video havolasini yuboring (https://... bilan boshlanadigan).")


@dp.callback_query(F.data.regexp(r"^[va]:[0-9a-f]{16}$"))
async def on_choice(call: CallbackQuery, bot: Bot) -> None:
    kind_code, key = call.data.split(":", 1)
    url = pending.pop(key, None)
    if url is None:
        await call.answer("Havola eskirgan, qaytadan yuboring.", show_alert=True)
        return
    kind = "audio" if kind_code == "a" else "video"
    await call.answer()
    status = await call.message.edit_text("⏳ Yuklab olinmoqda...")
    chat_id = call.message.chat.id

    async with semaphore:
        try:
            await bot.send_chat_action(chat_id, ChatAction.UPLOAD_VIDEO if kind == "video" else ChatAction.UPLOAD_VOICE)
            result = await downloader.download(url, kind)
        except FileTooLarge:
            await status.edit_text(f"❌ Fayl {config.max_file_mb} MB dan katta. Audio variantini sinab ko'ring.")
            return
        except DownloadError as e:
            log.warning("Download failed for %s: %s", url, e)
            await status.edit_text(
                "❌ Yuklab bo'lmadi. Havola to'g'riligini tekshiring.\n"
                "Yopiq (private) akkauntlar va ba'zi saytlar qo'llab-quvvatlanmaydi."
            )
            return
        except Exception:
            log.exception("Unexpected error for %s", url)
            await status.edit_text("❌ Kutilmagan xatolik yuz berdi.")
            return

        try:
            await status.edit_text("📤 Yuborilmoqda...")
            file = FSInputFile(result.path)
            caption = result.title[:1000]
            if result.kind == "audio":
                await bot.send_audio(chat_id, file, title=result.title[:64], duration=result.duration, caption=caption)
            else:
                await bot.send_video(chat_id, file, duration=result.duration, caption=caption, supports_streaming=True)
            await status.delete()
        except Exception:
            log.exception("Send failed for %s", url)
            await status.edit_text("❌ Faylni yuborishda xatolik.")
        finally:
            Downloader.cleanup(result)


async def main() -> None:
    session = None
    if config.telegram_api_url:
        session = AiohttpSession(api=TelegramAPIServer.from_base(config.telegram_api_url, is_local=True))
    bot = Bot(config.bot_token, session=session)
    log.info("Bot ishga tushdi")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
