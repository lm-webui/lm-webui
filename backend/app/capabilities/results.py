"""Typed results produced by each capability. The PromptBuilder merges them
into LLM messages — capabilities never build prompt text themselves."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional


@dataclass
class FileResult:
    """Extracted text from document attachments."""
    text: str = ""


@dataclass
class RetrievalResult:
    """RAG chunks retrieved for a knowledge query."""
    chunks: List[str] = field(default_factory=list)


@dataclass
class SearchResult:
    """Web search results."""
    items: List[Any] = field(default_factory=list)
    query: str = ""


@dataclass
class MultimodalResult:
    """Architecture B — retrieved text chunks + matching image refs (cross-modal)."""
    text_chunks: List[str] = field(default_factory=list)
    image_refs: List[Any] = field(default_factory=list)  # {media_path, caption, file_id, score}


@dataclass
class VisionResult:
    """Prepared image attachments + the vision provider to use."""
    images: Optional[List[str]] = None
    provider: Any = None
    ready: bool = False
    text: str = ""  # vision description (two-stage mode: injected into the selected LLM)


@dataclass
class ImageGenResult:
    """Generated image URL (image-generation intent)."""
    image_url: str = ""
    provider: str = ""  # actual image provider (openai/google/comfyui)
    model: str = ""     # actual image model


@dataclass
class TranscriptResult:
    """Transcription of a linked video (YouTube summary path)."""
    text: str = ""
    title: str = ""
    url: str = ""
