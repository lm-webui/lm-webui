"""
File Storage Utility for Local Image Persistence
Handles storing generated image data locally.
"""
import uuid
import base64
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def save_image_data(image_data: bytes, conversation_id: str, prompt: str, model: str) -> str:
    """Save image data to local file system. Returns relative URL path."""
    try:
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = uuid.uuid4().hex[:8]

        # Create safe filename from prompt (first 20 chars, alphanumeric only)
        safe_prompt = "".join(c for c in prompt[:20] if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_prompt = safe_prompt.replace(' ', '_') if safe_prompt else "image"

        filename = f"{conversation_id}_{timestamp}_{safe_prompt}_{file_hash}.png"

        from app.core.config_manager import get_media_dir
        media_dir = get_media_dir()
        generated_dir = media_dir / "generated" / "images"
        generated_dir.mkdir(parents=True, exist_ok=True)

        local_path = generated_dir / filename

        # Handle different data types
        if isinstance(image_data, bytes):
            # Check if it's already raw binary image data (PNG magic number: 0x89 0x50 0x4E 0x47)
            if len(image_data) >= 8 and image_data[:8] == b'\x89PNG\r\n\x1a\n':
                # Raw PNG data - save directly
                logger.info("✅ Saving raw PNG binary data directly")
                with open(local_path, 'wb') as f:
                    f.write(image_data)
            else:
                # Try to decode as base64
                try:
                    # Convert bytes to string for base64 processing
                    image_data_str = image_data.decode('utf-8')

                    # Clean base64 data (remove data URI prefix if present)
                    if image_data_str.startswith('data:image/'):
                        # Extract base64 data from data URI
                        image_data_str = image_data_str.split(',', 1)[1]

                    # Decode base64 and save
                    decoded_data = base64.b64decode(image_data_str)
                    with open(local_path, 'wb') as f:
                        f.write(decoded_data)
                    logger.info("✅ Base64 image data decoded and saved")

                except (UnicodeDecodeError, base64.binascii.Error):
                    # If base64 decoding fails, try saving as raw binary
                    logger.info("⚠️ Data is not base64, saving as raw binary")
                    with open(local_path, 'wb') as f:
                        f.write(image_data)
        else:
            # Handle string input (base64)
            image_data_str = str(image_data)

            # Clean base64 data (remove data URI prefix if present)
            if image_data_str.startswith('data:image/'):
                # Extract base64 data from data URI
                image_data_str = image_data_str.split(',', 1)[1]

            # Decode base64 and save
            decoded_data = base64.b64decode(image_data_str)
            with open(local_path, 'wb') as f:
                f.write(decoded_data)
            logger.info("✅ Base64 image data decoded and saved")

        logger.info(f"✅ Image saved locally: {local_path}")
        return f"/generated/images/{filename}"

    except Exception as e:
        logger.error(f"❌ Failed to save image data: {str(e)}")
        raise
