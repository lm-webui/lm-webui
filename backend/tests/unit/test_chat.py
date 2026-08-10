"""Tests for the chat capability prompt builder (app.capabilities.prompt_builder).

The old `extract_file_issues_from_context` / `build_prompt` helpers were removed
when prompt construction moved into PromptBuilder.build_messages.
"""
import pytest
from unittest.mock import patch

from app.capabilities.prompt_builder import build_messages
from app.capabilities.results import FileResult, RetrievalResult, SearchResult, VisionResult


@pytest.fixture(autouse=True)
def _no_history():
    """Default: no conversation summary and empty history (mocked, no DB)."""
    with patch("app.chat.service.get_conversation_summary", return_value=None), \
         patch("app.chat.service.get_last_n_messages", return_value=[]):
        yield


class TestBuildMessages:
    def test_basic_user_system_messages(self):
        messages = build_messages("Hello", [], "conv_1")
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello"

    def test_default_system_prompt(self):
        messages = build_messages("Hi", [], "conv_1", system_prompt="")
        assert "You are a helpful AI assistant." in messages[0]["content"]

    def test_custom_system_prompt_used(self):
        messages = build_messages("Hi", [], "conv_1", system_prompt="Be terse.")
        assert messages[0]["content"] == "Be terse."

    def test_retrieval_context_injected(self):
        res = RetrievalResult(chunks=["Acme's return policy is 30 days.", "Q4 revenue was $20M."])
        messages = build_messages("What is the return policy?", [res], "conv_1")
        sys = messages[0]["content"]
        assert "return policy is 30 days" in sys
        assert "[1]" in sys and "[2]" in sys

    def test_file_context_injected(self):
        res = FileResult(text="Raw extracted file text.")
        messages = build_messages("Summarize this file", [res], "conv_1")
        assert "Raw extracted file text." in messages[0]["content"]

    def test_search_context_injected(self):
        res = SearchResult(items=[{"title": "LM-WebUI", "url": "https://lm-webui", "snippet": "docs"}])
        messages = build_messages("search the web", [res], "conv_1")
        assert "Web search results:" in messages[0]["content"]
        assert "[LM-WebUI](https://lm-webui)" in messages[0]["content"]

    def test_vision_context_injected(self):
        res = VisionResult(text="A red apple on a desk.")
        messages = build_messages("What is in this image?", [res], "conv_1")
        assert "red apple on a desk" in messages[0]["content"]

    def test_mixed_results_merged_in_order(self):
        results = [FileResult(text="FILE"), RetrievalResult(chunks=["RETRIEVAL"])]
        messages = build_messages("q", results, "conv_1")
        sys = messages[0]["content"]
        assert "FILE" in sys and "RETRIEVAL" in sys

    def test_empty_result_types_skipped(self):
        results = [RetrievalResult(chunks=[]), SearchResult(items=[]), VisionResult(text="")]
        messages = build_messages("q", results, "conv_1")
        assert "Relevant context" not in messages[0]["content"]

    def test_conversation_summary_injected(self):
        with patch("app.chat.service.get_conversation_summary",
                   return_value="Talked about Acme earlier"):
            messages = build_messages("continue", [], "conv_1")
        assert any("Talked about Acme earlier" in m["content"] for m in messages)

    def test_last_messages_included(self):
        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
        with patch("app.chat.service.get_last_n_messages", return_value=history):
            messages = build_messages("How are you?", [], "conv_1")
        assert len(messages) == 4
        assert messages[1]["content"] == "Hi"
        assert messages[2]["content"] == "Hello!"
        assert messages[3]["content"] == "How are you?"
