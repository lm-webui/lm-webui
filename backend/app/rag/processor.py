"""
RAG ingestion processor.
Orchestrates the upload → text-extract → chunk → embed → LanceDB pipeline.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class RAGProcessor:
    """Processes uploaded files into the LanceDB vector store."""

    def __init__(self) -> None:
        self._ready = False

    def ensure_ready(self) -> None:
        """Lazy-init: import and validate that all sub-modules load."""
        if self._ready:
            return
        # BGE deep-text (used by both engines — retrieve_multimodal reuses it).
        from app.rag import embedder  # noqa: F401
        from app.rag import vector_store  # noqa: F401
        try:
            from app.rag.embedder_multimodal import multimodal_enabled, embed_text_multimodal
            multimodal = multimodal_enabled()
        except Exception:
            multimodal = False
        if multimodal:
            # Pre-warm the SigLIP multimodal model so the first query/upload is fast.
            try:
                embed_text_multimodal(["warm"])  # cached; loads weights into RAM
            except Exception as exc:
                logger.warning("SigLIP pre-warm failed: %s", exc)

        self._ready = True
        logger.info("RAGProcessor ready (%s)", "multimodal (BGE + SigLIP)" if multimodal else "BGE-small")

    def process_file(
        self,
        file_path: str,
        file_name: str,
        conversation_id: str | None = None,
        user_id: int = 1,
    ) -> dict[str, Any]:
        """Run the full ingestion pipeline for a single file.

        Parameters
        ----------
        file_path : str
            Absolute path to the stored file on disk.
        file_name : str
            Original filename (for citation metadata).
        conversation_id : str or None
            Scope chunks to a conversation.
        user_id : int
            Owner of the file.

        Returns
        -------
        dict
            ``{"status": "ok", "chunks": N}`` or ``{"status": "error", "message": …}``.
        """
        self.ensure_ready()

        # 1. Reuse the text already extracted and stored by the upload-time
        #    FileProcessor task (avoids a second extraction/OCR per file).
        try:
            from app.database import get_db
            db = get_db()
            try:
                row = db.execute(
                    "SELECT extracted_text FROM media_library WHERE file_path = ?",
                    (file_path,),
                ).fetchone()
            finally:
                db.close()
            text = (row[0] if row and row[0] else "") or ""
            if not text:
                return {"status": "skipped", "reason": "no extractable text"}
        except Exception as exc:
            logger.warning("Failed to read extracted text for %s: %s", file_path, exc)
            return {"status": "error", "message": str(exc)}

        # Truncate to reasonable max (fastembed has a 512-token limit per segment;
        # chunking will split further, but cap the raw input).
        text = text[:100_000]

        # 2. Chunk (honor configured chunk size/overlap). Audio is skipped here — its
        #    placeholder text isn't real content; the transcript path (multimodal ingest)
        #    handles audio. BGE deep-text indexing below runs for docs/images only.
        from pathlib import Path as _Path
        is_audio = _Path(file_path).suffix.lower() in self._AUDIO_EXT

        from app.core.config_manager import get_config
        from app.rag.chunking import chunk_text

        try:
            rag_cfg = get_config().rag
            chunk_size = rag_cfg.chunk_size
            chunk_overlap = rag_cfg.chunk_overlap
        except Exception:
            chunk_size, chunk_overlap = 512, 64

        chunks = [] if is_audio else chunk_text(
            text,
            file_id=file_path,
            conversation_id=conversation_id,
            user_id=user_id,
            file_name=file_name,
            chunk_size=chunk_size,
            overlap=chunk_overlap,
        )
        if not is_audio and not chunks:
            return {"status": "skipped", "reason": "text too short to chunk"}

        # 3. Embed.
        from app.rag.embedder import embed_text

        texts = [c["text"] for c in chunks]
        vectors = embed_text(texts)

        # 4. Store in LanceDB.
        from app.rag.vector_store import insert_chunks

        records = []
        for chunk, vec in zip(chunks, vectors):
            records.append({**chunk, "vector": vec})

        count = insert_chunks(records, user_id)

        # Architecture B (multimodal): also ingest into the SigLIP latent tables when
        # RAG is on and SigLIP is available. Docs get short SigLIP chunks/captions;
        # images get a vision row + a text anchor. BGE deep-text indexing above is kept.
        try:
            from app.rag.embedder_multimodal import multimodal_enabled
            multimodal = multimodal_enabled()
        except Exception:
            multimodal = False
        if multimodal:
            self._ingest_multimodal(file_path, file_name, text, chunks, conversation_id, user_id)

        logger.info("Indexed %d chunks from %s", count, file_name)
        return {"status": "ok", "chunks": count}

    # ── Architecture B: multimodal latent ingestion ─────────────────────────

    _IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'}
    _AUDIO_EXT = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'}

    @classmethod
    def _short_text(cls, text: str, n: int) -> str:
        """A concise SigLIP unit: first sentence, truncated to n words."""
        import re
        text = (text or "").strip()
        if not text:
            return ""
        first = (re.split(r"(?<=[.!?])\s+", text)[0] or text).strip()
        words = first.split()
        return first if len(words) <= n else " ".join(words[:n])

    def _ingest_multimodal(
        self,
        file_path: str,
        file_name: str,
        text: str,
        chunks: list[dict],
        conversation_id: str | None,
        user_id: int,
    ) -> None:
        """Add SigLIP short-text rows (docs) / vision + text-anchor rows (images)."""
        from pathlib import Path
        from app.core.config_manager import get_config
        from app.rag.embedder_multimodal import embed_image, embed_text_multimodal
        from app.rag import vector_store_multimodal as vs

        try:
            short_n = get_config().rag.multimodal.short_chunk_words
        except Exception:
            short_n = 50

        n_vis = n_txt = 0
        suffix = Path(file_path).suffix.lower()
        try:
            if suffix in self._AUDIO_EXT:
                # Audio: ASR → text into latent_text (gated on audio config + ASR availability).
                try:
                    a_cfg = get_config().rag.multimodal.audio
                except Exception:
                    a_cfg = None
                if a_cfg is not None and getattr(a_cfg, "enabled", False):
                    from app.services.audio_transcriber import transcribe
                    transcript = transcribe(file_path, a_cfg.asr_provider, a_cfg.asr_model)
                    if transcript:
                        cap = self._short_text(transcript, short_n)
                        v = embed_text_multimodal([cap])[0]
                        vs.insert_text_rows([{
                            "chunk_id": f"{file_path}_audiotxt",
                            "text": cap,
                            "vector": v,
                            "file_id": file_path,
                            "user_id": user_id,
                            "conversation_id": conversation_id,
                            "source_file": file_name,
                            "media_path": file_path,
                            "chunk_index": 0,
                        }], user_id)
                        n_txt += 1
                # Audio is never a doc — return whether or not ASR ran.
                return
            elif suffix in self._IMAGE_EXT:
                # Vision row for cross-modal retrieval.
                vec = embed_image([file_path])[0]
                cap = self._short_text(text, short_n)
                vs.insert_vision_rows([{
                    "chunk_id": f"{file_path}_img",
                    "media_path": file_path,
                    "vector": vec,
                    "file_id": file_path,
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "payload_text": cap or None,
                }], user_id)
                n_vis += 1
                # Text anchor so the image is also text-retrievable (OCR caption).
                if cap:
                    v = embed_text_multimodal([cap])[0]
                    vs.insert_text_rows([{
                        "chunk_id": f"{file_path}_imgtxt",
                        "text": cap,
                        "vector": v,
                        "file_id": file_path,
                        "user_id": user_id,
                        "conversation_id": conversation_id,
                        "source_file": file_name,
                        "media_path": file_path,
                        "chunk_index": 0,
                    }], user_id)
                    n_txt += 1
            else:
                # Short SigLIP unit per BGE chunk (first sentence, ≤ short_n words).
                pairs = [(c, self._short_text(c.get("text", ""), short_n)) for c in chunks]
                pairs = [(c, s) for c, s in pairs if s]
                if pairs:
                    vecs = embed_text_multimodal([s for _, s in pairs])
                    records = [{
                        "chunk_id": f"{c['chunk_id']}_siglip",
                        "text": s,
                        "vector": vec,
                        "file_id": c.get("file_id", file_path),
                        "user_id": user_id,
                        "conversation_id": c.get("conversation_id", conversation_id),
                        "source_file": file_name,
                        "media_path": None,
                        "chunk_index": c.get("chunk_index"),
                    } for (c, s), vec in zip(pairs, vecs)]
                    n_txt += vs.insert_text_rows(records, user_id)
        except Exception as exc:
            logger.warning("Multimodal ingest failed for %s: %s", file_path, exc)
            return

        logger.info("Multimodal ingest: %d vision rows, %d text rows for %s", n_vis, n_txt, file_name)
