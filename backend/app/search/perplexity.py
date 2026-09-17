"""Perplexity API provider (Sonar chat completions with citations).

Requires an API key:
  PERPLEXITY_API_KEY   (Perplexity API key, per-user via UI or env fallback)
  PERPLEXITY_MODEL     (optional, default "sonar")
Returns no results when the key is unset or the call fails. Citations become
SearchResults; if the answer has none, the answer text is returned as one result.
"""
import asyncio
import os

import requests

from .base import SearchProvider, SearchResult

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")
PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "sonar")
TIMEOUT = 15
UA = "Mozilla/5.0"

_CHAT_URL = "https://api.perplexity.ai/chat/completions"


def _post(api_key: str, query: str, max_tokens: int) -> requests.Response:
    """Blocking POST to the chat API — callers wrap this in `asyncio.to_thread`."""
    return requests.post(
        _CHAT_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": PERPLEXITY_MODEL,
            "messages": [{"role": "user", "content": query.strip()[:200]}],
            "max_tokens": max_tokens,
        },
        timeout=TIMEOUT,
    )


def _sources(data: dict) -> list[tuple[str, str]]:
    """(title, url) pairs from a Perplexity response.

    Two shapes are in the wild and they do NOT agree: newer models return `search_results`, a list
    of objects with title/url, while `citations` is a list of **bare URL strings**. Reading
    `cite.get("url")` off a string raised AttributeError, which the caller swallowed into a silent
    empty result — that is what made this provider return nothing whenever it was selected.
    Prefer `search_results` when present (it carries titles); `citations` is the fallback.
    """
    found = data.get("search_results") or []
    if found:
        return [(r.get("title") or r.get("url") or "", r.get("url") or "") for r in found]
    out: list[tuple[str, str]] = []
    for c in data.get("citations") or []:
        if isinstance(c, dict):
            out.append((c.get("title") or c.get("url") or "", c.get("url") or ""))
        else:
            out.append((str(c), str(c)))   # bare URL — it is its own title
    return out


class PerplexityProvider(SearchProvider):
    name = "perplexity"

    async def search(self, query: str, limit: int = 5, api_key: str | None = None) -> list[SearchResult]:
        api_key = api_key or PERPLEXITY_API_KEY
        if not api_key:
            return []

        try:
            resp = await asyncio.to_thread(_post, api_key, query, 300)
        except Exception:
            return []
        if resp.status_code != 200:
            return []
        try:
            data = resp.json() or {}
        except ValueError:
            return []
        if not isinstance(data, dict):
            return []

        results: list[SearchResult] = []
        for title, url in _sources(data)[:limit]:
            title = (title or "").strip()
            url = (url or "").strip()
            if not url or not title:
                continue
            results.append(SearchResult(title=title, url=url))
            if len(results) >= limit:
                break

        # No citations — fall back to the answer text as one result. Not a SearchResult with a URL,
        # so the fetcher has nothing to enrich; the model still gets the answer as evidence.
        if not results:
            content = ""
            choices = data.get("choices") or []
            if choices and isinstance(choices[0], dict):
                content = (choices[0].get("message") or {}).get("content") or ""
            content = content.strip()
            if content:
                results.append(SearchResult(title="Perplexity answer", url="", content=content[:2000]))

        return results

    async def test(self, api_key: str | None = None) -> tuple[bool, str]:
        """Verify the key works against the Perplexity chat API."""
        api_key = api_key or PERPLEXITY_API_KEY
        if not api_key:
            return False, "No Perplexity API key configured"
        try:
            resp = await asyncio.to_thread(_post, api_key, "test", 5)
        except Exception as exc:
            return False, f"Connection error: {exc}"
        if resp.status_code == 200:
            return True, "Perplexity API key is valid"
        return False, f"Perplexity API returned status {resp.status_code}"
