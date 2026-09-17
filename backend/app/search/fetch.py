"""Fetch the text of a search result's page, so the model reads content instead of a snippet.

Provider-agnostic: callers enrich whatever `SearchResult`s a provider returned, so all engines
benefit from one code path. Every failure is per-result — one dead link never fails the search.
"""
from __future__ import annotations

import asyncio
import ipaddress
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .base import SearchResult

UA = "Mozilla/5.0 (compatible; LM-WebUI/1.0)"
TIMEOUT = 10                                  # seconds, per page — bounded so one slow host can't
                                             # stall a turn the user did not ask to search
MAX_BYTES = 2 << 20                           # 2 MiB, like the body cap this was ported from
MAX_CHARS = 12_000                            # prompt budget per page
CONCURRENCY = 4                               # parallel fetches; more trips rate limits
_DROP = ("script", "style", "nav", "footer", "header", "noscript", "form", "aside")
_BLOCKED_HOSTS = ("localhost", "metadata.google.internal")


def _blocked_host(host: str) -> bool:
    """True for hosts a search result must never be able to make us request.

    Result URLs come from a third party, so this is a trust boundary: without it a result pointing
    at 127.0.0.1 or the cloud metadata endpoint turns search into an SSRF primitive.

    ponytail: resolved pre-DNS, same ceiling as the implementation this was ported from — a host
    that resolves to a private IP after this check still gets through. Close it with a custom
    adapter binding to a validated IP if that ever matters.
    """
    host = host.rstrip(".").lower()
    if not host or host in _BLOCKED_HOSTS or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False                          # a name, not a literal — DNS is out of scope here
    return ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_unspecified or ip.is_reserved


def _fetch(url: str) -> str:
    """Page text with chrome stripped, or "" — never raises."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or _blocked_host(parsed.hostname or ""):
            return ""
        resp = requests.get(url, headers={"User-Agent": UA},
                            timeout=TIMEOUT, stream=True, allow_redirects=True)
        with resp:
            if resp.status_code != 200:
                return ""
            body = resp.raw.read(MAX_BYTES + 1, decode_content=True) or b""
        if len(body) > MAX_BYTES:
            return ""                          # over budget: treat as unusable rather than truncating
        soup = BeautifulSoup(body, "html.parser")
        for tag in soup(_DROP):
            tag.decompose()
        return soup.get_text(" ", strip=True)[:MAX_CHARS]
    except Exception:
        return ""


async def enrich(results: list[SearchResult], limit: int = 5) -> list[SearchResult]:
    """Set `.content` on up to `limit` results, in place, concurrently. Returns the same list."""
    targets = results[:limit]
    if not targets:
        return results
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(item: SearchResult) -> None:
        if item.content:
            return                      # the provider already supplied the text; don't clobber it
        async with sem:
            item.content = await asyncio.to_thread(_fetch, item.url)

    await asyncio.gather(*(one(item) for item in targets))
    return results
