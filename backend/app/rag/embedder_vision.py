"""
SigLIP2 vision embedder (Architecture B — multimodal latent retrieval).

Encodes images into the shared SigLIP latent space (768-dim, projected) so a
SigLIP *text* query can find semantically-related images via cosine search.

Loads via transformers (fastembed has no SigLIP model). Lazy-loaded and cached
module-global, like `embedder.py`. Graceful if transformers/the model are missing.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)

_model = None
_processor = None


def _load() -> None:
    """Lazy-load SigLIP2 model + processor (cached after first call)."""
    global _model, _processor
    if _model is not None:
        return
    from app.core.config_manager import get_config
    try:
        model_name = get_config().rag.multimodal.vision_model or "google/siglip2-base-patch16-224"
    except Exception:
        model_name = "google/siglip2-base-patch16-224"

    from transformers import AutoModel, AutoProcessor
    logger.info("Loading SigLIP vision model %s ...", model_name)
    _model = AutoModel.from_pretrained(model_name).eval()
    _processor = AutoProcessor.from_pretrained(model_name)
    logger.info("SigLIP vision model ready")


def embed_image(images: list[Any]) -> list[list[float]]:
    """Embed a list of images (PIL Images or file paths) into 768-dim vectors.

    Returns one 768-dim vector per input image, in the shared SigLIP space.
    """
    _load()
    import torch
    from PIL import Image

    pil_images: list[Any] = []
    for img in images:
        if isinstance(img, (str, bytes)):
            pil_images.append(Image.open(img).convert("RGB") if isinstance(img, str) else Image.open(img))
        else:
            pil_images.append(img.convert("RGB") if hasattr(img, "convert") else img)

    with torch.no_grad():
        inputs = _processor(images=pil_images, return_tensors="pt")
        embeds = _model.get_image_features(**inputs)
    return embeds.detach().cpu().float().tolist()


def is_available() -> bool:
    """True if transformers + torch are importable (SigLIP can load)."""
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
        return False
