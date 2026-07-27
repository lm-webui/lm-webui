"""
Dedicated file upload processing routes
Centralizes all file upload functionality with flexible processing options

This is the single upload endpoint for all file types:
- General files (documents, images, spreadsheets) -> RAG processing
- GGUF model files -> Model management system
- Other specialized file types with appropriate routing
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from typing import Optional, List, Dict, Any
import json
import logging
import os
import shutil
from pathlib import Path

from app.rag.processor import RAGProcessor
from app.security.auth.dependencies import get_current_user
from app.database import get_db
from app.core.error_handlers import (
    ValidationException, NotFoundException, BaseAPIException,
    handle_file_processing_error, validate_required_field, validate_file_extension,
    with_error_handling
)
from app.services.gguf_manager import validate_gguf_file
from app.services.gguf_resolver import gguf_resolver
from app.core.config_manager import get_media_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])

# Initialize processor (singleton)
try:
    rag_processor = RAGProcessor()
except Exception as e:
    logger.error(f"Failed to initialize RAGProcessor: {e}")
    rag_processor = None

# Supported file types for general uploads
SUPPORTED_TYPES = {
    'image': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'],
    'document': ['.pdf', '.docx', '.pptx', '.ppt', '.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json'],
    'spreadsheet': ['.xlsx', '.xls', '.csv']
}

# Upload type configurations
UPLOAD_TYPES = {
    'general': {
        'description': 'General files for RAG processing',
        'allowed_extensions': [ext for category in SUPPORTED_TYPES.values() for ext in category],
        'max_size_mb': 100,
        'processor': 'rag_processor'
    },
    'model': {
        'description': 'GGUF model files',
        'allowed_extensions': ['.gguf'],
        'max_size_mb': 10000,  # 10GB for large models
        'processor': 'model_manager',
        'upload_dir': 'models'
    },
    'image_generation': {
        'description': 'Images for generation reference',
        'allowed_extensions': ['.jpg', '.jpeg', '.png', '.webp'],
        'max_size_mb': 20,
        'processor': 'image_processor',
        'upload_dir': 'generated/reference'
    }
}

@router.post("/files")
@with_error_handling(
    error_message="File upload failed",
    error_type="VALIDATION_ERROR",
    status_code=400
)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(..., alias="files"),
    upload_type: str = Form("general"),
    conversation_id: Optional[str] = Form(None),
    metadata: Optional[str] = Form(None),
    user_id: dict = Depends(get_current_user)
):
    """
    Unified file upload endpoint for all file types with authentication.
    
    Parameters:
    - files: List of files to upload
    - upload_type: Type of upload ("general", "model", "image_generation")
    - conversation_id: Optional conversation ID for context
    - metadata: Optional JSON metadata string
    - user_id: Authenticated user from JWT
    
    Returns standardized response with upload results.
    """
    # Validate upload type
    if upload_type not in UPLOAD_TYPES:
        raise ValidationException(
            message=f"Invalid upload type: {upload_type}",
            details={"valid_types": list(UPLOAD_TYPES.keys())}
        )
    
    # Parse metadata if provided
    parsed_metadata = {}
    if metadata:
        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            raise ValidationException(
                message="Invalid metadata JSON",
                details={"metadata": metadata}
            )
    
    # Process files based on upload type
    if upload_type == "general":
        # RBAC Check: Only admin can upload to global Knowledge Base
        if (not conversation_id or conversation_id == "global") and user_id.get("role") != "admin":
            raise HTTPException(
                status_code=403,
                detail="Admin access required for Knowledge Base upload"
            )
            
        return await _handle_general_upload(
            files, background_tasks, conversation_id, parsed_metadata, user_id
        )
    elif upload_type == "model":
        return await _handle_model_upload(files, parsed_metadata, user_id)
    elif upload_type == "image_generation":
        return await _handle_image_generation_upload(
            files, parsed_metadata, user_id
        )
    else:
        # This shouldn't happen due to validation above
        raise ValidationException(
            message=f"Unhandled upload type: {upload_type}",
            details={"upload_type": upload_type}
        )

# Helper functions for different upload types
async def _handle_general_upload(
    files: List[UploadFile],
    background_tasks: BackgroundTasks,
    conversation_id: Optional[str],
    metadata: Dict[str, Any],
    user_id: dict
) -> Dict[str, Any]:
    """Handle general file uploads for RAG processing"""
    results = []
    db = get_db()
    cursor = db.cursor()

    # Ensure uploads directory exists using configuration manager
    media_dir = get_media_dir()
    uploads_dir = media_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        # Validate file
        validate_required_field(file.filename, "filename")
        validate_file_extension(
            file.filename,
            UPLOAD_TYPES['general']['allowed_extensions']
        )
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)

        # Generate unique filename (handle duplicates)
        original_filename = file.filename
        file_extension = original_filename.split('.')[-1] if '.' in original_filename else 'bin'
        filename_without_ext = original_filename.rsplit('.', 1)[0] if '.' in original_filename else original_filename
        
        # Check for existing files and create unique name
        counter = 1
        final_filename = original_filename
        
        while (uploads_dir / final_filename).exists():
            final_filename = f"{filename_without_ext}-{counter}.{file_extension}"
            counter += 1

        # Use Path object for better cross-platform compatibility
        file_path = uploads_dir / final_filename
        
        # Save file to disk
        with open(file_path, "wb") as f:
            f.write(file_content)

        # Determine generic file type for DB
        file_type_db = "document"
        ext = f".{file_extension.lower()}"
        if ext in SUPPORTED_TYPES['image']:
            file_type_db = "image"
        elif ext in SUPPORTED_TYPES['spreadsheet']:
            file_type_db = "spreadsheet"

        # Insert into media library with authenticated user ID
        cursor.execute("""
            INSERT INTO media_library (
                user_id, filename, file_path, file_type, file_size,
                conversation_id, media_type, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            user_id["id"],
            final_filename,
            str(file_path),
            file.content_type,
            file_size,
            conversation_id,
            file_type_db
        ))

        media_id = cursor.lastrowid

        # Trigger Background Processing
        if rag_processor:
            logger.info(f"Queueing RAG processing for {final_filename}")
            background_tasks.add_task(
                rag_processor.process_file,
                str(file_path),
                conversation_id or "global",
                user_id=user_id["id"]
            )
            processing_queued = True
        else:
            logger.warning(f"RAG Processor not initialized, skipping processing for {final_filename}")
            processing_queued = False

        results.append({
            "success": True,
            "filename": final_filename,
            "media_id": media_id,
            "file_path": str(file_path),
            "file_size": file_size,
            "processing_queued": processing_queued,
            "upload_type": "general"
        })

    db.commit()
    
    return {
        "success": True,
        "results": results,
        "total_files": len(results),
        "user_id": user_id["id"],
        "upload_type": "general"
    }

