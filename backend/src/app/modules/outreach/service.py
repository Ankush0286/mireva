from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.enums import (
    LeadStage,
    LeadTier,
    OutreachMessageStatus,
    PlatformType,
)
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
from app.modules.outreach.models import Lead, OutreachCampaign, OutreachMessage


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class OutreachService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_service = AccountService(db)

    # =========================================================================
    # Lead / Influencer Directory Management
    # =========================================================================

    async def get_lead_by_id(self, lead_id: UUID | str) -> Lead | None:
        target_id = _ensure_uuid(lead_id)
        stmt = select(Lead).where(Lead.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_lead_by_id_or_raise(self, lead_id: UUID | str) -> Lead:
        lead = await self.get_lead_by_id(lead_id)
        if not lead:
            raise LeadNotFoundError(lead_id)
        return lead

    async def get_lead_by_platform_and_handle(
        self, platform: PlatformType, handle: str
    ) -> Lead | None:
        clean_handle = handle.lstrip("@").strip()
        stmt = select(Lead).where(
            Lead.platform == platform,
            Lead.handle == clean_handle,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_leads(
        self,
        platform: PlatformType | None = None,
        stage: LeadStage | None = None,
        tier: LeadTier | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Lead]:
        stmt = select(Lead).order_by(Lead.created_at.desc())
        if platform is not None:
            stmt = stmt.where(Lead.platform == platform)
        if stage is not None:
            stmt = stmt.where(Lead.stage == stage)
        if tier is not None:
            stmt = stmt.where(Lead.tier == tier)

        result = await self.db.execute(stmt.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def create_lead(self, cmd: CreateLeadCommand) -> Lead:
        clean_handle = cmd.handle.lstrip("@").strip()
        existing = await self.get_lead_by_platform_and_handle(cmd.platform, clean_handle)
        if existing:
            platform_str = (
                cmd.platform.value if hasattr(cmd.platform, "value") else str(cmd.platform)
            )
            raise LeadAlreadyExistsError(platform=platform_str, handle=clean_handle)

        lead = Lead(
            platform=cmd.platform,
            handle=clean_handle,
            display_name=cmd.display_name,
            bio=cmd.bio,
            profile_url=cmd.profile_url,
            email=cmd.email,
            follower_count=cmd.follower_count,
            tier=cmd.tier,
            stage=cmd.stage,
            tags=cmd.tags,
            notes=cmd.notes,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(lead)
        await self.db.commit()
        await self.db.refresh(lead)
        return lead

    async def update_lead(self, cmd: UpdateLeadCommand) -> Lead:
        lead = await self.get_lead_by_id_or_raise(cmd.lead_id)

        if cmd.display_name is not None:
            lead.display_name = cmd.display_name
        if cmd.bio is not None:
            lead.bio = cmd.bio
        if cmd.profile_url is not None:
            lead.profile_url = cmd.profile_url
        if cmd.email is not None:
            lead.email = cmd.email
        if cmd.follower_count is not None:
            lead.follower_count = cmd.follower_count
        if cmd.tier is not None:
            lead.tier = cmd.tier
        if cmd.stage is not None:
            lead.stage = cmd.stage
        if cmd.tags is not None:
            lead.tags = cmd.tags
        if cmd.notes is not None:
            lead.notes = cmd.notes
        if cmd.extra_metadata is not None:
            lead.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(lead)
        return lead

    async def delete_lead(self, lead_id: UUID | str) -> None:
        lead = await self.get_lead_by_id_or_raise(lead_id)
        await self.db.execute(delete(OutreachMessage).where(OutreachMessage.lead_id == lead.id))
        await self.db.delete(lead)
        await self.db.commit()

    # =========================================================================
    # Outreach Campaign Management
    # =========================================================================

    async def get_campaign_by_id(self, campaign_id: UUID | str) -> OutreachCampaign | None:
        target_id = _ensure_uuid(campaign_id)
        stmt = select(OutreachCampaign).where(OutreachCampaign.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_campaign_by_id_or_raise(self, campaign_id: UUID | str) -> OutreachCampaign:
        campaign = await self.get_campaign_by_id(campaign_id)
        if not campaign:
            raise OutreachCampaignNotFoundError(campaign_id)
        return campaign

    async def list_campaigns(self, is_active: bool | None = None) -> list[OutreachCampaign]:
        stmt = select(OutreachCampaign).order_by(OutreachCampaign.created_at.desc())
        if is_active is not None:
            stmt = stmt.where(OutreachCampaign.is_active == is_active)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_campaign(self, cmd: CreateOutreachCampaignCommand) -> OutreachCampaign:
        acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
        acc_res = await self.db.execute(acc_stmt)
        account = acc_res.scalars().first()
        if not account:
            raise AccountNotFoundError(cmd.account_id)

        campaign = OutreachCampaign(
            name=cmd.name,
            account_id=cmd.account_id,
            description=cmd.description,
            is_active=cmd.is_active,
            target_criteria=cmd.target_criteria,
            template=cmd.template,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def update_campaign(self, cmd: UpdateOutreachCampaignCommand) -> OutreachCampaign:
        campaign = await self.get_campaign_by_id_or_raise(cmd.campaign_id)

        if cmd.account_id is not None:
            acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
            acc_res = await self.db.execute(acc_stmt)
            account = acc_res.scalars().first()
            if not account:
                raise AccountNotFoundError(cmd.account_id)
            campaign.account_id = cmd.account_id

        if cmd.name is not None:
            campaign.name = cmd.name
        if cmd.description is not None:
            campaign.description = cmd.description
        if cmd.is_active is not None:
            campaign.is_active = cmd.is_active
        if cmd.target_criteria is not None:
            campaign.target_criteria = cmd.target_criteria
        if cmd.template is not None:
            campaign.template = cmd.template
        if cmd.extra_metadata is not None:
            campaign.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def delete_campaign(self, campaign_id: UUID | str) -> None:
        campaign = await self.get_campaign_by_id_or_raise(campaign_id)
        await self.db.execute(
            update(OutreachMessage)
            .where(OutreachMessage.outreach_campaign_id == campaign.id)
            .values(outreach_campaign_id=None)
        )
        await self.db.delete(campaign)
        await self.db.commit()

    # =========================================================================
    # Outreach Message Staging & Human Review Gates
    # =========================================================================

    async def get_message_by_id(self, message_id: UUID | str) -> OutreachMessage | None:
        target_id = _ensure_uuid(message_id)
        stmt = (
            select(OutreachMessage)
            .options(
                selectinload(OutreachMessage.lead),
                selectinload(OutreachMessage.account),
            )
            .where(OutreachMessage.id == target_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_message_by_id_or_raise(self, message_id: UUID | str) -> OutreachMessage:
        message = await self.get_message_by_id(message_id)
        if not message:
            raise OutreachMessageNotFoundError(message_id)
        return message

    async def list_messages(
        self,
        lead_id: UUID | None = None,
        campaign_id: UUID | None = None,
        status: OutreachMessageStatus | None = None,
        limit: int = 50,
    ) -> list[OutreachMessage]:
        stmt = (
            select(OutreachMessage)
            .options(
                selectinload(OutreachMessage.lead),
                selectinload(OutreachMessage.account),
            )
            .order_by(OutreachMessage.created_at.desc())
        )
        if lead_id is not None:
            stmt = stmt.where(OutreachMessage.lead_id == lead_id)
        if campaign_id is not None:
            stmt = stmt.where(OutreachMessage.outreach_campaign_id == campaign_id)
        if status is not None:
            stmt = stmt.where(OutreachMessage.status == status)

        result = await self.db.execute(stmt.limit(limit))
        return list(result.scalars().all())

    async def stage_message(self, cmd: StageMessageCommand) -> OutreachMessage:
        lead = await self.get_lead_by_id_or_raise(cmd.lead_id)
        if not lead.can_contact():
            raise LeadUncontactableError(handle=lead.handle, stage=lead.stage.value)

        acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
        acc_res = await self.db.execute(acc_stmt)
        account = acc_res.scalars().first()
        if not account:
            raise AccountNotFoundError(cmd.account_id)

        if cmd.outreach_campaign_id:
            await self.get_campaign_by_id_or_raise(cmd.outreach_campaign_id)

        message = OutreachMessage(
            lead_id=cmd.lead_id,
            account_id=cmd.account_id,
            outreach_campaign_id=cmd.outreach_campaign_id,
            channel=cmd.channel,
            content=cmd.content,
            status=OutreachMessageStatus.STAGED,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def review_message(self, cmd: ReviewMessageCommand) -> OutreachMessage:
        message = await self.get_message_by_id_or_raise(cmd.message_id)
        if message.status not in (OutreachMessageStatus.STAGED, OutreachMessageStatus.DRAFT):
            raise MessageAlreadyProcessedError(message.id)

        if cmd.status == OutreachMessageStatus.APPROVED:
            acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == message.account_id)
            acc_res = await self.db.execute(acc_stmt)
            account = acc_res.scalars().first()

            if account and not account.can_send_dm_today():
                raise DailyDMQuotaExceededError(
                    handle=account.handle,
                    limit=account.daily_dm_limit,
                )
            message.mark_as_approved(edited_content=cmd.edited_content)

        elif cmd.status == OutreachMessageStatus.REJECTED:
            message.mark_as_rejected(reason=cmd.rejection_reason)

        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def record_delivery(self, cmd: RecordMessageDeliveryCommand) -> OutreachMessage:
        message = await self.get_message_by_id_or_raise(cmd.message_id)
        message.mark_as_dispatched(platform_id=cmd.platform_message_id)

        await self.account_service.record_dm_activity(message.account_id)

        lead = await self.get_lead_by_id(message.lead_id)
        if lead and lead.stage in (LeadStage.DISCOVERED, LeadStage.QUALIFIED):
            lead.stage = LeadStage.CONTACTED

        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def record_failure(self, cmd: RecordMessageFailureCommand) -> OutreachMessage:
        message = await self.get_message_by_id_or_raise(cmd.message_id)
        message.mark_as_failed(error=cmd.error_message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def delete_message(self, message_id: UUID | str) -> None:
        message = await self.get_message_by_id_or_raise(message_id)
        if message.status == OutreachMessageStatus.DISPATCHED:
            raise MessageAlreadyProcessedError(message.id)

        await self.db.delete(message)
        await self.db.commit()
