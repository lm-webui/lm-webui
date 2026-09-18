"""The recent-turn window, and full conversation reads.

Every query here joins `conversations` to enforce ownership. That is not belt-and-braces: these
reads feed a background task and an HTTP route as well as the prompt builder, and one of them
forgetting the check would put another user's conversation into a model's context. Enforcing it
in the query means no caller can forget.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from ._db import db_ctx

logger = logging.getLogger(__name__)


def get_recent_turns(conversation_id: str, user_id: int,
                     limit: int = 20) -> List[Dict[str, Any]]:
    """The newest `limit` turns, returned oldest-first (chronological, ready for a prompt).

    A *fetch* ceiling, not an injection target — the caller trims to its token budget afterwards.
    """
    with db_ctx() as db:
        rows = db.execute(
            """SELECT m.role, m.content, m.created_at
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                WHERE m.conversation_id = ? AND c.user_id = ?
                ORDER BY m.created_at DESC LIMIT ?""",
            (conversation_id, user_id, limit),
        ).fetchall()

    return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in reversed(rows)]


def get_conversation_messages(conversation_id: str, user_id: int,
                              limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Full transcript, oldest-first. Empty when the conversation isn't the caller's."""
    with db_ctx() as db:
        query = """
            SELECT m.id, m.role, m.content, m.tokens, m.metadata, m.created_at
              FROM messages m
              JOIN conversations c ON c.id = m.conversation_id
             WHERE m.conversation_id = ? AND c.user_id = ?
             ORDER BY m.created_at ASC
        """
        params: tuple = (conversation_id, user_id)
        if limit:
            query += " LIMIT ?"
            params += (limit,)
        rows = db.execute(query, params).fetchall()

    result: List[Dict[str, Any]] = []
    for msg in rows:
        data = {
            "id": msg[0], "role": msg[1], "content": msg[2],
            "tokens": msg[3], "created_at": msg[5],
        }
        if msg[4]:
            try:
                data["metadata"] = json.loads(msg[4])
            except Exception:
                data["metadata"] = {}
        else:
            data["metadata"] = {}
        result.append(data)

    logger.debug("Retrieved %d messages for conversation %s", len(result), conversation_id)
    return result
