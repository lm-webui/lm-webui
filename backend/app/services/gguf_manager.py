# Local GGUF model management utility - Consolidated model listing functions
import os
import requests
import logging
from pathlib import Path
from typing import List, Dict, Optional
from urllib.parse import urlparse

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Models directory path
MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "gguf"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

def list_local_models() -> List[Dict[str, str]]:
    """
    Scan the models directory and return metadata for all .gguf files
    Single source of truth for local model listing
    
    Returns:
        List of dictionaries with model metadata
    """
    models = []
    
    try:
        for file_path in MODELS_DIR.glob("*.gguf"):
            file_size = file_path.stat().st_size
            models.append({
                "name": file_path.name,
                "size": _format_file_size(file_size),
                "size_bytes": file_size,
                "path": str(file_path)
            })
        
        logger.info(f"Found {len(models)} local GGUF models")
        return models
    
    except Exception as e:
        logger.error(f"Error listing local models: {e}")
        return []

def scan_local_models() -> List[Dict[str, str]]:
    """
    Alias for list_local_models - maintained for backward compatibility
    """
    return list_local_models()

def get_models_base() -> Path:
    """Root models directory (parent of gguf/). Subdirs: gguf, vision, mlx, ..."""
    return MODELS_DIR.parent

def scan_vision_models() -> List[Dict[str, str]]:
    """
    Scan models/vision/* for vision bundles (main GGUF + optional mmproj.gguf).
    Returns per-model metadata including the mmproj path (vision capability).
    """
    base = MODELS_DIR.parent / "vision"
    models = []
    try:
        if not base.exists():
            return models
        for bundle_dir in base.iterdir():
            if not bundle_dir.is_dir():
                continue
            gguvs = [f for f in bundle_dir.iterdir() if f.suffix.lower() == ".gguf" and "mmproj" not in f.name.lower()]
            if not gguvs:
                continue
            main = gguvs[0]
            # mmproj may be named mmproj.gguf or mmproj-model-f16.gguf etc — match by pattern.
            mmprojs = [f for f in bundle_dir.iterdir() if f.suffix.lower() == ".gguf" and "mmproj" in f.name.lower()]
            mmproj = mmprojs[0] if mmprojs else (bundle_dir / "mmproj.gguf")
            has_mmproj = mmproj.exists()
            file_size = main.stat().st_size
            models.append({
                "name": bundle_dir.name,
                "size": _format_file_size(file_size),
                "size_bytes": file_size,
                "path": str(main),
                "mmproj": str(mmproj) if has_mmproj else None,
                "is_vision": True,
            })
        logger.info(f"Found {len(models)} vision model bundles")
        return models
    except Exception as e:
        logger.error(f"Error scanning vision models: {e}")
        return []

def download_model(url: str) -> Dict[str, str]:
    """
    Download a GGUF model file from a URL with streaming
    
    Args:
        url: The URL to download from (HuggingFace or direct download)
    
    Returns:
        Dictionary with download status and filename
    """
    try:
        # Extract filename from URL or generate one
        parsed_url = urlparse(url)
        filename = os.path.basename(parsed_url.path)
        
        if not filename.endswith('.gguf'):
            filename = f"model_{os.path.basename(parsed_url.path)}.gguf"
        
        file_path = MODELS_DIR / filename
        
        # Check if file already exists
        if file_path.exists():
            logger.warning(f"Model file {filename} already exists")
            return {
                "status": "exists", 
                "filename": filename,
                "message": "Model file already exists"
            }
        
        # Download with streaming
        logger.info(f"Starting download from {url}")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    # Log progress every 10MB
                    if downloaded % (10 * 1024 * 1024) == 0:
                        progress = (downloaded / total_size) * 100 if total_size > 0 else 0
                        logger.info(f"Download progress: {progress:.1f}% ({_format_file_size(downloaded)}/{_format_file_size(total_size)})")
        
        logger.info(f"Download completed: {filename} ({_format_file_size(file_path.stat().st_size)})")
        
        return {
            "status": "success",
            "filename": filename,
            "size": _format_file_size(file_path.stat().st_size)
        }
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Download failed: {e}")
        return {
            "status": "error",
            "filename": "",
            "message": f"Download failed: {str(e)}"
        }
    except Exception as e:
        logger.error(f"Unexpected error during download: {e}")
        return {
            "status": "error",
            "filename": "",
            "message": f"Unexpected error: {str(e)}"
        }

