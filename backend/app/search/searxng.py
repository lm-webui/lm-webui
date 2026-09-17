"""SearXNG search provider — self-hosted metasearch engine (JSON API).

Requires a running SearXNG instance with the JSON format enabled:
  search.formats: ["html", "json"]   (in SearXNG's settings.yml)
"""
import asyncio
import logging
import os

import requests

from .base import SearchProvider, SearchResult

logger = logging.getLogger(__name__)

SEARXNG_URL = os.getenv("SEARXNG_URL", "http://127.0.0.1:8080").rstrip("/")
TIMEOUT = 10
UA = "Mozilla/5.0"


def _probe(base_url: str, query: str) -> requests.Response:
    """Blocking GET of the JSON API — callers wrap this in `asyncio.to_thread`."""
    return requests.get(
        f"{base_url}/search",
        params={"q": query.strip()[:200], "format": "json"},
        headers={"User-Agent": UA},
        timeout=TIMEOUT,
    )


class SearXNGProvider(SearchProvider):
    name = "searxng"

    async def search(self, query: str, limit: int = 5, base_url: str | None = None) -> list[SearchResult]:
        base_url = (base_url or SEARXNG_URL).rstrip("/")
        try:
            # to_thread: requests is blocking and this is an async method — a bare call stalls the
            # whole event loop for up to the timeout.
            resp = await asyncio.to_thread(_probe, base_url, query)
        except Exception:
            return []
        if resp.status_code != 200:
            return []
        try:
            data = resp.json()
        except ValueError:
            # SearXNG ships with search.formats unset, i.e. the JSON API OFF — it then answers 200
            # with an HTML page. Raising here would be swallowed upstream into a silent empty
            # result; log the one line that names the fix and return empty deliberately.
            logger.warning("SearXNG at %s did not return JSON — enable search.formats: [\"json\"]",
                           base_url)
            return []
        if not isinstance(data, dict):
            return []

        results: list[SearchResult] = []
        for item in data.get("results") or []:
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
            resp = await asyncio.to_thread(_probe, base_url, "test")
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
