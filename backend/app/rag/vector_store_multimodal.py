"""
Multimodal vector store (Architecture B).

Per-modality LanceDB tables (one per user), all in the shared SigLIP 768-dim space so
a SigLIP text query can be cosine-matched against both text and image rows:

    latent_text_{user}   → SigLIP text rows (short chunks / captions), hybrid vector+FTS
    latent_vision_{user} → SigLIP image rows (media_path, optional OCR caption)

Kept as separate tables (not one typed table) because LanceDB has fixed-dim Vector
columns and append-only tables — per-modality tables let you upgrade one encoder
without re-embedding the others. Retrieval RRF-fuses across tables (see
`capabilities/retrieve_multimodal.py`, Phase 3).
"""
import os
import logging
from typing import Any

try:
    import lancedb
    from lancedb.pydantic import LanceModel, Vector
    _LANCE_OK = True
except ImportError:  # pragma: no cover
    lancedb = None
    LanceModel = None
    Vector = None
    _LANCE_OK = False

logger = logging.getLogger(__name__)

_DIM = 768  # SigLIP2-base shared latent dim (text & image)

if _LANCE_OK:
    class TextRow(LanceModel):
        """A short SigLIP-embedded text chunk / caption."""

        chunk_id: str
        text: str
        vector: Vector(_DIM)
        file_id: str
        user_id: int
        conversation_id: str | None = None
        source_file: str | None = None
        media_path: str | None = None
        year: int | None = None
        uploaded_at: str | None = None
        chunk_index: int | None = None

    class VisionRow(LanceModel):
        """A SigLIP-embedded image row."""

        chunk_id: str
        modality: str = "vision"
        media_path: str
        vector: Vector(_DIM)
        file_id: str
        user_id: int
        conversation_id: str | None = None
        payload_text: str | None = None  # OCR caption / text anchor
        uploaded_at: str | None = None
else:
    TextRow = None
    VisionRow = None


_db: Any = None


def _get_db() -> Any:
    global _db
    if not _LANCE_OK:
        raise RuntimeError("lancedb not installed")
    if _db is not None:
        return _db
    from app.core.config_manager import get_data_dir
    default_path = os.path.join(str(get_data_dir()), "vectors")
    path = os.environ.get("LANCE_DB_PATH", default_path)
    os.makedirs(path, exist_ok=True)
    _db = lancedb.connect(path)
    return _db


def _table_name(kind: str, user_id: int) -> str:
    return f"latent_{kind}_{user_id}"


def _get_table(kind: str, user_id: int, schema: Any) -> Any:
    db = _get_db()
    name = _table_name(kind, user_id)
    try:
        return db.open_table(name)
    except Exception:
        logger.info("Creating table %s", name)
        return db.create_table(name, schema=schema)


def _ensure_indexes(table: Any, fts_col: str | None = None) -> None:
    try:
        existing = {getattr(idx, "name", None) for idx in table.list_indices()}
    except Exception:
        existing = set()
    if fts_col and "text_idx" not in existing:
        try:
            table.create_fts_index(fts_col, name="text_idx")
        except Exception as exc:
            logger.warning("FTS index failed: %s", exc)
    if "vector_idx" not in existing:
        try:
            if table.count_rows() > 256:
                table.create_index(metric="cosine", index_type="IVF_PQ", name="vector_idx")
        except Exception as exc:
            logger.warning("Vector index failed: %s", exc)


# ── Insert ──────────────────────────────────────────────────────────────

def insert_text_rows(records: list[dict[str, Any]], user_id: int) -> int:
    if not _LANCE_OK:
        return 0
    try:
        table = _get_table("text", user_id, TextRow)
        table.add(records)
        _ensure_indexes(table, fts_col="text")
        return len(records)
    except Exception as exc:
        logger.warning("Multimodal text insert failed: %s", exc)
        return 0


def insert_vision_rows(records: list[dict[str, Any]], user_id: int) -> int:
    if not _LANCE_OK:
        return 0
    try:
        for rec in records:
            rec.setdefault("modality", "vision")
        table = _get_table("vision", user_id, VisionRow)
        table.add(records)
        _ensure_indexes(table)
        return len(records)
    except Exception as exc:
        logger.warning("Multimodal vision insert failed: %s", exc)
        return 0


# ── Search ──────────────────────────────────────────────────────────────

def search_text(
    query_vector: list[float],
    query_text: str,
    user_id: int,
    top_k: int = 10,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Hybrid vector + FTS search over SigLIP text rows."""
    if not _LANCE_OK:
        return []
    try:
        table = _get_table("text", user_id, TextRow)
    except Exception:
        return []
    vec = _search(table, query_vector, top_k, filters, fts=False)
    fts = _search(table, query_text, top_k, filters, fts=True)
    return _rrf_merge(vec, fts, top_k)


def search_vision(
    query_vector: list[float],
    user_id: int,
    top_k: int = 10,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Vector search over SigLIP vision rows (cross-modal: query is SigLIP text)."""
    if not _LANCE_OK:
        return []
    try:
        table = _get_table("vision", user_id, VisionRow)
    except Exception:
        return []
    return _search(table, query_vector, top_k, filters, fts=False)


def _search(table: Any, query, top_k: int, filters: dict | None, fts: bool) -> list[dict]:
    try:
        q = table.search(query).metric("cosine") if not fts else table.search(query).fts("text")
        if filters:
            q = q.where(_build_where(filters))
        return q.limit(top_k * 2).to_list()
    except Exception:
        return []


def _build_where(filters: dict[str, Any]) -> str:
    clauses = []
    for field, value in filters.items():
        if isinstance(value, list):
            clauses.append(f"{field} IN ({', '.join(str(v) for v in value)})")
        elif isinstance(value, str):
            clauses.append(f"{field} = '{value}'")
        else:
            clauses.append(f"{field} = {value}")
    return " AND ".join(clauses)


def _rrf_merge(a: list[dict], b: list[dict], top_k: int, k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion across two result sets (same as vector_store.py)."""
    scores: dict[str, float] = {}
    for rank, doc in enumerate(a):
        cid = doc.get("chunk_id", str(id(doc)))
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
    for rank, doc in enumerate(b):
        cid = doc.get("chunk_id", str(id(doc)))
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
    seen: dict[str, dict] = {}
    for doc in a + b:
        cid = doc.get("chunk_id", str(id(doc)))
        if cid not in seen:
            seen[cid] = dict(doc)
            seen[cid]["_score"] = scores.get(cid, 0)
    ranked = sorted(seen.values(), key=lambda x: x["_score"], reverse=True)
    return ranked[:top_k]
