"""Tests for the smart-modality router (app.modality.planner.plan).

plan() classifies intent and builds the minimal ExecutionPlan. Pure logic —
no models, no network. Mirrors the orchestrator's RAG/vision/search/diffusion
routing decisions.
"""
import pytest

from app.modality.planner import plan


def _doc_ref(filename: str = "report.pdf") -> dict:
    return {"filename": filename, "type": "document", "mime": "application/pdf"}


def _img_ref(filename: str = "photo.png") -> dict:
    return {"filename": filename, "type": "image", "mime": "image/png"}


class TestPlainTextNoRetrieve:
    def test_general_query_no_capability(self):
        p = plan(message="Hello, how are you?")
        assert p.retrieve is False
        assert p.file_context is False
        assert p.search is False
        assert p.vision is False
        assert p.diffusion is False

    def test_direct_hint_still_no_retrieve(self):
        p = plan(message="translate this to french")
        assert p.retrieve is False


class TestKnowledgeRetrieve:
    def test_document_hint_triggers_retrieve(self):
        p = plan(message="what did my pdf say?")
        assert p.retrieve is True

    def test_attached_document_triggers_file_context_and_retrieve(self):
        p = plan(message="summarize", file_references=[_doc_ref()])
        assert p.file_context is True
        assert p.retrieve is True

    def test_knowledge_base_query(self):
        p = plan(message="search my knowledge base for return policy")
        assert p.retrieve is True


class TestVision:
    def test_image_ref_triggers_vision(self):
        p = plan(message="what is in this image?", file_references=[_img_ref()])
        assert p.vision is True

    def test_mixed_image_and_doc_triggers_vision_and_retrieve(self):
        p = plan(message="analyze", file_references=[_img_ref(), _doc_ref()])
        assert p.vision is True
        assert p.retrieve is True

    def test_vision_mode_direct_for_simple_query(self):
        p = plan(message="what's in this picture?", file_references=[_img_ref()])
        assert p.vision is True
        assert p.vision_mode == "direct"


class TestWebSearch:
    def test_web_search_flag(self):
        p = plan(message="anything", web_search=True)
        assert p.search is True

    def test_web_hint_triggers_search(self):
        p = plan(message="what is the latest news?")
        assert p.search is True


class TestImageGeneration:
    def test_generation_hint_triggers_diffusion(self):
        p = plan(message="generate an image of a cat")
        assert p.diffusion is True


class TestVisionModeDescribe:
    def test_vision_mode_describe_for_complex_query(self):
        p = plan(message="compare this diagram to the report", file_references=[_img_ref()])
        assert p.vision is True
        assert p.vision_mode == "describe"
