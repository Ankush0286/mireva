import asyncio
import hashlib
import logging
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

MEDIA_DIR = Path("storage/media").resolve()
MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def resolve_media_path(media_input: str) -> Path:
    """
    Resolves a local media path or automatically downloads remote HTTP/HTTPS
    image URLs to storage/media/ so Playwright can attach them to file choosers.
    """
    clean_input = media_input.strip()

    # 1. Handle Remote Image URLs
    if clean_input.startswith(("http://", "https://")):
        url_hash = hashlib.md5(clean_input.encode("utf-8")).hexdigest()[:12]
        ext = ".jpg"
        clean_lower = clean_input.lower()
        if ".png" in clean_lower:
            ext = ".png"
        elif ".webp" in clean_lower:
            ext = ".webp"
        elif ".mp4" in clean_lower:
            ext = ".mp4"

        local_file = MEDIA_DIR / f"downloaded_{url_hash}{ext}"
        if not local_file.exists():
            logger.info(
                "Downloading remote media to local cache: %s -> %s", clean_input, local_file
            )
            headers = {"User-Agent": "Mozilla/5.0"}
            req = urllib.request.Request(clean_input, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp, open(local_file, "wb") as f:
                f.write(resp.read())
        return local_file

    # 2. Handle Local File Paths
    local_path = Path(clean_input).resolve()
    if not local_path.exists():
        alt_path = (MEDIA_DIR / clean_input).resolve()
        if alt_path.exists():
            return alt_path
        raise FileNotFoundError(f"Media file does not exist: {clean_input}")

    return local_path


async def aresolve_media_path(media_input: str) -> Path:
    """Async wrapper preventing remote media downloads from blocking the event loop."""
    return await asyncio.to_thread(resolve_media_path, media_input)
