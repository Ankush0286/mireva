import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import WebSocket
from playwright.async_api import async_playwright
from sqlalchemy.orm import Session

from app.common.enums import AccountStatus, PlatformType
from app.core.security import decrypt_token, encrypt_token
from app.modules.accounts.commands import CreateAccountCommand, UpdateAccountCommand
from app.modules.accounts.exceptions import (
    AccountAlreadyExistsError,
    AccountInCooldownError,
    AccountNotFoundError,
    DailyPostQuotaExceededError,
)
from app.modules.accounts.models import ConnectedAccount
from app.platforms.browser.driver import create_stealth_context
from app.platforms.browser.session_manager import BrowserSessionManager


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class AccountService:
    def __init__(self, db: Session):
        self.db = db

    # ================= Query Methods =================

    def get_by_id(self, account_id: UUID | str) -> ConnectedAccount | None:
        """Fetch a single account by its UUID, returning None if not found."""
        target_id = _ensure_uuid(account_id)
        return (
            self.db.query(ConnectedAccount)
            .filter(ConnectedAccount.id == target_id)
            .first()
        )

    def get_by_id_or_raise(self, account_id: UUID | str) -> ConnectedAccount:
        """Fetch a single account by its UUID or raise AccountNotFoundError."""
        account = self.get_by_id(account_id)
        if not account:
            raise AccountNotFoundError(account_id)
        return account

    def get_by_handle_and_platform(
        self, platform: PlatformType, handle: str
    ) -> ConnectedAccount | None:
        """Fetch an account by platform and username/handle."""
        return (
            self.db.query(ConnectedAccount)
            .filter(
                ConnectedAccount.platform == platform,
                ConnectedAccount.handle == handle,
            )
            .first()
        )

    def list_accounts(self, active_only: bool = False) -> list[ConnectedAccount]:
        """List all accounts, optionally filtering for active status only."""
        query = self.db.query(ConnectedAccount)
        if active_only:
            query = query.filter(ConnectedAccount.is_active.is_(True))
        return query.all()

    # ================= Command / Mutation Methods =================

    def create_account(self, cmd: CreateAccountCommand) -> ConnectedAccount:
        """Creates a new connected account. Raises AccountAlreadyExistsError on duplicate."""
        existing = self.get_by_handle_and_platform(cmd.platform, cmd.handle)
        if existing:
            platform_str = cmd.platform.value if hasattr(cmd.platform, "value") else str(cmd.platform)
            raise AccountAlreadyExistsError(platform=platform_str, handle=cmd.handle)

        account = ConnectedAccount(
            platform=cmd.platform,
            handle=cmd.handle,
            display_name=cmd.display_name,
            auth_method=cmd.auth_method,
            daily_post_limit=cmd.daily_post_limit,
            daily_dm_limit=cmd.daily_dm_limit,
            browser_storage_path=cmd.browser_storage_path,
            has_valid_browser_session=bool(cmd.browser_storage_path),
            encrypted_access_token=encrypt_token(cmd.access_token) if cmd.access_token else None,
            encrypted_refresh_token=encrypt_token(cmd.refresh_token) if cmd.refresh_token else None,
            encrypted_token_secret=encrypt_token(cmd.token_secret) if cmd.token_secret else None,
            encrypted_api_key=encrypt_token(cmd.api_key) if cmd.api_key else None,
            encrypted_api_secret=encrypt_token(cmd.api_secret) if cmd.api_secret else None,
        )
        self.db.add(account)
        self.db.commit()
        self.db.refresh(account)
        return account

    def update_account(self, cmd: UpdateAccountCommand) -> ConnectedAccount:
        """Updates an existing account or raises AccountNotFoundError."""
        account = self.get_by_id_or_raise(cmd.account_id)

        if cmd.display_name is not None:
            account.display_name = cmd.display_name
        if cmd.status is not None:
            account.status = cmd.status
        if cmd.is_active is not None:
            account.is_active = cmd.is_active
        if cmd.daily_post_limit is not None:
            account.daily_post_limit = cmd.daily_post_limit
        if cmd.daily_dm_limit is not None:
            account.daily_dm_limit = cmd.daily_dm_limit
        if cmd.extra_metadata is not None:
            account.extra_metadata = cmd.extra_metadata

        if cmd.access_token is not None:
            account.encrypted_access_token = encrypt_token(cmd.access_token) if cmd.access_token else None
        if cmd.refresh_token is not None:
            account.encrypted_refresh_token = encrypt_token(cmd.refresh_token) if cmd.refresh_token else None
        if cmd.api_key is not None:
            account.encrypted_api_key = encrypt_token(cmd.api_key) if cmd.api_key else None
        if cmd.api_secret is not None:
            account.encrypted_api_secret = encrypt_token(cmd.api_secret) if cmd.api_secret else None

        self.db.commit()
        self.db.refresh(account)
        return account

    def delete_account(self, account_id: UUID | str) -> None:
        """Removes an account from the database or raises AccountNotFoundError."""
        account = self.get_by_id_or_raise(account_id)
        self.db.delete(account)
        self.db.commit()

    # ================= Security & Automation Utilities =================

    def get_decrypted_tokens(self, account: ConnectedAccount) -> dict[str, str | None]:
        return {
            "access_token": decrypt_token(account.encrypted_access_token),
            "refresh_token": decrypt_token(account.encrypted_refresh_token),
            "token_secret": decrypt_token(account.encrypted_token_secret),
            "api_key": decrypt_token(account.encrypted_api_key),
            "api_secret": decrypt_token(account.encrypted_api_secret),
        }

    def record_post_activity(self, account_id: UUID | str) -> ConnectedAccount:
        """Increments daily post count after checking cooldown and daily limits."""
        account = self.get_by_id_or_raise(account_id)

        if account.is_in_cooldown():
            until_str = account.cooldown_until.isoformat() if account.cooldown_until else "unknown"
            raise AccountInCooldownError(account.handle, until_str)

        if not account.can_post_today():
            raise DailyPostQuotaExceededError(account.handle, account.daily_post_limit)

        account.daily_posts_sent += 1
        account.last_action_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(account)
        return account

    def record_dm_activity(self, account_id: UUID | str) -> ConnectedAccount:
        """Increments daily DM count."""
        account = self.get_by_id_or_raise(account_id)
        account._check_and_reset_daily_quotas()
        account.daily_dms_sent += 1
        account.last_action_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(account)
        return account

    def set_cooldown(self, account_id: UUID | str, until: datetime) -> ConnectedAccount:
        """Applies a temporary anti-ban rate limit cooldown to the account."""
        account = self.get_by_id_or_raise(account_id)
        account.status = AccountStatus.RATE_LIMITED
        account.cooldown_until = until

        self.db.commit()
        self.db.refresh(account)
        return account

    # ================= Browser Session & Authentication =================

    def mark_browser_session_authenticated(
        self, account_id: UUID | str, storage_path: str | Path
    ) -> ConnectedAccount:
        """
        Updates account state after successful interactive login (2FA/cookies).
        """
        account = self.get_by_id_or_raise(account_id)
        account.has_valid_browser_session = True
        account.last_browser_login_at = datetime.now(UTC)
        account.browser_storage_path = str(storage_path)
        self.db.commit()
        self.db.refresh(account)
        return account

    async def run_session_authentication_stream(
        self,
        account_id: UUID | str,
        websocket: WebSocket,
    ) -> None:
        """
        Orchestrates an interactive stealth browser screencast over WebSocket
        allowing the user to visually solve 2FA/Captchas and capture cookies.
        """

        account = self.get_by_id_or_raise(account_id)
        platform_str = account.platform.value if hasattr(account.platform, "value") else str(account.platform)

        session_mgr = BrowserSessionManager()
        user_data_dir = session_mgr.get_account_session_dir(account.id)
        storage_state = session_mgr.get_storage_state_path(account.id)

        platform_home_urls = {
            "instagram": "https://www.instagram.com/",
            "twitter": "https://x.com/home",
            "facebook": "https://www.facebook.com/",
            "email": "https://mail.google.com/",
        }

        await websocket.send_json({"type": "status", "message": "Launching isolated browser container..."})

        async with async_playwright() as playwright:
            context = await create_stealth_context(
                playwright=playwright,
                user_data_dir=user_data_dir,
                headless=True,
                storage_state_path=storage_state if storage_state.exists() else None,
            )

            page = context.pages[0] if context.pages else await context.new_page()
            await page.set_viewport_size({"width": 1280, "height": 800})

            # Attach CDP Screencast
            cdp = await context.new_cdp_session(page)

            def on_screencast_frame(event: dict[str, Any]):
                async def _send_frame():
                    try:
                        data = event.get("data")
                        session_id = event.get("sessionId")
                        await websocket.send_json({"type": "frame", "data": data})
                        await cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
                    except Exception:
                        pass

                asyncio.create_task(_send_frame())

            cdp.on("Page.screencastFrame", on_screencast_frame)
            await cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": 75,
                    "maxWidth": 1280,
                    "maxHeight": 800,
                    "everyNthFrame": 1,
                },
            )

            target_url = platform_home_urls.get(platform_str.lower(), f"https://www.{platform_str}.com/")
            await websocket.send_json({"type": "status", "message": f"Loading {target_url}..."})
            await page.goto(target_url, wait_until="domcontentloaded")
            await websocket.send_json({"type": "navigated", "url": page.url})
            await websocket.send_json({"type": "status", "message": "Ready"})

            page.on(
                "framenavigated",
                lambda frame: asyncio.create_task(
                    websocket.send_json({"type": "navigated", "url": page.url})
                )
                if frame == page.main_frame
                else None,
            )

            try:
                while True:
                    msg = await websocket.receive_json()
                    m_type = msg.get("type")

                    if m_type == "click":
                        await page.mouse.click(int(msg.get("x", 0)), int(msg.get("y", 0)))
                    elif m_type == "type":
                        await page.keyboard.insert_text(msg.get("text", ""))
                    elif m_type == "key":
                        key = msg.get("key", "Enter")
                        if key in ("ControlOrMeta+A", "Control+a", "Meta+a"):
                            await page.keyboard.press("ControlOrMeta+a")
                        else:
                            await page.keyboard.press(key)
                    elif m_type == "navigate":
                        nav_url = msg.get("url")
                        if nav_url:
                            if not nav_url.startswith(("http://", "https://")):
                                nav_url = f"https://{nav_url}"
                            await page.goto(nav_url, wait_until="domcontentloaded")
                            await websocket.send_json({"type": "navigated", "url": page.url})

            finally:
                # 1. Save session cookies to disk
                await session_mgr.save_session_state(context, account.id)
                await context.close()

                # 2. Update database record via service method
                self.mark_browser_session_authenticated(account.id, storage_state)
