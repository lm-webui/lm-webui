"""Model listing for the OpenAI-compatible cloud providers.

Every one of them speaks the same wire protocol, so they share `OpenAICompatProvider` and
differ only in identity and the model hints that pick their catalogue out of `/models`. Two
bugs lived here: the filter was OpenAI's (`gpt`/`o1`/`o3`) for every vendor, so xAI (`grok-*`)
and DeepSeek (`deepseek-*`) always listed nothing; and the factory handed them a custom base URL
without a `provider_id`, leaving all of them with `.id == "openai"` — which stamped their models
`provider="openai"` and made `get_backend_name()` fall back to the *OpenAI* stored key when
talking to api.x.ai. These tests pin the identity, the per-vendor filter, and Anthropic's live
list.
"""
import pytest

from app.providers.factory import ProviderFactory
from app.providers.remote.anthropic import AnthropicProvider
from app.providers.remote.deepseek import DeepSeekProvider
from app.providers.remote.openai import OpenAIProvider
from app.providers.remote.openai_compat import OpenAICompatProvider
from app.providers.remote.vllm import VLLMProvider
from app.providers.remote.xai import XAIProvider


class _FakeResp:
    def __init__(self, status, payload):
        self.status = status
        self._payload = payload

    async def json(self):
        return self._payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeSession:
    """Stands in for aiohttp.ClientSession, recording the request it was asked to make."""

    def __init__(self, status=200, payload=None):
        self.status = status
        self.payload = payload or {}
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _FakeResp(self.status, self.payload)


async def _resolved(value):
    return value


def _listing_provider(provider_class, models, status=200):
    """A provider whose session returns `models` from `/models`."""
    provider = provider_class()
    provider._decrypt_api_key = lambda key: key
    session = _FakeSession(status=status, payload={"data": [{"id": m} for m in models]})
    provider.get_session = lambda: _resolved(session)
    return provider, session


class TestProviderIdentity:
    """Guards the key leak: each provider must be its own class with its own id."""

    @pytest.mark.parametrize("provider_id, provider_class", [
        ("openai", OpenAIProvider),
        ("xai", XAIProvider),
        ("deepseek", DeepSeekProvider),
        ("vllm", VLLMProvider),
    ])
    def test_factory_returns_the_dedicated_class(self, provider_id, provider_class):
        provider = ProviderFactory.get_provider(provider_id)
        assert isinstance(provider, provider_class)
        assert provider.id == provider_id

    def test_each_provider_keeps_its_own_base_url(self):
        assert ProviderFactory.get_provider("xai")._api_base == "https://api.x.ai/v1"
        assert ProviderFactory.get_provider("deepseek")._api_base == "https://api.deepseek.com/v1"
        assert ProviderFactory.get_provider("openai")._api_base == "https://api.openai.com/v1"

    def test_factory_reuses_one_instance(self):
        # Regression: injecting api_base made kwargs non-empty, so the singleton guard never
        # fired and every chat message built a new provider with a new aiohttp session.
        assert ProviderFactory.get_provider("xai") is ProviderFactory.get_provider("xai")


@pytest.mark.asyncio
class TestModelHints:
    """Each vendor keeps its own catalogue out of a shared `/models` shape."""

    @pytest.mark.parametrize("provider_class, reported, expected", [
        (XAIProvider,
         ["grok-4", "grok-3-mini", "gpt-4o"],
         {"grok-4", "grok-3-mini"}),
        (DeepSeekProvider,
         ["deepseek-chat", "deepseek-reasoner", "gpt-4o"],
         {"deepseek-chat", "deepseek-reasoner"}),
        (OpenAIProvider,
         ["gpt-4o", "o3-mini", "whisper-1", "text-embedding-3-small"],
         {"gpt-4o", "o3-mini"}),
        (VLLMProvider,
         ["Qwen/Qwen3-8B", "meta-llama/Llama-3.1-8B-Instruct"],
         {"Qwen/Qwen3-8B", "meta-llama/Llama-3.1-8B-Instruct"}),
    ])
    async def test_vendor_lists_only_its_own_models(self, provider_class, reported, expected):
        provider, _ = _listing_provider(provider_class, reported)
        assert {m.id for m in await provider.list_models("test-key")} == expected

    async def test_the_compat_base_filters_nothing(self):
        # capabilities/vision.py points this class at a local llama-server holding one
        # downloaded model; a vendor's hints would filter its own name away.
        provider, _ = _listing_provider(
            OpenAICompatProvider, ["Llama-3.1-8B-Instruct", "qwen2.5-vl-7b"])
        assert len(await provider.list_models("ignored")) == 2

    async def test_reported_provider_is_the_listing_vendor(self):
        provider, _ = _listing_provider(XAIProvider, ["grok-4"])
        assert [m.provider for m in await provider.list_models("xai-key")] == ["xai"]


@pytest.mark.asyncio
class TestAnthropicListModels:
    async def test_no_key_lists_nothing(self):
        provider = AnthropicProvider()
        provider._decrypt_api_key = lambda key: None
        assert await provider.list_models(None) == []

    async def test_rejected_key_lists_nothing(self):
        """A 401 must not fall back — `routes/api_keys.py` calls any non-empty list 'valid'."""
        provider, _ = _listing_provider(AnthropicProvider, [], status=401)
        assert await provider.list_models("sk-ant-bad") == []

    async def test_success_maps_display_name_and_context_window(self):
        provider = AnthropicProvider()
        provider._decrypt_api_key = lambda key: key
        session = _FakeSession(payload={"data": [{
            "id": "claude-opus-5",
            "display_name": "Claude Opus 5",
            "max_input_tokens": 500000,
            "capabilities": {"image_input": {"supported": True}},
        }]})
        provider.get_session = lambda: _resolved(session)

        [model] = await provider.list_models("sk-ant-test")

        assert model.id == "claude-opus-5"
        assert model.name == "Claude Opus 5"
        assert model.context_window == 500000
        assert model.supports_vision is True

    async def test_request_uses_the_documented_headers(self):
        provider, session = _listing_provider(AnthropicProvider, ["claude-opus-5"])
        await provider.list_models("sk-ant-test")

        [call] = session.calls
        assert call["url"] == "https://api.anthropic.com/v1/models"
        assert call["headers"]["x-api-key"] == "sk-ant-test"
        assert call["headers"]["anthropic-version"] == "2023-06-01"
