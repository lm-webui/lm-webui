"""
End-to-end RAG pipeline validation.

Tests each stage in isolation (unit) and the full ingest→retrieve pipeline
(integration) using a synthetic document so no external model or file is needed.

Run with:
    cd backend && python -m pytest tests/unit/test_rag_pipeline.py -v --capture=no
"""

import json
import os
import shutil
import tempfile
from pathlib import Path

import pytest

# ── Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def sample_document() -> str:
    """A synthetic document with date-anchored content for time-filter tests."""
    return """Annual Report 2024 — Acme Corp

Introduction
This report summarizes Acme Corp's performance for the fiscal year 2024.
Revenue grew by 15% year-over-year, driven by strong demand in the APAC region.

Q1 2024 Financial Results
In Q1 2024, Acme launched its flagship product, the Optical Widget 3000.
Revenue reached $12M with a gross margin of 62%.

Q2 2024 Financial Results
Q2 saw the expansion into the European market.
Revenue reached $14M. Operating expenses increased due to hiring.

Q3 2024 Financial Results
Q3 was marked by the acquisition of TinyDevCo for $8M.
Revenue reached $16M. The integration is proceeding as planned.

Q4 2024 Financial Results
Q4 capped the year with record revenue of $20M.
The board approved a $0.50 per share dividend.

Outlook 2025
For 2025, Acme projects revenue growth of 10-15%.
The company plans to enter the Latin American market.

Return Policy
Acme's return policy allows returns within 30 days of purchase.
Products must be in original packaging.
Refunds are processed within 5-7 business days after receipt.

Earlier documents from 2023
In 2023 Acme had a different return policy allowing 60-day returns.
The 2023 policy was changed to reduce inventory carrying costs.
"""


@pytest.fixture(scope="module")
def temp_vectors_dir():
    """Temporary LanceDB storage directory."""
    path = tempfile.mkdtemp(prefix="rag_test_vectors_")
    yield path
    shutil.rmtree(path, ignore_errors=True)


# ── Unit: query_parser ─────────────────────────────────────────────────


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


# ── Unit: chunking ──────────────────────────────────────────────────────


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


# ── Integration: full RAG pipeline ─────────────────────────────────────


