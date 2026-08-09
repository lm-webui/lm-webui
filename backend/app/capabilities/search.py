"""search capability — web search results into ctx.context."""
from __future__ import annotations

import logging

from .base import CapabilityContext
from .results import SearchResult

logger = logging.getLogger(__name__)


def _get_search_engine(user_id: int) -> str:
    """Read the user's selected search engine (default duckduckgo)."""
    try:
        from app.database import get_db
        import json as _json
        db = get_db()
        try:
            row = db.execute(
                "SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id,)
            ).fetchone()
            if row and row[0]:
                prefs = _json.loads(row[0])
                return prefs.get("selectedSearchEngine", "duckduckgo") or "duckduckgo"
        finally:
            db.close()
    except Exception:
        pass
    return "duckduckgo"


async def execute(ctx: CapabilityContext) -> None:
    """Run the configured search provider and append results to ctx.context."""
    message = (ctx.chat_request.message or "").strip()
    if not message:
        return SearchResult()
    try:
        query = message[:200]
        engine = _get_search_engine(ctx.user_id)
        from app.search import get_search_provider
        search_provider = get_search_provider(engine)  # distinct from the LLM provider
        results = await search_provider.search(query)
        if results:
            logger.info("Web search (%s) returned %d results for: %s...", search_provider.name, len(results), query[:60])
            return SearchResult(items=[{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results])
        logger.warning("Web search (%s) returned 0 results for: %s...", search_provider.name, query[:60])
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
    return SearchResult()
