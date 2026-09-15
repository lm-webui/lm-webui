"""Parse agent raw output into friendly chat blocks.

Every agent we wrap emits **JSONL** — one JSON object per line (`codex exec --json`, claude
stream-json, and the opencode/hermes adapters). Parsing the whole blob as one JSON document, as
this used to, could never succeed on multi-line output and always fell through to "return the
raw text", which is why the per-agent adapters were unreachable.

So: try the whole document first (for a CLI that prints a single object), then line by line,
collecting the text each object carries. Anything that never parses is returned as-is, so
plain-text output stays readable.
"""
import json

# Keys that carry human-readable text, in the shapes the CLIs actually emit.
# ponytail: shallow and heuristic; pin each CLI's schema once its frames stop moving.
_TEXT_KEYS = ("content", "text", "answer", "result", "output", "message")


def parse(agent: str, raw: str) -> list[dict]:
    raw = (raw or "").strip()
    if not raw:
        return []

    texts: list[str] = []
    try:
        texts = _texts(json.loads(raw))
    except ValueError:
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                texts.extend(_texts(json.loads(line)))
            except ValueError:
                continue

    if texts:
        return [{"type": "text", "content": t} for t in texts]
    return [{"type": "text", "content": raw}]


def _texts(obj) -> list[str]:
    """Text strings carried by one parsed JSON value."""
    if isinstance(obj, str):
        return [obj.strip()] if obj.strip() else []
    if isinstance(obj, list):
        return [t for item in obj for t in _texts(item)]
    if not isinstance(obj, dict):
        return []

    out: list[str] = []
    for key in _TEXT_KEYS:
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            out.append(value.strip())
        elif isinstance(value, (dict, list)):
            # claude stream-json nests text as {"message": {"content": [{"type": "text", ...}]}}
            out.extend(_texts(value))
    return out
