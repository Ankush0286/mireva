from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    LeadStage,
    LeadTier,
    OutreachChannel,
    OutreachMessageStatus,
    PlatformType,
)
from app.modules.accounts.commands import CreateAccountCommand
from app.modules.accounts.exceptions import AccountNotFoundError
from app.modules.accounts.models import ConnectedAccount
from app.modules.accounts.service import AccountService
from app.modules.outreach.commands import (
    CreateLeadCommand,
    CreateOutreachCampaignCommand,
    RecordMessageDeliveryCommand,
    RecordMessageFailureCommand,
    ReviewMessageCommand,
    StageMessageCommand,
    UpdateLeadCommand,
    UpdateOutreachCampaignCommand,
)
from app.modules.outreach.exceptions import (
    DailyDMQuotaExceededError,
    LeadAlreadyExistsError,
    LeadNotFoundError,
    LeadUncontactableError,
    MessageAlreadyProcessedError,
    OutreachCampaignNotFoundError,
    OutreachMessageNotFoundError,
)
from app.modules.outreach.models import Lead
from app.modules.outreach.service import OutreachService


async def _create_sample_account(
    db: AsyncSession, handle: str = "outreach_bot", daily_dm_limit: int = 15
) -> ConnectedAccount:
    """Helper to create a connected account used for cold DM outreach."""
    account_service = AccountService(db)
    return await account_service.create_account(
        CreateAccountCommand(
            platform=PlatformType.TWITTER,
            handle=handle,
            display_name="Outreach Bot",
            daily_dm_limit=daily_dm_limit,
        )
    )


async def _create_sample_lead(
    service: OutreachService,
    handle: str = "influencer_sam",
    stage: LeadStage = LeadStage.DISCOVERED,
) -> Lead:
    """Helper to create a lead in the social CRM."""
    return await service.create_lead(
        CreateLeadCommand(
            platform=PlatformType.TWITTER,
            handle=handle,
            display_name="Influencer Sam",
            follower_count=25000,
            tier=LeadTier.MICRO,
            stage=stage,
            tags=["tech", "saas"],
        )
    )


# =============================================================================
# Lead / Influencer Directory Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_lead_crud(db_session: AsyncSession):
    service = OutreachService(db_session)

    # 1. Create lead (strips leading @)
    cmd = CreateLeadCommand(
        platform=PlatformType.TWITTER,
        handle="@startup_ceo",
        display_name="Startup CEO",
        bio="Building the future of marketing automation.",
        follower_count=12000,
        tier=LeadTier.MICRO,
    )
    lead = await service.create_lead(cmd)

    assert lead.id is not None
    assert lead.handle == "startup_ceo"
    assert lead.stage == LeadStage.DISCOVERED
    assert lead.tier == LeadTier.MICRO

    # 2. Update lead
    updated = await service.update_lead(
        UpdateLeadCommand(
            lead_id=lead.id,
            display_name="Renamed CEO",
            stage=LeadStage.QUALIFIED,
            notes="Very responsive on tech discussions.",
        )
    )
    assert updated.display_name == "Renamed CEO"
    assert updated.stage == LeadStage.QUALIFIED
    assert updated.notes == "Very responsive on tech discussions."

    # 3. List leads
    leads = await service.list_leads(stage=LeadStage.QUALIFIED)
    assert len(leads) == 1
    assert leads[0].id == lead.id

    # 4. Delete lead
    await service.delete_lead(lead.id)
    assert await service.get_lead_by_id(lead.id) is None


@pytest.mark.anyio
async def test_list_leads_filters_and_pagination(db_session: AsyncSession):
    service = OutreachService(db_session)

    await service.create_lead(
        CreateLeadCommand(platform=PlatformType.TWITTER, handle="lead_tw", tier=LeadTier.NANO)
    )
    await service.create_lead(
        CreateLeadCommand(platform=PlatformType.INSTAGRAM, handle="lead_ig", tier=LeadTier.MICRO)
    )

    tw_leads = await service.list_leads(platform=PlatformType.TWITTER)
    assert len(tw_leads) == 1
    assert tw_leads[0].handle == "lead_tw"

    micro_leads = await service.list_leads(tier=LeadTier.MICRO)
    assert len(micro_leads) == 1
    assert micro_leads[0].handle == "lead_ig"

    paged = await service.list_leads(limit=1, offset=0)
    assert len(paged) == 1


@pytest.mark.anyio
async def test_create_duplicate_lead_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    await service.create_lead(
        CreateLeadCommand(platform=PlatformType.TWITTER, handle="unique_creator")
    )

    with pytest.raises(LeadAlreadyExistsError):
        await service.create_lead(
            CreateLeadCommand(platform=PlatformType.TWITTER, handle="@unique_creator")
        )