def _format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format
    
    Args:
        size_bytes: File size in bytes
    
    Returns:
        Formatted string (e.g., "4.2GB")
    """
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    
    while size >= 1024 and i < len(size_names) - 1:
        size /= 1024
        i += 1
    
    return f"{size:.1f}{size_names[i]}"


def get_model_metadata(model_path: str) -> Dict:
    """
    Extract metadata from GGUF file
    
    Args:
        model_path: Path to GGUF model file
        
    Returns:
        Dictionary with model metadata
    """
    try:
        import struct
        
        file_path = Path(model_path)
        if not file_path.exists():
            return {"error": "File not found"}
        
        with open(file_path, 'rb') as f:
            # Read GGUF header
            magic = f.read(4)
            if magic != b'GGUF':
                return {"error": "Not a valid GGUF file"}
            
            # Read version
            version = struct.unpack('<I', f.read(4))[0]
            
            # Read tensor count and metadata count
            tensor_count = struct.unpack('<Q', f.read(8))[0]
            metadata_count = struct.unpack('<Q', f.read(8))[0]
            
            metadata = {
                "valid": True,
                "version": version,
                "tensor_count": tensor_count,
                "metadata_count": metadata_count,
                "file_size": file_path.stat().st_size,
                "file_size_human": _format_file_size(file_path.stat().st_size)
            }
            
            # Try to read some basic metadata (simplified)
            # In a real implementation, you would parse the actual metadata
            try:
                # This is a simplified approach - real GGUF parsing would be more complex
                metadata.update({
                    "format": "GGUF",
                    "note": "Basic metadata extracted. Full parsing requires GGUF library."
                })
            except:
                metadata["note"] = "Could not extract detailed metadata"
            
            return metadata
            
    except Exception as e:
        logger.error(f"Error extracting GGUF metadata from {model_path}: {e}")
        return {
            "error": f"Failed to extract metadata: {str(e)}",
            "valid": False
        }


def validate_gguf_file(file_path: str) -> Dict:
    """
    Validate GGUF file integrity and basic structure
    
    Args:
        file_path: Path to GGUF model file
        
    Returns:
        Validation result dictionary
    """
    try:
        import struct
        
        path = Path(file_path)
        if not path.exists():
            return {"valid": False, "error": "File not found"}
        
        if not path.is_file():
            return {"valid": False, "error": "Not a file"}
        
        # Check file size
        file_size = path.stat().st_size
        if file_size < 100:  # Minimum GGUF file size
            return {"valid": False, "error": "File too small to be a valid GGUF"}
        
        # Check GGUF magic bytes
        with open(file_path, 'rb') as f:
            magic = f.read(4)
            if magic != b'GGUF':
                return {"valid": False, "error": "Not a valid GGUF file (invalid magic bytes)"}
        
        return {
            "valid": True,
            "file_size": file_size,
            "file_size_human": _format_file_size(file_size),
            "message": "GGUF file appears valid"
        }
        
    except Exception as e:
        logger.error(f"Error validating GGUF file {file_path}: {e}")
        return {
            "valid": False,
            "error": f"Validation failed: {str(e)}"
        }


def delete_vision_model(model_name: str) -> Dict:
    """Delete a vision bundle directory (models/vision/<name>/) with its main GGUF + mmproj."""
    target = get_models_base() / "vision" / model_name
    if not target.exists() or not target.is_dir():
        return {"status": "error", "message": f"Vision model {model_name} not found"}
    import shutil
    shutil.rmtree(target)
    logger.info(f"Deleted vision model: {model_name}")
    return {"status": "success", "message": f"Vision model {model_name} deleted successfully"}


def delete_local_model(model_name: str) -> Dict:
    """
    Delete local GGUF model with validation
    
    Args:
        model_name: Name of model file to delete
        
    Returns:
        Dictionary with deletion status
    """
    try:
        # Ensure .gguf extension
        if not model_name.endswith('.gguf'):
            model_name = f"{model_name}.gguf"
        
        file_path = MODELS_DIR / model_name
        
        if not file_path.exists():
            return {
                "status": "error",
                "message": f"Model {model_name} not found"
            }
        
        # Check if file is a GGUF file
        validation = validate_gguf_file(str(file_path))
        if not validation.get("valid", False):
            return {
                "status": "error", 
                "message": f"File {model_name} is not a valid GGUF file"
            }
        
        # Delete the file
        file_path.unlink()
        
        logger.info(f"Deleted model: {model_name}")
        
        return {
            "status": "success",
            "message": f"Model {model_name} deleted successfully"
        }
        
    except Exception as e:
        logger.error(f"Error deleting model {model_name}: {e}")
        return {
            "status": "error",
            "message": f"Failed to delete model: {str(e)}"
        }
