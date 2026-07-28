"""
LanceDB vector store with hybrid search and metadata filtering.

Provides per-user tables with LanceModel schema, CRUD operations,
and hybrid search (vector ANN + full-text) fused via Reciprocal Rank Fusion.
"""

import os
import logging
from typing import Any

import lancedb
from lancedb.pydantic import LanceModel, Vector

logger = logging.getLogger(__name__)

# ── Schema ──────────────────────────────────────────────────────────────


class ChunkModel(LanceModel):
    """A single chunk stored in LanceDB."""

    chunk_id: str
    text: str
    vector: Vector(384)
    file_id: str
    conversation_id: str | None = None
    user_id: int
    year: int | None = None
    uploaded_at: str | None = None
    file_name: str | None = None
    chunk_index: int | None = None


# ── Connection ──────────────────────────────────────────────────────────

_db: lancedb.DBConnection | None = None


def _get_db() -> lancedb.DBConnection:
    global _db
    if _db is not None:
        return _db
    path = os.environ.get("LANCE_DB_PATH", "/backend/data/vectors")
    os.makedirs(path, exist_ok=True)
    _db = lancedb.connect(path)
    logger.info("LanceDB connected at %s", path)
    return _db


def _table_name(user_id: int) -> str:
    return f"chunks_{user_id}"


def _get_table(user_id: int) -> Any:
    db = _get_db()
    name = _table_name(user_id)
    try:
        return db.open_table(name)
    except Exception:
        logger.info("Creating table %s for user %d", name, user_id)
        return db.create_table(name, schema=ChunkModel)


# ── Public API ──────────────────────────────────────────────────────────


def insert_chunks(records: list[dict[str, Any]], user_id: int) -> int:
    """Insert chunk records into the user's LanceDB table.

    Parameters
    ----------
    records : list[dict]
        Each dict must contain at least ``text`` and ``vector``.
        All other ``ChunkModel`` fields are optional.
    user_id : int
        Owner of the table.

    Returns
    -------
    int
        Number of records inserted.
    """
    table = _get_table(user_id)
    table.add(records)
    logger.info("Inserted %d chunks for user %d", len(records), user_id)
    return len(records)


def delete_file_chunks(file_id: str, user_id: int) -> int:
    """Remove all chunks belonging to a specific file."""
    table = _get_table(user_id)
    result = table.delete(f"file_id = '{file_id}'")
    logger.info("Deleted chunks for file %s (user %d)", file_id, user_id)
    return result


def hybrid_search(
    query_vector: list[float],
    query_text: str,
    filters: dict[str, Any] | None = None,
    user_id: int = 1,
    top_k: int = 20,
) -> list[dict[str, Any]]:
    """Hybrid vector + full-text search with optional metadata filters.

    Uses LanceDB's built-in vector ANN and FTS, then merges via RRF.

    Parameters
    ----------
    query_vector : list[float]
        384-dim query embedding from ``embedder.embed_query()``.
    query_text : str
        Raw user query for FTS keyword matching.
    filters : dict or None
        Metadata filters to apply via ``.where()``.
    user_id : int
        Table owner.
    top_k : int
        Number of results to return after RRF fusion.

    Returns
    -------
    list[dict]
        Each dict matches ``ChunkModel`` fields plus a ``_score`` key.
    """
    table = _get_table(user_id)

    # --- Vector search ---
    vec_query = table.search(query_vector).metric("cosine")
    if filters:
        vec_query = vec_query.where(_build_where(filters))
    try:
        vec_results = vec_query.limit(top_k * 2).to_list()
    except Exception:
        vec_results = []

    # --- Full-text search ---
    try:
        fts_query = table.search(query_text).fts("text")
        if filters:
            fts_query = fts_query.where(_build_where(filters))
        fts_results = fts_query.limit(top_k * 2).to_list()
    except Exception:
        fts_results = []

    # --- RRF merge ---
    return _rrf_merge(vec_results, fts_results, top_k)


def _build_where(filters: dict[str, Any]) -> str:
    """Convert a filter dict to a LanceDB ``.where()`` expression string.

    Supports:
        ``{"year": 2024}``                   → ``year = 2024``
        ``{"year": [2022, 2024]}``           → ``year IN (2022, 2024)``
        ``{"uploaded_at": {"gte": "2026-01-01"}}`` → ``uploaded_at >= '2026-01-01'``
    """
    clauses: list[str] = []
    for field, value in filters.items():
        if isinstance(value, dict):
            for op, val in value.items():
                sql_op = {"gte": ">=", "gt": ">", "lte": "<=", "lt": "<"}.get(op, "=")
                clauses.append(f"{field} {sql_op} '{val}'")
        elif isinstance(value, list):
            formatted = ", ".join(str(v) for v in value)
            clauses.append(f"{field} IN ({formatted})")
        else:
            clauses.append(f"{field} = {value}")
    return " AND ".join(clauses)


def _rrf_merge(
    vec_results: list[dict],
    fts_results: list[dict],
    top_k: int,
    k: int = 60,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}

    for rank, doc in enumerate(vec_results):
        cid = doc.get("chunk_id", doc.get("_id", str(id(doc))))
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
        doc["_score"] = 0.0

    for rank, doc in enumerate(fts_results):
        cid = doc.get("chunk_id", doc.get("_id", str(id(doc))))
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)

    # Merge scores back and sort.
    seen: dict[str, dict] = {}
    for doc in vec_results + fts_results:
        cid = doc.get("chunk_id", doc.get("_id", str(id(doc))))
        if cid not in seen:
            seen[cid] = dict(doc)
            seen[cid]["_score"] = scores.get(cid, 0)

    ranked = sorted(seen.values(), key=lambda x: x["_score"], reverse=True)
    return ranked[:top_k]
