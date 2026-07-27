"""Local metadata-only usage tracking."""
from typing import Optional
from app.database.sqlite.connection_pool import database_manager

LOCAL_PROVIDERS = {"ollama", "gguf", "mlx", "vllm", "comfyui"}

def execution_boundary(provider: Optional[str]) -> str:
    if provider in LOCAL_PROVIDERS:
        return "local"
    if provider:
        return "cloud"
    return "unknown"

def estimate_tokens(text: str) -> int:
    return max(0, len(text or "") // 4)

def record_usage(*, user_id: int, event_type: str, provider: Optional[str], model: Optional[str], input_tokens: int = 0, output_tokens: int = 0, token_accuracy: str = "estimated", duration_ms: Optional[int] = None, success: bool = True, error_code: Optional[str] = None, estimated_cost: Optional[float] = None) -> None:
    total = max(0, input_tokens) + max(0, output_tokens)
    with database_manager.transaction() as conn:
        conn.execute("""INSERT INTO usage_events
            (user_id, event_type, provider, model, execution_boundary, input_tokens, output_tokens, total_tokens, token_accuracy, duration_ms, success, error_code, estimated_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, event_type, provider, model, execution_boundary(provider), input_tokens, output_tokens, total, token_accuracy, duration_ms, 1 if success else 0, error_code, estimated_cost))
