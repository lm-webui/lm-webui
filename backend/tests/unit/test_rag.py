"""Tests for RAG chunking (app.rag.chunking.chunk_text).

The old `add_context_to_chunks` / `generate_summary` helpers were removed;
chunk_text now returns metadata-carrying dicts and requires `file_id`.
"""
import pytest
from app.rag.chunking import chunk_text


class TestChunkText:
    def test_chunk_empty_text(self):
        assert chunk_text("", file_id="x.txt") == []

    def test_chunk_short_text(self):
        result = chunk_text("This is a short text.", file_id="a.txt", chunk_size=100)
        assert len(result) == 1
        assert result[0]["text"] == "This is a short text."

    def test_chunk_metadata_carried(self):
        result = chunk_text("Hello world.", file_id="doc_1", user_id=7, year=2024, file_name="r.pdf")
        c = result[0]
        assert c["file_id"] == "doc_1"
        assert c["user_id"] == 7
        assert c["year"] == 2024
        assert c["file_name"] == "r.pdf"
        assert "chunk_id" in c and "chunk_index" in c

    def test_chunk_multiple_paragraphs(self):
        text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        result = chunk_text(text, file_id="a.txt", chunk_size=100)
        full = " ".join(c["text"] for c in result)
        assert "First paragraph" in full
        assert "Second paragraph" in full
        assert "Third paragraph" in full

    def test_chunk_long_text_splits(self):
        text = "This is sentence one. This is sentence two. " * 200
        result = chunk_text(text, file_id="a.txt", chunk_size=500, overlap=50)
        assert len(result) >= 2
        for c in result:
            # chunks may carry up to `overlap` chars from the previous chunk
            assert len(c["text"]) <= 500 + 50

    def test_chunk_preserves_line_ending_normalization(self):
        text = "Line one.\r\n\r\nLine two."
        result = chunk_text(text, file_id="a.txt", chunk_size=100)
        assert len(result) >= 1
        assert all("\r" not in c["text"] for c in result)

    def test_chunk_index_is_sequential(self):
        result = chunk_text("A. B. C. " * 300, file_id="a.txt", chunk_size=500, overlap=50)
        indices = [c["chunk_index"] for c in result]
        assert indices == list(range(len(result)))
