from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.common.enums import PlatformType
from app.modules.accounts.models import ConnectedAccount
from app.platforms.browser.session_manager import BrowserSessionManager
from app.platforms.instagram.adapter import InstagramAdapter, InstagramAutomationError


@pytest.mark.anyio
async def test_publish_post_validates_media(tmp_path: Path):
    mock_account = MagicMock(spec=ConnectedAccount)
    mock_account.id = uuid4()
    mock_account.platform = PlatformType.INSTAGRAM

    adapter = InstagramAdapter(
        account=mock_account,
        session_manager=BrowserSessionManager(base_dir=tmp_path),
    )

    # 1. Instagram requires media -> raises ValueError if None or empty
    with pytest.raises(ValueError, match="Instagram requires at least one media file"):
        await adapter.publish_post("Caption without image", media_paths=None)

    with pytest.raises(ValueError, match="Instagram requires at least one media file"):
        await adapter.publish_post("Caption without image", media_paths=[])

    # 2. File does not exist on disk -> raises FileNotFoundError immediately
    fake_file = tmp_path / "missing_photo.jpg"
    with pytest.raises(FileNotFoundError):
        await adapter.publish_post("Caption", media_paths=[str(fake_file)])


@pytest.mark.anyio
async def test_adapter_auth_fails_cleanly(tmp_path: Path):
    mock_account = MagicMock(spec=ConnectedAccount)
    mock_account.id = uuid4()
    mock_account.platform = PlatformType.INSTAGRAM
    mock_account.handle = "missing_creds"
    mock_account.encrypted_api_secret = None

    adapter = InstagramAdapter(
        account=mock_account,
        session_manager=BrowserSessionManager(base_dir=tmp_path),
    )

    # Mock _get_or_create_page and authenticate to simulate failed auth without hitting external servers
    mock_page = AsyncMock()
    adapter._get_or_create_page = AsyncMock(return_value=mock_page)
    adapter.authenticate = AsyncMock(return_value=False)

    fake_file = tmp_path / "valid.jpg"
    fake_file.write_bytes(b"dummy")

    try:
        with pytest.raises(InstagramAutomationError, match="Failed to authenticate session"):
            await adapter.publish_post("Caption", media_paths=[str(fake_file)])
    finally:
        await adapter.close()


@pytest.mark.anyio
async def test_adapter_close_teardown(tmp_path: Path):
    mock_account = MagicMock(spec=ConnectedAccount)
    mock_account.id = uuid4()
    mock_account.platform = PlatformType.INSTAGRAM

    adapter = InstagramAdapter(
        account=mock_account,
        session_manager=BrowserSessionManager(base_dir=tmp_path),
    )

    # Mock active browser context and playwright instance
    mock_context = MagicMock()
    mock_context.close = AsyncMock()
    mock_playwright = MagicMock()
    mock_playwright.stop = AsyncMock()

    adapter._context = mock_context
    adapter._playwright = mock_playwright

    # Teardown should cleanly close both
    await adapter.close()

    mock_context.close.assert_called_once()
    mock_playwright.stop.assert_called_once()
    assert adapter._context is None
    assert adapter._playwright is None
