import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.dependencies import get_db_session
from app.db.session import async_session_factory
from app.modules.accounts.schemas import (
    AccountCreateRequest,
    AccountResponse,
    AccountUpdateRequest,
)
from app.modules.accounts.service import AccountService

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


@router.websocket("/{account_id}/session/ws")
async def account_session_auth_stream(
    websocket: WebSocket,
    account_id: UUID,
):
    """
    Hardened WebSocket stream: Uses isolated short-lived DB sessions
    so long browser auth sessions never exhaust the connection pool.
    """
    await websocket.accept()
    try:
        # 1. Fetch account metadata in a dedicated short-lived session
        async with async_session_factory() as db:
            service = AccountService(db)
            await service.get_by_id_or_raise(account_id)

        # 2. Run the interactive browser session without locking a DB connection
        async with async_session_factory() as db:
            service = AccountService(db)
            await service.run_session_authentication_stream(account_id, websocket)

    except WebSocketDisconnect:
        logger.debug("Client disconnected from account session stream: %s", account_id)
    except Exception as exc:
        logger.error("Error in account session stream for %s: %s", account_id, exc, exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
