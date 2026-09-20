"""Tests for the chat capability prompt builder (app.capabilities.prompt_builder).

The old `extract_file_issues_from_context` / `build_prompt` helpers were removed
when prompt construction moved into PromptBuilder.build_messages.
"""
import pytest
from unittest.mock import patch

from app.capabilities.prompt_builder import build_messages
from app.capabilities.results import FileResult, RetrievalResult, SearchResult, VisionResult
from app.memory import MemoryContext

USER = 1   # any owner id; the queries are mocked, so only the plumbing matters


@pytest.fixture(autouse=True)
def _no_history():
    """Default: no summary and empty history (mocked, no DB).

    `build_messages` now goes through app.memory.assemble(), which owns the owner-scoping for both
    reads — so this is a single patch rather than one per query.
    """
    with patch("app.memory.assemble", return_value=MemoryContext()):
        yield


class TestBuildMessages:
    def test_basic_user_system_messages(self):
        messages = build_messages("Hello", [], "conv_1", USER)
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello"

    def test_default_system_prompt(self):
        messages = build_messages("Hi", [], "conv_1", USER, system_prompt="")
        assert "You are a helpful, honest AI assistant" in messages[0]["content"]

    def test_custom_system_prompt_used(self):
        messages = build_messages("Hi", [], "conv_1", USER, system_prompt="Be terse.")
        assert messages[0]["content"] == "Be terse."

    def test_retrieval_context_injected(self):
        res = RetrievalResult(chunks=["Acme's return policy is 30 days.", "Q4 revenue was $20M."])
        messages = build_messages("What is the return policy?", [res], "conv_1", USER)
        sys = messages[0]["content"]
        assert "return policy is 30 days" in sys
        assert "[1]" in sys and "[2]" in sys

    def test_file_context_injected(self):
        res = FileResult(text="Raw extracted file text.")
        messages = build_messages("Summarize this file", [res], "conv_1", USER)
        assert "Raw extracted file text." in messages[0]["content"]

    def test_search_context_injected(self):
        res = SearchResult(items=[{"title": "LM-WebUI", "url": "https://lm-webui", "snippet": "docs"}])
        messages = build_messages("search the web", [res], "conv_1", USER)
        assert "Web search results:" in messages[0]["content"]
        assert "[1] LM-WebUI (https://lm-webui)" in messages[0]["content"]

    def test_large_search_context_is_truncated_not_dropped(self):
        """The regression: a full search section is ~9k tokens against a 2k budget, and `_trim`
        used to drop the whole section — so the search ran, returned pages, and the model was
        handed no web context at all and reported "I cannot search the web". The head (framing +
        first results) must survive the budget."""
        pages = [{"title": f"Page {i}", "url": f"https://e.com/{i}", "content": "x" * 12000}
                 for i in range(1, 4)]
        messages = build_messages("latest news", [SearchResult(items=pages, query="q")], "conv_1", USER)
        content = messages[0]["content"]
        assert "already been run" in content, "SEARCH_INTRO was dropped with the section"
        assert "[1] Page 1 (https://e.com/1)" in content, "no result rows survived"

    def test_vision_context_injected(self):
        res = VisionResult(text="A red apple on a desk.")
        messages = build_messages("What is in this image?", [res], "conv_1", USER)
        assert "red apple on a desk" in messages[0]["content"]

    def test_mixed_results_merged_in_order(self):
        results = [FileResult(text="FILE"), RetrievalResult(chunks=["RETRIEVAL"])]
        messages = build_messages("q", results, "conv_1", USER)
        sys = messages[0]["content"]
        assert "FILE" in sys and "RETRIEVAL" in sys

    def test_empty_result_types_skipped(self):
        results = [RetrievalResult(chunks=[]), SearchResult(items=[]), VisionResult(text="")]
        messages = build_messages("q", results, "conv_1", USER)
        assert "Relevant context" not in messages[0]["content"]

    def test_conversation_summary_injected(self):
        with patch("app.memory.assemble",
                   return_value=MemoryContext(summary="Talked about Acme earlier")):
            messages = build_messages("continue", [], "conv_1", USER)
        assert any("Talked about Acme earlier" in m["content"] for m in messages)

    def test_last_messages_included(self):
        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
        with patch("app.memory.assemble", return_value=MemoryContext(recent=history)):
            messages = build_messages("How are you?", [], "conv_1", USER)
        assert len(messages) == 4
        assert messages[1]["content"] == "Hi"
        assert messages[2]["content"] == "Hello!"
        assert messages[3]["content"] == "How are you?"
