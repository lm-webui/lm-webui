"""search capability — web search results into ctx.context."""
from __future__ import annotations

import logging
import re

from .base import CapabilityContext, get_user_api_key
from .results import SearchResult

logger = logging.getLogger(__name__)

# Longest first: "search the web for" must win over "search for".
_SEARCH_PREFIXES = ("search the web for", "search the web", "search for", "look up", "google")

# Conversational filler that hurts recall — meaningful to a human, noise to an index. Deliberately
# small: over-stripping is worse than under-stripping, so only words that are never the subject of
# a query are listed. ("web" is not here — "web development" is a legitimate query.)
_STOPWORDS = frozenset((
    "a", "an", "about", "again", "and", "are", "can", "could", "do", "for", "give", "i", "is",
    "me", "now", "of", "on", "please", "tell", "the", "this", "to", "try", "up", "was", "what",
    "would", "you", "your",
))
_URL_RE = re.compile(r"https?://\S+")
# Tokens keep internal punctuation — "python 3.13", "C++", "gpt-4" are single units, and splitting
# on "." turns a version number into two useless tokens.
_TOKEN_RE = re.compile(r"[A-Za-z0-9][\w.+#-]*")


def _clean_query(message: str) -> str:
    """Reduce a chat sentence to something worth sending a search engine.

    'can you search the web for the latest news about python 3.13?' → 'latest news python 3.13'.

    URLs are pulled out first and re-appended, because they are usually the subject of the query
    and the tokenizer would otherwise chew through their punctuation.
    """
    q = (message or "").strip()
    urls = _URL_RE.findall(q)
    prose = _URL_RE.sub(" ", q)

    # Anywhere, not just at the start: "can you search the web for X" is the common phrasing.
    low = prose.lower()
    for p in _SEARCH_PREFIXES:
        i = low.find(p)
        if i != -1:
            prose = prose[:i] + " " + prose[i + len(p):]
            break

    kept = [t for t in (w.rstrip(".") for w in _TOKEN_RE.findall(prose))
            if t and t.lower() not in _STOPWORDS]
    # All filler: search the original rather than nothing — an empty query is always wrong.
    if not kept and not urls:
        return q
    return " ".join(kept + urls)[:200]


# The rewrite prompt is deliberately terse. It runs on every search, before the search, so its
# output is capped hard (48 tokens) — anything longer is the model explaining itself, which
# _sanitize_query then throws away.
REWRITE_INSTRUCTION = (
    "Rewrite the user's message as a web search query. "
    "Reply with the query only: no quotes, no explanation, no trailing punctuation. "
    "Keep names, versions and numbers exactly as written. "
    "If the message is already a good query, repeat it unchanged."
)


def _sanitize_query(raw: str) -> str:
    """Pull a query out of whatever the model actually returned.

    Returns "" when nothing usable came back, which makes the caller fall back to
    _clean_query — a failed rewrite must never cost the user their search.
    """
    lines = [ln.strip() for ln in (raw or "").splitlines() if ln.strip()]
    if not lines:
        return ""
    text = lines[0]
    # A label on its own line — "Here is the query:" — carries nothing; the query is the next one.
    if text.endswith(":") and len(lines) > 1:
        text = lines[1]
    # "Search query: X" — keep the part after the label. Split on ": " rather than ":" so a
    # search operator keeps its prefix: "site:docs.python.org ..." has no space after the colon
    # and is all query, while a label always does.
    if ": " in text:
        head, _, tail = text.partition(": ")
        if len(head) <= 20 and tail.strip():
            text = tail.strip()
    text = text.strip().strip('"\'`“”').strip().rstrip(".").strip()
    # A paragraph back means it ignored the instruction and answered instead.
    if not text or len(text) > 200:
        return ""
    return text


async def _rewrite_query(ctx: CapabilityContext) -> str:
    """Ask the model for a search query instead of mining one out of the sentence.

    _clean_query can only strip stopwords, so it cannot resolve "what about the second one?" or
    reorder a comparison into something an index responds to. This is one small non-streaming
    generation on the user's own model, the same shape as vision._describe: it runs inside the
    capability, uses the provider already on the context, and returns "" on any failure.
    """
    message = (ctx.chat_request.message or "").strip() if ctx.chat_request else ""
    if not message or not ctx.provider or not ctx.model_id:
        return ""
    try:
        from app.providers.schemas import GenerateRequest
        req = GenerateRequest(
            model=ctx.model_id,
            messages=[
                {"role": "system", "content": REWRITE_INSTRUCTION},
                {"role": "user", "content": message[:1000]},
            ],
            max_tokens=48,
            temperature=0.0,
            stream=False,
        )
        resp = await ctx.provider.generate(req)
        query = _sanitize_query(getattr(resp, "content", "") or "")
        if query:
            logger.info("Query rewrite: %r -> %r", message[:60], query[:60])
        return query
    except Exception as exc:
        # Never fatal: the caller falls back to keyword extraction.
        logger.warning("Query rewrite failed (%s); falling back to keyword extraction", exc)
        return ""


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
        # Model-written query first; keyword extraction is the fallback, not the default. This
        # stage keeps the planner's LIVE/WEB_HINTS gate, so the only change is query quality —
        # whether a search runs at all is still decided upstream.
        #
        # The fallback is silent by design but logged, because it is expected rather than
        # exceptional: reasoning models (Qwen3-style, granite, zeto-*) spend the whole token
        # budget in the `reasoning` field and return empty `content`, and no prompt or parameter
        # on the Ollama endpoint talks them out of it. Those models keep today's behaviour.
        rewritten = await _rewrite_query(ctx)
        if not rewritten:
            logger.info("Query rewrite unavailable for %s; using keyword extraction",
                        ctx.model_id or "unknown model")
        query = (rewritten or _clean_query(message))[:200]
        engine, searxng_url = _get_search_config(ctx.user_id)
        from app.search import get_search_provider
        from app.search.fetch import enrich
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
            # Read the pages, not just the snippets — providers return ~150 chars of teaser, which
            # is not enough for the model to answer from. Failures leave `.content` empty.
            # Capped at 3 of the 5: `web_search` defaults ON in the UI, so this runs on every turn,
            # and the tail results cost latency far more often than they contribute an answer.
            results = await enrich(results, limit=3)
            logger.info("Web search (%s) returned %d results (%d with page text) for: %s...",
                        search_provider.name, len(results),
                        sum(1 for r in results if r.content), query[:60])
            return SearchResult(items=[{"title": r.title, "url": r.url,
                                        "snippet": r.snippet, "content": r.content}
                                       for r in results], query=query,
                                provider=search_provider.name)
        logger.warning("Web search (%s) returned 0 results for: %s...", search_provider.name, query[:60])
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
    return SearchResult()
