"""
Optional second-stage reranker using FlashRank.
Compresses the Top-N retrieval pool down to the Top-K most relevant passages.

By default uses ``ms-marco-MultiBERT-L-12`` (150 MB, multilingual, cross-encoder).
Set ``RERANKER_MODEL=none`` to skip reranking entirely.
"""

import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

_ranker = None
_model_name = None


def _get_ranker():
    """Lazy-load FlashRank ranker (cached)."""
    global _ranker, _model_name

    from app.core.config_manager import get_config
    try:
        cfg_model = get_config().rag.reranker_model
    except Exception:
        cfg_model = None
    _model_name = cfg_model or os.environ.get("RERANKER_MODEL", "ms-marco-MultiBERT-L-12")

    if _model_name.lower() in ("", "none", "false", "0"):
        return None

    if _ranker is not None:
        return _ranker

    from flashrank import Ranker, RerankRequest

    from app.core.config_manager import get_data_dir
    default_cache = os.path.join(str(get_data_dir()), "cache", "flashrank")
    cache_dir = os.environ.get("FLASHRANK_CACHE_PATH", default_cache)
    os.makedirs(cache_dir, exist_ok=True)

    logger.info("Loading reranker %s (%.0f MB) ...", _model_name, 150)
    _ranker = Ranker(model_name=_model_name, cache_dir=cache_dir)
    logger.info("Reranker ready")
    return _ranker


def rerank(
    query: str,
    passages: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Rerank passages by relevance to the query.

    Parameters
    ----------
    query : str
        Original user query.
    passages : list[dict]
        Each dict must have ``chunk_id`` and ``text`` keys.
        Other keys are preserved in the output.
    top_k : int
        Number of passages to keep.

    Returns
    -------
    list[dict]
        Top-*k* passages sorted by relevance (descending), each with a
        ``_rerank_score`` key appended.
    """
    ranker = _get_ranker()
    if ranker is None:
        # Reranking disabled — return top_k as-is.
        return passages[:top_k]

    if not passages:
        return []

    from flashrank import RerankRequest

    # FlashRank expects a specific format.
    flashrank_input = []
    for i, p in enumerate(passages):
        flashrank_input.append({
            "id": p.get("chunk_id", str(i)),
            "text": p.get("text", ""),
            "metadata": {k: v for k, v in p.items() if k not in ("chunk_id", "text")},
        })

    results = ranker.rerank(RerankRequest(query=query, passages=flashrank_input))
    # results is sorted descending by score already.
    top = results[:top_k]

    # Map back to our dict format.
    output = []
    for r in top:
        item = {
            "chunk_id": r["id"],
            "text": r["text"],
            "_rerank_score": r.get("score", 0.0),
        }
        # Merge preserved metadata.
        if "metadata" in r and r["metadata"]:
            item.update(r["metadata"])
        output.append(item)

    return output
