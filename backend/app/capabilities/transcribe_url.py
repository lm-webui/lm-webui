"""transcribe_url capability — download a linked YouTube video's audio and transcribe it.

The transcript is injected into context (not indexed) so the LLM can summarize the video.
Requires yt-dlp + a whisper backend; absent deps degrade gracefully (skip transcription).
"""
from __future__ import annotations

import logging

from .base import CapabilityContext
from .results import TranscriptResult
from app.modality.intent_classifier import YOUTUBE_RE

logger = logging.getLogger(__name__)


def _youtube_id(message: str) -> str | None:
    m = YOUTUBE_RE.search(message or "")
    return m.group(1) if m else None


async def execute(ctx: CapabilityContext) -> TranscriptResult:
    """If the message links a YouTube video, download + transcribe its audio."""
    video_id = _youtube_id(ctx.chat_request.message)
    if not video_id:
        return TranscriptResult()
    try:
        from app.core.config_manager import get_config as _gc
        try:
            a_cfg = _gc().rag.multimodal.audio
            provider, model = a_cfg.asr_provider, a_cfg.asr_model
        except Exception:
            provider, model = "faster_whisper", "tiny"
        if provider == "none":
            return TranscriptResult()

        import tempfile, asyncio, os
        from app.services.audio_transcriber import transcribe
        import yt_dlp

        url = f"https://www.youtube.com/watch?v={video_id}"
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "audio.%(ext)s")
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": out,
                "quiet": True,
                "no_warnings": True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title", "") or ""
                audio_path = next(
                    (os.path.join(tmp, f) for f in os.listdir(tmp) if f.startswith("audio.")),
                    None,
                )
            if not audio_path:
                return TranscriptResult()
            # Transcribe off the event loop.
            text = await asyncio.to_thread(transcribe, audio_path, provider, model)
            if not text.strip():
                return TranscriptResult()
            ctx.transcript = text
            ctx.transcript_title = title
            ctx.transcript_url = url
            return TranscriptResult(text=text, title=title, url=url)
    except Exception as exc:
        logger.warning("YouTube transcription failed: %s", exc)
        return TranscriptResult()
