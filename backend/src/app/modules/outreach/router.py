import json
import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.browser_agent import read_and_summarize_inbox, scout_influencer_leads
from app.common.enums import (
    LeadStage,
    LeadTier,
    OutreachMessageStatus,
    PlatformType,
)
from app.db.dependencies import get_db_session
from app.db.session import async_session_factory
from app.modules.accounts.service import AccountService
from app.modules.outreach.commands import CreateLeadCommand
from app.modules.outreach.schemas import (
    LeadCreateRequest,
    LeadResponse,
    LeadUpdateRequest,
    MessageReviewRequest,
    MessageStageRequest,
    OutreachCampaignCreateRequest,
    OutreachCampaignResponse,
    OutreachCampaignUpdateRequest,
    OutreachMessageResponse,
    ScoutLeadsRequest,
    ScoutLeadsResponse,
)
from app.modules.outreach.service import OutreachService

router = APIRouter()


def get_outreach_service(db: AsyncSession = Depends(get_db_session)) -> OutreachService:
    return OutreachService(db)


# =============================================================================
# Lead / Influencer Directory Endpoints
# =============================================================================


@router.post(
    "/leads",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import or create a new lead in the social CRM",
)
async def create_lead(
    payload: LeadCreateRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> LeadResponse:
    lead = await service.create_lead(payload.to_command())
    return LeadResponse.model_validate(lead)


@router.get(
    "/leads",
    response_model=list[LeadResponse],
    status_code=status.HTTP_200_OK,
    summary="List and filter tracked leads",
)
async def list_leads(
    platform: PlatformType | None = Query(default=None, description="Filter by platform"),
    stage: LeadStage | None = Query(default=None, description="Filter by CRM relationship stage"),
    tier: LeadTier | None = Query(default=None, description="Filter by audience sizing tier"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: OutreachService = Depends(get_outreach_service),
) -> list[LeadResponse]:
    leads = await service.list_leads(
        platform=platform,
        stage=stage,
        tier=tier,
        limit=limit,
        offset=offset,
    )
    return [LeadResponse.model_validate(lead) for lead in leads]


@router.get(
    "/leads/{lead_id}",
    response_model=LeadResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a lead by ID",
)
async def get_lead(
    lead_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> LeadResponse:
    lead = await service.get_lead_by_id_or_raise(lead_id)
    return LeadResponse.model_validate(lead)


@router.patch(
    "/leads/{lead_id}",
    response_model=LeadResponse,
    status_code=status.HTTP_200_OK,
    summary="Update lead metadata or relationship stage",
)
async def update_lead(
    lead_id: UUID,
    payload: LeadUpdateRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> LeadResponse:
    lead = await service.update_lead(payload.to_command(lead_id))
    return LeadResponse.model_validate(lead)


@router.delete(
    "/leads/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a lead and their message history",
)
async def delete_lead(
    lead_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> None:
    await service.delete_lead(lead_id)


# =============================================================================
# Outreach Campaigns Endpoints
# =============================================================================


@router.post(
    "/campaigns",
    response_model=OutreachCampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new cold outreach campaign",
)
async def create_campaign(
    payload: OutreachCampaignCreateRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachCampaignResponse:
    campaign = await service.create_campaign(payload.to_command())
    return OutreachCampaignResponse.model_validate(campaign)


@router.get(
    "/campaigns",
    response_model=list[OutreachCampaignResponse],
    status_code=status.HTTP_200_OK,
    summary="List all outreach campaigns",
)
async def list_campaigns(
    is_active: bool | None = Query(default=None, description="Filter active status"),
    service: OutreachService = Depends(get_outreach_service),
) -> list[OutreachCampaignResponse]:
    campaigns = await service.list_campaigns(is_active=is_active)
    return [OutreachCampaignResponse.model_validate(c) for c in campaigns]


@router.get(
    "/campaigns/{campaign_id}",
    response_model=OutreachCampaignResponse,
    status_code=status.HTTP_200_OK,
    summary="Get an outreach campaign by ID",
)
async def get_campaign(
    campaign_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachCampaignResponse:
    campaign = await service.get_campaign_by_id_or_raise(campaign_id)
    return OutreachCampaignResponse.model_validate(campaign)


@router.patch(
    "/campaigns/{campaign_id}",
    response_model=OutreachCampaignResponse,
    status_code=status.HTTP_200_OK,
    summary="Update outreach campaign settings or template",
)
async def update_campaign(
    campaign_id: UUID,
    payload: OutreachCampaignUpdateRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachCampaignResponse:
    campaign = await service.update_campaign(payload.to_command(campaign_id))
    return OutreachCampaignResponse.model_validate(campaign)


@router.delete(
    "/campaigns/{campaign_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an outreach campaign",
)
async def delete_campaign(
    campaign_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> None:
    await service.delete_campaign(campaign_id)


# =============================================================================
# Outreach Messages & Review Gates Endpoints
# =============================================================================


@router.post(
    "/messages/stage",
    response_model=OutreachMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Stage a cold message behind a human approval gate",
)
async def stage_message(
    payload: MessageStageRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachMessageResponse:
    message = await service.stage_message(payload.to_command())
    return OutreachMessageResponse.model_validate(message)


@router.get(
    "/messages",
    response_model=list[OutreachMessageResponse],
    status_code=status.HTTP_200_OK,
    summary="List staged, approved, or dispatched cold messages",
)
async def list_messages(
    lead_id: UUID | None = Query(default=None, description="Filter by lead ID"),
    campaign_id: UUID | None = Query(default=None, description="Filter by campaign ID"),
    status: OutreachMessageStatus | None = Query(
        default=None, description="Filter by message review status"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    service: OutreachService = Depends(get_outreach_service),
) -> list[OutreachMessageResponse]:
    messages = await service.list_messages(
        lead_id=lead_id,
        campaign_id=campaign_id,
        status=status,
        limit=limit,
    )
    return [OutreachMessageResponse.model_validate(m) for m in messages]


@router.get(
    "/messages/{message_id}",
    response_model=OutreachMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a cold outreach message by ID",
)
async def get_message(
    message_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachMessageResponse:
    message = await service.get_message_by_id_or_raise(message_id)
    return OutreachMessageResponse.model_validate(message)


@router.post(
    "/messages/{message_id}/review",
    response_model=OutreachMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve or reject a staged cold message",
)
async def review_message(
    message_id: UUID,
    payload: MessageReviewRequest,
    service: OutreachService = Depends(get_outreach_service),
) -> OutreachMessageResponse:
    message = await service.review_message(payload.to_command(message_id))
    return OutreachMessageResponse.model_validate(message)


@router.delete(
    "/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft, staged, or rejected message",
)
async def delete_message(
    message_id: UUID,
    service: OutreachService = Depends(get_outreach_service),
) -> None:
    await service.delete_message(message_id)


# =============================================================================
# Hardened Browser Scouting & Sweep Endpoints (Decoupled from DB Pool)
# =============================================================================


@router.post(
    "/scout",
    response_model=ScoutLeadsResponse,
    status_code=status.HTTP_200_OK,
    summary="Deploy autonomous Browser AI Agent to scout & vet creator leads into CRM",
)
async def scout_creators_endpoint(
    payload: ScoutLeadsRequest,
) -> ScoutLeadsResponse:
    """
    Decoupled DB access: Reads account first, releases connection during
    long browser run, then opens a fresh session to batch-insert results.
    """
    # 1. Fetch account in short-lived session
    async with async_session_factory() as db:
        account = await AccountService(db).get_by_id_or_raise(payload.account_id)

    # 2. Run long Playwright browser exploration (no open DB transaction)
    raw_report = await scout_influencer_leads(
        account=account,
        niche_or_query=payload.niche_or_query,
        max_leads=payload.max_leads,
        headless=True,
    )

    parsed_leads: list[dict[str, Any]] = []
    json_match = re.search(r"\[[\s\S]*\]", raw_report)
    if json_match:
        try:
            parsed_leads = json.loads(json_match.group(0))
        except Exception:
            pass

    # 3. Batch-save verified leads in a fresh transaction
    imported_count = 0
    if payload.auto_import and parsed_leads:
        async with async_session_factory() as db:
            service = OutreachService(db)
            for item in parsed_leads:
                handle = str(item.get("handle", "")).lstrip("@").strip()
                if not handle:
                    continue
                existing = await service.get_lead_by_platform_and_handle(account.platform, handle)
                if existing:
                    continue

                try:
                    await service.create_lead(
                        CreateLeadCommand(
                            platform=account.platform,
                            handle=handle,
                            display_name=item.get("display_name"),
                            bio=item.get("bio"),
                            follower_count=item.get("follower_count"),
                            tier=LeadTier.MICRO
                            if (item.get("follower_count") or 0) > 10000
                            else LeadTier.NANO,
                            tags=[payload.niche_or_query.lstrip("#")],
                            notes=f"AI Scout fit: {item.get('reason', 'N/A')}",
                        )
                    )
                    imported_count += 1
                except Exception:
                    continue

    return ScoutLeadsResponse(
        niche=payload.niche_or_query,
        discovered_count=len(parsed_leads),
        imported_count=imported_count,
        leads=parsed_leads,
    )


@router.post(
    "/sweep-inbox",
    status_code=status.HTTP_200_OK,
    summary="Deploy Browser AI Agent to read direct messages and summarize replies",
)
async def sweep_inbox_endpoint(
    account_id: UUID,
) -> dict[str, Any]:
    # 1. Fetch account in short-lived session
    async with async_session_factory() as db:
        account = await AccountService(db).get_by_id_or_raise(account_id)

    # 2. Run browser sweep without holding DB connection
    summary = await read_and_summarize_inbox(account=account, headless=True)

    return {
        "account": account.handle,
        "platform": account.platform.value,
        "summary": summary,
    }
