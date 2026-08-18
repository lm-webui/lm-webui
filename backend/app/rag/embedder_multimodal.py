"""
SigLIP2 embedder (Architecture B — multimodal latent retrieval).

One lazy-loaded SigLIP model serves both the shared latent space:
  - `embed_text_multimodal` — SHORT text units (≤~50 words) / 1-sentence captions + the query.
  - `embed_image` — images, for cross-modal search (a SigLIP text query finds matching images).

SigLIP is contrastive — strong on short self-contained units, weak on long passages.
Keep deep long-context text search on BGE (`embedder.py`); use this for short chunks,
captions, images, and the cross-modal query. Graceful if transformers/torch are missing.
"""
import logging

logger = logging.getLogger(__name__)

_model = None
_processor = None


def _load() -> None:
    """Lazy-load SigLIP2 model + processor once (shared by text & image embedding)."""
    global _model, _processor
    if _model is not None:
        return
    from app.core.config_manager import get_config
    try:
        model_name = get_config().rag.multimodal.vision_model or "google/siglip2-base-patch16-224"
    except Exception:
        model_name = "google/siglip2-base-patch16-224"

    from transformers.models.siglip.modeling_siglip import SiglipModel
    from transformers.models.siglip.processing_siglip import SiglipProcessor
    logger.info("Loading SigLIP model %s ...", model_name)
    _model = SiglipModel.from_pretrained(model_name).eval()
    _processor = SiglipProcessor.from_pretrained(model_name)
    logger.info("SigLIP model ready")


def _vectors(out) -> list[list[float]]:
    """Pull the 768-dim pooler (or [CLS]) vectors off the GPU and to plain floats."""
    import torch
    embeds = out.pooler_output if getattr(out, "pooler_output", None) is not None else out.last_hidden_state[:, 0]
    return embeds.detach().cpu().float().tolist()


def embed_text_multimodal(texts: list[str]) -> list[list[float]]:
    """Embed short texts (chunks/captions) into 768-dim SigLIP vectors."""
    _load()
    import torch
    with torch.no_grad():
        inputs = _processor(text=list(texts), padding="max_length", return_tensors="pt")
        out = _model.get_text_features(**inputs)
    return _vectors(out)


def embed_image(images: list) -> list[list[float]]:
    """Embed images (PIL Images or file paths) into 768-dim vectors, one per input."""
    _load()
    import torch
    from PIL import Image

    pil_images: list = []
    for img in images:
        if isinstance(img, (str, bytes)):
            pil_images.append(Image.open(img).convert("RGB") if isinstance(img, str) else Image.open(img))
        else:
            pil_images.append(img.convert("RGB") if hasattr(img, "convert") else img)

    with torch.no_grad():
        inputs = _processor(images=pil_images, return_tensors="pt")
        out = _model.get_image_features(**inputs)
    return _vectors(out)


def is_available() -> bool:
    """True if transformers + torch are importable (SigLIP can load)."""
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
        return False


def multimodal_enabled() -> bool:
    """RAG multimodal pipeline active: RAG enabled AND SigLIP embedder available.

    Single source of truth for the planner/retrieval/ingestion gates. When SigLIP isn't
    installed the pipeline auto-falls back to BGE text-only.
    """
    if not is_available():
        return False
    try:
        from app.core.config_manager import get_config
        return bool(get_config().rag.enabled)
    except Exception:
        return False
