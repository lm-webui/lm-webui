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

    async def search(self, query: str, limit: int = 5, base_url: str | None = None) -> list[SearchResult]:
        base_url = (base_url or SEARXNG_URL).rstrip("/")
        try:
            resp = requests.get(
                f"{base_url}/search",
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

    async def test(self, base_url: str | None = None) -> tuple[bool, str]:
        """Probe reachability + JSON API of a SearXNG instance."""
        base_url = (base_url or SEARXNG_URL).rstrip("/")
        try:
            resp = requests.get(
                f"{base_url}/search",
                params={"q": "test", "format": "json"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
        except Exception as exc:
            return False, f"Connection error: {exc}"
        if resp.status_code != 200:
            return False, f"SearXNG returned status {resp.status_code}"
        try:
            data = resp.json()
            if isinstance(data, dict) and "results" in data:
                return True, "SearXNG reachable, JSON API enabled"
            return False, "SearXNG responded but JSON format not enabled"
        except Exception:
            return False, "SearXNG responded but did not return JSON (enable search.formats: json)"
