"""SearXNG search provider — self-hosted metasearch engine (JSON API).

Requires a running SearXNG instance with the JSON format enabled:
  search.formats: ["html", "json"]   (in SearXNG's settings.yml)
"""
import os

import requests

from .base import SearchProvider, SearchResult

SEARXNG_URL = os.getenv("SEARXNG_URL", "http://127.0.0.1:8080").rstrip("/")


class SearXNGProvider(SearchProvider):
    name = "searxng"

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        try:
            resp = requests.get(
                f"{SEARXNG_URL}/search",
                params={"q": query.strip()[:200], "format": "json"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
        except Exception:
            return []
        if resp.status_code != 200:
            return []

        results: list[SearchResult] = []
        for item in (resp.json() or {}).get("results", []):
            url = item.get("url", "")
            title = (item.get("title") or "").strip()
            if not url or not title:
                continue
            results.append(SearchResult(title=title, url=url, snippet=(item.get("content") or "").strip()))
            if len(results) >= limit:
                break
        return results
