"""
Text chunking for RAG ingestion.
Splits extracted text into overlapping chunks for embedding and retrieval.

Strategy: recursive paragraph split with configurable chunk_size and overlap.
"""

import re
import logging
from typing import Any

logger = logging.getLogger(__name__)


def chunk_text(
    text: str,
    file_id: str,
    conversation_id: str | None = None,
    user_id: int = 1,
    year: int | None = None,
    uploaded_at: str | None = None,
    file_name: str | None = None,
    chunk_size: int = 512,
    overlap: int = 64,
) -> list[dict[str, Any]]:
    """Split extracted text into overlapping chunks.

    Each chunk carries metadata so LanceDB can filter by file, conversation,
    user, time period, and source.

    Parameters
    ----------
    text : str
        Raw extracted text (from file_processor).
    file_id : str
        Identifier linking back to media_library or files table.
    conversation_id : str or None
        Scope chunk to a conversation.
    user_id : int
        Owner of the file.
    year : int or None
        Extracted from the file's upload date (for time-filtered search).
    uploaded_at : str or None
        ISO-8601 timestamp of upload.
    file_name : str or None
        Original filename for display in citations.
    chunk_size : int
        Target character length per chunk.
    overlap : int
        Number of characters to carry from the end of the previous chunk.

    Returns
    -------
    list[dict]
        Each dict has keys: chunk_id, text, file_id, conversation_id, user_id,
        year, uploaded_at, file_name, chunk_index.
    """
    if not text:
        return []

    # Split on double newlines (paragraphs), then flatten long paragraphs.
    paragraphs = _split_paragraphs(text)

    chunks: list[dict[str, Any]] = []
    buffer: list[str] = []
    buffer_size = 0
    chunk_index = 0

    for para in paragraphs:
        para_len = len(para)

        # If a single paragraph exceeds chunk_size, force-split it.
        if para_len > chunk_size:
            # Flush any existing buffer first.
            if buffer:
                chunks.append(_make_chunk(chunk_index, file_id, conversation_id,
                                           user_id, year, uploaded_at, file_name,
                                           "\n\n".join(buffer)))
                chunk_index += 1
                buffer = []
                buffer_size = 0

            # Split the long paragraph into smaller pieces.
            for sub_para in _split_long_paragraph(para, chunk_size, overlap):
                chunks.append(_make_chunk(chunk_index, file_id, conversation_id,
                                           user_id, year, uploaded_at, file_name,
                                           sub_para))
                chunk_index += 1
            continue

        # If adding this paragraph exceeds chunk_size, finalise the current chunk.
        if buffer and buffer_size + para_len > chunk_size:
            chunks.append(_make_chunk(chunk_index, file_id, conversation_id,
                                       user_id, year, uploaded_at, file_name,
                                       "\n\n".join(buffer)))
            chunk_index += 1
            # Keep trailing overlap from the end of the buffer.
            buffer = _tail_overlap(buffer, overlap)
            buffer_size = sum(len(p) for p in buffer)

        buffer.append(para)
        buffer_size += para_len

    # Final chunk.
    if buffer:
        chunks.append(_make_chunk(chunk_index, file_id, conversation_id,
                                   user_id, year, uploaded_at, file_name,
                                   "\n\n".join(buffer)))

    logger.info("Chunked into %d chunks (size=%d, overlap=%d)", len(chunks), chunk_size, overlap)
    return chunks


# ── Internal helpers ────────────────────────────────────────────────────


def _make_chunk(
    idx: int, file_id: str, conversation_id: str | None,
    user_id: int, year: int | None, uploaded_at: str | None,
    file_name: str | None, text: str,
) -> dict[str, Any]:
    return {
        "chunk_id": f"{file_id}_{idx}",
        "text": text.strip(),
        "file_id": file_id,
        "conversation_id": conversation_id,
        "user_id": user_id,
        "year": year,
        "uploaded_at": uploaded_at,
        "file_name": file_name or "unknown",
        "chunk_index": idx,
    }


def _split_paragraphs(text: str) -> list[str]:
    """Split on double newlines, strip whitespace, drop empties."""
    import re
    raw = re.split(r"\n\s*\n", text)
    return [p.strip() for p in raw if p.strip()]


def _split_long_paragraph(para: str, chunk_size: int, overlap: int) -> list[str]:
    """Force-split a paragraph that exceeds chunk_size."""
    sentences = re.split(r"(?<=[.?!])\s+", para)
    parts: list[str] = []
    buf: list[str] = []
    buf_len = 0

    for sent in sentences:
        if buf and buf_len + len(sent) > chunk_size:
            parts.append(" ".join(buf))
            buf = _tail_overlap_text(buf, overlap)
            buf_len = sum(len(s) for s in buf)
        buf.append(sent)
        buf_len += len(sent)
    if buf:
        parts.append(" ".join(buf))
    return parts


def _tail_overlap(buffer: list[str], overlap_chars: int) -> list[str]:
    """Keep enough trailing paragraphs to fill *overlap_chars*."""
    return _tail_overlap_text(buffer, overlap_chars)


def _tail_overlap_text(buffer: list[str], overlap_chars: int) -> list[str]:
    """Keep enough trailing items to fill *overlap_chars*."""
    tail: list[str] = []
    size = 0
    for item in reversed(buffer):
        if size + len(item) > overlap_chars and tail:
            break
        tail.insert(0, item)
        size += len(item)
    return tail