@pytest.mark.anyio
async def test_get_nonexistent_lead_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    with pytest.raises(LeadNotFoundError):
        await service.get_lead_by_id_or_raise(uuid4())


@pytest.mark.anyio
async def test_lead_can_contact_helper(db_session: AsyncSession):
    service = OutreachService(db_session)
    lead_ok = await _create_sample_lead(service, "contactable", stage=LeadStage.QUALIFIED)
    assert lead_ok.can_contact() is True

    lead_dnc = await _create_sample_lead(service, "dnc_lead", stage=LeadStage.DO_NOT_CONTACT)
    assert lead_dnc.can_contact() is False

    lead_converted = await _create_sample_lead(service, "conv_lead", stage=LeadStage.CONVERTED)
    assert lead_converted.can_contact() is False


# =============================================================================
# Outreach Campaigns Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_outreach_campaign_crud(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)

    # 1. Create campaign
    cmd = CreateOutreachCampaignCommand(
        name="Micro-Influencer Q4",
        account_id=account.id,
        template="Hey @{handle}, love your content on SaaS!",
        target_criteria={"min_followers": 5000, "max_followers": 50000},
    )
    campaign = await service.create_campaign(cmd)

    assert campaign.id is not None
    assert campaign.name == "Micro-Influencer Q4"
    assert campaign.is_active is True

    # 2. Update campaign
    updated = await service.update_campaign(
        UpdateOutreachCampaignCommand(
            campaign_id=campaign.id,
            name="Updated Campaign Name",
            is_active=False,
        )
    )
    assert updated.name == "Updated Campaign Name"
    assert updated.is_active is False

    # 3. Delete campaign
    await service.delete_campaign(campaign.id)
    assert await service.get_campaign_by_id(campaign.id) is None


@pytest.mark.anyio
async def test_create_campaign_nonexistent_account_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    with pytest.raises(AccountNotFoundError):
        await service.create_campaign(
            CreateOutreachCampaignCommand(
                name="Orphan Campaign",
                account_id=uuid4(),
            )
        )


@pytest.mark.anyio
async def test_get_nonexistent_campaign_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    with pytest.raises(OutreachCampaignNotFoundError):
        await service.get_campaign_by_id_or_raise(uuid4())


# =============================================================================
# Message Staging & Human Review Gates Unit Tests
# =============================================================================


@pytest.mark.anyio
async def test_stage_message_success(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead = await _create_sample_lead(service, "prospect_one")

    cmd = StageMessageCommand(
        lead_id=lead.id,
        account_id=account.id,
        content="Hey Sam, noticed your post on AI workflows. Would love to connect!",
        channel=OutreachChannel.DM,
    )
    message = await service.stage_message(cmd)

    assert message.id is not None
    assert message.status == OutreachMessageStatus.STAGED
    assert message.lead_id == lead.id
    assert message.account_id == account.id


@pytest.mark.anyio
async def test_stage_message_with_nonexistent_account_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    lead = await _create_sample_lead(service, "prospect_orphan")

    with pytest.raises(AccountNotFoundError):
        await service.stage_message(
            StageMessageCommand(
                lead_id=lead.id,
                account_id=uuid4(),
                content="Hello there!",
            )
        )


@pytest.mark.anyio
async def test_stage_message_uncontactable_lead_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)

    # Lead marked 'do_not_contact'
    dnc_lead = await _create_sample_lead(service, "optout_user", stage=LeadStage.DO_NOT_CONTACT)
    with pytest.raises(LeadUncontactableError):
        await service.stage_message(
            StageMessageCommand(
                lead_id=dnc_lead.id,
                account_id=account.id,
                content="Hello there!",
            )
        )

    # Lead marked 'converted'
    converted_lead = await _create_sample_lead(service, "customer_user", stage=LeadStage.CONVERTED)
    with pytest.raises(LeadUncontactableError):
        await service.stage_message(
            StageMessageCommand(
                lead_id=converted_lead.id,
                account_id=account.id,
                content="Hello customer!",
            )
        )


@pytest.mark.anyio
async def test_review_message_approval_and_rejection(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead = await _create_sample_lead(service, "review_lead")

    # 1. Approval flow with copy edits
    msg1 = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Draft copy that needs polish.",
        )
    )
    approved = await service.review_message(
        ReviewMessageCommand(
            message_id=msg1.id,
            status=OutreachMessageStatus.APPROVED,
            edited_content="Polished, personalized cold DM copy.",
        )
    )
    assert approved.status == OutreachMessageStatus.APPROVED
    assert approved.content == "Polished, personalized cold DM copy."
    assert approved.reviewed_at is not None

    # 2. Rejection flow with reason
    msg2 = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Irrelevant pitch message.",
        )
    )
    rejected = await service.review_message(
        ReviewMessageCommand(
            message_id=msg2.id,
            status=OutreachMessageStatus.REJECTED,
            rejection_reason="Not a good fit for this campaign.",
        )
    )
    assert rejected.status == OutreachMessageStatus.REJECTED
    assert rejected.last_error_message == "Not a good fit for this campaign."


