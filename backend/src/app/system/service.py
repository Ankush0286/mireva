import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.automation.scheduler import get_scheduler
from app.automation.workers.post_dispatcher import run_post_dispatcher
from app.automation.workers.quota_reset_worker import run_quota_reset_worker
from app.automation.workers.watcher_worker import run_watcher_worker
from app.common.enums import ActivitySeverity, ActivityType, PlatformType
from app.common.exceptions import AppError
from app.core.agent_config import agent_settings
from app.core.config import settings
from app.core.security import decrypt_token, encrypt_token
from app.db.session import sync_replica
from app.modules.accounts.models import ConnectedAccount
from app.modules.campaigns.models import Campaign, ScheduledPost
from app.modules.connectors.models import DataConnector
from app.modules.history.commands import LogActivityCommand
from app.modules.history.service import HistoryService
from app.modules.outreach.models import Lead
from app.modules.recipes.models import ActionRecipe
from app.modules.triggers.models import TriggerRule
from app.platforms.registry import PlatformRegistry
from app.system.schemas import (
    CoverageStatus,
    HealthStatus,
    RecipeCoverageSlot,
    SchedulerJobInfo,
    SeedRecipesResponse,
    SubsystemHealth,
    SystemDiagnosticsResponse,
    WorkerTriggerResponse,
)

# Only track deterministic WRITE actions as recipes; read/exploration is handled by the Browser AI Agent
CORE_ACTIONS: list[tuple[str, str]] = [
    ("publish_post", "Publish Post"),
    ("send_dm", "Send Cold DM"),
    ("comment_reply", "Reply to Post"),
]

AUDITED_PLATFORMS: list[PlatformType] = [
    PlatformType.INSTAGRAM,
    PlatformType.TWITTER,
    PlatformType.FACEBOOK,
]

DEFAULT_RECIPE_TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "Instagram Default Feed Post",
        "platform": PlatformType.INSTAGRAM,
        "action_type": "publish_post",
        "is_default": True,
        "description": "Standard photo/video feed post workflow with crop, filter, and caption steps.",
        "steps": [
            {"type": "click", "description": "Click Create button", "selectors": ["svg[aria-label='New post']", "[aria-label='Create']"]},
            {"type": "upload", "description": "Upload media file", "target": "input[type='file']", "variable": "media_path"},
            {"type": "click", "description": "Advance Crop screen", "selectors": ["button:has-text('Next')", "[role='button']:has-text('Next')"]},
            {"type": "click", "description": "Advance Filter screen", "selectors": ["button:has-text('Next')", "[role='button']:has-text('Next')"]},
            {"type": "type", "description": "Type post caption", "variable": "content", "selectors": ["div[aria-label='Write a caption...']", "[role='dialog'] div[role='textbox']"]},
            {"type": "click", "description": "Click Share", "selectors": ["[role='dialog'] button:has-text('Share')", "[role='dialog'] div[role='button']:has-text('Share')"]},
        ],
    },
    {
        "name": "Instagram Default Cold DM",
        "platform": PlatformType.INSTAGRAM,
        "action_type": "send_dm",
        "is_default": False,
        "description": "Navigates to target profile, opens message thread, and dispatches personalized DM.",
        "steps": [
            {"type": "click", "description": "Click profile Message button", "selectors": ["header button:has-text('Message')", "div[role='button']:has-text('Message')"]},
            {"type": "type", "description": "Type DM message", "variable": "content", "selectors": ["div[aria-label='Message']", "div[role='textbox'][contenteditable='true']"]},
            {"type": "click", "description": "Send message", "selectors": ["button:has-text('Send')", "div[role='button']:has-text('Send')"], "optional": True},
        ],
    },
    {
        "name": "Instagram Default Comment Reply",
        "platform": PlatformType.INSTAGRAM,
        "action_type": "comment_reply",
        "is_default": False,
        "description": "Opens post URL, focuses comment input, types contextual response, and submits.",
        "steps": [
            {"type": "click", "description": "Focus comment input", "selectors": ["textarea[aria-label='Add a comment...']", "form textarea"]},
            {"type": "type", "description": "Type comment copy", "variable": "content", "selectors": ["textarea[aria-label='Add a comment...']", "form textarea"]},
            {"type": "click", "description": "Post comment", "selectors": ["button:has-text('Post')", "div[role='button']:has-text('Post')"]},
        ],
    },
    {
        "name": "Twitter Default Post Compose",
        "platform": PlatformType.TWITTER,
        "action_type": "publish_post",
        "is_default": True,
        "description": "Standard X/Twitter compose and publish workflow.",
        "steps": [
            {"type": "click", "description": "Focus Tweet Compose Box", "selectors": ["div[data-testid='tweetTextarea_0']"]},
            {"type": "type", "description": "Type Tweet copy", "variable": "content", "selectors": ["div[data-testid='tweetTextarea_0']"]},
            {"type": "click", "description": "Click Post button", "selectors": ["button[data-testid='tweetButtonInline']", "button[data-testid='tweetButton']"]},
        ],
    },
    {
        "name": "Twitter Default Cold DM",
        "platform": PlatformType.TWITTER,
        "action_type": "send_dm",
        "is_default": False,
        "description": "Dispatches direct message from target user's X profile.",
        "steps": [
            {"type": "click", "description": "Click send DM from profile", "selectors": ["button[data-testid='sendDMFromProfile']"]},
            {"type": "type", "description": "Type DM copy", "variable": "content", "selectors": ["div[data-testid='dmComposerTextInput']"]},
            {"type": "click", "description": "Click DM Send button", "selectors": ["button[data-testid='dmComposerSendButton']"]},
        ],
    },
    {
        "name": "Twitter Default Comment Reply",
        "platform": PlatformType.TWITTER,
        "action_type": "comment_reply",
        "is_default": False,
        "description": "Submits auto-reply on target tweet for keyword trigger rules.",
        "steps": [
            {"type": "click", "description": "Focus reply box", "selectors": ["div[data-testid='tweetTextarea_0']", "div[role='textbox']"]},
            {"type": "type", "description": "Type reply copy", "variable": "content", "selectors": ["div[data-testid='tweetTextarea_0']", "div[role='textbox']"]},
            {"type": "click", "description": "Submit reply", "selectors": ["button[data-testid='tweetButtonInline']"]},
        ],
    },
]