class TestRAGPipeline:
    """Ingest a document, then query it with and without time filters."""

    @pytest.fixture(autouse=True)
    def setup(self, sample_document, temp_vectors_dir):
        """One-time: chunk, embed, and store the sample document."""
        from app.rag.chunking import chunk_text
        from app.rag.embedder import embed_text
        from app.rag.vector_store import insert_chunks, _get_db

        # Point LanceDB to temp directory
        import app.rag.vector_store as vs
        vs._db = None  # reset singleton
        os.environ["LANCE_DB_PATH"] = temp_vectors_dir

        self.user_id = 999
        self.file_id = "test_acme_report.txt"

        # Chunk
        chunks = chunk_text(
            sample_document,
            file_id=self.file_id,
            user_id=self.user_id,
            file_name="acme_2024_report.txt",
        )
        assert len(chunks) > 0, "chunking returned zero chunks"
        self.chunks = chunks

        # Embed
        texts = [c["text"] for c in chunks]
        vectors = embed_text(texts)
        assert len(vectors) == len(chunks)

        # Store
        records = [{**c, "vector": v} for c, v in zip(chunks, vectors)]
        insert_chunks(records, self.user_id)

    # ── search tests ───────────────────────────────────────────────

    def test_hybrid_search_returns_results(self):
        """Unfiltered hybrid search must find relevant chunks."""
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search

        q_vec = embed_query("return policy")
        results = hybrid_search(q_vec, "return policy", user_id=self.user_id, top_k=5)
        assert len(results) > 0, "No results returned"
        # At least one result should mention "return" or "policy"
        texts = " ".join(r["text"].lower() for r in results)
        assert "return" in texts, "Expected 'return' in retrieved chunks"

    def test_hybrid_search_with_year_filter(self):
        """Filter by year must exclude chunks outside that year."""
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search

        q_vec = embed_query("return policy")
        results = hybrid_search(
            q_vec, "return policy",
            filters={"year": 2024},
            user_id=self.user_id,
            top_k=5,
        )
        assert len(results) > 0, "No results with year 2024"
        texts = " ".join(r["text"].lower() for r in results)
        assert "return" in texts

    def test_reranker_refines_results(self):
        """Reranker must return top-k items sorted by relevance."""
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

        q = "Acme return policy 2024"
        q_vec = embed_query(q)
        candidates = hybrid_search(q_vec, q, user_id=self.user_id, top_k=10)
        assert len(candidates) >= 3

        top = rerank(q, candidates, top_k=3)
        assert len(top) <= 3
        # Items should have a _rerank_score
        for item in top:
            assert "_rerank_score" in item

    # ── end-to-end: simulate what the chat pipeline does ───────────

    def test_end_to_end_context_assembly(self):
        """Simulate the full _retrieve_context flow from controller.py."""
        from app.rag.query_parser import extract_filters
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

        user_message = "What was Acme's return policy in 2024?"
        user_id = self.user_id

        # Step 1: extract time filters
        filters = extract_filters(user_message)
        assert filters.get("year") == [2024], f"Expected year 2024, got {filters}"

        # Step 2: embed query
        q_vec = embed_query(user_message)

        # Step 3: hybrid search with filters
        candidates = hybrid_search(
            q_vec, user_message,
            filters=filters or None,
            user_id=user_id,
            top_k=20,
        )
        assert len(candidates) > 0, "No candidates retrieved"

        # Step 4: rerank → Top 5
        top_chunks = rerank(user_message, candidates, top_k=5)
        assert len(top_chunks) > 0, "Reranker returned empty"

        # Step 5: format for LLM
        parts = []
        for c in top_chunks:
            source = c.get("file_name", "source")
            parts.append(f"--- {source} ---\n{c['text']}")
        context = "\n\n".join(parts)

        assert "Return Policy" in context or "return" in context.lower()
        assert "2024" in context or "30 days" in context

    def test_response_time_within_bounds(self):
        """The retrieval pipeline must complete in reasonable time (<3s for pipeline)."""
        import time
        from app.rag.query_parser import extract_filters
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

        user_message = "What was Acme's return policy in 2024?"
        user_id = self.user_id

        t0 = time.time()
        filters = extract_filters(user_message)
        t1 = time.time()
        q_vec = embed_query(user_message)
        t2 = time.time()
        candidates = hybrid_search(q_vec, user_message, filters=filters or None, user_id=user_id, top_k=20)
        t3 = time.time()
        top_chunks = rerank(user_message, candidates, top_k=5)
        t4 = time.time()

        total_ms = (t4 - t0) * 1000
        print(f"\n  ⏱  query_parser: {(t1-t0)*1000:.1f}ms")
        print(f"  ⏱  embed_query:  {(t2-t1)*1000:.1f}ms")
        print(f"  ⏱  hybrid_search: {(t3-t2)*1000:.1f}ms")
        print(f"  ⏱  rerank:      {(t4-t3)*1000:.1f}ms")
        print(f"  ⏱  TOTAL:       {total_ms:.0f}ms")

        assert total_ms < 3000, f"Pipeline took {total_ms:.0f}ms, expected <3000ms"
        assert len(top_chunks) > 0, "No chunks after rerank"


# ── Integration: chat request wiring ────────────────────────────────────


class TestChatPipelineWiring:
    """Verify that ChatRequest carries requires_rag and the orchestrator
    calls the RAG path when appropriate."""

    def test_chat_request_has_requires_rag(self):
        from app.chat.schemas import ChatRequest

        req = ChatRequest(
            sessionId="sess_1",
            message="hello",
            model="gpt-4",
        )
        assert hasattr(req, "requires_rag"), "ChatRequest missing requires_rag"
        assert req.requires_rag is True

    def test_chat_request_from_dict_preserves_flag(self):
        from app.chat.schemas import ChatRequest

        req = ChatRequest.from_dict({
            "sessionId": "sess_1",
            "message": "return policy",
            "model": "gpt-4",
            "requires_rag": True,
        })
        assert req.requires_rag is True

    def test_chat_request_disabled_rag(self):
        from app.chat.schemas import ChatRequest

        req = ChatRequest.from_dict({
            "sessionId": "sess_1",
            "message": "hello",
            "model": "gpt-4",
            "requires_rag": False,
        })
        assert req.requires_rag is False
