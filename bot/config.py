import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    bot_token: str
    download_dir: Path
    max_file_mb: int
    telegram_api_url: str | None
    cookies_file: str | None

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024


def load_config() -> Config:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN topilmadi. .env faylini yarating (.env.example ga qarang).")
    download_dir = Path(os.getenv("DOWNLOAD_DIR", "downloads")).resolve()
    download_dir.mkdir(parents=True, exist_ok=True)
    return Config(
        bot_token=token,
        download_dir=download_dir,
        max_file_mb=int(os.getenv("MAX_FILE_MB", "50")),
        telegram_api_url=os.getenv("TELEGRAM_API_URL", "").strip() or None,
        cookies_file=os.getenv("COOKIES_FILE", "").strip() or None,
    )
