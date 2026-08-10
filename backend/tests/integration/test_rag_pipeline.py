"""
Integration: full RAG ingest->retrieve pipeline.

Downloads embedding (BAAI/bge-small-en-v1.5) and rerank (ms-marco-MultiBERT-L-12)
models from HuggingFace on first run (cached afterward). Excluded from the
default hermetic unit run via `-m "not integration"` in pytest.ini.
Run explicitly with:
    cd backend && venv/bin/python -m pytest -m integration
"""
import json
import os
import shutil
import tempfile
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def sample_document() -> str:
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
    path = tempfile.mkdtemp(prefix="rag_test_vectors_")
    yield path
    shutil.rmtree(path, ignore_errors=True)


class TestRAGPipeline:
    """Ingest a document, then query it with and without time filters."""

    @pytest.fixture(autouse=True)
    def setup(self, sample_document, temp_vectors_dir):
        from app.rag.chunking import chunk_text
        from app.rag.embedder import embed_text
        from app.rag.vector_store import insert_chunks

        import app.rag.vector_store as vs
        vs._db = None  # reset singleton
        os.environ["LANCE_DB_PATH"] = temp_vectors_dir

        self.user_id = 999
        self.file_id = "test_acme_report.txt"

        chunks = chunk_text(
            sample_document,
            file_id=self.file_id,
            user_id=self.user_id,
            file_name="acme_2024_report.txt",
        )
        assert len(chunks) > 0, "chunking returned zero chunks"
        self.chunks = chunks

        texts = [c["text"] for c in chunks]
        vectors = embed_text(texts)
        assert len(vectors) == len(chunks)

        records = [{**c, "vector": v} for c, v in zip(chunks, vectors)]
        insert_chunks(records, self.user_id)

    def test_hybrid_search_returns_results(self):
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search

        q_vec = embed_query("return policy")
        results = hybrid_search(q_vec, "return policy", user_id=self.user_id, top_k=5)
        assert len(results) > 0, "No results returned"
        texts = " ".join(r["text"].lower() for r in results)
        assert "return" in texts, "Expected 'return' in retrieved chunks"

    def test_hybrid_search_with_year_filter(self):
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
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

        q = "Acme return policy 2024"
        q_vec = embed_query(q)
        candidates = hybrid_search(q_vec, q, user_id=self.user_id, top_k=10)
        assert len(candidates) >= 3

        top = rerank(q, candidates, top_k=3)
        assert len(top) <= 3
        for item in top:
            assert "_rerank_score" in item

    def test_end_to_end_context_assembly(self):
        from app.rag.query_parser import extract_filters
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

        user_message = "What was Acme's return policy in 2024?"
        user_id = self.user_id

        filters = extract_filters(user_message)
        assert filters.get("year") == [2024], f"Expected year 2024, got {filters}"

        q_vec = embed_query(user_message)
        candidates = hybrid_search(
            q_vec, user_message,
            filters=filters or None,
            user_id=user_id,
            top_k=20,
        )
        assert len(candidates) > 0, "No candidates retrieved"

        top_chunks = rerank(user_message, candidates, top_k=5)
        assert len(top_chunks) > 0, "Reranker returned empty"

        parts = []
        for c in top_chunks:
            source = c.get("file_name", "source")
            parts.append(f"--- {source} ---\n{c['text']}")
        context = "\n\n".join(parts)

        assert "Return Policy" in context or "return" in context.lower()
        assert "2024" in context or "30 days" in context

    def test_response_time_within_bounds(self):
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
        assert total_ms < 3000, f"Pipeline took {total_ms:.0f}ms, expected <3000ms"
        assert len(top_chunks) > 0, "No chunks after rerank"
