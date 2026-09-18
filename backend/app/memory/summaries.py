"""The rolling conversation summary: where it is stored, when it is regenerated, and how.

Scoped to the caller throughout. The summary is the one piece of memory that OUTLIVES the recent
window, so a leak here exposes conversation content the turn-level readers would have dropped.
"""
import datetime
import logging
from typing import Any, Dict, List, Optional

from ._db import db_ctx

logger = logging.getLogger(__name__)

# Regenerate once this many *unsummarised* tokens have accumulated. The lower first-summary
# threshold avoids a long wait before the very first summary exists.
SUMMARY_TOKEN_THRESHOLD = 2000
FIRST_SUMMARY_TOKEN_THRESHOLD = 500

# How many unsummarised turns to feed the summariser at once. Bounds the prompt when a long gap
# accumulated (an idle conversation, or summarisation failing for a while).
SUMMARISE_FETCH_LIMIT = 40


def get_summary(conversation_id: str, user_id: int) -> Optional[str]:
    """The stored summary, or None when there is none or the conversation isn't the caller's."""
    with db_ctx() as db:
        row = db.execute(
            """SELECT s.summary
                 FROM conversation_summaries s
                 JOIN conversations c ON c.id = s.conversation_id
                WHERE s.conversation_id = ? AND c.user_id = ?""",
            (conversation_id, user_id),
        ).fetchone()
    return row[0] if row else None


