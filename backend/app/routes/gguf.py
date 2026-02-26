"""
GGUF Model Management Routes
Unified GGUF model operations with WebSocket support
"""
from fastapi import APIRouter, WebSocket, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse
import os
import shutil
from typing import Dict, List
from pathlib import Path

from app.services.gguf_resolver import gguf_resolver
from app.services.gguf_downloader import gguf_downloader
from app.services.gguf_manager import list_local_models, delete_local_model, validate_gguf_file, get_model_metadata
from app.hardware.detection import check_gguf_compatibility

router = APIRouter(prefix="/api/models")

@router.post("/resolve")
async def resolve_gguf_model(resolve_request: dict):
    """
    Resolve HuggingFace repo, tag, or URL to GGUF files
    
    Request:
    {
        "input": "huggingface/repo", 
        "input": "huggingface/repo:tag",
        "input": "https://huggingface.co/repo/resolve/main/model.gguf"
    }
    
    Response:
    {
        "type": "repository" | "direct" | "error",
        "repo_id": "string",  // for repository type
        "tag": "string",      // for repository type  
        "files": [            // for repository type
            {
                "filename": "model.gguf",
                "url": "https://...",
                "size": 123456789,
                "human_size": "1.2GB",
                "compatibility": {
                    "compatibility": "compatible" | "warning" | "incompatible",
                    "vram_ok": true,
                    "cpu_ram_ok": true,
                    "warnings": ["warning message"],
                    "requirements": {
                        "vram_gb_required": 4.2,
                        "cpu_ram_gb_required": 8.4,
                        "note": "Estimates based on model size"
                    },
                    "hardware": {
                        "gpu_available": true,
                        "gpu_vram_gb": 8.0,
                        "cpu_ram_gb": 16.0
                    }
                }
            }
        ],
        "file_url": "string",  // for direct type
        "filename": "string",  // for direct type
        "size": 123456789,     // for direct type
        "human_size": "1.2GB", // for direct type
        "compatibility": {...} // for direct type
    }
    """
    try:
        input_str = resolve_request.get("input", "").strip()
        if not input_str:
            raise HTTPException(status_code=400, detail="Input parameter is required")
        
        result = gguf_resolver.resolve_model(input_str)
        
        if result.get("type") == "error":
            raise HTTPException(status_code=400, detail=result.get("error", "Resolution failed"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in resolve endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/download")
async def start_gguf_download(download_request: dict):
    """
    Start GGUF download with WebSocket progress tracking
    
    Request:
    {
        "file_url": "https://huggingface.co/.../model.gguf",
        "filename": "model.gguf"  // optional, will be extracted from URL if not provided
    }
    
    Response:
    {
        "task_id": "uuid-string",
        "status": "starting",
        "websocket_url": "/api/models/download-ws/{task_id}"
    }
    """
    try:
        file_url = download_request.get("file_url", "").strip()
        filename = download_request.get("filename", "").strip()
        
        if not file_url:
            raise HTTPException(status_code=400, detail="file_url parameter is required")
        
        # Extract filename from URL if not provided
        if not filename:
            from urllib.parse import urlparse
            parsed_url = urlparse(file_url)
            filename = Path(parsed_url.path).name
            if not filename.endswith('.gguf'):
                filename = f"model_{filename}.gguf"
        
        # Validate filename
        if not filename.endswith('.gguf'):
            raise HTTPException(status_code=400, detail="Filename must end with .gguf")
        
        # Start download
        task_id = await gguf_downloader.start_download(file_url, filename)
        
        return {
            "task_id": task_id,
            "status": "starting",
            "websocket_url": f"/api/models/download-ws/{task_id}",
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")

@router.websocket("/download-ws/{task_id}")
async def download_progress_websocket(websocket: WebSocket, task_id: str):
    """
    WebSocket endpoint for real-time download progress
    
    Connects to: ws://localhost:8000/api/models/download-ws/{task_id}
    
    Messages received:
    {
        "task_id": "string",
        "status": "starting" | "downloading" | "completed" | "failed" | "exists" | "cancelled",
        "progress": 0-100,
        "downloaded_bytes": 123456,
        "total_bytes": 123456789,
        "filename": "model.gguf",
        "error": "error message"  // only for failed status
    }
    """
    await websocket.accept()
    
    try:
        # Register WebSocket for this task
        await gguf_downloader.register_websocket(task_id, websocket)
        
        # Keep connection alive and handle messages
        while True:
            # Wait for any message (client can send ping or other messages)
            data = await websocket.receive_text()
            
            # Client can send "close" to disconnect
            if data.strip().lower() == "close":
                break
                
            # Client can send "cancel" to cancel download
            if data.strip().lower() == "cancel":
                gguf_downloader.cancel_download(task_id)
                break
    
    except WebSocketDisconnect:
        # Client disconnected normally
        pass
    except Exception as e:
        logger.error(f"WebSocket error for task {task_id}: {e}")
    finally:
        # Unregister WebSocket
        gguf_downloader.unregister_websocket(task_id, websocket)

@router.get("/download/status/{task_id}")
async def get_download_status(task_id: str):
    """
    Get download task status via HTTP (alternative to WebSocket)
    
    Response:
    {
        "task_id": "string",
        "status": "starting" | "downloading" | "completed" | "failed" | "exists" | "cancelled",
        "progress": 0-100,
        "downloaded_bytes": 123456,
        "total_bytes": 123456789,
        "filename": "model.gguf",
        "error": "error message"  // only for failed status
    }
    """
    status = gguf_downloader.get_download_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Download task not found")
    
    return status

@router.delete("/{model_name}")
async def delete_gguf_model(model_name: str):
    """
    Delete local GGUF model
    
    Response:
    {
        "status": "success" | "error",
        "message": "Model deleted successfully" | "Error message"
    }
    """
    try:
        # Validate model name
        if not model_name.endswith('.gguf'):
            model_name = f"{model_name}.gguf"
        
        result = delete_local_model(model_name)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message", "Delete failed"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting model {model_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {str(e)}")

@router.post("/upload")
async def upload_gguf_model(file: UploadFile = File(...)):
    """
    Upload GGUF model file
    
    Response:
    {
        "status": "success" | "error",
        "filename": "uploaded_model.gguf",
        "size": 123456789,
        "message": "Upload successful" | "Error message"
    }
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.endswith('.gguf'):
            raise HTTPException(status_code=400, detail="Only .gguf files are allowed")
        
        # Define upload directory
        upload_dir = Path(__file__).parent.parent.parent / "models"
        upload_dir.mkdir(exist_ok=True)
        
        file_path = upload_dir / file.filename
        
        # Check if file already exists
        if file_path.exists():
            raise HTTPException(status_code=400, detail=f"File {file.filename} already exists")
        
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Validate the GGUF file
        validation_result = validate_gguf_file(str(file_path))
        if not validation_result.get("valid", False):
            # Delete invalid file
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid GGUF file: {validation_result.get('error', 'Unknown error')}"
            )
        
        file_size = file_path.stat().st_size
        
        return {
            "status": "success",
            "filename": file.filename,
            "size": file_size,
            "human_size": gguf_resolver._format_file_size(file_size),
            "message": "File uploaded successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/compatibility/{model_name}")
async def check_model_compatibility(model_name: str):
    """
    Check hardware compatibility for local GGUF model
    
    Response:
    {
        "compatible": true | false,
        "warnings": ["warning messages"],
        "requirements": {
            "vram_gb_required": 4.2,
            "cpu_ram_gb_required": 8.4
        },
        "hardware": {
            "gpu_available": true,
            "gpu_vram_gb": 8.0,
            "cpu_ram_gb": 16.0
        }
    }
    """
    try:
        # Validate model name
        if not model_name.endswith('.gguf'):
            model_name = f"{model_name}.gguf"
        
        models_dir = Path(__file__).parent.parent.parent / "models"
        model_path = models_dir / model_name
        
        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Check compatibility
        compatibility = check_gguf_compatibility(str(model_path))
        
        return compatibility
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking compatibility for {model_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Compatibility check failed: {str(e)}")

@router.get("/local")
async def list_local_gguf_models():
    """
    List local GGUF models (delegates to existing local_models endpoint)
    
    Response: {"models": [...]}
    """
    models = list_local_models()
    return {"models": models}

# Import logger at module level
import logging
logger = logging.getLogger(__name__)