class SystemDiagnosticsService:
    def __init__(self, db: Session):
        self.db = db

    def _check_database_health(self) -> SubsystemHealth:
        start = time.perf_counter()
        try:
            self.db.execute(text("SELECT 1")).scalar()
            latency = round((time.perf_counter() - start) * 1000, 2)
            has_turso = bool(settings.TURSO_DATABASE_URL and settings.TURSO_AUTH_TOKEN)
            mode = "Turso Cloud Embedded Replica" if has_turso else "Standalone Local libSQL"

            return SubsystemHealth(
                id="database",
                name="Database & libSQL Replica",
                status="healthy",
                message=f"Connected ({mode}) • {latency}ms read latency",
                latency_ms=latency,
                details={
                    "mode": mode,
                    "local_db_path": settings.LOCAL_DB_PATH,
                    "cloud_sync_configured": has_turso,
                },
            )
        except Exception as exc:
            return SubsystemHealth(
                id="database",
                name="Database & libSQL Replica",
                status="error",
                message=f"Database query failed: {exc}",
            )

    def _check_security_vault(self) -> SubsystemHealth:
        try:
            probe = "vault_roundtrip_probe"
            cipher = encrypt_token(probe)
            decrypted = decrypt_token(cipher)
            if decrypted != probe:
                return SubsystemHealth(
                    id="security",
                    name="AES-128 Fernet Vault",
                    status="error",
                    message="Fernet roundtrip mismatch.",
                )

            raw_key = settings.SECRET_KEY.get_secret_value()
            is_default = raw_key == "default-dev-secret-key-32-bytes!"

            return SubsystemHealth(
                id="security",
                name="AES-128 Fernet Vault",
                status="warning" if is_default else "healthy",
                message=(
                    "Using default dev key — generate a custom SECRET_KEY for production"
                    if is_default
                    else "Master key verified • AES-128 roundtrip OK"
                ),
                details={"custom_master_key": not is_default},
            )
        except Exception as exc:
            return SubsystemHealth(
                id="security",
                name="AES-128 Fernet Vault",
                status="error",
                message=f"Vault encryption error: {exc}",
            )

    def _check_ai_gateway(self) -> SubsystemHealth:
        openrouter_key = settings.OPENROUTER_API_KEY.get_secret_value().strip()
        fireworks_key = settings.FIREWORKS_API_KEY.get_secret_value().strip()

        has_openrouter = bool(
            openrouter_key and not openrouter_key.startswith("sk-or-placeholder")
        )
        has_fireworks = bool(
            fireworks_key and not fireworks_key.startswith("fw-placeholder")
        )
        has_key = has_openrouter or has_fireworks

        active_provider = (
            "Fireworks AI"
            if has_fireworks and not has_openrouter
            else "OpenRouter + Fireworks AI"
            if has_fireworks and has_openrouter
            else "OpenRouter"
        )

        return SubsystemHealth(
            id="ai_gateway",
            name="AI Copilot & Model Gateway",
            status="healthy" if has_key else "warning",
            message=(
                f"Provider: {active_provider} • Active: {agent_settings.DEFAULT_MODEL}"
                if has_key
                else "Neither FIREWORKS_API_KEY nor OPENROUTER_API_KEY is configured in backend/.env"
            ),
            details={
                "openrouter_configured": has_openrouter,
                "fireworks_configured": has_fireworks,
                "default_model": agent_settings.DEFAULT_MODEL,
                "reasoning_model": agent_settings.REASONING_MODEL,
            },
        )

    def _check_browser_engine(self) -> SubsystemHealth:
        sessions_dir = Path("storage/browser_sessions").resolve()
        media_dir = Path("storage/media").resolve()
        try:
            sessions_dir.mkdir(parents=True, exist_ok=True)
            media_dir.mkdir(parents=True, exist_ok=True)
            session_profiles = [p for p in sessions_dir.iterdir() if p.is_dir()]

            return SubsystemHealth(
                id="browser",
                name="Stealth Playwright Engine",
                status="healthy",
                message=f"Storage writable • {len(session_profiles)} isolated browser profiles",
                details={
                    "sessions_dir": str(sessions_dir),
                    "stored_profiles_count": len(session_profiles),
                },
            )
        except Exception as exc:
            return SubsystemHealth(
                id="browser",
                name="Stealth Playwright Engine",
                status="error",
                message=f"Storage directory error: {exc}",
            )

    def _build_recipe_matrix(self) -> list[RecipeCoverageSlot]:
        all_recipes = self.db.query(ActionRecipe).filter(ActionRecipe.is_active.is_(True)).all()
        recipes_dir = Path("storage/recipes").resolve()
        matrix: list[RecipeCoverageSlot] = []

        for platform in AUDITED_PLATFORMS:
            has_native = PlatformRegistry.is_supported(platform)
            platform_recipes = [r for r in all_recipes if r.platform == platform]

            for action_key, action_label in CORE_ACTIONS:
                matched_recipe: ActionRecipe | None = None
                for r in platform_recipes:
                    meta_action = (r.extra_metadata or {}).get("action_type")
                    if meta_action == action_key:
                        matched_recipe = r
                        break
                    if action_key == "publish_post" and (r.is_default or "post" in r.name.lower()):
                        matched_recipe = r
                        break
                    if action_key == "send_dm" and "dm" in r.name.lower() and "inbox" not in r.name.lower():
                        matched_recipe = r
                        break
                    if action_key == "comment_reply" and ("comment" in r.name.lower() or "reply" in r.name.lower()):
                        matched_recipe = r
                        break

                disk_file = recipes_dir / f"{platform.value}_{action_key}.json"
                legacy_publish_file = recipes_dir / f"{platform.value}_publish.json"
                has_disk_recipe = disk_file.exists() or (
                    action_key == "publish_post" and legacy_publish_file.exists()
                )

                has_default = matched_recipe is not None or has_disk_recipe
                native_supports_action = has_native and action_key in (
                    "publish_post",
                    "send_dm",
                    "comment_reply",
                )

                status: CoverageStatus = (
                    "custom_ready"
                    if has_default
                    else "native_ready"
                    if native_supports_action
                    else "missing"
                )

                recipe_display_name = (
                    matched_recipe.name
                    if matched_recipe
                    else f"{platform.value}_{action_key}.json (disk)"
                    if has_disk_recipe
                    else None
                )

                matrix.append(
                    RecipeCoverageSlot(
                        platform=platform.value,
                        action_type=action_key,
                        action_label=action_label,
                        status=status,
                        has_custom_recipe=has_default,
                        has_native_adapter=native_supports_action,
                        recipe_id=matched_recipe.id if matched_recipe else None,
                        recipe_name=recipe_display_name,
                    )
                )

        return matrix

    def get_diagnostics(self) -> SystemDiagnosticsResponse:
        subsystems = [
            self._check_database_health(),
            self._check_security_vault(),
            self._check_ai_gateway(),
            self._check_browser_engine(),
        ]

        sched = get_scheduler()
        is_sched_running = bool(getattr(sched, "running", False))
        jobs_info: list[SchedulerJobInfo] = []

        if is_sched_running:
            for job in sched.get_jobs():
                jobs_info.append(
                    SchedulerJobInfo(
                        id=job.id,
                        name=job.name or job.id,
                        next_run_time=getattr(job, "next_run_time", None),
                    )
                )

        subsystems.append(
            SubsystemHealth(
                id="scheduler",
                name="APScheduler Background Workers",
                status="healthy" if is_sched_running else "warning",
                message=(
                    f"Running • {len(jobs_info)} active worker loops"
                    if is_sched_running
                    else "Scheduler paused (normal in test mode)"
                ),
                details={"active_jobs": len(jobs_info)},
            )
        )

        statuses = [s.status for s in subsystems]
        overall: HealthStatus = (
            "error"
            if "error" in statuses
            else "warning"
            if "warning" in statuses
            else "healthy"
        )

        entity_counts = {
            "accounts": self.db.query(ConnectedAccount).count(),
            "campaigns": self.db.query(Campaign).count(),
            "scheduled_posts": self.db.query(ScheduledPost).count(),
            "leads": self.db.query(Lead).count(),
            "trigger_rules": self.db.query(TriggerRule).count(),
            "recipes": self.db.query(ActionRecipe).count(),
            "connectors": self.db.query(DataConnector).count(),
        }

        return SystemDiagnosticsResponse(
            overall_status=overall,
            checked_at=datetime.now(UTC),
            subsystems=subsystems,
            scheduler_running=is_sched_running,
            scheduler_jobs=jobs_info,
            recipe_matrix=self._build_recipe_matrix(),
            entity_counts=entity_counts,
        )

    def seed_default_recipes(self) -> SeedRecipesResponse:
        """Idempotently seeds default platform recipes for all core action types."""
        seeded = 0
        for tpl in DEFAULT_RECIPE_TEMPLATES:
            existing = (
                self.db.query(ActionRecipe)
                .filter(
                    ActionRecipe.platform == tpl["platform"],
                    ActionRecipe.name == tpl["name"],
                )
                .first()
            )
            if existing:
                continue

            is_def = bool(tpl.get("is_default", False))
            if is_def:
                existing_def = (
                    self.db.query(ActionRecipe)
                    .filter(
                        ActionRecipe.platform == tpl["platform"],
                        ActionRecipe.is_default.is_(True),
                    )
                    .first()
                )
                if existing_def:
                    is_def = False

            new_recipe = ActionRecipe(
                name=tpl["name"],
                platform=tpl["platform"],
                description=tpl["description"],
                steps=tpl["steps"],
                is_default=is_def,
                is_active=True,
                extra_metadata={
                    "action_type": tpl["action_type"],
                    "seeded_by": "system_admin",
                },
            )
            self.db.add(new_recipe)
            seeded += 1

        if seeded > 0:
            self.db.commit()

        total = self.db.query(ActionRecipe).count()
        return SeedRecipesResponse(
            seeded_count=seeded,
            total_recipes=total,
            message=f"Seeded {seeded} missing default recipes ({total} total active in repository).",
        )

    def trigger_replica_sync(self) -> dict[str, Any]:
        """Forces an immediate synchronization between local libSQL and Turso Cloud."""
        try:
            sync_replica()
            HistoryService(self.db).log_activity(
                LogActivityCommand(
                    activity_type=ActivityType.SYSTEM_REPLICA_SYNCED,
                    severity=ActivitySeverity.SUCCESS,
                    title="Manual Turso replica sync completed",
                    actor="admin_console",
                )
            )
            return {"status": "synced", "message": "Local replica synchronized with Turso Cloud."}
        except Exception as exc:
            return {"status": "skipped", "message": f"Sync skipped or offline mode: {exc}"}

    async def run_worker_now(self, worker_name: str) -> WorkerTriggerResponse:
        """Manually executes a single background worker cycle for testing or admin control."""
        clean_name = worker_name.lower().strip()

        if clean_name == "post_dispatcher":
            count = await run_post_dispatcher(db=self.db)
            return WorkerTriggerResponse(
                worker="post_dispatcher",
                status="completed",
                items_processed=count,
                message=f"Post Dispatcher executed ({count} due posts dispatched).",
            )

        if clean_name == "watcher_worker":
            count = await run_watcher_worker(db=self.db)
            return WorkerTriggerResponse(
                worker="watcher_worker",
                status="completed",
                items_processed=count,
                message=f"Competitor Watcher executed ({count} keyword matches detected).",
            )

        if clean_name == "quota_reset_worker":
            count = await run_quota_reset_worker(db=self.db)
            return WorkerTriggerResponse(
                worker="quota_reset_worker",
                status="completed",
                items_processed=count,
                message=f"Quota Reset & Sync executed ({count} accounts reset).",
            )

        raise AppError(
            f"Unknown worker '{worker_name}'. Valid workers: post_dispatcher, watcher_worker, quota_reset_worker."
        )
