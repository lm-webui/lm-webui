"""
Runtime Registry
Manages registered runtimes and their state (GGUF, MLX, ComfyUI only).
"""
import json
import os
import logging
from typing import Dict, List, Optional
from .detector import RuntimeType, get_runtime_detector

logger = logging.getLogger(__name__)


class RuntimeRegistry:
    """
    Registry for tracking managed runtime state.

    Stores runtime state in a JSON file for persistence.
    Only tracks: GGUF (in-container), MLX (external), ComfyUI (external).
    """

    def __init__(self, registry_path: Optional[str] = None):
        """
        Initialize registry.

        Args:
            registry_path: Path to registry JSON file
        """
        if registry_path is None:
            # The app's configured data dir, not a path relative to this file — the old
            # hardcoded repo-relative location ignored LMWEBUI_BASE_DIR, so an isolated
            # instance (tests, a second deployment) read and wrote another install's state.
            try:
                from app.core.config_manager import get_data_dir
                data_dir = str(get_data_dir())
            except Exception:  # config unavailable (very early import) — keep it local
                data_dir = os.path.join(
                    os.path.dirname(os.path.dirname(__file__)), "..", "..", "data"
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

    def _update_from_detection(self, detected: Dict[str, Dict]) -> None:
        """Store detected runtimes into the registry.

        A user-registered external endpoint outranks detection: it was set deliberately, and
        the detector only knows about the managed engine — overwriting would silently discard
        the endpoint on the next refresh, which is what used to happen.
        """
        from datetime import datetime
        for runtime_type, info in detected.items():
            existing = self._runtimes.get(runtime_type, {})
            if existing.get("source") == "external" and existing.get("endpoint"):
                self._runtimes[runtime_type] = {
                    **existing,
                    # Keep reporting live managed state, but never the endpoint.
                    "installed": info.get("installed", existing.get("installed", False)),
                    "last_checked": datetime.now().isoformat(),
                }
                continue
            self._runtimes[runtime_type] = {
                "installed": info.get("installed", False),
                "status": info.get("status", "unknown"),
                "version": info.get("version"),
                "port": info.get("port"),
                "endpoint": info.get("endpoint"),
                "last_checked": datetime.now().isoformat()
            }

    def refresh(self) -> Dict[str, Dict]:
        """
        Refresh registry by detecting all managed runtimes (synchronous).

        Returns:
            Updated runtime information
        """
        detected = self._detector.detect_all(include_external=True)
        self._update_from_detection(detected)

        return self._runtimes

    def get_runtimes(self) -> Dict[str, Dict]:
        """Get all registered runtimes."""
        if not self._runtimes:
            return self.refresh()
        return self._runtimes

    def get_runtime(self, runtime_type: str) -> Optional[Dict]:
        """Get a specific runtime."""
        return self._runtimes.get(runtime_type)

    def register_runtime(self, runtime_type: str, info: Dict) -> None:
        """Register or update a runtime's connection info."""
        from datetime import datetime
        self._runtimes[runtime_type] = {
            **info,
            "last_checked": datetime.now().isoformat()
        }
        self._save()

    def unregister_runtime(self, runtime_type: str) -> None:
        """Unregister a runtime."""
        if runtime_type in self._runtimes:
            del self._runtimes[runtime_type]
            self._save()

    def _build_ui_entries(self) -> List[Dict]:
        """Build the UI-formatted runtime list from current registry state."""
        result = []
        for rt in RuntimeType:
            info = self._runtimes.get(rt.value, {})
            detection_info = self._detector.get_detection_info(rt)

            entry = {
                "type": rt.value,
                "name": rt.value.upper(),
                "installed": info.get("installed", False),
                "status": info.get("status", "not_installed"),
                "version": info.get("version"),
                "port": info.get("port"),
                "endpoint": info.get("endpoint"),
                "managed": detection_info.get("managed", False),
                "install_hint": detection_info.get("install_hint", ""),
            }

            # Add GGUF-specific model info
            if rt == RuntimeType.GGUF and info.get("installed"):
                models_count = info.get("models_count", 0)
                entry["models_count"] = models_count

            result.append(entry)

        return result

    def get_runtime_info_for_ui(self) -> List[Dict]:
        """Get runtime info formatted for UI display (synchronous)."""
        self.refresh()
        return self._build_ui_entries()

    async def get_runtime_info_for_ui_async(self) -> List[Dict]:
        """Get runtime info formatted for UI display (async — safe in FastAPI endpoints)."""
        detected = await self._detector.detect_all_async(include_external=True)
        self._update_from_detection(detected)
        self._save()
        return self._build_ui_entries()


# Singleton instance
_registry: Optional[RuntimeRegistry] = None


def get_runtime_registry() -> RuntimeRegistry:
    """Get the runtime registry instance."""
    global _registry
    if _registry is None:
        _registry = RuntimeRegistry()
    return _registry
