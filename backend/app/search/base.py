"""Search provider abstraction — pluggable web search backends."""
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str = ""


class SearchProvider:
    name: str = ""

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        raise NotImplementedError
