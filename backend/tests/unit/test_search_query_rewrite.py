"""Tests for the model-written search query (app.capabilities.search).

Search used to build its query by stripping stopwords out of the sentence, which cannot
reorder a comparison or resolve "what about the second one?". The query now comes from one
small capped generation on the user's own model, with the keyword extraction kept as the
fallback. No network here: the provider is faked, and the point of most of these cases is
that a bad rewrite degrades to the old behaviour instead of losing the search.
"""
from types import SimpleNamespace

import pytest

from app.capabilities.base import CapabilityContext
from app.capabilities.search import _rewrite_query, _sanitize_query


class FakeProvider:
    """Stands in for a real provider; records the request so the prompt shape is assertable."""

    def __init__(self, content: str = "", raises: Exception | None = None):
        self.content = content
        self.raises = raises
        self.seen = None

    async def generate(self, req):
        self.seen = req
        if self.raises:
            raise self.raises
        return SimpleNamespace(content=self.content)


def _ctx(message="what is new in python 3.13", provider=None, model_id="gpt-4o-mini"):
    return CapabilityContext(
        chat_request=SimpleNamespace(message=message),
        provider=provider,
        model_id=model_id,
    )


class TestSanitizeQuery:
    def test_plain_query_passes_through(self):
        assert _sanitize_query("python 3.13 release notes") == "python 3.13 release notes"

    def test_strips_surrounding_quotes_and_backticks(self):
        assert _sanitize_query('"python 3.13"') == "python 3.13"
        assert _sanitize_query("`python 3.13`") == "python 3.13"
        assert _sanitize_query("“python 3.13”") == "python 3.13"

    def test_strips_trailing_period(self):
        assert _sanitize_query("weather in Jakarta.") == "weather in Jakarta"

    def test_strips_inline_label(self):
        assert _sanitize_query("Search query: python 3.13") == "python 3.13"

    def test_label_on_its_own_line_uses_the_next_line(self):
        # The first-line rule alone would keep the label, since "Here is the query:" ends in a
        # colon with nothing after it.
        assert _sanitize_query("Here is the query:\npython 3.13") == "python 3.13"

    def test_takes_first_line_when_the_model_preambles(self):
        assert _sanitize_query("Sure!\npython 3.13\nLet me know") == "Sure!"

    def test_colon_inside_the_query_survives(self):
        # A long head means it is not a label, so the colon is part of the query.
        assert _sanitize_query("site:docs.python.org whatsnew 3.13") == "site:docs.python.org whatsnew 3.13"

    @pytest.mark.parametrize("raw", ["", "   ", "\n\n", None])
    def test_empty_input_is_empty_string(self, raw):
        assert _sanitize_query(raw) == ""

    def test_paragraph_back_is_rejected(self):
        # The model answered the question instead of producing a query.
        assert _sanitize_query("x" * 201) == ""


class TestRewriteQuery:
    @pytest.mark.asyncio
    async def test_returns_the_sanitized_model_output(self):
        provider = FakeProvider('"python 3.13 whatsnew"')
        assert await _rewrite_query(_ctx(provider=provider)) == "python 3.13 whatsnew"

    @pytest.mark.asyncio
    async def test_request_uses_the_users_own_model_and_is_capped(self):
        provider = FakeProvider("python 3.13")
        await _rewrite_query(_ctx(provider=provider, model_id="llama3.1:8b"))
        assert provider.seen.model == "llama3.1:8b"
        assert provider.seen.stream is False
        # A capped output is the point: this runs before every search.
        assert provider.seen.max_tokens <= 64
        assert provider.seen.temperature == 0.0

    @pytest.mark.asyncio
    async def test_provider_failure_returns_empty_so_the_caller_falls_back(self):
        provider = FakeProvider(raises=RuntimeError("connection reset"))
        assert await _rewrite_query(_ctx(provider=provider)) == ""

    @pytest.mark.asyncio
    async def test_unusable_output_returns_empty(self):
        assert await _rewrite_query(_ctx(provider=FakeProvider(""))) == ""
        assert await _rewrite_query(_ctx(provider=FakeProvider("x" * 300))) == ""

    @pytest.mark.asyncio
    async def test_no_provider_or_model_means_no_call_attempted(self):
        # MLX and friends still reach here; the caller falls back to keyword extraction.
        assert await _rewrite_query(_ctx(provider=None)) == ""
        assert await _rewrite_query(_ctx(provider=FakeProvider("q"), model_id="")) == ""

    @pytest.mark.asyncio
    async def test_empty_message_short_circuits(self):
        provider = FakeProvider("something")
        assert await _rewrite_query(_ctx(message="   ", provider=provider)) == ""
        assert provider.seen is None
