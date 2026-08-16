"""Parse agent raw output into friendly chat blocks.

v1: the whole output is one markdown text block. Tool-use / structured cards are a
follow-up once per-agent JSON formats are pinned down — this keeps the UI friendly
without depending on 4 different agent output schemas.
"""
import json


def parse(agent: str, raw: str) -> list[dict]:
    raw = (raw or "").strip()
    if not raw:
        return []
    # If a single JSON object with a text/content field, surface that; else whole text.
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            content = obj.get("content") or obj.get("text") or obj.get("answer")
            if isinstance(content, str) and content.strip():
                return [{"type": "text", "content": content.strip()}]
    except Exception:
        pass
    return [{"type": "text", "content": raw}]
