from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.conversation import ChatConversation, ChatMessage
from app.schemas.conversation import (
    AddMessagesRequest,
    ConversationDetail,
    ConversationListItem,
    CreateConversationRequest,
    MessageOut,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=List[ConversationListItem])
async def list_conversations(
    dataset_id: Optional[uuid.UUID] = Query(default=None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ConversationListItem]:
    """List the current user's conversations ordered by updated_at desc, limit 50."""
    msg_count_subq = (
        select(func.count(ChatMessage.id))
        .where(ChatMessage.conversation_id == ChatConversation.id)
        .correlate(ChatConversation)
        .scalar_subquery()
    )

    stmt = (
        select(
            ChatConversation.id,
            ChatConversation.dataset_id,
            ChatConversation.title,
            ChatConversation.created_at,
            ChatConversation.updated_at,
            msg_count_subq.label("message_count"),
        )
        .where(ChatConversation.user_id == current_user.user_id)
        .order_by(ChatConversation.updated_at.desc())
        .limit(50)
    )

    if dataset_id is not None:
        stmt = stmt.where(ChatConversation.dataset_id == dataset_id)

    result = await db.execute(stmt)
    rows = result.mappings().all()

    return [
        ConversationListItem(
            id=row["id"],
            dataset_id=row["dataset_id"],
            title=row["title"],
            message_count=row["message_count"] or 0,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: CreateConversationRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    """Create a new conversation and return it with an empty message list."""
    conv = ChatConversation(
        user_id=current_user.user_id,
        dataset_id=body.dataset_id,
        title=body.title,
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    await db.commit()

    return ConversationDetail(
        id=conv.id,
        dataset_id=conv.dataset_id,
        title=conv.title,
        messages=[],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    """Get a single conversation with all messages ordered by created_at."""
    conv_result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conv_id)
    )
    conv = conv_result.scalar_one_or_none()

    if conv is None or conv.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Conversation not found", "code": "CONVERSATION_NOT_FOUND"},
        )

    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = msgs_result.scalars().all()

    return ConversationDetail(
        id=conv.id,
        dataset_id=conv.dataset_id,
        title=conv.title,
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                query_sql=m.query_sql,
                chart_type=m.chart_type,
                data=m.data,
                created_at=m.created_at,
            )
            for m in messages
        ],
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.post("/{conv_id}/messages", status_code=status.HTTP_204_NO_CONTENT)
async def add_messages(
    conv_id: uuid.UUID,
    body: AddMessagesRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Append one or more messages to a conversation and bump its updated_at."""
    conv_result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conv_id)
    )
    conv = conv_result.scalar_one_or_none()

    if conv is None or conv.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Conversation not found", "code": "CONVERSATION_NOT_FOUND"},
        )

    for msg_dict in body.messages:
        msg = ChatMessage(
            conversation_id=conv_id,
            role=msg_dict.get("role", "user"),
            content=msg_dict.get("content", ""),
            query_sql=msg_dict.get("query_sql"),
            chart_type=msg_dict.get("chart_type"),
            data=msg_dict.get("data"),
        )
        db.add(msg)

    # Explicitly bump updated_at in case the DB trigger / onupdate isn't fired
    await db.execute(
        update(ChatConversation)
        .where(ChatConversation.id == conv_id)
        .values(updated_at=datetime.now(tz=timezone.utc))
    )

    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete a conversation (cascade removes messages). Returns 404 if not owned by current user."""
    conv_result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conv_id)
    )
    conv = conv_result.scalar_one_or_none()

    if conv is None or conv.user_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Conversation not found", "code": "CONVERSATION_NOT_FOUND"},
        )

    await db.delete(conv)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
