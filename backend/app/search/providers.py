"""Search provider registry. `get_search_provider(name)` returns a provider;
unknown/missing engines fall back to the default (DuckDuckGo)."""
from .base import SearchProvider, SearchResult
from .duckduckgo import DuckDuckGoProvider
from .searxng import SearXNGProvider


class NeedsKeyProvider(SearchProvider):
    """Compatibility stub for engines that require an API key/endpoint.

    Registered so the engine selector maps to a provider, but returns no
    results until the user configures the key/endpoint. Keeps the existing
    engine options available without breaking search.
    """

    def __init__(self, name: str):
        self.name = name

    async def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        return []


# engine id → provider class (or factory returning a provider instance)
SEARCH_PROVIDERS: dict[str, type[SearchProvider]] = {
    "duckduckgo": DuckDuckGoProvider,
    "searxng": SearXNGProvider,
    # Keyed engines — kept for compatibility (need API key/endpoint configured).
    "google_search": NeedsKeyProvider,
    "google_cx": NeedsKeyProvider,
    "bing_search": NeedsKeyProvider,
    "perplexity": NeedsKeyProvider,
    "tavily": NeedsKeyProvider,
}

DEFAULT_PROVIDER = "duckduckgo"


def get_search_provider(name: str | None) -> SearchProvider:
    provider_cls = SEARCH_PROVIDERS.get(name or "", DuckDuckGoProvider)
    return provider_cls(name) if provider_cls is NeedsKeyProvider else provider_cls()