async def _handle_model_upload(
    files: List[UploadFile],
    metadata: Dict[str, Any],
    user_id: dict
) -> Dict[str, Any]:
    """Handle GGUF model file uploads"""
    if len(files) != 1:
        raise ValidationException(
            message="Model upload accepts exactly one file at a time",
            details={"files_count": len(files)}
        )
    
    file = files[0]
    
    # Validate file
    validate_required_field(file.filename, "filename")
    validate_file_extension(
        file.filename,
        UPLOAD_TYPES['model']['allowed_extensions']
    )
    
    # Define upload directory
    upload_dir = Path(__file__).parent.parent.parent / "models"
    upload_dir.mkdir(exist_ok=True)
    
    file_path = upload_dir / file.filename
    
    # Check if file already exists
    if file_path.exists():
        raise ValidationException(
            message=f"File {file.filename} already exists",
            details={"filename": file.filename, "path": str(file_path)}
        )
    
    # Save uploaded file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Validate the GGUF file
    validation_result = validate_gguf_file(str(file_path))
    if not validation_result.get("valid", False):
        # Delete invalid file
        file_path.unlink(missing_ok=True)
        raise ValidationException(
            message=f"Invalid GGUF file: {validation_result.get('error', 'Unknown error')}",
            details={"validation_result": validation_result}
        )
    
    file_size = file_path.stat().st_size
    
    return {
        "success": True,
        "results": [{
            "filename": file.filename,
            "file_path": str(file_path),
            "file_size": file_size,
            "human_size": gguf_resolver._format_file_size(file_size),
            "upload_type": "model",
            "validation": validation_result
        }],
        "total_files": 1,
        "user_id": user_id["id"],
        "upload_type": "model",
        "message": "Model uploaded and validated successfully"
    }

