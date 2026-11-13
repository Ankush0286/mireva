import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ToolCallPart, ToolReturnPart
from pydantic_ai.models import Model
from pydantic_ai.usage import RunUsage
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure all tool decorators register on marketing_agent
from app.agent import tools as _registered_tools  # noqa: F401
from app.agent.llm import AgentDeps, get_openrouter_model, marketing_agent
from app.common.enums import ChatRole, ToolExecutionStatus
from app.core.agent_config import agent_settings, calculate_usage_metrics
from app.modules.copilot.commands import (
    AddChatMessageCommand,
    LogToolExecutionCommand,
)
from app.modules.copilot.models import ChatMessage, ToolExecutionLog
from app.modules.copilot.service import CopilotService

logger = logging.getLogger(__name__)


def _build_prompt_with_history(
    prior_context: list[dict[str, str]],
    current_user_prompt: str,
) -> str:
    if not prior_context:
        return current_user_prompt

    lines: list[str] = ["=== CONVERSATION HISTORY ==="]
    for turn in prior_context:
        role_label = turn["role"].upper()
        lines.append(f"[{role_label}]: {turn['content']}")

    lines.append("\n=== CURRENT USER REQUEST ===")
    lines.append(current_user_prompt)
    return "\n".join(lines)


def _apply_thinking_directive(user_prompt: str, thinking: bool) -> str:
    if not thinking:
        return user_prompt
    return (
        "IMPORTANT: Before answering, think step-by-step inside <think>...</think> tags "
        "about the user's marketing objective, account constraints, and execution strategy. "
        "Put each distinct reasoning step on a new line inside the <think>...</think> block, "
        "then provide your final response outside the closing </think> tag.\n\n"
        f"{user_prompt}"
    )


def _extract_run_usage(usage: RunUsage | None, model_id: str | None) -> dict[str, Any]:
    """Calculates token metrics and costs directly from Pydantic AI's RunUsage property."""
    if usage is None:
        return calculate_usage_metrics(model_id, 0, 0)

    return calculate_usage_metrics(
        model_id=model_id,
        prompt_tokens=usage.input_tokens,
        completion_tokens=usage.output_tokens,
    )


def _normalize_tool_args(raw_args: Any) -> dict[str, Any]:
    """
    Normalizes tool call arguments into a clean dictionary.
    Unwraps escaped JSON strings if the LLM passed arguments nested under an 'arguments' key.
    """
    parsed: Any
    if isinstance(raw_args, str):
        try:
            parsed = json.loads(raw_args)
        except ValueError:
            return {"arguments": raw_args}
    elif isinstance(raw_args, dict):
        parsed = raw_args
    else:
        return {"arguments": str(raw_args)}

    if isinstance(parsed, dict):
        for key in ("arguments", "args"):
            nested = parsed.get(key)
            if isinstance(nested, str):
                try:
                    inner = json.loads(nested)
                    if isinstance(inner, dict):
                        return inner
                except ValueError:
                    pass
        return parsed

    return {"arguments": str(parsed)}


def _infer_tool_status(output_result: Any) -> tuple[ToolExecutionStatus, str | None]:
    if isinstance(output_result, dict) and isinstance(output_result.get("error"), str):
        return ToolExecutionStatus.ERROR, output_result["error"]
    return ToolExecutionStatus.SUCCESS, None


def _serialize_tools(tools: list[ToolExecutionLog]) -> list[dict[str, Any]]:
    return [
        {
            "id": str(t.id),
            "tool_name": t.tool_name,
            "input_arguments": t.input_arguments,
            "output_result": t.output_result,
            "status": t.status.value,
            "execution_time_ms": t.execution_time_ms,
            "error_message": t.error_message,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tools
    ]


async def _record_tool_traces(
    copilot_service: CopilotService,
    session_id: UUID,
    messages: list[ModelMessage],
    elapsed_ms: int,
) -> list[ToolExecutionLog]:
    """
    Pairs ToolCallPart with ToolReturnPart using Python 3.12 structural
    pattern matching on Pydantic AI's discriminated union message parts.
    """
    tool_returns: dict[str, Any] = {}
    tool_calls: list[ToolCallPart] = []

    for message in messages:
        for part in message.parts:
            match part:
                case ToolReturnPart(tool_call_id=call_id, content=content) if call_id:
                    tool_returns[call_id] = content
                case ToolCallPart():
                    tool_calls.append(part)
                case _:
                    pass

    recorded_logs: list[ToolExecutionLog] = []

    for call in tool_calls:
        has_return = bool(call.tool_call_id and call.tool_call_id in tool_returns)
        output_result = tool_returns.get(call.tool_call_id) if call.tool_call_id else None
        if has_return:
            status, error_message = _infer_tool_status(output_result)
        else:
            status, error_message = ToolExecutionStatus.PENDING, None

        clean_args = _normalize_tool_args(call.args)

        log = await copilot_service.log_tool_execution(
            LogToolExecutionCommand(
                session_id=session_id,
                tool_name=call.tool_name,
                input_arguments=clean_args,
                output_result=output_result,
                status=status,
                execution_time_ms=elapsed_ms,
                error_message=error_message,
                extra_metadata={"tool_call_id": call.tool_call_id} if call.tool_call_id else {},
            )
        )
        recorded_logs.append(log)

    return recorded_logs


async def run_agent_turn(
    db: AsyncSession,
    session_id: UUID,
    user_prompt: str,
    model_override: str | Model | None = None,
    thinking: bool = False,
) -> ChatMessage:
    copilot_service = CopilotService(db)

    # 1. Fetch prior conversation context
    prior_context = await copilot_service.get_conversation_context(session_id, max_messages=20)

    # 2. Persist User Message
    await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.USER,
            content=user_prompt,
        )
    )

    # 3. Resolve Model & Dependencies
    deps = AgentDeps(db=db, session_id=session_id)
    resolved_model: Model | None = None
    if isinstance(model_override, str):
        resolved_model = get_openrouter_model(model_override)
    elif model_override is not None:
        resolved_model = model_override

    effective_prompt = _apply_thinking_directive(user_prompt, thinking)
    contextualized_prompt = _build_prompt_with_history(prior_context, effective_prompt)

    # 4. Run Agent Turn
    logger.info("Executing Agent Turn in Session %s (thinking=%s)...", session_id, thinking)
    start_time = time.perf_counter()

    result = await marketing_agent.run(
        contextualized_prompt,
        deps=deps,
        model=resolved_model,
    )
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Record Tool Execution Traces (typed match over message parts)
    recorded_tools = await _record_tool_traces(
        copilot_service=copilot_service,
        session_id=session_id,
        messages=list(result.new_messages()),
        elapsed_ms=elapsed_ms,
    )

    # 6. Extract Usage Directly from Property & Persist Assistant Message
    assistant_reply = str(result.output)
    model_label = (
        model_override if isinstance(model_override, str) else agent_settings.DEFAULT_MODEL
    )
    usage_metrics = _extract_run_usage(result.usage, model_label)

    assistant_msg = await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.ASSISTANT,
            content=assistant_reply,
            model_name=model_label,
            token_count=usage_metrics["totalTokens"],
            extra_metadata={"usage": usage_metrics},
        )
    )

    # 7. Associate recorded tool logs with this assistant message
    for tool_log in recorded_tools:
        tool_log.message_id = assistant_msg.id
    await db.commit()

    return assistant_msg


