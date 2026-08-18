"""Tests for the hybrid image-gen model resolution (app.capabilities.image_gen).

Pure logic — no network, no handlers invoked. Verifies the provider/model the
chat diffusion capability picks: the composer's selected model when it's an
image-capable model, else the Settings default image-gen model.
"""
from app.capabilities.image_gen import _is_image_gen, _resolve_image_model


class TestIsImageGen:
    def test_image_capable_models(self):
        assert _is_image_gen("openai", "gpt-image-1") is True
        assert _is_image_gen("openai", "dall-e-3") is True
        assert _is_image_gen("google", "gemini-2.5-flash-image") is True
        assert _is_image_gen("google", "imagen-3") is True
        assert _is_image_gen("gemini", "imagen-3") is True
        assert _is_image_gen("comfyui", "sdxl") is True

    def test_non_image_models(self):
        assert _is_image_gen("openai", "gpt-4o") is False
        assert _is_image_gen("google", "gemini-2.5-flash") is False
        assert _is_image_gen("claude", "claude-3-sonnet") is False
        assert _is_image_gen("", "") is False


_PREFS = {"defaultImageProvider": "openai", "defaultImageModel": "dall-e-3"}


class TestProviderResolution:
    def test_selected_image_capable_wins(self):
        # Selected gemini-image model is image-capable → it should be used.
        assert _resolve_image_model(_PREFS, "google", "gemini-2.5-flash-image") == (
            "google", "gemini-2.5-flash-image")

    def test_selected_gpt_image_wins(self):
        assert _resolve_image_model(_PREFS, "openai", "gpt-image-1") == ("openai", "gpt-image-1")

    def test_non_image_selected_falls_back_to_default(self):
        # Selected chat model (gemini-flash) can't generate → fall back to default.
        assert _resolve_image_model(_PREFS, "google", "gemini-2.5-flash") == ("openai", "dall-e-3")

    def test_missing_prefs_defaults_to_openai(self):
        assert _resolve_image_model({}, "claude", "claude-3-sonnet") == ("openai", "")
