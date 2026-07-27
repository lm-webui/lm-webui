"""
Runtime Registry
Manages registered runtimes and their state.
"""
import json
import os
import logging
from typing import Dict, List, Optional
from .detector import RuntimeType, get_runtime_detector

logger = logging.getLogger(__name__)


class RuntimeRegistry:
    """
    Registry for tracking installed and available runtimes.
    
    Stores runtime state in a JSON file for persistence.
    """
    
    def __init__(self, registry_path: Optional[str] = None):
        """
        Initialize registry.
        
        Args:
            registry_path: Path to registry JSON file
        """
        if registry_path is None:
            data_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "..", "..", "data"
            )
            os.makedirs(data_dir, exist_ok=True)
            registry_path = os.path.join(data_dir, "runtime_registry.json")
        
        self._registry_path = registry_path
        self._detector = get_runtime_detector()
        self._runtimes: Dict[str, Dict] = {}
        self._load()
    
    def _load(self) -> None:
        """Load registry from file."""
        if os.path.exists(self._registry_path):
            try:
                with open(self._registry_path, "r") as f:
                    self._runtimes = json.load(f)
                logger.info(f"Loaded runtime registry from {self._registry_path}")
            except Exception as e:
                logger.warning(f"Failed to load registry: {e}")
                self._runtimes = {}
    
    def _save(self) -> None:
        """Save registry to file."""
        try:
            with open(self._registry_path, "w") as f:
                json.dump(self._runtimes, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save registry: {e}")
    
    def refresh(self) -> Dict[str, Dict]:
        """
        Refresh registry by detecting all runtimes.
        
        Returns:
            Updated runtime information
        """
        detected = self._detector.detect_all()
        
        # Update registry with detected runtimes
        for runtime_type, info in detected.items():
            self._runtimes[runtime_type] = {
                "installed": info.get("installed", False),
                "status": info.get("status", "unknown"),
                "version": info.get("version"),
                "path": info.get("path"),
                "port": info.get("port"),
                "last_checked": self._get_timestamp()
            }
        
        # Mark undetected runtimes
        for rt in RuntimeType:
            if rt.value not in self._runtimes:
                self._runtimes[rt.value] = {
                    "installed": False,
                    "status": "not_checked",
                    "last_checked": self._get_timestamp()
                }
        
        self._save()
        return self._runtimes
    
    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def get_runtimes(self) -> Dict[str, Dict]:
        """Get all registered runtimes."""
        if not self._runtimes:
            return self.refresh()
        return self._runtimes
    
    def get_runtime(self, runtime_type: str) -> Optional[Dict]:
        """Get a specific runtime."""
        return self._runtimes.get(runtime_type)
    
    def register_runtime(self, runtime_type: str, info: Dict) -> None:
        """Register a runtime manually."""
        self._runtimes[runtime_type] = {
            **info,
            "last_checked": self._get_timestamp()
        }
        self._save()
    
    def unregister_runtime(self, runtime_type: str) -> None:
        """Unregister a runtime."""
        if runtime_type in self._runtimes:
            del self._runtimes[runtime_type]
            self._save()
    
    def get_available_runtimes(self) -> List[Dict]:
        """Get list of available (installed) runtimes."""
        return [
            {
                "type": rt_type,
                **rt_info
            }
            for rt_type, rt_info in self._runtimes.items()
            if rt_info.get("installed", False)
        ]
    
    def is_available(self, runtime_type: str) -> bool:
        """Check if a runtime is available."""
        info = self._runtimes.get(runtime_type, {})
        return info.get("installed", False)
    
    def get_runtime_info_for_ui(self) -> List[Dict]:
        """Get runtime info formatted for UI."""
        # Refresh first to get latest status
        self.refresh()
        
        result = []
        for rt in RuntimeType:
            info = self._runtimes.get(rt.value, {})
            
            detection_info = self._detector.get_detection_info(rt)
            
            result.append({
                "type": rt.value,
                "name": rt.value.upper(),
                "installed": info.get("installed", False),
                "status": info.get("status", "not_installed"),
                "version": info.get("version"),
                "path": info.get("path"),
                "port": info.get("port"),
                "detection_method": detection_info.get("detection_method"),
                "install_hint": detection_info.get("install_hint"),
                "manual_install": detection_info.get("detection_method") == "local_binary"
                                 and rt not in (RuntimeType.OLLAMA, RuntimeType.COMFYUI)
            })
        
        return result


# Singleton instance
_registry: Optional[RuntimeRegistry] = None


def get_runtime_registry() -> RuntimeRegistry:
    """Get the runtime registry instance."""
    global _registry
    if _registry is None:
        _registry = RuntimeRegistry()
    return _registry
