"""Read-only inspector for a conversation's memory.

Not on the generation path — `prompt_builder` assembles memory for a turn directly. This exists so
the active summary and recent window can be inspected without sending a message.

It used to be the IDOR: it accepted `user_id` from the JWT and never used it, so any authenticated
user who knew a `conv_<uuid>` id got back another user's summary and last 10 messages. The reads are
now scoped to the caller inside `app.memory`, and this endpoint does no fetching of its own.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.memory import assemble
from app.security.auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context")


@router.get("/{conversation_id}")
async def get_context(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """The caller's active memory for a conversation: summary + recent turns."""
    try:
        mem = assemble(conversation_id, user_id["id"], limit=10)
        # A conversation the caller does not own yields empty context, indistinguishable from a
        # conversation that does not exist — so this cannot be used to probe which ids are real.
        return {
            "conversation_id": conversation_id,
            "summary": mem.summary,
            "recent_messages": mem.recent,
            "has_context": mem.has_summary or bool(mem.recent),
        }
    except Exception as e:
        raise HTTPException(500, f"Context retrieval error: {str(e)}")
