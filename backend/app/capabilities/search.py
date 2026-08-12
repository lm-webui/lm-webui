"""search capability — web search results into ctx.context."""
from __future__ import annotations

import logging

from .base import CapabilityContext, get_user_api_key
from .results import SearchResult

logger = logging.getLogger(__name__)


def _get_search_cx(user_id: int) -> str | None:
    """Read the user's stored Google Programmable Search Engine ID (cx)."""
    try:
        from app.database import get_db
        db = get_db()
        try:
            row = db.execute(
                "SELECT base_url FROM api_keys WHERE user_id = ? AND provider = ?",
                (user_id, "google_search"),
            ).fetchone()
            if row and row[0]:
                from app.security.encryption import decrypt_key
                return decrypt_key(row[0]) or None
        finally:
            db.close()
    except Exception:
        pass
    return None


def _get_search_config(user_id: int) -> tuple[str, str]:
    """Read the user's selected search engine + searxng URL (default duckduckgo)."""
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
                engine = prefs.get("selectedSearchEngine", "duckduckgo") or "duckduckgo"
                searxng_url = prefs.get("searxngUrl", "") or ""
                return engine, searxng_url
        finally:
            db.close()
    except Exception:
        pass
    return "duckduckgo", ""


async def execute(ctx: CapabilityContext) -> None:
    """Run the configured search provider and append results to ctx.context."""
    message = (ctx.chat_request.message or "").strip()
    if not message:
        return SearchResult()
    try:
        query = message[:200]
        engine, searxng_url = _get_search_config(ctx.user_id)
        from app.search import get_search_provider
        search_provider = get_search_provider(engine)  # distinct from the LLM provider

        if engine == "searxng":
            results = await search_provider.search(query, base_url=searxng_url or None)
        elif engine in ("google_search", "perplexity"):
            # Use the key saved via the UI (api_keys table); env is the provider's fallback.
            from app.security.encryption import decrypt_key
            key = get_user_api_key(ctx.user_id, engine)
            api_key = decrypt_key(key) if key else None
            cx = None
            if engine == "google_search":
                # Google pairs the API key with a Programmable Search Engine ID (cx).
                cx = _get_search_cx(ctx.user_id) or None
            results = await search_provider.search(query, api_key=api_key, cx=cx) if engine == "google_search" \
                else await search_provider.search(query, api_key=api_key)
        else:
            results = await search_provider.search(query)

        if results:
            logger.info("Web search (%s) returned %d results for: %s...", search_provider.name, len(results), query[:60])
            return SearchResult(items=[{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results])
        logger.warning("Web search (%s) returned 0 results for: %s...", search_provider.name, query[:60])
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
    return SearchResult()
