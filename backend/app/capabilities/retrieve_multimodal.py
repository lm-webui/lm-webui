"""retrieve_multimodal capability — Architecture B latent retrieval.

Combines three retrieval streams into one `MultimodalResult`:
  1. BGE deep-text search (`chunks_*`) — long-context text RAG.
  2. SigLIP short-text search (`latent_text`) — short semantic matches.
  3. SigLIP cross-modal vision search (`latent_vision`) — matching images/diagrams.

SigLIP embeddings run in a worker thread (`asyncio.to_thread`) so GPU/CPU inference
never blocks the async event loop. Results are dedup/grouped by `file_id`/`media_path`
before being handed to the model.
"""
from __future__ import annotations

import asyncio
import logging

from .base import CapabilityContext
from .results import MultimodalResult
from .retrieve import _retrieve_raw, _format_chunks  # reuse the existing BGE deep-text pipeline

logger = logging.getLogger(__name__)


def _multimodal_enabled() -> bool:
    """True when the multimodal pipeline should run: RAG on AND SigLIP available."""
    try:
        from app.rag.embedder_multimodal import multimodal_enabled
        return multimodal_enabled()
    except Exception:
        return False


async def execute(ctx: CapabilityContext) -> MultimodalResult:
    """Run BGE deep-text + SigLIP short-text + SigLIP cross-modal vision, then fuse."""
    query = (ctx.chat_request.message or "").strip()
    if not query or not _multimodal_enabled():
        return MultimodalResult()

    # Parallel retrieval: BGE deep-text + SigLIP short-text/vision run concurrently
    # (each off the event loop) so one doesn't wait on the other.
    deep, sig = await asyncio.gather(
        asyncio.to_thread(_retrieve_raw, query, ctx.user_id, ctx.conversation_id),
        asyncio.to_thread(_siglip_retrieve, query, ctx.user_id, ctx.conversation_id),
    )

    # Merge BGE + SigLIP text pools and run ONE unified FlashRank pass for the top-K
    # text context. Vision refs ride through on their native vector path (not reranked).
    text_chunks = _unified_text(query, deep, sig["short_texts"])
    return MultimodalResult(text_chunks=text_chunks, image_refs=sig["image_refs"])


def _siglip_retrieve(query: str, user_id: int, conversation_id: str | None) -> dict:
    """SigLIP short-text + vision retrieval. Runs in a worker thread."""
    try:
        from app.rag.embedder_multimodal import embed_text_multimodal
        from app.rag import vector_store_multimodal as vs

        qvec = embed_text_multimodal([query])[0]
        filters = {"conversation_id": conversation_id} if conversation_id else None

        # Cross-modal vision search — a SigLIP text query finds matching images.
        vision_rows = vs.search_vision(qvec, user_id, top_k=5, filters=filters)
        image_refs = _dedup_images(vision_rows)

        # Short-semantic text search — pool sized above final top_k so the unified
        # FlashRank pass has candidates to pick among.
        text_rows = vs.search_text(qvec, query, user_id, top_k=10, filters=filters)
        short_texts = _dedup_texts(text_rows)

        return {"short_texts": short_texts, "image_refs": image_refs}
    except Exception as exc:
        logger.warning("SigLIP multimodal retrieval failed: %s", exc)
        return {"short_texts": [], "image_refs": []}


def _dedup_images(rows: list[dict]) -> list[dict]:
    """Group by media_path — keep the top-ranked row per image (avoid duplicate context)."""
    seen: dict[str, dict] = {}
    for r in rows or []:
        path = r.get("media_path") or r.get("file_id")
        if not path or path in seen:
            continue
        seen[path] = {
            "media_path": path,
            "file_id": r.get("file_id"),
            "caption": r.get("payload_text") or r.get("text") or "",
            "score": r.get("_score", 0.0),
        }
    return list(seen.values())


def _dedup_texts(rows: list[dict]) -> list[dict]:
    """Keep unique short-text chunks (dedup by text), preserving row metadata.

    Returns dicts (not bare strings) so the unified FlashRank pass can merge them with
    the BGE pool and keep each row's source metadata through reranking.
    """
    seen: set = set()
    out: list[dict] = []
    for r in rows or []:
        text = (r.get("text") or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(dict(r))
    return out


def _unified_text(
    query: str,
    bge_candidates: list[dict],
    siglip_candidates: list[dict],
    top_k: int | None = None,
) -> list[str]:
    """Merge the BGE + SigLIP text pools, dedup overlapping text, ONE FlashRank pass.

    Returns the top-K text context formatted as ``source\\ntext`` chunks (budget-limited).
    """
    from app.core.config_manager import get_config
    from app.rag.reranker import rerank

    cfg = get_config().rag
    top_k = top_k or getattr(cfg, "top_k_rerank", 5)

    seen: set = set()
    merged: list[dict] = []
    for c in list(bge_candidates or []) + list(siglip_candidates or []):
        text = (c.get("text") or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        merged.append(dict(c))
    if not merged:
        return []

    top = rerank(query, merged, top_k=top_k) or merged[:top_k]
    return _format_chunks(top)
