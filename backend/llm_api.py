"""
FastAPI router for LLM-powered BIM chat.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from graph_api import _load_graph
from job_security import require_job_access_user
from llm_chat import ask_about_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)


class ChatResponse(BaseModel):
    answer: str
    referenced_ids: list[str] = []
    reasoning: str | None = None


@router.post("/{job_id}/chat", response_model=ChatResponse)
async def chat_with_model(
    job_id: str,
    request: ChatRequest,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """
    Ask the LLM a question about the BIM model.
    Sends conversation history; the graph is used as context automatically.
    """
    graph = _load_graph(job_id)

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    result = await ask_about_model(graph, messages)

    return ChatResponse(
        answer=result["answer"],
        referenced_ids=result["referenced_ids"],
        reasoning=result.get("reasoning"),
    )
