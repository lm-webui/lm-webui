"""retrieve capability — RAG retrieval (knowledge search) into ctx.context."""
from __future__ import annotations

import asyncio
import logging

from .base import CapabilityContext, get_user_api_key
from .results import RetrievalResult

logger = logging.getLogger(__name__)


async def execute(ctx: CapabilityContext) -> RetrievalResult:
    """Optional query rewrite, then RAG retrieval in a worker thread."""
    rag_query = ctx.chat_request.message
    try:
        from app.core.config_manager import get_config as _gc
        rag_cfg = _gc().rag
    except Exception:
        rag_cfg = None

    if rag_cfg is not None and getattr(rag_cfg, "enabled", False) and getattr(rag_cfg, "query_rewrite", False) and ctx.conversation_id:
        try:
            from app.chat.service import get_last_n_messages
            from app.rag.query_rewriter import rewrite_query
            _key = get_user_api_key(ctx.user_id, ctx.provider_id)
            history = get_last_n_messages(ctx.conversation_id, n=6)
            rag_query = await rewrite_query(ctx.chat_request.message, history, ctx.provider, ctx.model_id, _key)
        except Exception as exc:
            logger.warning("Query rewrite skipped: %s", exc)
            rag_query = ctx.chat_request.message

    chunks = await asyncio.to_thread(_retrieve, rag_query, ctx.user_id, ctx.conversation_id)
    return RetrievalResult(chunks=chunks)


def _retrieve_raw(user_message: str, user_id: int, conversation_id: str | None) -> list[dict]:
    """Retrieval up to the candidate pool: filters -> embed -> hybrid RRF -> dedup.

    Returns raw chunk dicts (``chunk_id``/``text``/``file_name``/``_score``), pre-rerank
    and pre-format, so callers can merge pools across BGE + SigLIP before ranking.
    """
    try:
        from app.core.config_manager import get_config
        cfg = get_config()
        if not cfg.rag.enabled:
            return []
    except Exception:
        return []

    try:
        from app.rag.query_parser import extract_filters
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search

        filters = extract_filters(user_message)
        query_vec = embed_query(user_message)
        scope_conv = getattr(cfg.rag, "scope", "user") == "conversation"
        candidates = hybrid_search(
            query_vec, user_message,
            filters=filters or None,
            user_id=user_id,
            top_k=getattr(cfg.rag, "top_k_retrieval", 20),
            conversation_id=conversation_id if scope_conv else None,
        )
        if not candidates:
            return []

        # Dedup BEFORE rerank (None-safe key) so the reranker's top-k slots aren't wasted.
        seen: set = set()
        unique: list = []
        for c in candidates:
            cid = c.get("chunk_id") or hash(c.get("text", ""))
            if cid in seen:
                continue
            seen.add(cid)
            unique.append(c)
        return unique
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return []


def _format_chunks(top_chunks: list[dict]) -> list[str]:
    """Budget-limit and format reranked candidates into un-numbered ``source\\ntext`` chunks."""
    try:
        from app.core.config_manager import get_config
        cfg = get_config()
    except Exception:
        cfg = None
    budget = getattr(cfg.rag, "context_token_budget", 2000) if cfg is not None else 2000

    parts: list[str] = []
    used = 0
    for c in top_chunks:
        source = c.get("file_name") or c.get("source_file") or "source"
        formatted = f"{source}\n{c.get('text', '')}"
        approx = max(1, len(formatted) // 3)
        if used + approx > budget:
            break
        used += approx
        parts.append(formatted)
    return parts


def _retrieve(user_message: str, user_id: int, conversation_id: str | None) -> list[str]:
    """Legacy BGE-only RAG path: raw pool -> its own rerank -> formatted chunks.

    Returns un-numbered ``source\\ntext`` chunks; the prompt builder numbers them.
    """
    candidates = _retrieve_raw(user_message, user_id, conversation_id)
    if not candidates:
        return []
    from app.rag.reranker import rerank
    top = rerank(user_message, candidates, top_k=5) or candidates[:5]
    return _format_chunks(top)
