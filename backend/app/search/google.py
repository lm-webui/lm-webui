"""Google Programmable Search Engine (Custom Search JSON API) provider.

Requires a Google Cloud API key and a Programmable Search Engine ID:
  GOOGLE_SEARCH_API_KEY   (Google Cloud API key)
  GOOGLE_SEARCH_CX        (Programmable Search Engine / "cx" ID)
Returns no results when the keys are unset or the call fails.
"""
import os

import requests

from .base import SearchProvider, SearchResult

GOOGLE_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY", "")
GOOGLE_CX = os.getenv("GOOGLE_SEARCH_CX", "")

_SEARCH_URL = "https://www.googleapis.com/customsearch/v1"


class GoogleSearchProvider(SearchProvider):
    name = "google_search"

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        if not GOOGLE_API_KEY or not GOOGLE_CX:
            return []

        try:
            resp = requests.get(
                _SEARCH_URL,
                params={"key": GOOGLE_API_KEY, "cx": GOOGLE_CX, "q": query.strip()[:200], "num": limit},
                timeout=10,
            )
        except Exception:
            return []
        if resp.status_code != 200:
            return []

        results: list[SearchResult] = []
        for item in (resp.json() or {}).get("items", []):
            url = item.get("link", "")
            title = (item.get("title") or "").strip()
            if not url or not title:
                continue
            results.append(SearchResult(title=title, url=url, snippet=(item.get("snippet") or "").strip()))
            if len(results) >= limit:
                break
        return results