def save_summary(conversation_id: str, user_id: int, summary: str) -> bool:
    """Persist a summary, but only for a conversation the caller owns.

    The ownership check is a read before the write: this is the one path that *mutates* memory, and
    writing into another user's conversation is worse than reading from it.
    """
    try:
        with db_ctx() as db:
            owns = db.execute(
                "SELECT 1 FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not owns:
                logger.warning("Refusing to store a summary for %s — not owned by user %s",
                               conversation_id, user_id)
                return False

            db.execute(
                "INSERT OR REPLACE INTO conversation_summaries "
                "(conversation_id, summary, updated_at) VALUES (?, ?, ?)",
                (conversation_id, summary, datetime.datetime.now()),
            )
            db.commit()
        logger.info("Saved summary for conversation %s (%d chars)", conversation_id, len(summary))
        return True
    except Exception as e:
        logger.error("Failed to save summary for %s: %s", conversation_id, e)
        return False


def delete_summary(conversation_id: str, user_id: int) -> bool:
    """Drop a summary. Scoped, so it cannot be used to clear someone else's memory."""
    try:
        with db_ctx() as db:
            owns = db.execute(
                "SELECT 1 FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not owns:
                return False
            db.execute("DELETE FROM conversation_summaries WHERE conversation_id = ?",
                       (conversation_id,))
            db.commit()
        return True
    except Exception as e:
        logger.error("Failed to delete summary for %s: %s", conversation_id, e)
        return False


def should_summarize(conversation_id: str, user_id: int,
                     threshold: int = SUMMARY_TOKEN_THRESHOLD) -> bool:
    """True once enough unsummarised tokens have piled up behind the last summary."""
    try:
        with db_ctx() as db:
            owns = db.execute(
                "SELECT 1 FROM conversations WHERE id = ? AND user_id = ?",
                (conversation_id, user_id),
            ).fetchone()
            if not owns:
                return False

            row = db.execute(
                """SELECT s.updated_at
                     FROM conversation_summaries s
                    WHERE s.conversation_id = ?""",
                (conversation_id,),
            ).fetchone()
            last_summary_time = row[0] if row else None

            if last_summary_time:
                result = db.execute(
                    "SELECT SUM(tokens) FROM messages "
                    "WHERE conversation_id = ? AND created_at > ?",
                    (conversation_id, last_summary_time),
                ).fetchone()
            else:
                result = db.execute(
                    "SELECT SUM(tokens) FROM messages WHERE conversation_id = ?",
                    (conversation_id,),
                ).fetchone()

        token_count = (result[0] if result and result[0] else 0) or 0
        if not last_summary_time:
            return token_count > FIRST_SUMMARY_TOKEN_THRESHOLD
        return token_count > threshold
    except Exception as e:
        logger.error("Failed to check summarisation for %s: %s", conversation_id, e)
        return False


def get_unsummarized_messages(conversation_id: str, user_id: int,
                              limit: int = SUMMARISE_FETCH_LIMIT) -> List[Dict[str, Any]]:
    """Turns newer than the last summary — i.e. what the summary does not yet cover.

    This is what the summariser is fed, NOT the recent window that gets injected verbatim. Feeding
    it the same turns the prompt already carries makes the summary a lossy duplicate of text the
    model can already see.
    """
    try:
        with db_ctx() as db:
            row = db.execute(
                """SELECT s.updated_at
                     FROM conversation_summaries s
                     JOIN conversations c ON c.id = s.conversation_id
                    WHERE s.conversation_id = ? AND c.user_id = ?""",
                (conversation_id, user_id),
            ).fetchone()
            last_summary_time = row[0] if row else None

            if last_summary_time:
                rows = db.execute(
                    """SELECT m.role, m.content FROM messages m
                        JOIN conversations c ON c.id = m.conversation_id
                       WHERE m.conversation_id = ? AND c.user_id = ? AND m.created_at > ?
                       ORDER BY m.created_at ASC LIMIT ?""",
                    (conversation_id, user_id, last_summary_time, limit),
                ).fetchall()
            else:
                rows = db.execute(
                    """SELECT m.role, m.content FROM messages m
                        JOIN conversations c ON c.id = m.conversation_id
                       WHERE m.conversation_id = ? AND c.user_id = ?
                       ORDER BY m.created_at ASC LIMIT ?""",
                    (conversation_id, user_id, limit),
                ).fetchall()

        return [{"role": r[0], "content": r[1]} for r in rows]
    except Exception as e:
        logger.error("Failed to read unsummarised messages for %s: %s", conversation_id, e)
        return []


async def generate_summary(
    conversation_id: str,
    messages: List[Dict[str, Any]],
    user_id: int,
    provider_id: str = "",
    model_id: str = "",
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Optional[str]:
    """Roll the summary forward over `messages` using the user's own provider, and persist it.

    Best-effort by design: this runs *after* the reply has already streamed, so every failure logs
    and returns None rather than surfacing. The previous implementation computed a summary,
    returned it, and never saved it — which is why the whole long-term layer was inert.
    """
    if not messages:
        return None

    try:
        old_summary = get_summary(conversation_id, user_id)

        transcript = ""
        for msg in messages:
            speaker = "User" if msg["role"] == "user" else "Assistant"
            transcript += f"{speaker}: {msg['content']}\n\n"

        prompt = f"""Update the conversation summary with new events.

Current Summary:
{old_summary if old_summary else "No previous summary."}

New Messages:
{transcript}

Instructions:
1. Update the Current Summary to include key events from New Messages.
2. Maintain a coherent narrative flow.
3. Focus on actions, decisions, and current topic status.
4. Be concise — this replaces the older turns in a limited context window.

Updated Summary:"""

        from app.core.prompts import SUMMARY_SYSTEM
        from app.providers.factory import ProviderFactory
        from app.providers.schemas import GenerateRequest

        # Mirrors the orchestrator's resolution, base_url included — Ollama/LM-Studio store a custom
        # URL, and a bare get_provider() would quietly fall back to localhost. Reusing the shared
        # instance is safe: get_session() (providers/base.py:31) reopens a closed session, and the
        # orchestrator's finally closes the one it streamed with.
        provider = (ProviderFactory.get_provider(provider_id, base_url=base_url)
                    if base_url else ProviderFactory.get_provider(provider_id))
        if not provider:
            logger.warning("No provider %r available for summarisation", provider_id)
            return None

        resp = await provider.generate(GenerateRequest(
            model=model_id,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            api_key=api_key,
            max_tokens=300,
            temperature=0.3,
            stream=False,
        ))
        summary = (getattr(resp, "content", "") or "").strip()
        if not summary:
            logger.warning("Empty summary for %s — keeping the previous one", conversation_id)
            return None

        # The line this function never had.
        if not save_summary(conversation_id, user_id, summary):
            return None
        return summary

    except Exception as e:
        # Never propagate: the reply this summarises has already been delivered.
        logger.error("Failed to generate summary: %s", e)
        return None
