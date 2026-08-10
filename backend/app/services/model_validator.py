"""
Model validation service with disk space checking and cache validation
"""
import os
import shutil
import psutil
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class ModelValidator:
    """Comprehensive model validation with disk space and cache checking"""
    
    def __init__(self, min_disk_space_gb: float = 5.0):
        """
        Initialize model validator
        
        Args:
            min_disk_space_gb: Minimum required disk space in GB for model operations
        """
        self.min_disk_space_gb = min_disk_space_gb
        from app.core.config_manager import get_models_dir
        self.model_dirs = [
            Path(__file__).parent.parent / "rag" / "embed",
            Path(__file__).parent.parent / "rag" / "rerank",
            Path(__file__).parent.parent / "rag" / "vision",
            Path(__file__).parent.parent / "rag" / "ocr",
            get_models_dir(),
        ]
    
    def check_disk_space(self, path: Optional[str] = None) -> Dict[str, Any]:
        """
        Check available disk space
        
        Args:
            path: Path to check disk space for (defaults to root)
            
        Returns:
            Dict with disk space information and validation result
        """
        try:
            if path and os.path.exists(path):
                disk_usage = psutil.disk_usage(path)
            else:
                disk_usage = psutil.disk_usage('/')
            
            free_gb = disk_usage.free / (1024**3)
            total_gb = disk_usage.total / (1024**3)
            used_percent = disk_usage.percent
            
            has_space = free_gb >= self.min_disk_space_gb
            
            return {
                "has_sufficient_space": has_space,
                "free_gb": round(free_gb, 2),
                "total_gb": round(total_gb, 2),
                "used_percent": used_percent,
                "required_gb": self.min_disk_space_gb,
                "path": path or '/'
            }
            
        except Exception as e:
            logger.error(f"Failed to check disk space: {e}")
            return {
                "has_sufficient_space": False,
                "error": str(e),
                "path": path or '/'
            }
    
    def validate_model_cache(self, model_id: str, cache_dir: str) -> Dict[str, Any]:
        """
        Validate model cache directory and files
        
        Args:
            model_id: Model identifier (e.g., 'nomic-ai/nomic-embed-text-v1.5')
            cache_dir: Cache directory path
            
        Returns:
            Dict with cache validation results
        """
        try:
            cache_path = Path(cache_dir)
            
            # Check if cache directory exists
            if not cache_path.exists():
                return {
                    "is_valid": False,
                    "exists": False,
                    "model_id": model_id,
                    "cache_dir": str(cache_dir),
                    "message": "Cache directory does not exist"
                }
            
            # Check if directory is writable
            if not os.access(cache_path, os.W_OK):
                return {
                    "is_valid": False,
                    "exists": True,
                    "writable": False,
                    "model_id": model_id,
                    "cache_dir": str(cache_dir),
                    "message": "Cache directory is not writable"
                }
            
            # Look for model files (common patterns)
            model_files = []
            for ext in ['.bin', '.pth', '.safetensors', '.json', '.model', '.pt']:
                for file in cache_path.rglob(f"*{ext}"):
                    if model_id.replace('/', '_') in str(file) or model_id.split('/')[-1] in str(file):
                        model_files.append(str(file))
            
            # Check file sizes
            total_size_mb = 0
            for file_path in model_files:
                try:
                    total_size_mb += os.path.getsize(file_path) / (1024 * 1024)
                except:
                    pass
            
            has_files = len(model_files) > 0
            
            return {
                "is_valid": has_files,
                "exists": True,
                "writable": True,
                "has_files": has_files,
                "file_count": len(model_files),
                "total_size_mb": round(total_size_mb, 2),
                "model_id": model_id,
                "cache_dir": str(cache_dir),
                "files": model_files[:10]  # Limit to first 10 files
            }
            
        except Exception as e:
            logger.error(f"Failed to validate model cache for {model_id}: {e}")
            return {
                "is_valid": False,
                "error": str(e),
                "model_id": model_id,
                "cache_dir": str(cache_dir)
            }
    
    def estimate_model_size(self, model_id: str, model_type: str = "embedding") -> float:
        """
        Estimate model size based on model type and ID
        
        Args:
            model_id: Model identifier
            model_type: Type of model (embedding, vision, reranker, ocr, llm)
            
        Returns:
            Estimated size in GB
        """
        # Size estimates based on common models
        size_estimates = {
            "embedding": {
                "nomic-ai/nomic-embed-text-v1.5": 0.5,  # ~500MB
                "default": 0.3  # ~300MB
            },
            "reranker": {
                "BAAI/bge-reranker-base": 0.4,  # ~400MB
                "default": 0.5  # ~500MB
            },
            "vision": {
                "vikhyatk/moondream2": 1.5,  # ~1.5GB
                "default": 2.0  # ~2GB
            },
            "ocr": {
                "default": 0.8  # ~800MB
            },
            "llm": {
                "default": 4.0  # ~4GB for typical GGUF
            }
        }
        
        model_type_lower = model_type.lower()
        if model_type_lower in size_estimates:
            type_estimates = size_estimates[model_type_lower]
            for key, size in type_estimates.items():
                if key in model_id.lower():
                    return size
            return type_estimates.get("default", 1.0)
        
        return 1.0  # Default 1GB
    
    def validate_model_download(self, model_id: str, model_type: str, target_dir: str) -> Dict[str, Any]:
        """
        Comprehensive validation before model download
        
        Args:
            model_id: Model identifier
            model_type: Type of model
            target_dir: Target directory for download
            
        Returns:
            Dict with validation results
        """
        results = {
            "model_id": model_id,
            "model_type": model_type,
            "target_dir": target_dir,
            "can_proceed": False,
            "validations": {}
        }
        
        # 1. Check disk space
        disk_check = self.check_disk_space(target_dir)
        results["validations"]["disk_space"] = disk_check
        
        # 2. Estimate required space
        estimated_size_gb = self.estimate_model_size(model_id, model_type)
        results["estimated_size_gb"] = estimated_size_gb
        
        # 3. Check if model already exists in cache
        cache_check = self.validate_model_cache(model_id, target_dir)
        results["validations"]["cache"] = cache_check
        
        # 4. Check directory permissions
        target_path = Path(target_dir)
        dir_exists = target_path.exists()
        dir_writable = os.access(target_dir, os.W_OK) if dir_exists else False
        
        results["validations"]["directory"] = {
            "exists": dir_exists,
            "writable": dir_writable,
            "path": str(target_dir)
        }
        
        # Determine if we can proceed
        can_proceed = (
            disk_check.get("has_sufficient_space", False) and
            (not cache_check.get("has_files", True) or not cache_check.get("is_valid", False)) and
            (dir_exists and dir_writable)
        )
        
        results["can_proceed"] = can_proceed
        
        if not can_proceed:
            # Provide reasons
            reasons = []
            if not disk_check.get("has_sufficient_space", False):
                reasons.append(f"Insufficient disk space: {disk_check.get('free_gb', 0)}GB free, need {estimated_size_gb}GB")
            if cache_check.get("has_files", False) and cache_check.get("is_valid", False):
                reasons.append(f"Model already exists in cache with {cache_check.get('file_count', 0)} files")
            if not dir_exists:
                reasons.append(f"Target directory does not exist: {target_dir}")
            elif not dir_writable:
                reasons.append(f"Target directory is not writable: {target_dir}")
            
            results["blocking_reasons"] = reasons
        
        return results
    
    def cleanup_old_models(self, days_threshold: int = 30) -> Dict[str, Any]:
        """
        Clean up old model files from cache directories
        
        Args:
            days_threshold: Delete files older than this many days
            
        Returns:
            Dict with cleanup results
        """
        results = {
            "deleted_files": [],
            "deleted_size_mb": 0,
            "errors": []
        }
        
        cutoff_time = datetime.now() - timedelta(days=days_threshold)
        
        for model_dir in self.model_dirs:
            if not model_dir.exists():
                continue
                
            try:
                for file_path in model_dir.rglob("*"):
                    if file_path.is_file():
                        try:
                            mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
                            if mtime < cutoff_time:
                                file_size_mb = file_path.stat().st_size / (1024 * 1024)
                                
                                # Delete the file
                                file_path.unlink()
                                
                                results["deleted_files"].append(str(file_path))
                                results["deleted_size_mb"] += file_size_mb
                                
                                logger.info(f"Deleted old model file: {file_path} ({file_size_mb:.2f}MB)")
                                
                        except Exception as e:
                            results["errors"].append(f"Failed to process {file_path}: {e}")
                            
            except Exception as e:
                results["errors"].append(f"Failed to scan {model_dir}: {e}")
        
        results["deleted_count"] = len(results["deleted_files"])
        results["deleted_size_mb"] = round(results["deleted_size_mb"], 2)
        
        return results
    
    def get_model_directories_status(self) -> Dict[str, Any]:
        """
        Get status of all model directories
        
        Returns:
            Dict with directory status information
        """
        status = {}
        
        for model_dir in self.model_dirs:
            dir_path = model_dir
            dir_name = dir_path.name
            
            try:
                exists = dir_path.exists()
                writable = os.access(dir_path, os.W_OK) if exists else False
                
                # Calculate directory size
                total_size_mb = 0
                file_count = 0
                
                if exists:
                    for file_path in dir_path.rglob("*"):
                        if file_path.is_file():
                            try:
                                total_size_mb += file_path.stat().st_size / (1024 * 1024)
                                file_count += 1
                            except:
                                pass
                
                status[dir_name] = {
                    "path": str(dir_path),
                    "exists": exists,
                    "writable": writable,
                    "file_count": file_count,
                    "total_size_mb": round(total_size_mb, 2),
                    "total_size_gb": round(total_size_mb / 1024, 2)
                }
                
            except Exception as e:
                status[dir_name] = {
                    "path": str(dir_path),
                    "error": str(e)
                }
        
        return status


# Global instance
_model_validator = None

def get_model_validator() -> ModelValidator:
    """Get global ModelValidator instance"""
    global _model_validator
    if _model_validator is None:
        _model_validator = ModelValidator()
    return _model_validator