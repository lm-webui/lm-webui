"""Which Gemini models the provider offers.

The filter used to be `"gemini" in name`, which dropped the `gemini-*-image` models before
`routes/image_generation.py` could keyword-match them — the dynamic Google image-model list was
therefore always empty. It is now a capability check on the SDK's `supported_actions`. These
tests pin the boundary: chat and image models in, embeddings out.
"""
from types import SimpleNamespace

import pytest

from app.providers.remote.gemini import GeminiProvider, _can_generate


def _model(name: str, actions):
    return SimpleNamespace(name=f"models/{name}", supported_actions=actions)


class _FakeClient:
    def __init__(self, models):
        self.models = SimpleNamespace(list=lambda: models)


def _provider_returning(monkeypatch, models) -> GeminiProvider:
    provider = GeminiProvider()
    monkeypatch.setattr(provider, "_decrypt_api_key", lambda key: key)
    monkeypatch.setattr(provider, "_get_client", lambda key=None: _FakeClient(models))
    return provider


class TestCanGenerate:
    def test_generate_content_models_are_kept(self):
        assert _can_generate(_model("gemini-2.5-flash", ["generateContent"]), "gemini-2.5-flash")
        # The image variants are generateContent models too, which is how the image route's
        # `-image` keyword filter gets anything to match.
        assert _can_generate(
            _model("gemini-2.5-flash-image", ["generateContent"]), "gemini-2.5-flash-image")

    def test_embedding_models_are_dropped(self):
        assert not _can_generate(_model("text-embedding-004", ["embedContent"]), "text-embedding-004")
        assert not _can_generate(_model("aqa", ["generateAnswer"]), "aqa")

    def test_missing_actions_falls_back_to_the_name_check(self):
        # Older payloads omit supported_actions entirely; those must not all disappear.
        assert _can_generate(_model("gemini-1.5-flash", None), "gemini-1.5-flash")
        assert not _can_generate(_model("text-embedding-004", []), "text-embedding-004")


@pytest.mark.asyncio
async def test_list_models_surfaces_the_image_model_for_the_image_path(monkeypatch):
    """End of the chain the image route depends on: the `-image` model must survive list_models."""
    provider = _provider_returning(monkeypatch, [
        _model("gemini-2.5-flash", ["generateContent", "countTokens"]),
        _model("gemini-2.5-flash-image", ["generateContent"]),
        _model("text-embedding-004", ["embedContent"]),
    ])

    ids = {m.id for m in await provider.list_models("AQ.fake")}

    assert ids == {"gemini-2.5-flash", "gemini-2.5-flash-image"}
