from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.copilot.commands import (
    AddChatMessageCommand,
    CreateChatSessionCommand,
    LogToolExecutionCommand,
    UpdateChatSessionCommand,
)
from app.modules.copilot.exceptions import (
    ChatMessageNotFoundError,
    ChatSessionNotFoundError,
)
from app.modules.copilot.models import ChatMessage, ChatSession, ToolExecutionLog


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class CopilotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_session_by_id(self, session_id: UUID | str) -> ChatSession | None:
        target_id = _ensure_uuid(session_id)
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == target_id)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_session_by_id_or_raise(self, session_id: UUID | str) -> ChatSession:
        session = await self.get_session_by_id(session_id)
        if not session:
            raise ChatSessionNotFoundError(session_id)
        return session

    async def list_sessions(
        self, include_archived: bool = False, limit: int = 50, offset: int = 0
    ) -> list[ChatSession]:
        stmt = select(ChatSession).order_by(ChatSession.updated_at.desc())
        if not include_archived:
            stmt = stmt.where(ChatSession.is_archived.is_(False))
        result = await self.db.execute(stmt.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def create_session(self, cmd: CreateChatSessionCommand) -> ChatSession:
        session = ChatSession(
            title=cmd.title.strip(),
            system_prompt_override=cmd.system_prompt_override,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def update_session(self, cmd: UpdateChatSessionCommand) -> ChatSession:
        session = await self.get_session_by_id_or_raise(cmd.session_id)

        if cmd.title is not None:
            session.title = cmd.title.strip()
        if cmd.is_archived is not None:
            session.is_archived = cmd.is_archived
        if cmd.system_prompt_override is not None:
            session.system_prompt_override = cmd.system_prompt_override
        if cmd.extra_metadata is not None:
            session.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def delete_session(self, session_id: UUID | str) -> None:
        session = await self.get_session_by_id_or_raise(session_id)
        await self.db.execute(
            delete(ToolExecutionLog).where(ToolExecutionLog.session_id == session.id)
        )
        await self.db.execute(delete(ChatMessage).where(ChatMessage.session_id == session.id))
        await self.db.delete(session)
        await self.db.commit()

    async def add_message(self, cmd: AddChatMessageCommand) -> ChatMessage:
        await self.get_session_by_id_or_raise(cmd.session_id)

        message = ChatMessage(
            session_id=cmd.session_id,
            role=cmd.role,
            content=cmd.content,
            token_count=cmd.token_count,
            model_name=cmd.model_name,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def get_message_by_id_or_raise(self, message_id: UUID | str) -> ChatMessage:
        target_id = _ensure_uuid(message_id)
        stmt = select(ChatMessage).where(ChatMessage.id == target_id)
        result = await self.db.execute(stmt)
        message = result.scalars().first()
        if not message:
            raise ChatMessageNotFoundError(message_id)
        return message

    async def list_messages(
        self, session_id: UUID | str, limit: int = 100, offset: int = 0
    ) -> list[ChatMessage]:
        target_id = _ensure_uuid(session_id)
        await self.get_session_by_id_or_raise(target_id)
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == target_id)
            .order_by(ChatMessage.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_messages_from(
        self, session_id: UUID | str, message_id: UUID | str
    ) -> list[UUID]:
        """
        Deletes the specified message and all subsequent messages in the session.
        Cleans up associated tool execution logs to prevent orphaned records.
        """
        target_session_id = _ensure_uuid(session_id)
        target_msg_id = _ensure_uuid(message_id)

        target_msg = await self.get_message_by_id_or_raise(target_msg_id)

        stmt = select(ChatMessage).where(
            ChatMessage.session_id == target_session_id,
            ChatMessage.created_at >= target_msg.created_at,
        )
        result = await self.db.execute(stmt)
        messages_to_delete = list(result.scalars().all())
        deleted_ids = [m.id for m in messages_to_delete]

        if deleted_ids:
            await self.db.execute(
                delete(ToolExecutionLog).where(ToolExecutionLog.message_id.in_(deleted_ids))
            )
            await self.db.execute(delete(ChatMessage).where(ChatMessage.id.in_(deleted_ids)))
            await self.db.commit()

        return deleted_ids

    async def get_conversation_context(
        self, session_id: UUID | str, max_messages: int = 20
    ) -> list[dict[str, str]]:
        session = await self.get_session_by_id_or_raise(session_id)

        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(max_messages)
        )
        result = await self.db.execute(stmt)
        messages = list(result.scalars().all())
        messages.reverse()

        context: list[dict[str, str]] = []

        if session.system_prompt_override:
            context.append({"role": "system", "content": session.system_prompt_override})

        for msg in messages:
            context.append({"role": msg.role.value, "content": msg.content})

        return context

    async def log_tool_execution(self, cmd: LogToolExecutionCommand) -> ToolExecutionLog:
        await self.get_session_by_id_or_raise(cmd.session_id)

        if cmd.message_id:
            await self.get_message_by_id_or_raise(cmd.message_id)

        tool_log = ToolExecutionLog(
            session_id=cmd.session_id,
            message_id=cmd.message_id,
            tool_name=cmd.tool_name,
            input_arguments=cmd.input_arguments,
            output_result=cmd.output_result,
            status=cmd.status,
            execution_time_ms=cmd.execution_time_ms,
            error_message=cmd.error_message,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(tool_log)
        await self.db.commit()
        await self.db.refresh(tool_log)
        return tool_log

    async def list_tool_executions(self, session_id: UUID | str) -> list[ToolExecutionLog]:
        target_id = _ensure_uuid(session_id)
        await self.get_session_by_id_or_raise(target_id)
        stmt = (
            select(ToolExecutionLog)
            .where(ToolExecutionLog.session_id == target_id)
            .order_by(ToolExecutionLog.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
