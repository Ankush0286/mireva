import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import AppError
from app.db.dependencies import get_db_session
from app.modules.accounts.schemas import (
    AccountCreateRequest,
    AccountResponse,
    AccountUpdateRequest,
)
from app.modules.accounts.service import AccountService
from app.platforms.browser.session_manager import BrowserSessionManager

logger = logging.getLogger(__name__)
router = APIRouter()


def get_account_service(db: AsyncSession = Depends(get_db_session)) -> AccountService:
    return AccountService(db)


@router.post(
    "/",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Connect a new social or email account",
)
async def create_account(
    payload: AccountCreateRequest,
    service: AccountService = Depends(get_account_service),
) -> AccountResponse:
    account = await service.create_account(payload.to_command())
    return AccountResponse.model_validate(account)


@router.get(
    "/",
    response_model=list[AccountResponse],
    status_code=status.HTTP_200_OK,
    summary="List all connected accounts",
)
async def list_accounts(
    active_only: bool = Query(
        default=False,
        description="If true, returns only enabled/active accounts",
    ),
    service: AccountService = Depends(get_account_service),
) -> list[AccountResponse]:
    accounts = await service.list_accounts(active_only=active_only)
    return [AccountResponse.model_validate(acc) for acc in accounts]


@router.get(
    "/{account_id}",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a connected account by ID",
)
async def get_account(
    account_id: UUID,
    service: AccountService = Depends(get_account_service),
) -> AccountResponse:
    account = await service.get_by_id_or_raise(account_id)
    return AccountResponse.model_validate(account)


@router.patch(
    "/{account_id}",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Update account settings, limits, or rotate credentials",
)
async def update_account(
    account_id: UUID,
    payload: AccountUpdateRequest,
    service: AccountService = Depends(get_account_service),
) -> AccountResponse:
    account = await service.update_account(payload.to_command(account_id))
    return AccountResponse.model_validate(account)


@router.delete(
    "/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect and delete an account",
)
async def delete_account(
    account_id: UUID,
    service: AccountService = Depends(get_account_service),
) -> None:
    await service.delete_account(account_id)


@router.post(
    "/{account_id}/session/verify",
    response_model=AccountResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify storage_state.json exists and mark account authenticated",
)
async def verify_browser_session(
    account_id: UUID,
    service: AccountService = Depends(get_account_service),
) -> AccountResponse:
    account = await service.get_by_id_or_raise(account_id)

    session_mgr = BrowserSessionManager()
    if not session_mgr.has_stored_session(account.id):
        raise AppError("No session cookies were saved. Please try logging in again.")

    storage_path = session_mgr.get_storage_state_path(account.id)
    updated = await service.mark_browser_session_authenticated(account.id, storage_path)
    return AccountResponse.model_validate(updated)
