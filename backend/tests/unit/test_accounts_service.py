from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import AccountStatus, PlatformType
from app.modules.accounts.commands import CreateAccountCommand, UpdateAccountCommand
from app.modules.accounts.exceptions import (
    AccountAlreadyExistsError,
    AccountInCooldownError,
    AccountNotFoundError,
    DailyPostQuotaExceededError,
)
from app.modules.accounts.service import AccountService
from app.modules.outreach.exceptions import DailyDMQuotaExceededError


@pytest.mark.anyio
async def test_create_account_encrypts_tokens(db_session: AsyncSession):
    service = AccountService(db_session)
    cmd = CreateAccountCommand(
        platform=PlatformType.TWITTER,
        handle="growth_ai",
        access_token="secret_plain_token",
        api_key="plain_api_key",
    )

    account = await service.create_account(cmd)

    assert account.id is not None
    assert account.handle == "growth_ai"
    assert account.encrypted_access_token != "secret_plain_token"
    assert account.encrypted_api_key != "plain_api_key"

    decrypted = service.get_decrypted_tokens(account)
    assert decrypted["access_token"] == "secret_plain_token"
    assert decrypted["api_key"] == "plain_api_key"


@pytest.mark.anyio
async def test_create_duplicate_account_raises_conflict(db_session: AsyncSession):
    service = AccountService(db_session)
    cmd = CreateAccountCommand(platform=PlatformType.TWITTER, handle="duplicate_handle")
    await service.create_account(cmd)

    with pytest.raises(AccountAlreadyExistsError):
        await service.create_account(cmd)


@pytest.mark.anyio
async def test_get_by_id_or_raise_not_found(db_session: AsyncSession):
    service = AccountService(db_session)
    with pytest.raises(AccountNotFoundError):
        await service.get_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_get_by_handle_and_platform(db_session: AsyncSession):
    service = AccountService(db_session)
    cmd = CreateAccountCommand(platform=PlatformType.INSTAGRAM, handle="queried_user")
    created = await service.create_account(cmd)

    found = await service.get_by_handle_and_platform(PlatformType.INSTAGRAM, "queried_user")
    assert found is not None
    assert found.id == created.id

    not_found = await service.get_by_handle_and_platform(PlatformType.TWITTER, "queried_user")
    assert not_found is None


@pytest.mark.anyio
async def test_update_account_fields_and_rotate_credentials(db_session: AsyncSession):
    service = AccountService(db_session)
    created = await service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="update_me",
            access_token="old_token",
        )
    )

    updated = await service.update_account(
        UpdateAccountCommand(
            account_id=created.id,
            display_name="New Display Name",
            daily_post_limit=25,
            access_token="new_rotated_token",
        )
    )

    assert updated.display_name == "New Display Name"
    assert updated.daily_post_limit == 25
    decrypted = service.get_decrypted_tokens(updated)
    assert decrypted["access_token"] == "new_rotated_token"


@pytest.mark.anyio
async def test_delete_account(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="delete_me")
    )

    await service.delete_account(account.id)
    assert await service.get_by_id(account.id) is None

    # Deleting again raises not found
    with pytest.raises(AccountNotFoundError):
        await service.delete_account(account.id)


@pytest.mark.anyio
async def test_list_accounts_with_filter(db_session: AsyncSession):
    service = AccountService(db_session)
    acc1 = await service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="active_user")
    )
    acc2 = await service.create_account(
        CreateAccountCommand(platform=PlatformType.INSTAGRAM, handle="inactive_user")
    )
    await service.update_account(UpdateAccountCommand(account_id=acc2.id, is_active=False))

    all_accounts = await service.list_accounts(active_only=False)
    active_accounts = await service.list_accounts(active_only=True)

    assert len(all_accounts) == 2
    assert len(active_accounts) == 1
    assert active_accounts[0].id == acc1.id


@pytest.mark.anyio
async def test_daily_post_quota_enforcement(db_session: AsyncSession):
    service = AccountService(db_session)
    cmd = CreateAccountCommand(
        platform=PlatformType.TWITTER,
        handle="quota_tester",
        daily_post_limit=1,
    )
    account = await service.create_account(cmd)

    # 1st post succeeds
    await service.record_post_activity(account.id)
    assert account.daily_posts_sent == 1

    # 2nd post exceeds limit
    with pytest.raises(DailyPostQuotaExceededError):
        await service.record_post_activity(account.id)


