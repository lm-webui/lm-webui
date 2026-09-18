"""Read-only inspector for a conversation's memory.

Not on the generation path — `prompt_builder` assembles memory for a turn directly. This exists so
the active summary and recent window can be inspected without sending a message.

It used to be the IDOR: it accepted `user_id` from the JWT and never used it, so any authenticated
user who knew a `conv_<uuid>` id got back another user's summary and last 10 messages. The reads are
now scoped to the caller inside `app.memory`, and this endpoint does no fetching of its own.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.memory import get_recent_turns, get_summary
from app.security.auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context")


@router.get("/{conversation_id}")
async def get_context(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """What memory is STORED for a conversation: the summary, and the recent window.

    Deliberately not `memory.assemble()`, which applies the prompt rule of dropping a summary the
    recent window already covers. That is right for a prompt and wrong for an inspector — someone
    debugging "why is my summary not being used" needs to see it exists.
    """
    try:
        uid = user_id["id"]
        # A conversation the caller does not own yields empty context, indistinguishable from a
        # conversation that does not exist — so this cannot probe which ids are real.
        summary = get_summary(conversation_id, uid)
        recent = get_recent_turns(conversation_id, uid, limit=10)
        return {
            "conversation_id": conversation_id,
            "summary": summary,
            "recent_messages": recent,
            "has_context": bool(summary) or bool(recent),
        }
    except Exception as e:
        raise HTTPException(500, f"Context retrieval error: {str(e)}")
