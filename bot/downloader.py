"""yt-dlp ustidagi yupqa qatlam: video yoki audio yuklab oladi."""
import asyncio
import logging
import os
import shutil
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

import yt_dlp


log = logging.getLogger(__name__)


def find_ffmpeg_dir(cache_dir: Path) -> str | None:
    """Tizimdagi ffmpeg'ni topadi, bo'lmasa imageio-ffmpeg paketidagisini ishlatadi.

    yt-dlp faylni "ffmpeg" nomi bilan qidiradi, imageio esa boshqa nom bilan saqlaydi,
    shuning uchun uni alohida papkaga "ffmpeg(.exe)" nomi bilan nusxalaymiz.
    """
    if shutil.which("ffmpeg"):
        return None  # PATH'da bor, yt-dlp o'zi topadi
    try:
        import imageio_ffmpeg
    except ImportError:
        log.warning("ffmpeg topilmadi: video+audio birlashtirish va MP3 ishlamasligi mumkin")
        return None
    src = Path(imageio_ffmpeg.get_ffmpeg_exe())
    cache_dir.mkdir(parents=True, exist_ok=True)
    dst = cache_dir / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
    if not dst.exists() or dst.stat().st_size != src.stat().st_size:
        shutil.copy2(src, dst)
        os.chmod(dst, 0o755)
    log.info("ffmpeg: %s", dst)
    return str(cache_dir)


class DownloadError(Exception):
    pass


class FileTooLarge(DownloadError):
    pass


@dataclass
class Result:
    path: Path
    title: str
    duration: int | None
    kind: str  # "video" | "audio"


class Downloader:
    def __init__(self, base_dir: Path, max_bytes: int, cookies_file: str | None = None):
        self.base_dir = base_dir
        self.max_bytes = max_bytes
        self.cookies_file = cookies_file
        self.ffmpeg_dir = find_ffmpeg_dir(base_dir / ".ffmpeg")

    def _opts(self, workdir: Path, kind: str) -> dict:
        max_mb = self.max_bytes // (1024 * 1024)
        opts: dict = {
            "outtmpl": str(workdir / "%(title).80B.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "restrictfilenames": False,
            "max_filesize": self.max_bytes,
            "socket_timeout": 30,
            "retries": 3,
        }
        if self.ffmpeg_dir:
            opts["ffmpeg_location"] = self.ffmpeg_dir
        if self.cookies_file:
            opts["cookiefile"] = self.cookies_file
        if kind == "audio":
            opts["format"] = "bestaudio/best"
            opts["postprocessors"] = [
                {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}
            ]
        else:
            # Telegram'da to'g'ridan-to'g'ri ko'rinishi uchun mp4, hajm chegarasiga sig'adigan eng yaxshi sifat.
            opts["format"] = (
                f"bv*[height<=720][ext=mp4][filesize<{max_mb}M]+ba[ext=m4a]/"
                f"b[height<=720][ext=mp4][filesize<{max_mb}M]/"
                "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b"
            )
            opts["merge_output_format"] = "mp4"
        return opts

    def _download_sync(self, url: str, kind: str) -> Result:
        workdir = self.base_dir / uuid.uuid4().hex
        workdir.mkdir(parents=True)
        try:
            with yt_dlp.YoutubeDL(self._opts(workdir, kind)) as ydl:
                info = ydl.extract_info(url, download=True)
            if info is None:
                raise DownloadError("Ma'lumot olinmadi.")
            if "entries" in info:  # karusel / pleylist bo'lsa birinchisini olamiz
                entries = [e for e in info["entries"] if e]
                if not entries:
                    raise DownloadError("Media topilmadi.")
                info = entries[0]
            files = [p for p in workdir.iterdir() if p.is_file() and not p.name.endswith(".part")]
            if not files:
                raise FileTooLarge("Fayl hajmi chegaradan katta.")
            path = max(files, key=lambda p: p.stat().st_size)
            if path.stat().st_size > self.max_bytes:
                raise FileTooLarge("Fayl hajmi chegaradan katta.")
            return Result(
                path=path,
                title=info.get("title") or "media",
                duration=int(info["duration"]) if info.get("duration") else None,
                kind=kind,
            )
        except yt_dlp.utils.DownloadError as e:
            shutil.rmtree(workdir, ignore_errors=True)
            raise DownloadError(str(e)) from e
        except Exception:
            shutil.rmtree(workdir, ignore_errors=True)
            raise

    async def download(self, url: str, kind: str = "video") -> Result:
        return await asyncio.to_thread(self._download_sync, url, kind)

    @staticmethod
    def cleanup(result: Result) -> None:
        shutil.rmtree(result.path.parent, ignore_errors=True)