@pytest.mark.anyio
async def test_anti_ban_cooldown_blocks_posting(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="cooldown_user")
    )

    # Place account in cooldown until 1 hour from now
    cooldown_time = datetime.now(UTC) + timedelta(hours=1)
    await service.set_cooldown(account.id, until=cooldown_time)

    assert account.status == AccountStatus.RATE_LIMITED
    assert account.is_in_cooldown()

    # Posting must raise AccountInCooldownError
    with pytest.raises(AccountInCooldownError):
        await service.record_post_activity(account.id)


@pytest.mark.anyio
async def test_cooldown_expiry_allows_posting(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="expired_cooldown")
    )

    # Set cooldown in the past
    past_cooldown = datetime.now(UTC) - timedelta(minutes=10)
    await service.set_cooldown(account.id, until=past_cooldown)
    account.status = AccountStatus.ACTIVE
    await db_session.commit()

    assert not account.is_in_cooldown()
    assert account.can_post_today()

    # Should post without error
    updated = await service.record_post_activity(account.id)
    assert updated.daily_posts_sent == 1


@pytest.mark.anyio
async def test_record_dm_activity_and_quota_check(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="dm_sender",
            daily_dm_limit=2,
        )
    )

    assert account.can_send_dm_today()

    await service.record_dm_activity(account.id)
    assert account.daily_dms_sent == 1
    assert account.last_action_at is not None
    assert account.can_send_dm_today()

    await service.record_dm_activity(account.id)
    assert account.daily_dms_sent == 2
    assert not account.can_send_dm_today()


@pytest.mark.anyio
async def test_daily_quota_auto_reset(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER, handle="reset_tester", daily_post_limit=1
        )
    )

    await service.record_post_activity(account.id)
    assert account.daily_posts_sent == 1
    assert not account.can_post_today()

    # Artificially age the reset timestamp older than 24 hours
    account.daily_counters_reset_at = datetime.now(UTC) - timedelta(hours=25)
    await db_session.commit()

    assert account.can_post_today()
    await service.record_post_activity(account.id)
    assert account.daily_posts_sent == 1


@pytest.mark.anyio
async def test_mark_browser_session_authenticated(db_session: AsyncSession):
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(platform=PlatformType.INSTAGRAM, handle="session_tester")
    )
    assert account.has_valid_browser_session is False
    assert account.last_browser_login_at is None
    assert account.browser_storage_path is None

    # 1. Update using a Path object
    storage_path = Path("storage/browser_sessions/test_id/storage_state.json")
    updated = await service.mark_browser_session_authenticated(account.id, storage_path)

    assert updated.has_valid_browser_session is True
    assert updated.last_browser_login_at is not None
    assert updated.browser_storage_path == str(storage_path)

    # 2. Update using a str object
    updated2 = await service.mark_browser_session_authenticated(account.id, "storage/new_path.json")
    assert updated2.browser_storage_path == "storage/new_path.json"


@pytest.mark.anyio
async def test_mark_browser_session_authenticated_not_found_raises(db_session: AsyncSession):
    service = AccountService(db_session)
    with pytest.raises(AccountNotFoundError):
        await service.mark_browser_session_authenticated(uuid4(), "dummy/path.json")


@pytest.mark.anyio
async def test_account_recovers_after_cooldown_expires(db_session: AsyncSession):
    """Verifies that an account in RATE_LIMITED status recovers to ACTIVE once cooldown expires."""
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(platform=PlatformType.TWITTER, handle="cooldown_recovery_bot")
    )

    expired_time = datetime.now(UTC) - timedelta(minutes=10)
    await service.set_cooldown(account.id, until=expired_time)

    assert account.is_in_cooldown() is False
    assert account.can_post_today() is True
    assert account.status == AccountStatus.ACTIVE


@pytest.mark.anyio
async def test_record_dm_activity_enforces_daily_limit(db_session: AsyncSession):
    """Verifies record_dm_activity raises DailyDMQuotaExceededError when limit is reached."""
    service = AccountService(db_session)
    account = await service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle="dm_limit_bypass_bot",
            daily_dm_limit=1,
        )
    )

    await service.record_dm_activity(account.id)
    assert account.daily_dms_sent == 1

    with pytest.raises(DailyDMQuotaExceededError):
        await service.record_dm_activity(account.id)
