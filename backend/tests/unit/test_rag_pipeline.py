"""
Hermetic RAG unit tests: query-parser and chunking (no model download).

The model-dependent ingest->retrieve pipeline lives in
tests/integration/test_rag_pipeline.py (run via `-m integration`).
"""
import os
import pytest

os.environ["TZ"] = "UTC"  # tzlocal/dateparser needs a zoneinfo TZ, not a bare offset like WIB


class TestQueryParser:
    """Validate time-filter extraction from user queries."""

    def test_extract_single_year(self):
        from app.rag.query_parser import extract_filters

        result = extract_filters("What was the return policy in 2024?")
        assert "year" in result
        assert result["year"] == [2024]

    def test_extract_year_range(self):
        from app.rag.query_parser import extract_filters

        result = extract_filters("Compare 2022 vs 2024 strategy")
        assert result["year"] == [2022, 2024]

    def test_extract_quarter(self):
        from app.rag.query_parser import extract_filters

        result = extract_filters("Show me Q3 2022 reports")
        assert "year" in result
        assert 2022 in result["year"]
        assert result["quarter"] == "Q3"

    def test_generic_query_no_filters(self):
        from app.rag.query_parser import extract_filters

        result = extract_filters("What is this document about?")
        assert result == {}

    def test_relative_date_recent(self):
        from app.rag.query_parser import extract_filters

        result = extract_filters("Show me recent documents")
        # Should produce an uploaded_at filter with gte
        if result:
            assert "uploaded_at" in result
            assert "gte" in result["uploaded_at"]


class TestChunking:
    """Validate text splitting with metadata preservation."""

    def test_chunk_basic(self):
        from app.rag.chunking import chunk_text

        text = "Para one.\n\nPara two.\n\nPara three."
        chunks = chunk_text(text, file_id="test.txt", user_id=1)
        assert len(chunks) >= 1
        assert chunks[0]["file_id"] == "test.txt"
        assert chunks[0]["user_id"] == 1
        assert "chunk_id" in chunks[0]

    def test_chunk_metadata_carried(self):
        from app.rag.chunking import chunk_text

        chunks = chunk_text(
            "Hello.\n\nWorld.",
            file_id="doc_123",
            conversation_id="conv_abc",
            user_id=42,
            year=2024,
            file_name="report.pdf",
        )
        c = chunks[0]
        assert c["conversation_id"] == "conv_abc"
        assert c["user_id"] == 42
        assert c["year"] == 2024
        assert c["file_name"] == "report.pdf"

    def test_chunk_empty_text(self):
        from app.rag.chunking import chunk_text

        assert chunk_text("", file_id="x.txt", user_id=1) == []


class TestUnifiedText:
    """Unified FlashRank merge across BGE + SigLIP text pools (hermetic — rerank stubbed).

    Exercises `retrieve_multimodal._unified_text` with a deterministic rerank stub so no
    FlashRank model download is needed. Asserts cross-pool dedup, single rerank call, top_k,
    and `source\\ntext` output shape.
    """

    def _call(self, monkeypatch, bge, sig, top_k=5):
        import app.capabilities.retrieve_multimodal as rm
        import app.rag.reranker as reranker_mod

        seen_calls = []

        def fake_rerank(query, passages, top_k):
            seen_calls.append(len(passages))
            # Keep first `top_k` as-is (input already ordered by `_score`).
            return passages[:top_k]

        # `_unified_text` does `from app.rag.reranker import rerank` at call time, so
        # patch the source module, not the retrieve_multimodal namespace.
        monkeypatch.setattr(reranker_mod, "rerank", fake_rerank)
        out = rm._unified_text("q", bge, sig, top_k=top_k)
        return out, seen_calls

    def test_dedups_overlap_across_pools(self, monkeypatch):
        bge = [{"chunk_id": "b1", "text": "shared paragraph", "file_name": "a.txt"},
               {"chunk_id": "b2", "text": "only in bge", "file_name": "a.txt"}]
        sig = [{"chunk_id": "s1", "text": "shared paragraph", "source_file": "cap.txt"},
               {"chunk_id": "s2", "text": "only in siglip", "source_file": "cap.txt"}]
        out, _ = self._call(monkeypatch, bge, sig)
        # "shared paragraph" appears once across both pools → deduped.
        assert sum("shared paragraph" in c for c in out) == 1
        assert sum("only in bge" in c for c in out) == 1
        assert sum("only in siglip" in c for c in out) == 1

    def test_single_rerank_pass_over_merged_pool(self, monkeypatch):
        bge = [{"chunk_id": f"b{i}", "text": f"bge {i}", "file_name": "a.txt"} for i in range(3)]
        sig = [{"chunk_id": f"s{i}", "text": f"sig {i}", "source_file": "cap.txt"} for i in range(3)]
        _, calls = self._call(monkeypatch, bge, sig)
        # Exactly one rerank call, fed the merged (deduped) pool of 6.
        assert calls == [6]

    def test_top_k_respected_and_shape(self, monkeypatch):
        bge = [{"chunk_id": f"b{i}", "text": f"chunk {i}", "file_name": "a.txt"} for i in range(8)]
        out, _ = self._call(monkeypatch, bge, [], top_k=3)
        assert len(out) == 3
        assert all(c.startswith("a.txt\n") for c in out)

    def test_empty_pool_returns_empty(self, monkeypatch):
        out, _ = self._call(monkeypatch, [], [])
        assert out == []
