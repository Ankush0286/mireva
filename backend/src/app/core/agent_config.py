import os
from dataclasses import dataclass
from typing import Any, Literal

ProviderType = Literal["fireworks", "openrouter"]


@dataclass(frozen=True)
class ModelConfig:
    id: str
    name: str
    description: str
    provider: ProviderType
    context_window: int = 1_048_576
    input_cost_per_1m: float = 0.0
    output_cost_per_1m: float = 0.0
    badge: str | None = None


@dataclass(frozen=True)
class AgentSettings:
    """Runtime configuration for LLM orchestration and Pydantic AI."""

    DEFAULT_MODEL: str = os.getenv("AGENT_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")
    REASONING_MODEL: str = os.getenv(
        "AGENT_REASONING_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"
    )

    AVAILABLE_MODELS: tuple[ModelConfig, ...] = (
        ModelConfig(
            id="nvidia/nemotron-3-ultra-550b-a55b:free",
            name="Nemotron 3 Ultra (Free Sandbox)",
            description="550B MoE (OpenRouter) — 1M context, 100% Free risk-free testing",
            provider="openrouter",
            context_window=1_048_576,
            input_cost_per_1m=0.00,
            output_cost_per_1m=0.00,
            badge="FREE",
        ),
        ModelConfig(
            id="accounts/fireworks/models/deepseek-v4p1-flash-1017",
            name="DeepSeek V4.1 Flash 1017 (Fireworks)",
            description="552B MoE Flagship ($0.30 / $1.20 per 1M) — 1M context",
            provider="fireworks",
            context_window=1_048_576,
            input_cost_per_1m=0.30,
            output_cost_per_1m=1.20,
            badge="PAID",
        ),
        ModelConfig(
            id="accounts/fireworks/models/glm-5p3-flash",
            name="GLM 5.3 Flash (Fireworks)",
            description="Ultra-budget agent ($0.15 / $0.50 per 1M) — 1M context",
            provider="fireworks",
            context_window=1_048_576,
            input_cost_per_1m=0.15,
            output_cost_per_1m=0.50,
            badge="BUDGET",
        ),
        ModelConfig(
            id="accounts/fireworks/models/minimax-m3p1-flash",
            name="MiniMax M3.1 Flash (Fireworks)",
            description="High-speed copywriting ($0.15 / $0.60 per 1M) — 1M context",
            provider="fireworks",
            context_window=1_000_000,
            input_cost_per_1m=0.15,
            output_cost_per_1m=0.60,
        ),
    )


agent_settings = AgentSettings()

MODEL_REGISTRY: dict[str, ModelConfig] = {m.id: m for m in agent_settings.AVAILABLE_MODELS}


def calculate_usage_metrics(
    model_id: str | None,
    prompt_tokens: int,
    completion_tokens: int,
) -> dict[str, Any]:
    """Calculates exact token metrics and USD cost from model registry pricing."""
    target_id = (model_id or agent_settings.DEFAULT_MODEL).strip()
    config = MODEL_REGISTRY.get(target_id) or MODEL_REGISTRY[agent_settings.DEFAULT_MODEL]

    cost_usd = (prompt_tokens / 1_000_000) * config.input_cost_per_1m + (
        completion_tokens / 1_000_000
    ) * config.output_cost_per_1m

    return {
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "totalTokens": prompt_tokens + completion_tokens,
        "contextWindow": config.context_window,
        "estimatedCostUsd": round(cost_usd, 6),
    }
