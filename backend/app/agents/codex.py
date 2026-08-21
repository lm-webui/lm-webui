"""Codex CLI adapter. Codex currently runs through its JSON one-shot command."""
def normalize(ev: dict) -> list[dict] | None:
    event_type = ev.get("type")
    if event_type in {"assistant", "message", "output_text"}:
        text = ev.get("text") or ev.get("content") or ev.get("message")
        return [{"type": "output", "content": text}] if isinstance(text, str) and text else None
    if event_type in {"tool_call", "command_execution", "file_change"}:
        return [{"type": "tool", "data": {"tool": ev.get("name") or event_type, "input": ev.get("input") or ev.get("command") or ev}}]
    return None
