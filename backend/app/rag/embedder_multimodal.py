"""
SigLIP2 text embedder (Architecture B — multimodal latent retrieval).

Encodes SHORT text units (≤~50 words) / 1-sentence captions and the query into the
shared SigLIP latent space (768-dim) so they can be cosine-matched against SigLIP
*image* embeddings (cross-modal) and other short semantic text.

SigLIP is a contrastive vision-language model — good on short self-contained units,
weak on long passages. Keep deep long-context text search on BGE (`embedder.py`);
use this only for short chunks, captions, and the cross-modal query.
"""
import logging

logger = logging.getLogger(__name__)

_model = None
_processor = None


def _load() -> None:
    """Lazy-load SigLIP2 model + processor (shared with the vision embedder)."""
    global _model, _processor
    if _model is not None:
        return
    from app.core.config_manager import get_config
    try:
        model_name = get_config().rag.multimodal.vision_model or "google/siglip2-base-patch16-224"
    except Exception:
        model_name = "google/siglip2-base-patch16-224"

    from transformers import AutoModel, AutoProcessor
    logger.info("Loading SigLIP text model %s ...", model_name)
    _model = AutoModel.from_pretrained(model_name).eval()
    _processor = AutoProcessor.from_pretrained(model_name)
    logger.info("SigLIP text model ready")


def embed_text_multimodal(texts: list[str]) -> list[list[float]]:
    """Embed short texts (chunks/captions) into 768-dim SigLIP vectors."""
    _load()
    import torch
    with torch.no_grad():
        inputs = _processor(text=list(texts), padding="max_length", return_tensors="pt")
        embeds = _model.get_text_features(**inputs)
    return embeds.detach().cpu().float().tolist()


def embed_query(query: str) -> list[float]:
    """Embed a single short query into a 768-dim SigLIP vector."""
    return embed_text_multimodal([query])[0]
