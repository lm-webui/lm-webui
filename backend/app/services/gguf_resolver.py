"""
GGUF Model Resolution Service
Resolves HuggingFace repos, tags, and URLs to GGUF files with compatibility analysis
"""
import requests
import re
import logging
from typing import Dict, List, Optional
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

class GGUFResolver:
    """Resolves model inputs to GGUF files with hardware compatibility analysis"""
    
    def __init__(self):
        self.huggingface_base_url = "https://huggingface.co/api"
    
    def resolve_model(self, input_str: str) -> Dict:
        """
        Resolve input string to GGUF files with compatibility info
        
        Args:
            input_str: HuggingFace repo, repo:tag, or direct GGUF URL
            
        Returns:
            Dictionary with resolved model information
        """
        try:
            # Determine input type
            if input_str.startswith(('http://', 'https://')):
                return self._resolve_direct_url(input_str)
            elif ':' in input_str:
                repo_id, tag = input_str.split(':', 1)
                return self._resolve_huggingface_repo(repo_id, tag)
            else:
                return self._resolve_huggingface_repo(input_str)
                
        except Exception as e:
            logger.error(f"Error resolving model {input_str}: {e}")
            return {
                "type": "error",
                "error": f"Failed to resolve model: {str(e)}"
            }
    
    def _resolve_huggingface_repo(self, repo_id: str, tag: str = None) -> Dict:
        """
        Resolve HuggingFace repository to GGUF files
        
        Args:
            repo_id: HuggingFace repository ID
            tag: Optional tag or branch
            
        Returns:
            Dictionary with repository information and GGUF files
        """
        try:
            # Clean repo ID
            repo_id = repo_id.strip()
            if repo_id.startswith('https://huggingface.co/'):
                repo_id = repo_id.replace('https://huggingface.co/', '')
            
            # Get repository info
            repo_url = f"{self.huggingface_base_url}/models/{repo_id}"
            response = requests.get(repo_url, timeout=30)
            response.raise_for_status()
            repo_info = response.json()
            
            # Get files from repository
            if tag:
                files_url = f"{self.huggingface_base_url}/models/{repo_id}/tree/{tag}"
            else:
                files_url = f"{self.huggingface_base_url}/models/{repo_id}/tree/main"
            
            files_response = requests.get(files_url, timeout=30)
            files_response.raise_for_status()
            files_data = files_response.json()
            
            # Filter for GGUF files
            gguf_files = []
            for file_info in files_data:
                if file_info.get('type') == 'file' and file_info.get('path', '').endswith('.gguf'):
                    file_url = f"https://huggingface.co/{repo_id}/resolve/main/{file_info['path']}"
                    if tag:
                        file_url = f"https://huggingface.co/{repo_id}/resolve/{tag}/{file_info['path']}"
                    
                    gguf_files.append({
                        "filename": file_info['path'],
                        "url": file_url,
                        "size": file_info.get('size', 0),
                        "human_size": self._format_file_size(file_info.get('size', 0))
                    })
            
            # Analyze compatibility for each file
            files_with_compatibility = []
            for file_info in gguf_files:
                compatibility = self._analyze_compatibility(file_info)
                file_info["compatibility"] = compatibility
                files_with_compatibility.append(file_info)

            # Classify: vision models carry an mmproj (multimodal projector) file.
            mmproj_files = [f for f in files_with_compatibility if "mmproj" in f["filename"].lower()]
            main_files = [f for f in files_with_compatibility if f not in mmproj_files]

            return {
                "type": "repository",
                "repo_id": repo_id,
                "tag": tag,
                "files": files_with_compatibility,
                "main_files": main_files,
                "mmproj_files": mmproj_files,
                "is_vision": bool(mmproj_files),
                "model_name": repo_info.get('modelId', repo_id)
            }
            
        except requests.RequestException as e:
            logger.error(f"HTTP error resolving HuggingFace repo {repo_id}: {e}")
            return {
                "type": "error",
                "error": f"Failed to access HuggingFace repository: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error resolving HuggingFace repo {repo_id}: {e}")
            return {
                "type": "error",
                "error": f"Failed to resolve repository: {str(e)}"
            }
    
    def _resolve_direct_url(self, url: str) -> Dict:
        """
        Resolve direct GGUF URL
        
        Args:
            url: Direct GGUF file URL
            
        Returns:
            Dictionary with direct download information
        """
        try:
            parsed_url = urlparse(url)
            filename = Path(parsed_url.path).name
            
            if not filename.endswith('.gguf'):
                return {
                    "type": "error",
                    "error": "URL does not point to a GGUF file"
                }
            
            # Get file size via HEAD request
            try:
                head_response = requests.head(url, timeout=10, allow_redirects=True)
                file_size = int(head_response.headers.get('content-length', 0))
            except:
                file_size = 0
            
            file_info = {
                "filename": filename,
                "url": url,
                "size": file_size,
                "human_size": self._format_file_size(file_size),
                "file_url": url
            }
            
            # Analyze compatibility
            compatibility = self._analyze_compatibility(file_info)
            
            return {
                "type": "direct",
                "file_url": url,
                "filename": filename,
                "size": file_size,
                "human_size": self._format_file_size(file_size),
                "compatibility": compatibility
            }
            
        except Exception as e:
            logger.error(f"Error resolving direct URL {url}: {e}")
            return {
                "type": "error",
                "error": f"Failed to resolve URL: {str(e)}"
            }
    
    def _analyze_compatibility(self, file_info: Dict) -> Dict:
        """
        Analyze hardware compatibility for GGUF file
        
        Args:
            file_info: File information dictionary
            
        Returns:
            Compatibility analysis dictionary
        """
        try:
            file_size_gb = file_info.get('size', 0) / (1024**3)
            
            # Basic compatibility analysis
            # This would be enhanced with actual hardware detection
            vram_required = file_size_gb * 1.5  # Rough estimate
            ram_required = file_size_gb * 2.0   # Rough estimate
            
            # Mock hardware detection - would integrate with actual hardware service
            available_vram = 8.0  # Mock - would get from hardware detection
            available_ram = 16.0  # Mock - would get from system
            
            vram_ok = vram_required <= available_vram
            cpu_ram_ok = ram_required <= available_ram
            
            compatibility = "compatible"
            warnings = []
            
            if not vram_ok:
                compatibility = "warning"
                warnings.append(f"Model may exceed available VRAM ({available_vram:.1f}GB available, {vram_required:.1f}GB estimated)")
            
            if not cpu_ram_ok:
                compatibility = "warning" if compatibility == "compatible" else "incompatible"
                warnings.append(f"Model may exceed available RAM ({available_ram:.1f}GB available, {ram_required:.1f}GB estimated)")
            
            if file_size_gb > 20:
                compatibility = "warning"
                warnings.append("Very large model - download and loading may be slow")
            
            return {
                "compatibility": compatibility,
                "vram_ok": vram_ok,
                "cpu_ram_ok": cpu_ram_ok,
                "warnings": warnings,
                "requirements": {
                    "vram_gb_required": round(vram_required, 1),
                    "cpu_ram_gb_required": round(ram_required, 1),
                    "note": "Estimates based on model size"
                },
                "hardware": {
                    "gpu_available": True,  # Mock
                    "gpu_vram_gb": available_vram,
                    "cpu_ram_gb": available_ram
                }
            }
            
        except Exception as e:
            logger.error(f"Error analyzing compatibility: {e}")
            return {
                "compatibility": "unknown",
                "vram_ok": True,
                "cpu_ram_ok": True,
                "warnings": ["Could not analyze compatibility"],
                "requirements": {
                    "vram_gb_required": 0,
                    "cpu_ram_gb_required": 0,
                    "note": "Compatibility analysis failed"
                },
                "hardware": {
                    "gpu_available": False,
                    "gpu_vram_gb": 0,
                    "cpu_ram_gb": 0
                }
            }
    
    def _format_file_size(self, size_bytes: int) -> str:
        """Format file size in human-readable format"""
        if size_bytes == 0:
            return "0B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        size = float(size_bytes)
        
        while size >= 1024 and i < len(size_names) - 1:
            size /= 1024
            i += 1
        
        return f"{size:.1f}{size_names[i]}"


# Global instance
gguf_resolver = GGUFResolver()