@pytest.mark.anyio
async def test_review_message_dm_quota_exceeded_raises(db_session: AsyncSession):
    """Enforces that approving a message checks the account's safe daily cold DM limits."""
    service = OutreachService(db_session)
    # Account with daily limit of 1 DM
    account = await _create_sample_account(db_session, "limited_dm_bot", daily_dm_limit=1)
    lead = await _create_sample_lead(service, "quota_lead")

    # Exhaust the daily DM limit on the sender account
    account.daily_dms_sent = 1
    await db_session.commit()

    staged = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Pitch message",
        )
    )

    # Attempting to approve must fail due to anti-ban quota enforcement
    with pytest.raises(DailyDMQuotaExceededError):
        await service.review_message(
            ReviewMessageCommand(
                message_id=staged.id,
                status=OutreachMessageStatus.APPROVED,
            )
        )


@pytest.mark.anyio
async def test_record_delivery_advances_lead_stage_and_increments_quota(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead = await _create_sample_lead(service, "dispatched_lead", stage=LeadStage.DISCOVERED)

    message = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Hey there, great profile!",
        )
    )

    # Approve message
    await service.review_message(
        ReviewMessageCommand(message_id=message.id, status=OutreachMessageStatus.APPROVED)
    )

    # Platform adapter confirms DM dispatch
    delivered = await service.record_delivery(
        RecordMessageDeliveryCommand(
            message_id=message.id,
            platform_message_id="dm_platform_12345",
        )
    )

    assert delivered.status == OutreachMessageStatus.DISPATCHED
    assert delivered.platform_message_id == "dm_platform_12345"
    assert delivered.sent_at is not None

    # Verify CRM lead progressed from DISCOVERED -> CONTACTED
    refreshed_lead = await service.get_lead_by_id_or_raise(lead.id)
    assert refreshed_lead.stage == LeadStage.CONTACTED

    # Verify sender profile daily DM count incremented
    await db_session.refresh(account)
    assert account.daily_dms_sent == 1


@pytest.mark.anyio
async def test_record_failure(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead = await _create_sample_lead(service, "failure_lead")

    message = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Hello world!",
        )
    )

    failed = await service.record_failure(
        RecordMessageFailureCommand(
            message_id=message.id,
            error_message="Twitter API rate limited (429)",
        )
    )
    assert failed.status == OutreachMessageStatus.FAILED
    assert failed.last_error_message == "Twitter API rate limited (429)"


@pytest.mark.anyio
async def test_list_messages_filters(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead1 = await _create_sample_lead(service, "filter_lead_1")
    lead2 = await _create_sample_lead(service, "filter_lead_2")

    msg1 = await service.stage_message(
        StageMessageCommand(lead_id=lead1.id, account_id=account.id, content="Hi 1")
    )
    await service.stage_message(
        StageMessageCommand(lead_id=lead2.id, account_id=account.id, content="Hi 2")
    )

    lead1_msgs = await service.list_messages(lead_id=lead1.id)
    assert len(lead1_msgs) == 1
    assert lead1_msgs[0].id == msg1.id

    staged_msgs = await service.list_messages(status=OutreachMessageStatus.STAGED)
    assert len(staged_msgs) >= 2


@pytest.mark.anyio
async def test_processed_message_cannot_be_reviewed_or_deleted(db_session: AsyncSession):
    service = OutreachService(db_session)
    account = await _create_sample_account(db_session)
    lead = await _create_sample_lead(service, "immutable_lead")

    message = await service.stage_message(
        StageMessageCommand(
            lead_id=lead.id,
            account_id=account.id,
            content="Already sent copy",
        )
    )
    await service.record_delivery(
        RecordMessageDeliveryCommand(
            message_id=message.id,
            platform_message_id="platform_sent_999",
        )
    )

    # Re-reviewing already sent message must raise
    with pytest.raises(MessageAlreadyProcessedError):
        await service.review_message(
            ReviewMessageCommand(
                message_id=message.id,
                status=OutreachMessageStatus.APPROVED,
            )
        )

    # Deleting sent message must raise
    with pytest.raises(MessageAlreadyProcessedError):
        await service.delete_message(message.id)


@pytest.mark.anyio
async def test_get_nonexistent_message_raises(db_session: AsyncSession):
    service = OutreachService(db_session)
    with pytest.raises(OutreachMessageNotFoundError):
        await service.get_message_by_id_or_raise(uuid4())
