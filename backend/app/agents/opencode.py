"""OpenCode CLI adapter."""
def normalize(ev: dict) -> list[dict] | None:
    text = ev.get("text") or ev.get("content")
    return [{"type": "output", "content": text}] if isinstance(text, str) and text else None
