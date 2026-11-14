from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

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


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class AccountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ================= Query Methods =================

    async def get_by_id(self, account_id: UUID | str) -> ConnectedAccount | None:
        target_id = _ensure_uuid(account_id)
        stmt = select(ConnectedAccount).where(ConnectedAccount.id == target_id)
        result = await self.db.execute(stmt)
        account = result.scalars().first()
        if account:
            reset = account._check_and_reset_daily_quotas()
            cd_reset = account._check_and_reset_cooldown()
            if reset or cd_reset:
                await self.db.commit()
                await self.db.refresh(account)
        return account

    async def get_by_id_or_raise(self, account_id: UUID | str) -> ConnectedAccount:
        account = await self.get_by_id(account_id)
        if not account:
            raise AccountNotFoundError(account_id)
        return account

    async def get_by_handle_and_platform(
        self, platform: PlatformType, handle: str
    ) -> ConnectedAccount | None:
        stmt = select(ConnectedAccount).where(
            ConnectedAccount.platform == platform,
            ConnectedAccount.handle == handle,
        )
        result = await self.db.execute(stmt)
        account = result.scalars().first()
        if account:
            reset = account._check_and_reset_daily_quotas()
            cd_reset = account._check_and_reset_cooldown()
            if reset or cd_reset:
                await self.db.commit()
                await self.db.refresh(account)
        return account

    async def list_accounts(
        self, active_only: bool = False, auto_reset: bool = True
    ) -> list[ConnectedAccount]:
        stmt = select(ConnectedAccount).order_by(ConnectedAccount.created_at.desc())
        if active_only:
            stmt = stmt.where(ConnectedAccount.is_active.is_(True))
        result = await self.db.execute(stmt)
        accounts = list(result.scalars().all())
        if auto_reset:
            any_reset = False
            for acc in accounts:
                if acc._check_and_reset_daily_quotas():
                    any_reset = True
                if acc._check_and_reset_cooldown():
                    any_reset = True
            if any_reset:
                await self.db.commit()
                for acc in accounts:
                    await self.db.refresh(acc)
        return accounts

    # ================= Command / Mutation Methods =================

    async def create_account(self, cmd: CreateAccountCommand) -> ConnectedAccount:
        existing = await self.get_by_handle_and_platform(cmd.platform, cmd.handle)
        if existing:
            platform_str = (
                cmd.platform.value if hasattr(cmd.platform, "value") else str(cmd.platform)
            )
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
        try:
            await self.db.commit()
            await self.db.refresh(account)
            return account
        except Exception:
            await self.db.rollback()
            raise

    async def update_account(self, cmd: UpdateAccountCommand) -> ConnectedAccount:
        account = await self.get_by_id_or_raise(cmd.account_id)

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
            account.encrypted_access_token = (
                encrypt_token(cmd.access_token) if cmd.access_token else None
            )
        if cmd.refresh_token is not None:
            account.encrypted_refresh_token = (
                encrypt_token(cmd.refresh_token) if cmd.refresh_token else None
            )
        if cmd.api_key is not None:
            account.encrypted_api_key = encrypt_token(cmd.api_key) if cmd.api_key else None
        if cmd.api_secret is not None:
            account.encrypted_api_secret = encrypt_token(cmd.api_secret) if cmd.api_secret else None

        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def delete_account(self, account_id: UUID | str) -> None:
        account = await self.get_by_id_or_raise(account_id)
        await self.db.delete(account)
        await self.db.commit()

    # ================= Security & Automation Utilities =================

    def get_decrypted_tokens(self, account: ConnectedAccount) -> dict[str, str | None]:
        return {
            "access_token": decrypt_token(account.encrypted_access_token),
            "refresh_token": decrypt_token(account.encrypted_refresh_token),
            "token_secret": decrypt_token(account.encrypted_token_secret),
            "api_key": decrypt_token(account.encrypted_api_key),
            "api_secret": decrypt_token(account.encrypted_api_secret),
        }

    async def record_post_activity(
        self, account_id: UUID | str, enforce_limits: bool = True
    ) -> ConnectedAccount:
        account = await self.get_by_id_or_raise(account_id)

        if enforce_limits:
            if account.is_in_cooldown():
                until_str = (
                    account.cooldown_until.isoformat() if account.cooldown_until else "unknown"
                )
                raise AccountInCooldownError(account.handle, until_str)

            if not account.can_post_today():
                raise DailyPostQuotaExceededError(account.handle, account.daily_post_limit)

        account.daily_posts_sent += 1
        account.last_action_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def record_dm_activity(
        self, account_id: UUID | str, enforce_limits: bool = True
    ) -> ConnectedAccount:
        account = await self.get_by_id_or_raise(account_id)

        if enforce_limits:
            if account.is_in_cooldown():
                until_str = (
                    account.cooldown_until.isoformat() if account.cooldown_until else "unknown"
                )
                raise AccountInCooldownError(account.handle, until_str)

            if not account.can_send_dm_today():
                from app.modules.outreach.exceptions import DailyDMQuotaExceededError

                raise DailyDMQuotaExceededError(account.handle, account.daily_dm_limit)

        account.daily_dms_sent += 1
        account.last_action_at = datetime.now(UTC)

        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def reserve_dm_slot(self, account_id: UUID | str) -> bool:
        """
        Atomically checks cooldown and daily quota, and reserves a slot
        by incrementing daily_dms_sent before dispatch only if below daily_dm_limit.
        """
        target_id = _ensure_uuid(account_id)
        account = await self.get_by_id_or_raise(target_id)
        if account.is_in_cooldown() or not account.can_send_dm_today():
            return False

        stmt = (
            update(ConnectedAccount)
            .where(
                ConnectedAccount.id == target_id,
                ConnectedAccount.is_active.is_(True),
                ConnectedAccount.status == AccountStatus.ACTIVE,
                ConnectedAccount.daily_dms_sent < ConnectedAccount.daily_dm_limit,
            )
            .values(
                daily_dms_sent=ConnectedAccount.daily_dms_sent + 1,
                last_action_at=datetime.now(UTC),
            )
            .execution_options(synchronize_session=False)
        )
        res = await self.db.execute(stmt)
        await self.db.commit()
        return getattr(res, "rowcount", 0) > 0

    async def release_dm_slot(self, account_id: UUID | str) -> None:
        """Releases a previously reserved quota slot if dispatch failed."""
        target_id = _ensure_uuid(account_id)
        stmt = (
            update(ConnectedAccount)
            .where(
                ConnectedAccount.id == target_id,
                ConnectedAccount.daily_dms_sent > 0,
            )
            .values(daily_dms_sent=ConnectedAccount.daily_dms_sent - 1)
            .execution_options(synchronize_session=False)
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def set_cooldown(self, account_id: UUID | str, until: datetime) -> ConnectedAccount:
        account = await self.get_by_id_or_raise(account_id)
        account.status = AccountStatus.RATE_LIMITED
        account.cooldown_until = until

        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def mark_browser_session_authenticated(
        self, account_id: UUID | str, storage_path: str | Path
    ) -> ConnectedAccount:
        account = await self.get_by_id_or_raise(account_id)
        account.has_valid_browser_session = True
        account.last_browser_login_at = datetime.now(UTC)
        account.browser_storage_path = str(storage_path)
        await self.db.commit()
        await self.db.refresh(account)
        return account
