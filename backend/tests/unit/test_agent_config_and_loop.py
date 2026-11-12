from pydantic_ai.usage import RunUsage

from app.agent.loop import (
    _apply_thinking_directive,
    _build_prompt_with_history,
    _extract_run_usage,
    _normalize_tool_args,
)
from app.core.agent_config import MODEL_REGISTRY, calculate_usage_metrics


def test_model_registry_contains_free_and_flagship_models() -> None:
    assert "nvidia/nemotron-3-ultra-550b-a55b:free" in MODEL_REGISTRY
    assert "accounts/fireworks/models/deepseek-v4p1-flash-1017" in MODEL_REGISTRY
    assert "accounts/fireworks/models/glm-5p3-flash" in MODEL_REGISTRY
    assert "accounts/fireworks/models/minimax-m3p1-flash" in MODEL_REGISTRY


def test_calculate_usage_metrics_free_and_paid_models() -> None:
    # Free Sandbox Model ($0.00)
    free_metrics = calculate_usage_metrics(
        model_id="nvidia/nemotron-3-ultra-550b-a55b:free",
        prompt_tokens=50_000,
        completion_tokens=10_000,
    )
    assert free_metrics["promptTokens"] == 50_000
    assert free_metrics["completionTokens"] == 10_000
    assert free_metrics["totalTokens"] == 60_000
    assert free_metrics["contextWindow"] == 1_048_576
    assert free_metrics["estimatedCostUsd"] == 0.0

    # Paid Flagship Model (DeepSeek V4.1 Flash -> $0.30/1M in, $1.20/1M out)
    paid_metrics = calculate_usage_metrics(
        model_id="accounts/fireworks/models/deepseek-v4p1-flash-1017",
        prompt_tokens=100_000,
        completion_tokens=50_000,
    )
    assert paid_metrics["totalTokens"] == 150_000
    assert paid_metrics["contextWindow"] == 1_048_576
    assert paid_metrics["estimatedCostUsd"] == 0.09


def test_extract_run_usage_from_pydantic_ai_property() -> None:
    usage = RunUsage(input_tokens=1200, output_tokens=300)
    metrics = _extract_run_usage(usage, "accounts/fireworks/models/deepseek-v4p1-flash-1017")
    assert metrics["promptTokens"] == 1200
    assert metrics["completionTokens"] == 300
    assert metrics["totalTokens"] == 1500

    empty_metrics = _extract_run_usage(None, None)
    assert empty_metrics["totalTokens"] == 0


def test_normalize_tool_args_unwraps_nested_json_strings() -> None:
    # 1. Nested 'arguments' JSON string
    nested = {"arguments": '{"action_type": "outreach_dm", "title": "Send DM to @zuck?"}'}
    assert _normalize_tool_args(nested) == {
        "action_type": "outreach_dm",
        "title": "Send DM to @zuck?",
    }

    # 2. Nested 'args' JSON string
    nested_args = {"args": '{"duration_minutes": 45}'}
    assert _normalize_tool_args(nested_args) == {"duration_minutes": 45}

    # 3. Direct JSON string
    raw_str = '{"duration_minutes": 60, "rationale": "Resting"}'
    assert _normalize_tool_args(raw_str) == {
        "duration_minutes": 60,
        "rationale": "Resting",
    }

    # 4. Already a flat dictionary
    flat = {"handle": "founder_1"}
    assert _normalize_tool_args(flat) == {"handle": "founder_1"}


def test_build_prompt_with_history_and_thinking_directive() -> None:
    history = [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}]
    compiled = _build_prompt_with_history(history, "Draft a tweet")
    assert "=== CONVERSATION HISTORY ===" in compiled
    assert "[USER]: Hi" in compiled
    assert "Draft a tweet" in compiled

    thinking_prompt = _apply_thinking_directive("Draft a tweet", thinking=True)
    assert "<think>...</think>" in thinking_prompt
