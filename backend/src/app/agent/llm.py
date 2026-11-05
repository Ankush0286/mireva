import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from uuid import UUID

from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.fireworks import FireworksProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.agent.prompts import MARKETING_AGENT_SYSTEM_PROMPT
from app.core.agent_config import MODEL_REGISTRY, agent_settings
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AgentDeps:
    """Dependency container injected into every tool call."""

    db: Session
    session_id: UUID | None = None
    _db_lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    @contextmanager
    def db_session_scope(self) -> Generator[Session, None, None]:
        """
        Serializes concurrent tool access to the SQLAlchemy Session across worker
        threads so parallel tool calls never collide mid-commit ('prepared' state).
        """
        with self._db_lock:
            try:
                yield self.db
            except SQLAlchemyError:
                self.db.rollback()
                raise


def resolve_model(model_name: str | None = None) -> Model:
    """
    Deterministically resolves and constructs a Model instance.
    Uses exact dictionary lookup in MODEL_REGISTRY without fuzzy heuristics.
    Falls back to DEFAULT_MODEL if an unlisted model ID is passed.
    """
    target_id = (model_name or agent_settings.DEFAULT_MODEL).strip()
    config = MODEL_REGISTRY.get(target_id) or MODEL_REGISTRY[agent_settings.DEFAULT_MODEL]

    if config.provider == "fireworks":
        api_key = (
            settings.FIREWORKS_API_KEY.get_secret_value().strip()
            or "fw-placeholder-for-tests"
        )
        provider_fw = FireworksProvider(api_key=api_key)
        return OpenAIChatModel(config.id, provider=provider_fw)

    # Provider is "openrouter"
    api_key_or = (
        settings.OPENROUTER_API_KEY.get_secret_value().strip()
        or "sk-or-placeholder-for-tests"
    )
    provider_or = OpenRouterProvider(api_key=api_key_or)
    return OpenRouterModel(config.id, provider=provider_or)


# Backward-compatible alias
get_openrouter_model = resolve_model

# Root marketing agent instance
marketing_agent: Agent[AgentDeps, str] = Agent(
    resolve_model(),
    deps_type=AgentDeps,
    system_prompt=MARKETING_AGENT_SYSTEM_PROMPT,
)
