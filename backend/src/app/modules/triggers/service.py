import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.enums import PlatformType, TriggerMatchStatus
from app.modules.accounts.exceptions import AccountNotFoundError
from app.modules.accounts.models import ConnectedAccount
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
from app.modules.triggers.models import TriggerMatch, TriggerRule, WatchedHandle


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class TriggerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Watched Handle Management
    # =========================================================================

    async def get_watched_handle_by_id(self, handle_id: UUID | str) -> WatchedHandle | None:
        target_id = _ensure_uuid(handle_id)
        stmt = select(WatchedHandle).where(WatchedHandle.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_watched_handle_by_id_or_raise(self, handle_id: UUID | str) -> WatchedHandle:
        handle = await self.get_watched_handle_by_id(handle_id)
        if not handle:
            raise WatchedHandleNotFoundError(handle_id)
        return handle

    async def get_watched_handle_by_platform_and_handle(
        self, platform: PlatformType, handle: str
    ) -> WatchedHandle | None:
        clean_handle = handle.lstrip("@").strip()
        stmt = select(WatchedHandle).where(
            WatchedHandle.platform == platform,
            WatchedHandle.handle == clean_handle,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_watched_handles(self, active_only: bool = False) -> list[WatchedHandle]:
        stmt = select(WatchedHandle).order_by(WatchedHandle.created_at.desc())
        if active_only:
            stmt = stmt.where(WatchedHandle.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def add_watched_handle(self, cmd: AddWatchedHandleCommand) -> WatchedHandle:
        clean_handle = cmd.handle.lstrip("@").strip()
        existing = await self.get_watched_handle_by_platform_and_handle(cmd.platform, clean_handle)
        if existing:
            platform_str = (
                cmd.platform.value if hasattr(cmd.platform, "value") else str(cmd.platform)
            )
            raise WatchedHandleAlreadyExistsError(platform=platform_str, handle=clean_handle)

        watched = WatchedHandle(
            platform=cmd.platform,
            handle=clean_handle,
            display_name=cmd.display_name,
            scrape_frequency_minutes=cmd.scrape_frequency_minutes,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(watched)
        await self.db.commit()
        await self.db.refresh(watched)
        return watched

    async def update_watched_handle(self, cmd: UpdateWatchedHandleCommand) -> WatchedHandle:
        watched = await self.get_watched_handle_by_id_or_raise(cmd.handle_id)

        if cmd.display_name is not None:
            watched.display_name = cmd.display_name
        if cmd.is_active is not None:
            watched.is_active = cmd.is_active
        if cmd.scrape_frequency_minutes is not None:
            watched.scrape_frequency_minutes = cmd.scrape_frequency_minutes
        if cmd.extra_metadata is not None:
            watched.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(watched)
        return watched

    async def delete_watched_handle(self, handle_id: UUID | str) -> None:
        watched = await self.get_watched_handle_by_id_or_raise(handle_id)
        await self.db.execute(
            delete(TriggerMatch).where(TriggerMatch.watched_handle_id == watched.id)
        )
        await self.db.delete(watched)
        await self.db.commit()

    # =========================================================================
    # Trigger Rule Management
    # =========================================================================

    async def get_rule_by_id(self, rule_id: UUID | str) -> TriggerRule | None:
        target_id = _ensure_uuid(rule_id)
        stmt = (
            select(TriggerRule)
            .options(selectinload(TriggerRule.account))
            .where(TriggerRule.id == target_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_rule_by_id_or_raise(self, rule_id: UUID | str) -> TriggerRule:
        rule = await self.get_rule_by_id(rule_id)
        if not rule:
            raise TriggerRuleNotFoundError(rule_id)
        return rule

    async def list_rules(
        self, platform: PlatformType | None = None, active_only: bool = False
    ) -> list[TriggerRule]:
        stmt = (
            select(TriggerRule)
            .options(selectinload(TriggerRule.account))
            .order_by(TriggerRule.created_at.desc())
        )
        if platform is not None:
            stmt = stmt.where(TriggerRule.platform == platform)
        if active_only:
            stmt = stmt.where(TriggerRule.is_active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_rule(self, cmd: CreateTriggerRuleCommand) -> TriggerRule:
        acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
        acc_result = await self.db.execute(acc_stmt)
        account = acc_result.scalars().first()
        if not account:
            raise AccountNotFoundError(cmd.account_id)

        if cmd.watched_handle_id:
            await self.get_watched_handle_by_id_or_raise(cmd.watched_handle_id)

        clean_any = [k.lower().strip() for k in cmd.keywords_any if k.strip()]
        clean_all = [k.lower().strip() for k in cmd.keywords_all if k.strip()]
        clean_exclude = [k.lower().strip() for k in cmd.keywords_exclude if k.strip()]

        if not clean_any and not clean_all:
            raise InvalidTriggerRuleError(
                "Rule requires at least one keyword in keywords_any or keywords_all."
            )

        rule = TriggerRule(
            name=cmd.name,
            description=cmd.description,
            platform=cmd.platform,
            account_id=cmd.account_id,
            watched_handle_id=cmd.watched_handle_id,
            action_type=cmd.action_type,
            keywords_any=clean_any,
            keywords_all=clean_all,
            keywords_exclude=clean_exclude,
            response_template=cmd.response_template,
            cooldown_minutes=cmd.cooldown_minutes,
            is_active=cmd.is_active,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def update_rule(self, cmd: UpdateTriggerRuleCommand) -> TriggerRule:
        rule = await self.get_rule_by_id_or_raise(cmd.rule_id)

        if cmd.account_id is not None:
            acc_stmt = select(ConnectedAccount).where(ConnectedAccount.id == cmd.account_id)
            acc_res = await self.db.execute(acc_stmt)
            account = acc_res.scalars().first()
            if not account:
                raise AccountNotFoundError(cmd.account_id)
            rule.account_id = cmd.account_id

        if cmd.watched_handle_id is not None:
            await self.get_watched_handle_by_id_or_raise(cmd.watched_handle_id)
            rule.watched_handle_id = cmd.watched_handle_id

        if cmd.name is not None:
            rule.name = cmd.name
        if cmd.description is not None:
            rule.description = cmd.description
        if cmd.action_type is not None:
            rule.action_type = cmd.action_type
        if cmd.keywords_any is not None:
            rule.keywords_any = [k.lower().strip() for k in cmd.keywords_any if k.strip()]
        if cmd.keywords_all is not None:
            rule.keywords_all = [k.lower().strip() for k in cmd.keywords_all if k.strip()]
        if cmd.keywords_exclude is not None:
            rule.keywords_exclude = [k.lower().strip() for k in cmd.keywords_exclude if k.strip()]

        if not rule.keywords_any and not rule.keywords_all:
            raise InvalidTriggerRuleError(
                "Rule requires at least one keyword in keywords_any or keywords_all."
            )

        if cmd.response_template is not None:
            rule.response_template = cmd.response_template
        if cmd.cooldown_minutes is not None:
            rule.cooldown_minutes = cmd.cooldown_minutes
        if cmd.is_active is not None:
            rule.is_active = cmd.is_active
        if cmd.extra_metadata is not None:
            rule.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def delete_rule(self, rule_id: UUID | str) -> None:
        rule = await self.get_rule_by_id_or_raise(rule_id)
        await self.db.execute(delete(TriggerMatch).where(TriggerMatch.rule_id == rule.id))
        await self.db.delete(rule)
        await self.db.commit()

    # =========================================================================
    # Matching Engine & Post Evaluation
    # =========================================================================

    @staticmethod
    def evaluate_text_match(rule: TriggerRule, text: str) -> tuple[bool, list[str]]:
        normalized_text = text.lower()
        matched: list[str] = []

        for exclude_kw in rule.keywords_exclude:
            pattern = rf"(?<!\w){re.escape(exclude_kw)}(?!\w)"
            if re.search(pattern, normalized_text):
                return False, []

        if rule.keywords_all:
            for all_kw in rule.keywords_all:
                pattern = rf"(?<!\w){re.escape(all_kw)}(?!\w)"
                if not re.search(pattern, normalized_text):
                    return False, []
                matched.append(all_kw)

        if rule.keywords_any:
            any_found = False
            for any_kw in rule.keywords_any:
                pattern = rf"(?<!\w){re.escape(any_kw)}(?!\w)"
                if re.search(pattern, normalized_text):
                    any_found = True
                    matched.append(any_kw)
            if not any_found:
                return False, []

        return True, list(set(matched))

    async def evaluate_incoming_post(self, cmd: EvaluateIncomingPostCommand) -> list[TriggerMatch]:
        stmt = select(TriggerRule).where(
            TriggerRule.platform == cmd.platform,
            TriggerRule.is_active.is_(True),
        )
        if cmd.watched_handle_id:
            stmt = stmt.where(
                (TriggerRule.watched_handle_id == cmd.watched_handle_id)
                | (TriggerRule.watched_handle_id.is_(None))
            )
        else:
            stmt = stmt.where(TriggerRule.watched_handle_id.is_(None))

        rules_result = await self.db.execute(stmt)
        active_rules = rules_result.scalars().all()
        created_matches: list[TriggerMatch] = []
        now = datetime.now(UTC)

        for rule in active_rules:
            dup_stmt = select(TriggerMatch).where(
                TriggerMatch.rule_id == rule.id,
                TriggerMatch.platform_post_id == cmd.platform_post_id,
            )
            dup_res = await self.db.execute(dup_stmt)
            if dup_res.scalars().first():
                continue

            is_match, matched_kws = self.evaluate_text_match(rule, cmd.post_content)
            if not is_match:
                continue

            cooldown_cutoff = now - timedelta(minutes=rule.cooldown_minutes)
            cooldown_stmt = select(TriggerMatch).where(
                TriggerMatch.rule_id == rule.id,
                TriggerMatch.author_handle == cmd.author_handle,
                TriggerMatch.created_at >= cooldown_cutoff,
            )
            cd_res = await self.db.execute(cooldown_stmt)
            if cd_res.scalars().first():
                continue

            response_copy: str | None = None
            if rule.response_template:
                response_copy = rule.response_template.replace("{author}", cmd.author_handle)

            match = TriggerMatch(
                rule_id=rule.id,
                watched_handle_id=cmd.watched_handle_id,
                platform_post_id=cmd.platform_post_id,
                platform_post_url=cmd.platform_post_url,
                author_handle=cmd.author_handle,
                post_content=cmd.post_content,
                matched_keywords=matched_kws,
                status=TriggerMatchStatus.PENDING_REVIEW,
                generated_response=response_copy,
            )
            self.db.add(match)
            created_matches.append(match)

        if created_matches:
            await self.db.commit()
            for m in created_matches:
                await self.db.refresh(m)

        return created_matches

    # =========================================================================
    # Match Review & Actions
    # =========================================================================

    async def get_match_by_id(self, match_id: UUID | str) -> TriggerMatch | None:
        target_id = _ensure_uuid(match_id)
        stmt = select(TriggerMatch).where(TriggerMatch.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_match_by_id_or_raise(self, match_id: UUID | str) -> TriggerMatch:
        match = await self.get_match_by_id(match_id)
        if not match:
            raise TriggerMatchNotFoundError(match_id)
        return match

    async def list_matches(
        self,
        rule_id: UUID | None = None,
        status: TriggerMatchStatus | None = None,
        limit: int = 50,
    ) -> list[TriggerMatch]:
        stmt = select(TriggerMatch).order_by(TriggerMatch.created_at.desc())
        if rule_id is not None:
            stmt = stmt.where(TriggerMatch.rule_id == rule_id)
        if status is not None:
            stmt = stmt.where(TriggerMatch.status == status)

        result = await self.db.execute(stmt.limit(limit))
        return list(result.scalars().all())

    async def review_match(self, cmd: ReviewMatchCommand) -> TriggerMatch:
        match = await self.get_match_by_id_or_raise(cmd.match_id)

        if cmd.status == TriggerMatchStatus.APPROVED:
            match.mark_as_approved(response_text=cmd.edited_response)
        elif cmd.status == TriggerMatchStatus.IGNORED:
            match.mark_as_ignored()

        await self.db.commit()
        await self.db.refresh(match)
        return match
