"""
Shared save pipeline for generated images.
Saves directly to media_library — no conversation, no messages, no files table.
Gallery is the single source of truth.
"""
import logging
import os
import json
from app.core.config_manager import get_media_dir
from app.utils.file_storage import save_image_data
from app.database import get_db

logger = logging.getLogger(__name__)


async def save_generated_image(
    image_bytes: bytes,
    user_id: int,
    prompt: str,
    model: str,
    provider: str,
    params: dict = None,
) -> dict:
    """Save a generated image to disk + media_library."""
    image_url = await save_image_data(
        image_data=image_bytes,
        conversation_id=f"gen_{os.urandom(4).hex()}",
        prompt=prompt,
        model=model,
    )

    try:
        media_dir = get_media_dir()
        filename = image_url.split("/")[-1]
        physical_path = os.path.join(str(media_dir), "generated", "images", filename)
        generation_params = json.dumps(params or {})

        db = get_db()
        db.execute(
            """INSERT INTO media_library (user_id, filename, file_path, file_type, file_size,
               media_type, generation_params)
               VALUES (?, ?, ?, ?, ?, 'image', ?)""",
            (user_id, filename, physical_path, "image/png", len(image_bytes), generation_params),
        )
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save image metadata: {e}", exc_info=True)

    return {"image_url": image_url}
