"""
Embedding wrapper around fastembed.
Downloads and caches BAAI/bge-small-en-v1.5 ONNX model on first use.
"""

import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

_model = None


def _get_model():
    """Lazy-load the embedding model (cached after first call)."""
    global _model
    if _model is not None:
        return _model

    from fastembed import TextEmbedding

    cache_dir = os.environ.get(
        "FASTEMBED_CACHE_PATH",
        "/backend/data/cache/fastembed",
    )
    os.makedirs(cache_dir, exist_ok=True)
    logger.info("Loading embedding model BAAI/bge-small-en-v1.5 ...")
    _model = TextEmbedding(
        "BAAI/bge-small-en-v1.5",
        cache_dir=cache_dir,
    )
    logger.info("Embedding model ready (384-dim, %d MB cache)", 67)
    return _model


def embed_text(texts: list[str]) -> list[list[float]]:
    """Embed a list of document chunks.

    Parameters
    ----------
    texts : list[str]
        Chunk strings to embed.

    Returns
    -------
    list[list[float]]
        384-dim vectors, one per input text.
    """
    model = _get_model()
    return list(model.embed(texts))


def embed_query(query: str) -> list[float]:
    """Embed a single user query string.

    Returns
    -------
    list[float]
        Single 384-dim vector.
    """
    model = _get_model()
    return list(model.query_embed(query))[0]