async def _handle_image_generation_upload(
    files: List[UploadFile],
    metadata: Dict[str, Any],
    user_id: dict
) -> Dict[str, Any]:
    """Handle image uploads for generation reference"""
    results = []
    
    # Ensure upload directory exists using configuration manager
    media_dir = get_media_dir()
    uploads_dir = media_dir / "generated" / "reference"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        # Validate file
        validate_required_field(file.filename, "filename")
        validate_file_extension(
            file.filename,
            UPLOAD_TYPES['image_generation']['allowed_extensions']
        )
        
        # Generate unique filename
        original_filename = file.filename
        file_extension = original_filename.split('.')[-1]
        filename_without_ext = original_filename.rsplit('.', 1)[0]
        
        counter = 1
        final_filename = original_filename
        
        while (uploads_dir / final_filename).exists():
            final_filename = f"{filename_without_ext}-{counter}.{file_extension}"
            counter += 1
        
        file_path = uploads_dir / final_filename
        
        # Save file
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        file_size = len(content)
        
        results.append({
            "filename": final_filename,
            "file_path": str(file_path),
            "file_size": file_size,
            "upload_type": "image_generation",
            "url": f"/generated/reference/{final_filename}"
        })
    
    return {
        "success": True,
        "results": results,
        "total_files": len(results),
        "user_id": user_id["id"],
        "upload_type": "image_generation",
        "message": "Images uploaded for generation reference"
    }

@router.get("/files/{file_id}/status")
@with_error_handling(
    error_message="Failed to get upload status",
    error_type="NOT_FOUND_ERROR",
    status_code=404
)
async def get_upload_status(file_id: str, user_id: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT filename, file_path, media_type FROM media_library WHERE id = ? AND user_id = ?", (file_id, user_id["id"]))
    file_record = cursor.fetchone()

    if not file_record:
        raise NotFoundException(
            message="File not found",
            details={"file_id": file_id, "user_id": user_id["id"]}
        )

    return {
        "file_id": file_id,
        "filename": file_record[0],
        "file_path": file_record[1],
        "media_type": file_record[2],
        "status": "processed", # Simplified, ideally we'd check Chroma or a processing_status table
        "user_id": user_id["id"]
    }

@router.delete("/files/{filename}")
@with_error_handling(
    error_message="Failed to delete file",
    error_type="INTERNAL_ERROR",
    status_code=500
)
async def delete_uploaded_file(filename: str, user_id: dict = Depends(get_current_user)):
    """Delete uploaded file from storage and database"""
    validate_required_field(filename, "filename")
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT file_path FROM media_library WHERE filename = ? AND user_id = ?", (filename, user_id["id"]))
    file_record = cursor.fetchone()
    
    if not file_record:
        raise NotFoundException(
            message="File not found",
            details={"filename": filename, "user_id": user_id["id"]}
        )
    
    # Delete file from storage if it exists
    file_path = file_record[0]
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info(f"Deleted file from storage: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete file from storage {file_path}: {e}")
            # Continue with database deletion even if storage deletion fails
    
    # Delete from database
    cursor.execute("DELETE FROM media_library WHERE filename = ? AND user_id = ?", (filename, user_id["id"]))
    db.commit()
    
    return {
        "success": True,
        "message": f"Deleted {filename}",
        "filename": filename,
        "user_id": user_id["id"]
    }

@router.get("/health")
async def health_check():
    return {"status": "healthy", "rag_processor": "ready" if rag_processor else "not_initialized"}
