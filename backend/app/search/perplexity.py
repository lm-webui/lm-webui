"""Perplexity API provider (Sonar chat completions with citations).

Requires an API key:
  PERPLEXITY_API_KEY   (Perplexity API key, per-user via UI or env fallback)
  PERPLEXITY_MODEL     (optional, default "sonar")
Returns no results when the key is unset or the call fails. Citations become
SearchResults; if the answer has none, the answer text is returned as one result.
"""
import os

import requests

from .base import SearchProvider, SearchResult

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")
PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "sonar")

_CHAT_URL = "https://api.perplexity.ai/chat/completions"


class PerplexityProvider(SearchProvider):
    name = "perplexity"

    async def search(self, query: str, limit: int = 5, api_key: str | None = None) -> list[SearchResult]:
        api_key = api_key or PERPLEXITY_API_KEY
        if not api_key:
            return []

        try:
            resp = requests.post(
                _CHAT_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": PERPLEXITY_MODEL,
                    "messages": [{"role": "user", "content": query.strip()[:200]}],
                    "max_tokens": 300,
                },
                timeout=15,
            )
        except Exception:
            return []
        if resp.status_code != 200:
            return []

        data = resp.json() or {}
        results: list[SearchResult] = []
        for cite in data.get("citations", [])[:limit]:
            url = cite.get("url", "")
            title = (cite.get("title") or url or "").strip()
            if not url or not title:
                continue
            results.append(SearchResult(title=title, url=url, snippet=(cite.get("snippet") or "").strip()))
            if len(results) >= limit:
                break

        # No citations — fall back to the answer text as a single result.
        if not results:
            content = ""
            choices = data.get("choices") or []
            if choices:
                content = (choices[0].get("message") or {}).get("content") or ""
            content = content.strip()
            if content:
                results.append(SearchResult(title="Perplexity answer", url="", snippet=content[:500]))

        return results

    async def test(self, api_key: str | None = None) -> tuple[bool, str]:
        """Verify the key works against the Perplexity chat API."""
        api_key = api_key or PERPLEXITY_API_KEY
        if not api_key:
            return False, "No Perplexity API key configured"
        try:
            resp = requests.post(
                _CHAT_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": PERPLEXITY_MODEL,
                    "messages": [{"role": "user", "content": "test"}],
                    "max_tokens": 5,
                },
                timeout=15,
            )
        except Exception as exc:
            return False, f"Connection error: {exc}"
        if resp.status_code == 200:
            return True, "Perplexity API key is valid"
        return False, f"Perplexity API returned status {resp.status_code}"
