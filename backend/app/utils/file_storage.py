"""
File Storage Utilities for Local File Persistence
Handles downloading and storing generated content locally
"""

import os
import uuid
import base64
import requests
from datetime import datetime
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

async def download_and_save_image(image_url: str, conversation_id: str, prompt: str, model: str) -> str:
    """
    Download an image from URL and save it locally in the generated directory
    
    Args:
        image_url: URL of the image to download
        conversation_id: Conversation ID for organization
        prompt: Image generation prompt for filename
        model: Model used for generation
    
    Returns:
        Local file path relative to generated directory
    """
    try:
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = uuid.uuid4().hex[:8]
        
        # Create safe filename from prompt (first 20 chars, alphanumeric only)
        safe_prompt = "".join(c for c in prompt[:20] if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_prompt = safe_prompt.replace(' ', '_') if safe_prompt else "image"
        
        filename = f"{conversation_id}_{timestamp}_{safe_prompt}_{file_hash}.jpg"
        
        from app.core.config_manager import get_media_dir
        media_dir = get_media_dir()
        generated_dir = media_dir / "generated" / "images"
        generated_dir.mkdir(parents=True, exist_ok=True)

        local_path = generated_dir / filename

        # Download image
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        # Save locally
        with open(local_path, 'wb') as f:
            f.write(response.content)
        
        logger.info(f"✅ Image saved locally: {local_path}")
        return f"/generated/images/{filename}"

    except Exception as e:
        logger.error(f"❌ Failed to download and save image: {str(e)}")
        raise

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

async def save_generated_document(content: bytes, conversation_id: str, file_type: str, title: str = "") -> str:
    """
    Save generated document content locally
    
    Args:
        content: Document content bytes
        conversation_id: Conversation ID for organization
        file_type: Type of document (docx, xlsx, etc.)
        title: Document title for filename
    
    Returns:
        Local file path relative to generated directory
    """
    try:
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_hash = uuid.uuid4().hex[:8]
        
        # Create safe filename
        safe_title = "".join(c for c in title[:30] if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_title = safe_title.replace(' ', '_') if safe_title else "document"
        
        filename = f"{conversation_id}_{timestamp}_{safe_title}_{file_hash}.{file_type}"
        
        from app.core.config_manager import get_media_dir
        media_dir = get_media_dir()
        generated_dir = media_dir / "generated" / "documents"
        generated_dir.mkdir(parents=True, exist_ok=True)
        
        local_path = generated_dir / filename
        
        # Save locally
        with open(local_path, 'wb') as f:
            f.write(content)
        
        logger.info(f"✅ Document saved locally: {local_path}")
        return f"/generated/documents/{filename}"
        
    except Exception as e:
        logger.error(f"❌ Failed to save generated document: {str(e)}")
        raise

async def save_file_to_database(
    user_id: int,
    conversation_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    file_size: int,
    metadata: dict = None
) -> str:
    """
    Save file metadata to database files table
    
    Args:
        user_id: User ID
        conversation_id: Conversation ID
        filename: Original filename
        file_path: Local file path
        file_type: File type (image/document/audio/video)
        file_size: File size in bytes
        metadata: Additional metadata dictionary
    
    Returns:
        File ID from database
    """
    try:
        from app.database import get_db
        import json
        
        db = get_db()
        
        metadata_json = json.dumps(metadata) if metadata else "{}"
        cur = db.execute("""
            INSERT INTO files (user_id, conversation_id, filename, file_path, file_type,
                file_size, status, summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (user_id, conversation_id, filename, file_path, file_type, file_size, "completed", metadata_json))
        db.commit()
        file_id = cur.lastrowid
        logger.info(f"✅ Saved file metadata to database: {filename} (ID: {file_id})")
        return file_id
        
    except Exception as e:
        logger.error(f"❌ Failed to save file to database: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise

async def get_file_metadata(file_id: str) -> dict:
    """
    Get file metadata from database
    
    Args:
        file_id: File ID
    
    Returns:
        File metadata dictionary
    """
    try:
        from app.database import get_db
        import json
        
        db = get_db()
        
        result = db.execute("""
            SELECT id, user_id, conversation_id, filename, file_path, file_type,
                   file_size, status, summary, created_at, updated_at
            FROM files WHERE id = ?
        """, (file_id,)).fetchone()

        if not result:
            raise ValueError(f"File not found: {file_id}")

        metadata = json.loads(result[8]) if result[8] else {}
        
        return {
            "id": result[0],
            "user_id": result[1],
            "conversation_id": result[2],
            "filename": result[3],
            "file_path": result[4],
            "file_type": result[5],
            "file_size": result[6],
            "status": result[7],
            "metadata": metadata,
            "created_at": result[9],
            "updated_at": result[10]
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get file metadata: {str(e)}")
        raise

async def link_file_to_message(file_id: str, message_id: str) -> bool:
    """
    Link a file to a message in file_references table
    
    Args:
        file_id: File ID
        message_id: Message ID
    
    Returns:
        Success status
    """
    try:
        from app.database import get_db
        
        db = get_db()
        
        # Get file info
        file_info = await get_file_metadata(file_id)
        
        # Insert into file_references table
        db.execute("""
            INSERT INTO file_references (
                conversation_id, user_id, message_id, file_type, file_path, metadata
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            file_info["conversation_id"],
            file_info["user_id"],
            message_id,
            file_info["file_type"],
            file_info["file_path"],
            json.dumps(file_info["metadata"]) if file_info["metadata"] else "{}"
        ))
        db.commit()
        
        logger.info(f"✅ Linked file {file_id} to message {message_id}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to link file to message: {str(e)}")
        return False

def get_file_size(file_path: str) -> int:
    """
    Get file size in bytes
    
    Args:
        file_path: Path to the file
    
    Returns:
        File size in bytes
    """
    try:
        return os.path.getsize(file_path)
    except Exception as e:
        logger.error(f"❌ Failed to get file size for {file_path}: {str(e)}")
        return 0

async def cleanup_conversation_files(conversation_id: str):
    """
    Clean up all files associated with a conversation
    
    Args:
        conversation_id: Conversation ID to clean up
    """
    try:
        # Get all files for this conversation from database
        from app.database.sqlite.files import get_db
        db = get_db()
        
        files = db.execute(
            "SELECT local_file_path FROM media_library WHERE conversation_id = ?",
            (conversation_id,)
        ).fetchall()
        
        # Delete local files
        for file_record in files:
            local_path = file_record[0]
            if local_path and os.path.exists(local_path):
                try:
                    os.remove(local_path)
                    logger.info(f"🗑️  Cleaned up file: {local_path}")
                except Exception as e:
                    logger.error(f"⚠️ Failed to delete file {local_path}: {str(e)}")
        
        logger.info(f"✅ Cleaned up files for conversation: {conversation_id}")
        
    except Exception as e:
        logger.error(f"❌ Failed to cleanup conversation files: {str(e)}")
