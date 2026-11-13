from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import PlatformType, TriggerActionType, TriggerMatchStatus
from app.common.exceptions import ConflictError
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.exceptions import AccountNotFoundError
from app.modules.accounts.models import ConnectedAccount
from app.modules.accounts.service import AccountService
from app.modules.triggers.commands import (
    AddWatchedHandleCommand,
    CreateTriggerRuleCommand,
    EvaluateIncomingPostCommand,
    ReviewMatchCommand,
    UpdateTriggerRuleCommand,
    UpdateWatchedHandleCommand,
)
from app.modules.triggers.exceptions import (
    InvalidTriggerRuleError,
    TriggerMatchNotFoundError,
    TriggerRuleNotFoundError,
    WatchedHandleAlreadyExistsError,
    WatchedHandleNotFoundError,
)
from app.modules.triggers.service import TriggerService


async def _create_sample_account(db: AsyncSession, handle: str = "trigger_bot") -> ConnectedAccount:
    """Helper to create a connected account used for auto-reply rules."""
    account_service = AccountService(db)
    return await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle=handle,
            display_name="Trigger Bot",
        )
    )


# =============================================================================
# Watched Handle Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_watched_handle_crud(db_session: AsyncSession):
    service = TriggerService(db_session)

    # 1. Add watched handle (strips leading @)
    cmd = AddWatchedHandleCommand(
        platform=PlatformType.TWITTER,
        handle="@competitor_ceo",
        display_name="Competitor CEO",
        scrape_frequency_minutes=15,
    )
    handle = await service.add_watched_handle(cmd)

    assert handle.id is not None
    assert handle.handle == "competitor_ceo"
    assert handle.scrape_frequency_minutes == 15

    # 2. Update
    updated = await service.update_watched_handle(
        UpdateWatchedHandleCommand(
            handle_id=handle.id,
            display_name="Updated CEO",
            scrape_frequency_minutes=60,
        )
    )
    assert updated.display_name == "Updated CEO"
    assert updated.scrape_frequency_minutes == 60

    # 3. List
    handles = await service.list_watched_handles()
    assert len(handles) == 1

    # 4. Delete
    await service.delete_watched_handle(handle.id)
    assert await service.get_watched_handle_by_id(handle.id) is None


@pytest.mark.anyio
async def test_list_watched_handles_active_filter(db_session: AsyncSession):
    service = TriggerService(db_session)

    h1 = await service.add_watched_handle(
        AddWatchedHandleCommand(platform=PlatformType.TWITTER, handle="active_brand")
    )
    h2 = await service.add_watched_handle(
        AddWatchedHandleCommand(platform=PlatformType.TWITTER, handle="inactive_brand")
    )
    await service.update_watched_handle(
        UpdateWatchedHandleCommand(handle_id=h2.id, is_active=False)
    )

    all_handles = await service.list_watched_handles(active_only=False)
    active_handles = await service.list_watched_handles(active_only=True)

    assert len(all_handles) == 2
    assert len(active_handles) == 1
    assert active_handles[0].id == h1.id


@pytest.mark.anyio
async def test_add_duplicate_watched_handle_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    await service.add_watched_handle(
        AddWatchedHandleCommand(platform=PlatformType.TWITTER, handle="same_handle")
    )

    with pytest.raises(WatchedHandleAlreadyExistsError):
        await service.add_watched_handle(
            AddWatchedHandleCommand(platform=PlatformType.TWITTER, handle="@same_handle")
        )


@pytest.mark.anyio
async def test_get_nonexistent_handle_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    with pytest.raises(WatchedHandleNotFoundError):
        await service.get_watched_handle_by_id_or_raise(uuid4())


# =============================================================================
# Trigger Rule Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_trigger_rule_crud(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    # 1. Create rule
    cmd = CreateTriggerRuleCommand(
        name="Pricing Complaint Rule",
        platform=PlatformType.TWITTER,
        account_id=account.id,
        action_type=TriggerActionType.STAGE_DRAFT,
        keywords_any=["expensive", "pricing", "#saas"],
        keywords_exclude=["hiring"],
        response_template="Hey @{author}, try our affordable alternative!",
    )
    rule = await service.create_rule(cmd)

    assert rule.id is not None
    assert rule.name == "Pricing Complaint Rule"
    assert "pricing" in rule.keywords_any

    # 2. Update rule
    updated = await service.update_rule(
        UpdateTriggerRuleCommand(
            rule_id=rule.id,
            name="Updated Rule Name",
            cooldown_minutes=120,
        )
    )
    assert updated.name == "Updated Rule Name"
    assert updated.cooldown_minutes == 120

    # 3. Delete rule
    await service.delete_rule(rule.id)
    assert await service.get_rule_by_id(rule.id) is None


