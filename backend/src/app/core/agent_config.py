import os
from dataclasses import dataclass
from typing import Literal

ProviderType = Literal["fireworks", "openrouter"]


@dataclass(frozen=True)
class ModelConfig:
    id: str
    name: str
    description: str
    provider: ProviderType
    badge: str | None = None


@dataclass(frozen=True)
class AgentSettings:
    """Runtime configuration for LLM orchestration and Pydantic AI."""

    DEFAULT_MODEL: str = os.getenv(
        "AGENT_MODEL", "accounts/fireworks/models/deepseek-v4p1-flash-1017"
    )
    REASONING_MODEL: str = os.getenv(
        "AGENT_REASONING_MODEL", "accounts/fireworks/models/deepseek-r1"
    )

    AVAILABLE_MODELS: tuple[ModelConfig, ...] = (
        ModelConfig(
            id="accounts/fireworks/models/deepseek-v4p1-flash-1017",
            name="DeepSeek V4.1 Flash (Fireworks)",
            description="Direct successor to V4 Flash 0731 ($0.30 / $1.20 per 1M) — 1M context",
            provider="fireworks",
            badge="DEFAULT",
        ),
        ModelConfig(
            id="accounts/fireworks/models/glm-5p3-flash",
            name="GLM 5.3 Flash (Fireworks)",
            description="Ultra-budget agent ($0.15 / $0.50 per 1M) — fast tool calling",
            provider="fireworks",
            badge="BUDGET",
        ),
        ModelConfig(
            id="accounts/fireworks/models/minimax-m3p1-flash",
            name="MiniMax M3.1 Flash (Fireworks)",
            description="High-speed copywriting ($0.15 / $0.60 per 1M)",
            provider="fireworks",
        ),
        ModelConfig(
            id="accounts/fireworks/models/llama-v3p3-70b-instruct",
            name="Llama 3.3 70B (Fireworks)",
            description="High precision for structured tool execution ($0.90 / $0.90 per 1M)",
            provider="fireworks",
            badge="STABLE",
        ),
        ModelConfig(
            id="accounts/fireworks/models/deepseek-r1",
            name="DeepSeek R1 (Fireworks)",
            description="Deep chain-of-thought strategy & complex reasoning",
            provider="fireworks",
            badge="REASONING",
        ),
        ModelConfig(
            id="anthropic/claude-3.5-sonnet",
            name="Claude 3.5 Sonnet (OpenRouter)",
            description="High-nuance brand strategy & long-form threads",
            provider="openrouter",
            badge="PRO",
        ),
    )


agent_settings = AgentSettings()

# O(1) Exact Match Single Source of Truth
MODEL_REGISTRY: dict[str, ModelConfig] = {
    m.id: m for m in agent_settings.AVAILABLE_MODELS
}
