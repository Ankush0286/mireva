import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.loop import run_agent_turn
from app.automation.workers.strategist_worker import (
    cancel_active_cycle,
    execute_autonomous_cycle,
)
from app.common.enums import StrategistStatus
from app.core.agent_config import agent_settings
from app.db.dependencies import get_db_session
from app.modules.strategist.schemas import (
    HumanReplyRequest,
    StrategistStateResponse,
    UpdateAutonomyRequest,
    UpdateModelRequest,
)
from app.modules.strategist.service import StrategistService

router = APIRouter()


def get_strategist_service(db: AsyncSession = Depends(get_db_session)) -> StrategistService:
    return StrategistService(db)


@router.get(
    "/state",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current 24/7 autonomous strategist state and sleep timer",
)
async def get_strategist_state(
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.get_or_create_state()
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/run-now",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Wake up the strategist early and execute an immediate cycle",
)
async def force_run_cycle(
    db: AsyncSession = Depends(get_db_session),
) -> StrategistStateResponse:
    service = StrategistService(db)
    state = await service.ensure_can_start_cycle()
    await execute_autonomous_cycle(db, state)
    await db.refresh(state)
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/toggle-pause",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Pause or resume the 24/7 autonomous strategist heartbeat",
)
async def toggle_pause(
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.toggle_pause()
    if state.status == StrategistStatus.PAUSED:
        cancel_active_cycle()
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/autonomy",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Update autonomy policy (staged_review vs full_auto)",
)
async def update_autonomy(
    payload: UpdateAutonomyRequest,
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.set_autonomy_level(payload.autonomy_level)
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/model",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Set the LLM model used by the autonomous strategist",
)
async def set_strategist_model(
    payload: UpdateModelRequest,
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.set_model(payload.model_id)
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/clear-context",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Clear all cycle logs and reset the strategist context window",
)
async def clear_strategist_context(
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.clear_context_and_logs()
    return StrategistStateResponse.model_validate(state)


@router.delete(
    "/cycles/{message_id}",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete a single cycle briefing and its associated tool logs",
)
async def delete_cycle_briefing(
    message_id: UUID,
    service: StrategistService = Depends(get_strategist_service),
) -> StrategistStateResponse:
    state = await service.delete_cycle_briefing(message_id)
    return StrategistStateResponse.model_validate(state)


@router.post(
    "/reply",
    response_model=StrategistStateResponse,
    status_code=status.HTTP_200_OK,
    summary="Answer a pending human-intervention question and resume the strategist",
)
async def reply_to_agent(
    payload: HumanReplyRequest,
    db: AsyncSession = Depends(get_db_session),
) -> StrategistStateResponse:
    service = StrategistService(db)
    state, question = await service.prepare_human_reply()

    if state.session_id:
        active_model = state.model_id or agent_settings.DEFAULT_MODEL
        prompt = (
            f"Human Operator responded to your question ('{question}'):\n"
            f"{payload.reply.strip()}\n\n"
            "Proceed with your actions based on this guidance, then call `sleep(duration_minutes, rationale)`."
        )
        try:
            await run_agent_turn(
                db=db,
                session_id=state.session_id,
                user_prompt=prompt,
                model_override=active_model,
                thinking=True,
            )
            await db.refresh(state)
            await service._sync_cycle_count(state)

            if state.status == StrategistStatus.RUNNING:
                state.status = StrategistStatus.SLEEPING
                state.next_cycle_at = datetime.now(UTC) + timedelta(minutes=60)
                state.sleep_rationale = (
                    "Processed operator guidance. Resting 60m before next check."
                )
                state.current_step = "Resting until next scheduled cycle."
                state.last_cycle_completed_at = datetime.now(UTC)
                await db.commit()
        except (Exception, asyncio.CancelledError) as exc:
            await db.rollback()
            refreshed = await service.get_or_create_state()
            if refreshed.status == StrategistStatus.RUNNING:
                refreshed.status = StrategistStatus.SLEEPING
                refreshed.next_cycle_at = datetime.now(UTC) + timedelta(minutes=30)
                refreshed.sleep_rationale = f"Reply handling error ({exc}). Retrying in 30 minutes."
                refreshed.current_step = "Recovering from error; scheduled retry in 30m."
                await db.commit()
            await service._sync_cycle_count(refreshed)
            raise

    await db.refresh(state)
    return StrategistStateResponse.model_validate(state)
