"""DuckDuckGo search provider — the default.

Two paths, in order: the maintained `ddgs` client, then the HTML scrape as fallback.

The scrape alone is what this provider shipped for a long time, and it fails in the one way that
is hardest to notice: DuckDuckGo answers a rate-limited or bot-flagged request with a 202 and an
"anomaly" page that contains no result markup at all. Nothing raises, `search` returns [], no
results reach the prompt, `SEARCH_INTRO` is never injected — and every model, local or API,
independently reports "I cannot do web search". That symptom is model-independent precisely
because the fault is upstream of the model.

`ddgs` is the maintained client for this service and rotates DDG's own backends, so it survives
what a single hand-rolled endpoint does not. The scrape is kept as the fallback: it is existing
code, and this file's history (see tests/unit/test_search_providers.py) is exactly this failure
mode recurring, so a second path is worth its lines here.
"""
import asyncio
import html

import requests
from bs4 import BeautifulSoup

from .base import SearchProvider, SearchResult

UA = "Mozilla/5.0"


def _ddgs_text(query: str, limit: int) -> list[dict]:
    """Blocking `ddgs` call — the caller wraps this in `asyncio.to_thread`."""
    from ddgs import DDGS
    return DDGS().text(query.strip()[:200], max_results=limit) or []


class DuckDuckGoProvider(SearchProvider):
    name = "duckduckgo"

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        results = await self._via_ddgs(query, limit)
        if results:
            return results
        return await self._via_scrape(query, limit)

    async def _via_ddgs(self, query: str, limit: int) -> list[SearchResult]:
        """Primary path. Empty on any failure so the scrape gets its turn."""
        try:
            rows = await asyncio.to_thread(_ddgs_text, query, limit)
        except Exception:
            return []
        return [
            SearchResult(
                title=r.get("title", "") or "",
                url=r.get("href", "") or "",
                snippet=r.get("body", "") or "",
            )
            for r in rows[:limit] if r.get("href")
        ]

    async def _via_scrape(self, query: str, limit: int) -> list[SearchResult]:
        """Fallback: scrape the HTML endpoint directly."""
        try:
            # to_thread: requests is blocking and this is an async method — a bare call stalls the
            # whole event loop for up to the timeout.
            resp = await asyncio.to_thread(
                requests.post,
                "https://html.duckduckgo.com/html/",
                data={"q": query.strip()[:200]},
                headers={"User-Agent": UA},
                timeout=10,
            )
        except Exception:
            return []
        if resp.status_code != 200:
            return []

        # Parsed, not regexed: the markup is `<a rel="nofollow" class="result__a" href="…">`, and the
        # old pattern required `rel="nofollow"` to be immediately followed by `href=` — one added
        # attribute class silently matched zero results on every query.
        soup = BeautifulSoup(resp.text, "html.parser")
        results: list[SearchResult] = []
        for a in soup.select("a.result__a"):
            if len(results) >= limit:
                break
            url = a.get("href", "")
            # The snippet is a sibling of the title's <h2>, both under div.result — the anchor's
            # immediate parent is the <h2> and holds nothing useful.
            container = a.find_parent("div", class_="result")
            if not url.startswith("http") or container is None:
                continue
            snippet = container.select_one(".result__snippet")
            results.append(SearchResult(
                title=html.unescape(a.get_text(strip=True)),
                url=url,
                snippet=html.unescape(snippet.get_text(" ", strip=True)) if snippet else "",
            ))
        return results