@pytest.mark.anyio
async def test_list_rules_platform_and_active_filters(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    r1 = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Twitter Active",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["support"],
        )
    )
    r2 = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Instagram Active",
            platform=PlatformType.INSTAGRAM,
            account_id=account.id,
            keywords_any=["support"],
        )
    )
    await service.update_rule(UpdateTriggerRuleCommand(rule_id=r2.id, is_active=False))

    tw_rules = await service.list_rules(platform=PlatformType.TWITTER)
    assert len(tw_rules) == 1
    assert tw_rules[0].id == r1.id

    active_rules = await service.list_rules(active_only=True)
    assert len(active_rules) == 1
    assert active_rules[0].id == r1.id


@pytest.mark.anyio
async def test_create_rule_without_account_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    with pytest.raises(AccountNotFoundError):
        await service.create_rule(
            CreateTriggerRuleCommand(
                name="Orphan Rule",
                platform=PlatformType.TWITTER,
                account_id=uuid4(),
                keywords_any=["test"],
            )
        )


@pytest.mark.anyio
async def test_update_rule_with_nonexistent_account_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    rule = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["test"],
        )
    )

    with pytest.raises(AccountNotFoundError):
        await service.update_rule(UpdateTriggerRuleCommand(rule_id=rule.id, account_id=uuid4()))


@pytest.mark.anyio
async def test_create_rule_without_keywords_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    with pytest.raises(InvalidTriggerRuleError):
        await service.create_rule(
            CreateTriggerRuleCommand(
                name="Empty Keywords",
                platform=PlatformType.TWITTER,
                account_id=account.id,
                keywords_any=[],
                keywords_all=[],
            )
        )


# =============================================================================
# Keyword Evaluator Engine & Deduplication Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_evaluate_text_match_engine(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    rule = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Evaluation Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["alternative", "switch"],
            keywords_all=["looking", "tool"],
            keywords_exclude=["bad", "scam"],
        )
    )

    # 1. Matches: contains all required + at least one optional
    text1 = "I am looking for a new tool as an alternative."
    is_match1, kws1 = service.evaluate_text_match(rule, text1)
    assert is_match1 is True
    assert set(kws1) == {"looking", "tool", "alternative"}

    # 2. Fails: missing one required keyword ('tool')
    text2 = "I am looking for a switch."
    is_match2, _ = service.evaluate_text_match(rule, text2)
    assert is_match2 is False

    # 3. Fails: contains negative keyword ('scam')
    text3 = "I am looking for a tool alternative but it feels like a scam."
    is_match3, _ = service.evaluate_text_match(rule, text3)
    assert is_match3 is False


@pytest.mark.anyio
async def test_evaluate_text_match_hashtags_and_mentions(db_session: AsyncSession):
    """Verifies that lookaround regex accurately captures #hashtags and @mentions."""
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    rule = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Hashtag Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["#marketingai", "@competitor"],
        )
    )

    # Matches #marketingai
    match, kws = service.evaluate_text_match(rule, "Loving the new #marketingai framework!")
    assert match is True
    assert "#marketingai" in kws

    # Matches @competitor
    match2, kws2 = service.evaluate_text_match(rule, "Leaving @competitor for a better option.")
    assert match2 is True
    assert "@competitor" in kws2

    # Does not falsely match substrings
    match3, _ = service.evaluate_text_match(rule, "Using #marketingairocks framework")
    assert match3 is False


@pytest.mark.anyio
async def test_evaluate_incoming_post_deduplication(db_session: AsyncSession):
    """Ensures identical tweets are never processed twice for the same rule."""
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    await service.create_rule(
        CreateTriggerRuleCommand(
            name="Live Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["ai"],
        )
    )

    post_cmd = EvaluateIncomingPostCommand(
        platform=PlatformType.TWITTER,
        platform_post_id="tweet_9999",
        author_handle="tech_enthusiast",
        post_content="Testing the best ai solutions today.",
    )

    # 1st evaluation -> creates match
    matches1 = await service.evaluate_incoming_post(post_cmd)
    assert len(matches1) == 1
    assert matches1[0].platform_post_id == "tweet_9999"

    # 2nd evaluation of same tweet -> deduplicated, 0 new matches created
    matches2 = await service.evaluate_incoming_post(post_cmd)
    assert len(matches2) == 0


@pytest.mark.anyio
async def test_evaluate_incoming_post_author_cooldown(db_session: AsyncSession):
    """Ensures an author who matched recently is ignored within the cooldown window."""
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    await service.create_rule(
        CreateTriggerRuleCommand(
            name="Cooldown Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["growth"],
            cooldown_minutes=60,
        )
    )

    # 1st post from user
    post1 = EvaluateIncomingPostCommand(
        platform=PlatformType.TWITTER,
        platform_post_id="tweet_001",
        author_handle="frequent_poster",
        post_content="Need growth marketing advice.",
    )
    matches1 = await service.evaluate_incoming_post(post1)
    assert len(matches1) == 1

    # 2nd different post from SAME user within 60 minutes -> skipped
    post2 = EvaluateIncomingPostCommand(
        platform=PlatformType.TWITTER,
        platform_post_id="tweet_002",
        author_handle="frequent_poster",
        post_content="Still talking about growth tools.",
    )
    matches2 = await service.evaluate_incoming_post(post2)
    assert len(matches2) == 0


