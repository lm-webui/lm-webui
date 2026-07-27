"""
Context Assembler
Assembles conversation context from summary + recent messages for LLM generation.
"""
import logging
from typing import Dict, Any
from app.chat.service import get_conversation_summary
from app.chat.service import get_last_n_messages

logger = logging.getLogger(__name__)


class ContextAssembler:
    """Service to assemble context for LLM generation."""

    async def assemble_context(
        self,
        user_id: int,
        conversation_id: str,
        query: str,
        use_rag: bool = False
    ) -> Dict[str, Any]:
        """
        Gather context from conversation summary and recent history.
        """
        context = {
            "summary": None,
            "recent_messages": [],
        }

        # 1. Rolling Summary (SQLite)
        context["summary"] = get_conversation_summary(conversation_id)

        # 2. Recent History
        context["recent_messages"] = get_last_n_messages(conversation_id, n=10)

        return context

    def format_context_string(self, context: Dict[str, Any]) -> str:
        """Format context into a prompt string."""
        parts = []

        if context.get("summary"):
            parts.append(f"Conversation Summary:\n{context['summary']}")

        if context.get("recent_messages"):
            parts.append("Recent Messages:")
            for msg in context["recent_messages"]:
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
                if content:
                    parts.append(f"[{role}]: {content[:500]}")

        return "\n\n".join(parts)


# Global instance
context_assembler = ContextAssembler()
