"""Capability context + shared helpers for Smart-Modality execution."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class CapabilityContext:
    """Everything a capability needs, plus its mutable outputs."""
    chat_request: Any = None
    user_id: int = 0
    provider_id: str = ""
    model_id: str = ""
    provider: Any = None
    conversation_id: str = ""
    api_key: Optional[str] = None
    system_prompt: str = ""
    temperature: float = 0.7
    max_tokens: int = 4000
    top_p: Any = None

    # mutable outputs
    results: List[Any] = field(default_factory=list)
    messages: List[dict] = field(default_factory=list)
    images: Optional[List[str]] = None
    vision_model: str = ""
    vision_provider: Any = None
    vision_provider_id: str = ""
    vision_ready: bool = False
    vision_mode: str = "direct"  # "direct" | "describe"
    vision_error: str = ""       # actionable reason vision isn't ready (if any)
    backfilled_refs: bool = False  # file refs were inherited from conversation history, not this message
    transcript: str = ""         # linked-video transcript (YouTube summary path)
    transcript_title: str = ""   # source video title (for surfacing the transcript card)
    transcript_url: str = ""     # source video URL (for linking)


def get_user_api_key(user_id: int, provider_id: str) -> str | None:
    """Return the user's stored API key for a provider, if any."""
    try:
        from app.database import get_db
        db = get_db()
        row = db.execute(
            "SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?",
            (user_id, provider_id),
        ).fetchone()
        return row[0] if row else None
    except Exception:
        return None
