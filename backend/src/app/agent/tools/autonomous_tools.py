from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic_ai import RunContext
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import (
    ActivityType,
    LeadStage,
    OutreachMessageStatus,
    PostStatus,
    TriggerMatchStatus,
)
from app.modules.accounts.models import ConnectedAccount
from app.modules.campaigns.models import ScheduledPost
from app.modules.history.models import ActivityLog
from app.modules.outreach.models import Lead, OutreachMessage
from app.modules.strategist.service import StrategistService
from app.modules.triggers.models import TriggerMatch


@marketing_agent.tool
async def sleep(
    ctx: RunContext[AgentDeps],
    duration_minutes: int,
    rationale: str,
) -> dict[str, Any]:
    """
    Concludes the current autonomous marketing cycle and puts the agent to sleep.
    Call this tool when you have finished your tasks for the current cycle.
    """
    async with ctx.deps.db_session_scope() as db:
        service = StrategistService(db)
        state = await service.record_sleep(
            duration_minutes=duration_minutes,
            rationale=rationale,
        )
        return {
            "status": state.status.value,
            "duration_minutes": max(30, min(180, duration_minutes)),
            "next_cycle_at": state.next_cycle_at.isoformat() if state.next_cycle_at else None,
            "rationale": state.sleep_rationale,
        }


@marketing_agent.tool
async def ask_human_for_help(
    ctx: RunContext[AgentDeps],
    urgency: str,
    question: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Pauses the 24/7 autonomous loop and flags an urgent blocker for the human operator.
    Use strictly as a last resort (expired account cookies, 2FA challenge, or major strategic fork).
    """
    async with ctx.deps.db_session_scope() as db:
        service = StrategistService(db)
        state = await service.record_human_blocker(
            urgency=urgency,
            question=question,
            context=context,
        )
        return {
            "status": state.status.value,
            "urgency": state.pending_urgency,
            "question": state.pending_question,
        }


@marketing_agent.tool
async def evaluate_marketing_performance(
    ctx: RunContext[AgentDeps],
) -> dict[str, Any]:
    """
    Audits marketing performance across connected accounts, scheduled posts, CRM leads,
    and human review outcomes from previous cycles (approved, rejected, or still pending).
    """
    async with ctx.deps.db_session_scope() as db:
        now = datetime.now(UTC)
        seven_days_ago = now - timedelta(days=7)

        acc_res = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.is_active.is_(True))
        )
        accounts = list(acc_res.scalars().all())

        posts_res = await db.execute(
            select(ScheduledPost).where(ScheduledPost.created_at >= seven_days_ago)
        )
        recent_posts = list(posts_res.scalars().all())

        leads_count = (await db.scalar(select(func.count()).select_from(Lead))) or 0
        converted_count = (
            await db.scalar(
                select(func.count()).select_from(Lead).where(Lead.stage == LeadStage.CONVERTED)
            )
        ) or 0

        # Fetch recent cold DMs with their leads to report review outcomes
        dms_res = await db.execute(
            select(OutreachMessage)
            .options(selectinload(OutreachMessage.lead))
            .order_by(OutreachMessage.updated_at.desc())
            .limit(15)
        )
        recent_dms = list(dms_res.scalars().all())

        # Fetch recent trigger matches to report review outcomes
        matches_res = await db.execute(
            select(TriggerMatch).order_by(TriggerMatch.updated_at.desc()).limit(15)
        )
        recent_matches = list(matches_res.scalars().all())

        failures_res = await db.execute(
            select(ActivityLog)
            .where(
                ActivityLog.activity_type.in_(
                    [
                        ActivityType.POST_FAILED,
                        ActivityType.ACCOUNT_COOLDOWN_TRIGGERED,
                    ]
                ),
                ActivityLog.created_at >= seven_days_ago,
            )
            .limit(5)
        )
        recent_issues = [
            {"title": log.title, "error": log.description} for log in failures_res.scalars().all()
        ]

        return {
            "connected_accounts": [
                {
                    "id": str(a.id),
                    "handle": a.handle,
                    "platform": a.platform.value,
                    "posts_sent_today": a.daily_posts_sent,
                    "post_limit": a.daily_post_limit,
                    "dms_sent_today": a.daily_dms_sent,
                    "dm_limit": a.daily_dm_limit,
                    "in_cooldown": a.is_in_cooldown(),
                }
                for a in accounts
            ],
            "posts_last_7_days": {
                "total": len(recent_posts),
                "published": sum(1 for p in recent_posts if p.status == PostStatus.PUBLISHED),
                "scheduled": sum(1 for p in recent_posts if p.status == PostStatus.SCHEDULED),
                "failed": sum(1 for p in recent_posts if p.status == PostStatus.FAILED),
            },
            "crm_summary": {
                "total_leads": leads_count,
                "converted_customers": converted_count,
            },
            "review_queue_outcomes": {
                "approved_and_dispatched_dms": [
                    {
                        "lead_handle": dm.lead.handle if dm.lead else "unknown",
                        "status": dm.status.value,
                        "content_preview": dm.content[:80],
                    }
                    for dm in recent_dms
                    if dm.status
                    in (OutreachMessageStatus.APPROVED, OutreachMessageStatus.DISPATCHED)
                ],
                "rejected_dms_by_human": [
                    {
                        "lead_handle": dm.lead.handle if dm.lead else "unknown",
                        "content_preview": dm.content[:80],
                        "reason": dm.last_error_message or "Dismissed by operator in review queue",
                    }
                    for dm in recent_dms
                    if dm.status == OutreachMessageStatus.REJECTED
                ],
                "still_pending_dm_reviews": [
                    {
                        "lead_handle": dm.lead.handle if dm.lead else "unknown",
                        "content_preview": dm.content[:80],
                    }
                    for dm in recent_dms
                    if dm.status == OutreachMessageStatus.STAGED
                ],
                "approved_trigger_replies": [
                    {
                        "author_handle": m.author_handle,
                        "status": m.status.value,
                    }
                    for m in recent_matches
                    if m.status in (TriggerMatchStatus.APPROVED, TriggerMatchStatus.DISPATCHED)
                ],
                "ignored_trigger_replies_by_human": [
                    {
                        "author_handle": m.author_handle,
                        "post_preview": m.post_content[:80],
                    }
                    for m in recent_matches
                    if m.status == TriggerMatchStatus.IGNORED
                ],
                "still_pending_trigger_reviews": [
                    {
                        "author_handle": m.author_handle,
                        "reply_preview": (m.generated_response or "")[:80],
                    }
                    for m in recent_matches
                    if m.status == TriggerMatchStatus.PENDING_REVIEW
                ],
            },
            "recent_issues_or_cooldowns": recent_issues,
        }
