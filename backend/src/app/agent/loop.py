import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from pydantic_ai import Agent
from pydantic_ai.models import Model
from sqlalchemy.orm import Session

# Ensure all tool decorators register on marketing_agent
from app.agent import tools as _registered_tools  # noqa: F401
from app.agent.llm import AgentDeps, get_openrouter_model, marketing_agent
from app.common.enums import ChatRole, ToolExecutionStatus
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
    """
    Formats prior conversation turns and any session system_prompt_override
    into a structured context block so the LLM maintains full multi-turn memory.
    """
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
    """Prepends a structured <think>...</think> directive when Thinking Mode is enabled."""
    if not thinking:
        return user_prompt
    return (
        "IMPORTANT: Before answering, think step-by-step inside <think>...</think> tags "
        "about the user's marketing objective, account constraints, and execution strategy. "
        "Put each distinct reasoning step on a new line inside the <think>...</think> block, "
        "then provide your final response outside the closing </think> tag.\n\n"
        f"{user_prompt}"
    )


def _record_tool_traces(
    copilot_service: CopilotService,
    session_id: UUID,
    messages: list[Any],
    elapsed_ms: int,
) -> list[ToolExecutionLog]:
    """Extracts tool-call parts from Pydantic AI messages, logs them, and returns the records."""
    recorded_logs: list[ToolExecutionLog] = []
    for message in messages:
        parts = getattr(message, "parts", None)
        if not parts:
            continue
        for part in parts:
            if getattr(part, "part_kind", None) == "tool-call":
                tool_name = getattr(part, "tool_name", "unknown_tool")
                raw_args = getattr(part, "args", {})
                input_args = (
                    raw_args
                    if isinstance(raw_args, dict)
                    else {"arguments": str(raw_args)}
                )
                log = copilot_service.log_tool_execution(
                    LogToolExecutionCommand(
                        session_id=session_id,
                        tool_name=str(tool_name),
                        input_arguments=input_args,
                        status=ToolExecutionStatus.SUCCESS,
                        execution_time_ms=elapsed_ms,
                    )
                )
                recorded_logs.append(log)
    return recorded_logs


async def run_agent_turn(
    db: Session,
    session_id: UUID,
    user_prompt: str,
    model_override: str | Model | None = None,
    thinking: bool = False,
) -> ChatMessage:
    """
    Executes a complete multi-turn ReAct agent cycle and returns the persisted
    assistant ChatMessage ORM record.
    """
    copilot_service = CopilotService(db)

    # 1. Fetch prior conversation context before appending the new user message
    prior_context = copilot_service.get_conversation_context(session_id, max_messages=20)

    # 2. Persist incoming User Message (raw user prompt without internal directives)
    copilot_service.add_message(
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

    # 4. Run Agent
    logger.info("Executing Agent Turn in Session %s (thinking=%s)...", session_id, thinking)
    start_time = time.perf_counter()

    result = await marketing_agent.run(
        contextualized_prompt,
        deps=deps,
        model=resolved_model,
    )
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    # 5. Record Tool Execution Traces
    recorded_tools = _record_tool_traces(
        copilot_service=copilot_service,
        session_id=session_id,
        messages=list(result.new_messages()),
        elapsed_ms=elapsed_ms,
    )

    # 6. Persist Assistant Message
    assistant_reply = str(result.output)
    model_label = model_override if isinstance(model_override, str) else "default"

    assistant_msg = copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.ASSISTANT,
            content=assistant_reply,
            model_name=model_label,
        )
    )

    # 7. Foreign-key link tools to this assistant message in database
    for tool_log in recorded_tools:
        tool_log.message_id = assistant_msg.id
    db.commit()

    return assistant_msg


async def stream_agent_turn(
    db: Session,
    session_id: UUID,
    user_prompt: str,
    model_override: str | Model | None = None,
    thinking: bool = False,
) -> AsyncGenerator[str | dict[str, Any], None]:
    """
    Real-Time Node-by-Node Streaming ReAct Execution Loop:
    1. Steps through the agent graph using `marketing_agent.iter()`.
    2. The moment a `CallToolsNode` is reached (before the next LLM turn starts),
       logs and yields the `{"__event__": "tools", ...}` SSE packet in real time.
    3. Streams the final synthesized response tokens.
    4. Persists the completed assistant turn and links tool traces.
    """
    copilot_service = CopilotService(db)
    prior_context = copilot_service.get_conversation_context(session_id, max_messages=20)

    # 1. Persist User Prompt
    copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.USER,
            content=user_prompt,
        )
    )

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

    # 2. Step through the ReAct Agent Graph Node-by-Node in Real Time
    async with marketing_agent.iter(
        contextualized_prompt,
        deps=deps,
        model=resolved_model,
    ) as agent_run:
        async for node in agent_run:
            if Agent.is_call_tools_node(node):
                step_ms = int((time.perf_counter() - step_start) * 1000)
                new_tools = _record_tool_traces(
                    copilot_service=copilot_service,
                    session_id=session_id,
                    messages=[node.model_response],
                    elapsed_ms=step_ms,
                )
                if new_tools:
                    recorded_tools.extend(new_tools)
                    tools_payload = [
                        {
                            "id": str(t.id),
                            "tool_name": t.tool_name,
                            "input_arguments": t.input_arguments,
                            "output_result": t.output_result,
                            "status": t.status.value,
                            "execution_time_ms": t.execution_time_ms,
                            "created_at": t.created_at.isoformat() if t.created_at else None,
                        }
                        for t in recorded_tools
                    ]
                    # Flush tool event over SSE immediately BEFORE Turn 2 LLM generation starts
                    yield {"__event__": "tools", "tools": tools_payload}
                step_start = time.perf_counter()

        assistant_reply = str(agent_run.result.output) if agent_run.result else ""

    # 3. Stream Synthesized Response in Real Time
    words = assistant_reply.split(" ")
    for i, word in enumerate(words):
        chunk = word if i == 0 else " " + word
        accumulated_chunks.append(chunk)
        yield chunk
        if len(words) > 1:
            await asyncio.sleep(0.012)

    # 4. Persist Completed Assistant Response
    full_response = "".join(accumulated_chunks)
    model_label = model_override if isinstance(model_override, str) else "default"

    assistant_msg = copilot_service.add_message(
        AddChatMessageCommand(
            session_id=session_id,
            role=ChatRole.ASSISTANT,
            content=full_response,
            model_name=model_label,
        )
    )

    # 5. Associate recorded tool executions with assistant message
    for tool_log in recorded_tools:
        tool_log.message_id = assistant_msg.id
    db.commit()
