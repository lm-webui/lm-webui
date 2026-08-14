"""
Query rewriter for conversational RAG.

Resolves short / pronoun-heavy follow-ups ("What were its main findings?")
into a standalone query using the conversation history, so embedding/retrieval
doesn't fail on context-free queries. Config-gated via ``rag.query_rewrite``
(default off); falls back to the original query on any error.
"""
import logging

from app.core.prompts import REWRITE_SYSTEM

logger = logging.getLogger(__name__)


async def rewrite_query(
    query: str,
    history: list[dict],
    provider,
    model: str,
    api_key: str | None = None,
) -> str:
    """Rewrite ``query`` into a standalone form using ``history``.

    Returns the rewritten query on success, or the original ``query`` on any
    error so retrieval never fails because of rewriting.
    """
    if not query.strip():
        return query

    try:
        from app.providers.schemas import GenerateRequest

        transcript = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')[:500]}"
            for m in history[-6:]
            if m.get("content")
        )
        user = (
            f"Conversation:\n{transcript}\n\n"
            f"Latest question: {query}\n\nRewritten self-contained question:"
        )

        req = GenerateRequest(
            model=model,
            messages=[
                {"role": "system", "content": REWRITE_SYSTEM},
                {"role": "user", "content": user},
            ],
            max_tokens=80,
            temperature=0.0,
            api_key=api_key,
        )
        resp = await provider.generate(req)
        rewritten = (getattr(resp, "content", "") or "").strip()
        if rewritten and len(rewritten) < 400:
            return rewritten
    except Exception as exc:
        logger.warning("Query rewrite failed (%s); using original query", exc)

    return query
