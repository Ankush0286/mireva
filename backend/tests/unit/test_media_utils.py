import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.platforms import media_utils


@pytest.mark.anyio
async def test_aresolve_media_path_concurrent_download_atomic(tmp_path: Path) -> None:
    payload = b"\x89PNG\r\n\x1a\nfake-image-bytes"
    download_calls = 0

    def _fake_urlopen(req: object, timeout: int = 20) -> MagicMock:
        nonlocal download_calls
        _ = (req, timeout)
        download_calls += 1
        resp = MagicMock()
        resp.__enter__.return_value = resp
        resp.__exit__.return_value = False
        resp.read.return_value = payload
        return resp

    with (
        patch.object(media_utils, "MEDIA_DIR", tmp_path),
        patch.object(media_utils.urllib.request, "urlopen", side_effect=_fake_urlopen),
    ):
        url = "https://cdn.example.com/assets/concurrent-test.png"
        paths = await asyncio.gather(
            media_utils.aresolve_media_path(url),
            media_utils.aresolve_media_path(url),
            media_utils.aresolve_media_path(url),
        )

    assert download_calls == 1
    assert len({p.resolve() for p in paths}) == 1
    assert paths[0].read_bytes() == payload
    assert [p.name for p in tmp_path.iterdir() if p.name.startswith(".tmp_")] == []


@pytest.mark.anyio
async def test_aresolve_media_path_cleans_temp_file_on_failure(tmp_path: Path) -> None:
    with (
        patch.object(media_utils, "MEDIA_DIR", tmp_path),
        patch.object(
            media_utils.urllib.request,
            "urlopen",
            side_effect=OSError("network dropped"),
        ),
        pytest.raises(OSError, match="network dropped"),
    ):
        await media_utils.aresolve_media_path("https://cdn.example.com/fail.jpg")

    assert list(tmp_path.iterdir()) == []
