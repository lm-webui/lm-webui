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
from .retrieve import _retrieve  # reuse the existing BGE deep-text pipeline

logger = logging.getLogger(__name__)


def _multimodal_enabled() -> bool:
    try:
        from app.core.config_manager import get_config
        return get_config().rag.is_multimodal
    except Exception:
        return False


async def execute(ctx: CapabilityContext) -> MultimodalResult:
    """Run BGE deep-text + SigLIP short-text + SigLIP cross-modal vision, then fuse."""
    query = (ctx.chat_request.message or "").strip()
    if not query or not _multimodal_enabled():
        return MultimodalResult()

    # Parallel retrieval: BGE deep-text + SigLIP short-text/vision run concurrently
    # (each off the event loop) so one doesn't wait on the other.
    deep_text, sig = await asyncio.gather(
        asyncio.to_thread(_retrieve, query, ctx.user_id, ctx.conversation_id),
        asyncio.to_thread(_siglip_retrieve, query, ctx.user_id, ctx.conversation_id),
    )

    return MultimodalResult(text_chunks=(deep_text or []) + sig["short_texts"], image_refs=sig["image_refs"])


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

        # Short-semantic text search.
        text_rows = vs.search_text(qvec, query, user_id, top_k=5, filters=filters)
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


def _dedup_texts(rows: list[dict]) -> list[str]:
    """Keep unique short-text chunks (by chunk_id/text)."""
    seen: set = set()
    out: list[str] = []
    for r in rows or []:
        text = (r.get("text") or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out