@pytest.mark.anyio
async def test_review_match_flow(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    await service.create_rule(
        CreateTriggerRuleCommand(
            name="Review Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["help"],
            response_template="Hello @{author}!",
        )
    )

    matches = await service.evaluate_incoming_post(
        EvaluateIncomingPostCommand(
            platform=PlatformType.TWITTER,
            platform_post_id="tweet_777",
            author_handle="prospect_dan",
            post_content="I need help with social media.",
        )
    )
    assert len(matches) == 1
    match = matches[0]
    assert match.status == TriggerMatchStatus.PENDING_REVIEW
    assert match.generated_response == "Hello @prospect_dan!"

    # Approve with refined response copy
    approved = await service.review_match(
        ReviewMatchCommand(
            match_id=match.id,
            status=TriggerMatchStatus.APPROVED,
            edited_response="Hello prospect_dan, check our personalized demo!",
        )
    )
    assert approved.status == TriggerMatchStatus.APPROVED
    assert approved.generated_response == "Hello prospect_dan, check our personalized demo!"
    assert approved.reviewed_at is not None


@pytest.mark.anyio
async def test_review_match_ignore_flow(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    await service.create_rule(
        CreateTriggerRuleCommand(
            name="Ignore Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["feedback"],
        )
    )

    matches = await service.evaluate_incoming_post(
        EvaluateIncomingPostCommand(
            platform=PlatformType.TWITTER,
            platform_post_id="tweet_ignore_1",
            author_handle="random_user",
            post_content="Looking for feedback on my app.",
        )
    )
    assert len(matches) == 1

    ignored = await service.review_match(
        ReviewMatchCommand(match_id=matches[0].id, status=TriggerMatchStatus.IGNORED)
    )
    assert ignored.status == TriggerMatchStatus.IGNORED
    assert ignored.reviewed_at is not None


@pytest.mark.anyio
async def test_match_state_helpers(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)
    await service.create_rule(
        CreateTriggerRuleCommand(
            name="State Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["state"],
        )
    )

    matches = await service.evaluate_incoming_post(
        EvaluateIncomingPostCommand(
            platform=PlatformType.TWITTER,
            platform_post_id="tweet_state_1",
            author_handle="tester",
            post_content="State test query.",
        )
    )
    match = matches[0]

    # Test dispatched helper
    match.mark_as_dispatched("reply_123")
    assert match.status == TriggerMatchStatus.DISPATCHED
    assert match.published_reply_id == "reply_123"
    assert match.dispatched_at is not None

    # Test failed helper
    match.mark_as_failed("Rate limit hit")
    assert match.status == TriggerMatchStatus.FAILED
    assert match.last_error_message == "Rate limit hit"


@pytest.mark.anyio
async def test_get_nonexistent_match_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    with pytest.raises(TriggerMatchNotFoundError):
        await service.get_match_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_get_nonexistent_rule_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    with pytest.raises(TriggerRuleNotFoundError):
        await service.get_rule_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_update_rule_clearing_all_keywords_raises(db_session: AsyncSession):
    service = TriggerService(db_session)
    account = await _create_sample_account(db_session)

    rule = await service.create_rule(
        CreateTriggerRuleCommand(
            name="Valid Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["pricing"],
        )
    )

    with pytest.raises(InvalidTriggerRuleError):
        await service.update_rule(
            UpdateTriggerRuleCommand(
                rule_id=rule.id,
                keywords_any=[],
                keywords_all=[],
            )
        )


@pytest.mark.anyio
async def test_dispatched_trigger_match_cannot_be_re_reviewed(db_session: AsyncSession):
    """Verifies that an already dispatched match cannot be modified via review_match."""
    account = await _create_sample_account(db_session, "trig_guard_bot")
    trig_service = TriggerService(db_session)

    await trig_service.create_rule(
        CreateTriggerRuleCommand(
            name="Guard Rule",
            platform=PlatformType.TWITTER,
            account_id=account.id,
            keywords_any=["pricing"],
        )
    )
    matches = await trig_service.evaluate_incoming_post(
        EvaluateIncomingPostCommand(
            platform=PlatformType.TWITTER,
            platform_post_id="post_1",
            author_handle="user1",
            post_content="pricing question",
        )
    )
    match = matches[0]
    match.mark_as_dispatched("reply_id_123")
    await db_session.commit()

    with pytest.raises(ConflictError):
        await trig_service.review_match(
            ReviewMatchCommand(match_id=match.id, status=TriggerMatchStatus.IGNORED)
        )
