"""DuckDuckGo search provider — the default (HTML result scrape)."""
import asyncio
import html

import requests
from bs4 import BeautifulSoup

from .base import SearchProvider, SearchResult

UA = "Mozilla/5.0"


class DuckDuckGoProvider(SearchProvider):
    name = "duckduckgo"

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
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
