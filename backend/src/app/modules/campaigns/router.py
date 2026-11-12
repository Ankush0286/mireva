from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import CampaignStatus, PostStatus
from app.db.dependencies import get_db_session
from app.modules.campaigns.schemas import (
    CampaignCreateRequest,
    CampaignDetailResponse,
    CampaignResponse,
    CampaignUpdateRequest,
    PostQueueRequest,
    PostResponse,
    PostUpdateRequest,
)
from app.modules.campaigns.service import CampaignService

router = APIRouter()


def get_campaign_service(db: AsyncSession = Depends(get_db_session)) -> CampaignService:
    """Dependency injection factory for CampaignService."""
    return CampaignService(db)


# =============================================================================
# Campaign Endpoints
# =============================================================================


@router.post(
    "/",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new marketing campaign",
)
async def create_campaign(
    payload: CampaignCreateRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignResponse:
    campaign = await service.create_campaign(payload.to_command())
    return CampaignResponse.model_validate(campaign)


@router.get(
    "/",
    response_model=list[CampaignResponse],
    status_code=status.HTTP_200_OK,
    summary="List all campaigns",
)
async def list_campaigns(
    status: CampaignStatus | None = Query(
        default=None,
        description="Filter campaigns by status (draft, active, completed, etc.)",
    ),
    service: CampaignService = Depends(get_campaign_service),
) -> list[CampaignResponse]:
    campaigns = await service.list_campaigns(status=status)
    return [CampaignResponse.model_validate(c) for c in campaigns]


@router.get(
    "/{campaign_id}",
    response_model=CampaignDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a campaign by ID with all its scheduled posts",
)
async def get_campaign(
    campaign_id: UUID,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignDetailResponse:
    campaign = await service.get_campaign_by_id_or_raise(campaign_id)
    return CampaignDetailResponse.model_validate(campaign)


@router.patch(
    "/{campaign_id}",
    response_model=CampaignResponse,
    status_code=status.HTTP_200_OK,
    summary="Update campaign metadata, dates, or status",
)
async def update_campaign(
    campaign_id: UUID,
    payload: CampaignUpdateRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> CampaignResponse:
    campaign = await service.update_campaign(payload.to_command(campaign_id))
    return CampaignResponse.model_validate(campaign)


@router.delete(
    "/{campaign_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a campaign and cascade delete all its posts",
)
async def delete_campaign(
    campaign_id: UUID,
    service: CampaignService = Depends(get_campaign_service),
) -> None:
    await service.delete_campaign(campaign_id)


# =============================================================================
# Scheduled Post Endpoints
# =============================================================================


@router.post(
    "/{campaign_id}/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Stage or schedule a new post for a campaign",
)
async def queue_post(
    campaign_id: UUID,
    payload: PostQueueRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> PostResponse:
    post = await service.queue_post(payload.to_command(campaign_id))
    return PostResponse.model_validate(post)


@router.get(
    "/{campaign_id}/posts",
    response_model=list[PostResponse],
    status_code=status.HTTP_200_OK,
    summary="List all posts under a specific campaign",
)
async def list_campaign_posts(
    campaign_id: UUID,
    status: PostStatus | None = Query(
        default=None,
        description="Filter posts by status (draft, scheduled, published, failed, etc.)",
    ),
    service: CampaignService = Depends(get_campaign_service),
) -> list[PostResponse]:
    posts = await service.list_posts_by_campaign(campaign_id, status=status)
    return [PostResponse.model_validate(p) for p in posts]


@router.get(
    "/posts/{post_id}",
    response_model=PostResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a scheduled post by ID",
)
async def get_post(
    post_id: UUID,
    service: CampaignService = Depends(get_campaign_service),
) -> PostResponse:
    post = await service.get_post_by_id_or_raise(post_id)
    return PostResponse.model_validate(post)


@router.patch(
    "/posts/{post_id}",
    response_model=PostResponse,
    status_code=status.HTTP_200_OK,
    summary="Update content, schedule, or media of a pending post",
)
async def update_post(
    post_id: UUID,
    payload: PostUpdateRequest,
    service: CampaignService = Depends(get_campaign_service),
) -> PostResponse:
    post = await service.update_post(payload.to_command(post_id))
    return PostResponse.model_validate(post)


@router.post(
    "/posts/{post_id}/cancel",
    response_model=PostResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel a scheduled post without deleting it",
)
async def cancel_post(
    post_id: UUID,
    service: CampaignService = Depends(get_campaign_service),
) -> PostResponse:
    post = await service.cancel_post(post_id)
    return PostResponse.model_validate(post)


@router.delete(
    "/posts/{post_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete a draft or cancelled post",
)
async def delete_post(
    post_id: UUID,
    service: CampaignService = Depends(get_campaign_service),
) -> None:
    await service.delete_post(post_id)
