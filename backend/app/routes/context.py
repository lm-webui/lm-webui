from fastapi import APIRouter, HTTPException, Depends
import logging
from app.memory.context_assembler import context_assembler
from app.security.auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context")


@router.get("/{conversation_id}")
async def get_context(conversation_id: str, user_id: dict = Depends(get_current_user)):
    """Get active context for a conversation."""
    try:
        context = await context_assembler.assemble_context(
            user_id["id"], conversation_id, "", use_rag=False
        )

        return {
            "conversation_id": conversation_id,
            "summary": context.get("summary"),
            "recent_messages": context.get("recent_messages", []),
            "has_context": True,
        }
    except Exception as e:
        raise HTTPException(500, f"Context retrieval error: {str(e)}")
