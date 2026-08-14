"""ASR transcription shared by RAG audio ingestion and YouTube summaries."""
import logging

logger = logging.getLogger(__name__)

_whisper = None  # cached faster-whisper / openai-whisper model


def transcribe(file_path: str, provider: str = "faster_whisper", model_size: str = "tiny") -> str:
    """Transcribe an audio file to text via the configured ASR provider.

    Returns '' if the provider/model is unavailable (callers degrade gracefully).
    """
    global _whisper
    try:
        if provider == "openai_whisper":
            import whisper
            if _whisper is None:
                _whisper = whisper.load_model(model_size or "tiny")
            return (whisper.transcribe(_whisper, file_path)["text"] or "").strip()
        # default: faster_whisper
        from faster_whisper import WhisperModel
        if _whisper is None:
            _whisper = WhisperModel(model_size or "tiny", device="cpu", compute_type="int8")
        segments, _ = _whisper.transcribe(file_path)
        return " ".join(s.text for s in segments).strip()
    except Exception as exc:
        logger.warning("ASR transcription failed for %s (%s): %s", file_path, provider, exc)
        return ""
