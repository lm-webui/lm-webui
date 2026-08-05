"""DuckDuckGo search provider — the default (HTML result scrape)."""
import re

import requests

from .base import SearchProvider, SearchResult


class DuckDuckGoProvider(SearchProvider):
    name = "duckduckgo"

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        try:
            resp = requests.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query.strip()[:200]},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
        except Exception:
            return []
        if resp.status_code != 200:
            return []

        results: list[SearchResult] = []
        # Extract result blocks: <a rel="nofollow" href="...">title</a>
        for a_tag in re.findall(r'<a rel="nofollow" href="(https?://[^"]+)"[^>]*>(.*?)</a>', resp.text):
            url, title = a_tag
            title = re.sub(r"<[^>]+>", "", title).strip()
            if not url or not title:
                continue
            results.append(SearchResult(title=title, url=url))
            if len(results) >= limit:
                break
        return results