async def stream_agent_turn(
    db: AsyncSession,
    session_id: UUID,
    user_prompt: str,
    model_override: str | Model | None = None,
    thinking: bool = False,
) -> AsyncGenerator[str | dict[str, Any], None]:
    copilot_service = CopilotService(db)
    prior_context = await copilot_service.get_conversation_context(session_id, max_messages=20)

    # 1. Persist User Message
    await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.USER,
            content=user_prompt,
        )
    )

    # 2. Resolve Model & Dependencies
    deps = AgentDeps(db=db, session_id=session_id)
    resolved_model: Model | None = None
    if isinstance(model_override, str):
        resolved_model = get_openrouter_model(model_override)
    elif model_override is not None:
        resolved_model = model_override

    effective_prompt = _apply_thinking_directive(user_prompt, thinking)
    contextualized_prompt = _build_prompt_with_history(prior_context, effective_prompt)
    accumulated_chunks: list[str] = []
    recorded_tools: list[ToolExecutionLog] = []
    step_start = time.perf_counter()

    # 3. Stream Iteration Loop
    async with marketing_agent.iter(
        contextualized_prompt,
        deps=deps,
        model=resolved_model,
    ) as agent_run:
        async for node in agent_run:
            if Agent.is_call_tools_node(node):
                step_ms = int((time.perf_counter() - step_start) * 1000)
                new_tools = await _record_tool_traces(
                    copilot_service=copilot_service,
                    session_id=session_id,
                    messages=[node.model_response],
                    elapsed_ms=step_ms,
                )
                if new_tools:
                    recorded_tools.extend(new_tools)
                    yield {"__event__": "tools", "tools": _serialize_tools(recorded_tools)}
                step_start = time.perf_counter()

        assistant_reply = str(agent_run.result.output) if agent_run.result else ""
        run_usage = agent_run.usage

        # Correlate tool outputs from completed run messages and re-emit final tool states
        if agent_run.result:
            all_returns: dict[str, Any] = {}
            for msg in agent_run.result.new_messages():
                for part in msg.parts:
                    match part:
                        case ToolReturnPart(tool_call_id=ret_id, content=content) if ret_id:
                            all_returns[ret_id] = content
                        case _:
                            pass

            updated_any = False
            for tool_log in recorded_tools:
                meta = tool_log.extra_metadata or {}
                tool_call_id = meta.get("tool_call_id")
                if isinstance(tool_call_id, str) and tool_call_id in all_returns:
                    output_val = all_returns[tool_call_id]
                    tool_log.output_result = output_val
                    inferred_status, inferred_err = _infer_tool_status(output_val)
                    tool_log.status = inferred_status
                    tool_log.error_message = inferred_err
                    updated_any = True

            if updated_any:
                yield {"__event__": "tools", "tools": _serialize_tools(recorded_tools)}

    # 4. Stream response words with organic micro-delays
    words = assistant_reply.split(" ")
    for i, word in enumerate(words):
        chunk = word if i == 0 else " " + word
        accumulated_chunks.append(chunk)
        yield chunk
        if len(words) > 1:
            await asyncio.sleep(0.012)

    full_response = "".join(accumulated_chunks)
    model_label = (
        model_override if isinstance(model_override, str) else agent_settings.DEFAULT_MODEL
    )
    usage_metrics = _extract_run_usage(run_usage, model_label)

    # 5. Emit live usage event over SSE for UsageMeter
    yield {"__event__": "usage", "usage": usage_metrics}

    # 6. Persist Assistant Message in Database with exact token telemetry
    assistant_msg = await copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.ASSISTANT,
            content=full_response,
            model_name=model_label,
            token_count=usage_metrics["totalTokens"],
            extra_metadata={"usage": usage_metrics},
        )
    )

    # 7. Foreign-key link recorded tools to assistant message
    for tool_log in recorded_tools:
        tool_log.message_id = assistant_msg.id
    await db.commit()
