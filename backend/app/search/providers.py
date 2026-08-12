"""Search provider registry. `get_search_provider(name)` returns a provider;
unknown/missing engines fall back to the default (DuckDuckGo)."""
from .base import SearchProvider, SearchResult
from .duckduckgo import DuckDuckGoProvider
from .searxng import SearXNGProvider
from .google import GoogleSearchProvider
from .perplexity import PerplexityProvider


# engine id → provider class
SEARCH_PROVIDERS: dict[str, type[SearchProvider]] = {
    "duckduckgo": DuckDuckGoProvider,
    "searxng": SearXNGProvider,
    "google_search": GoogleSearchProvider,
    "perplexity": PerplexityProvider,
}

DEFAULT_PROVIDER = "duckduckgo"


def get_search_provider(name: str | None) -> SearchProvider:
    provider_cls = SEARCH_PROVIDERS.get(name or "", DuckDuckGoProvider)
    return provider_cls()
