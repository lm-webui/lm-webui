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

    retrieved = await asyncio.to_thread(_retrieve, rag_query, ctx.user_id, ctx.conversation_id)
    chunks = [c for c in retrieved.split("\n\n") if c.strip()] if retrieved else []
    return RetrievalResult(chunks=chunks)


def _retrieve(user_message: str, user_id: int, conversation_id: str | None) -> str:
    """RAG pipeline: filters -> embed -> hybrid search -> rerank -> numbered context."""
    try:
        from app.core.config_manager import get_config
        cfg = get_config()
        if not cfg.rag.enabled:
            return ""
    except Exception:
        return ""

    try:
        from app.rag.query_parser import extract_filters
        from app.rag.embedder import embed_query
        from app.rag.vector_store import hybrid_search
        from app.rag.reranker import rerank

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
            return ""

        # Dedup BEFORE rerank (None-safe key) so the reranker's top-k slots aren't wasted.
        seen: set = set()
        unique: list = []
        for c in candidates:
            cid = c.get("chunk_id") or hash(c.get("text", ""))
            if cid in seen:
                continue
            seen.add(cid)
            unique.append(c)

        top_chunks = rerank(user_message, unique, top_k=5) or unique[:5]

        budget = getattr(cfg.rag, "context_token_budget", 2000)
        parts: list[str] = []
        used = 0
        n = 0
        for c in top_chunks:
            text = c.get("text", "")
            source = c.get("file_name", "source")
            formatted = f"[{n+1}] {source}\n{text}"
            approx = max(1, len(formatted) // 3)
            if used + approx > budget:
                break
            used += approx
            n += 1
            parts.append(formatted)
        return "\n\n".join(parts) if parts else ""
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return ""
