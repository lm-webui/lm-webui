"""
MLX Management Scripts
Provides shell commands for MLX runtime management on macOS host.
MLX cannot run inside Docker — these scripts execute on the host.
"""
import logging
from typing import Dict
from .detector import RuntimeType

logger = logging.getLogger(__name__)

# MLX shell commands for host-side management
MLX_SCRIPTS: Dict[str, str] = {
    "version": "python3 -c 'import mlx; print(mlx.__version__)'",
    "install": "pip install mlx mlx-lm mlx-optiq",
    "uninstall": "pip uninstall mlx mlx-lm mlx-optiq -y",
    "server_start": "mlx_lm.server --port 8090 --model <model-name>",
    "server_stop": "kill $(lsof -ti:8090) 2>/dev/null; echo 'MLX server stopped'",
    "server_status": "lsof -ti:8090 2>/dev/null && echo 'MLX server running on :8090' || echo 'MLX server not running'",
    "detect_hardware": "python3 -c 'import platform; print(platform.machine())'",
    "list_models": "python3 -c \"import os; models=os.listdir(os.path.expanduser('~/.mlx/models')) if os.path.exists(os.path.expanduser('~/.mlx/models')) else []; print('\\n'.join(models) if models else 'No models found')\"",
}


class MLXManager:
    """
    Provides shell commands and guidance for MLX runtime management on macOS.
    MLX runs on the host (outside Docker) and lm-webui connects via API.
    """

    @staticmethod
    def get_scripts() -> Dict[str, str]:
        """Get all MLX management shell commands."""
        return dict(MLX_SCRIPTS)

    @staticmethod
    def get_script(action: str) -> str:
        """Get a specific MLX management command."""
        return MLX_SCRIPTS.get(action, "")

    @staticmethod
    def is_apple_silicon() -> bool:
        """Check if running on Apple Silicon (for UI display)."""
        import platform
        return platform.system() == "Darwin" and platform.machine() == "arm64"

    @staticmethod
    def get_setup_guide() -> Dict:
        """Get the full MLX setup guide with steps."""
        return {
            "runtime": "mlx",
            "platform": "macOS (Apple Silicon)",
            "steps": [
                {"order": 1, "action": "install", "command": MLX_SCRIPTS["install"], "description": "Install MLX packages"},
                {"order": 2, "action": "verify", "command": MLX_SCRIPTS["version"], "description": "Verify MLX installation"},
                {"order": 3, "action": "download_model", "command": "mlx_lm.fetch --hf-path <model-name>", "description": "Download a model (e.g., mlx-community/Llama-3.2-3B-Instruct-4bit)"},
                {"order": 4, "action": "start_server", "command": MLX_SCRIPTS["server_start"], "description": "Start MLX inference server"},
                {"order": 5, "action": "test", "command": "curl http://localhost:8090/v1/models", "description": "Test server is responding"},
            ],
            "cleanup": {
                "description": "Uninstall MLX completely",
                "commands": [
                    MLX_SCRIPTS["server_stop"],
                    MLX_SCRIPTS["uninstall"],
                    "rm -rf ~/.mlx",
                ],
            },
        }


# Singleton
_mlx_manager: "MLXManager" = None


def get_mlx_manager() -> MLXManager:
    """Get the MLX manager instance."""
    global _mlx_manager
    if _mlx_manager is None:
        _mlx_manager = MLXManager()
    return _mlx_manager
