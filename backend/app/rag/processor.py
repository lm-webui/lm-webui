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
        # Trigger model loads early so the first upload doesn't pay the cost.
        from app.rag import embedder  # noqa: F401
        from app.rag import vector_store  # noqa: F401

        self._ready = True
        logger.info("RAGProcessor ready (BGE-small + LanceDB)")

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

        # 1. Extract text (reuse existing FileProcessor).
        try:
            from app.services.file_processor import FileProcessor

            extractor = FileProcessor()
            result = extractor.process_file(file_path, conversation_id, user_id)
            text = result.get("text")
            if not text or result.get("status") == "error":
                return {"status": "skipped", "reason": "no extractable text"}
        except Exception as exc:
            logger.warning("Text extraction failed for %s: %s", file_path, exc)
            return {"status": "error", "message": str(exc)}

        # Truncate to reasonable max (fastembed has a 512-token limit per segment;
        # chunking will split further, but cap the raw input).
        text = text[:100_000]

        # 2. Chunk (honor configured chunk size/overlap).
        from app.core.config_manager import get_config
        from app.rag.chunking import chunk_text

        try:
            rag_cfg = get_config().rag
            chunk_size = rag_cfg.chunk_size
            chunk_overlap = rag_cfg.chunk_overlap
        except Exception:
            chunk_size, chunk_overlap = 512, 64

        chunks = chunk_text(
            text,
            file_id=file_path,
            conversation_id=conversation_id,
            user_id=user_id,
            file_name=file_name,
            chunk_size=chunk_size,
            overlap=chunk_overlap,
        )
        if not chunks:
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

        logger.info("Indexed %d chunks from %s", count, file_name)
        return {"status": "ok", "chunks": count}
