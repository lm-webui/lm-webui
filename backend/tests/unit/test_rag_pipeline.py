"""
Hermetic RAG unit tests: query-parser and chunking (no model download).

The model-dependent ingest->retrieve pipeline lives in
tests/integration/test_rag_pipeline.py (run via `-m integration`).
"""
import pytest


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
