"""Claude Code adapter for Agent Hub's bidirectional stream."""
import json
from pathlib import Path
from typing import Optional

CLAUDE_BASE = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--permission-mode", "manual", "--permission-prompt-tool", "stdio", "--verbose"]

def spawn(cwd: str, model: str, skill: str, resume_id: str = "") -> list[str]:
    cmd = [*CLAUDE_BASE]
    if resume_id: cmd += ["--resume", resume_id]
    if model: cmd += ["--model", model]
    if skill: cmd += ["--append-system-prompt", skill]
    return cmd

def prepare_workspace(cwd: str) -> None:
    try:
        d = Path(cwd) / ".claude"
        d.mkdir(parents=True, exist_ok=True)
        (d / "settings.json").write_text(json.dumps({"permissions": {"defaultMode": "default"}}), encoding="utf-8")
    except OSError:
        pass

def normalize(ev: dict) -> Optional[list[dict]]:
    t = ev.get("type")
    if t == "assistant":
        out = []
        for block in (ev.get("message") or {}).get("content") or []:
            if block.get("type") == "text" and block.get("text"):
                out.append({"type": "output", "content": block["text"]})
            elif block.get("type") == "tool_use":
                out.append({"type": "tool", "data": {"tool": block.get("name"), "tool_use_id": block.get("id"), "input": block.get("input") or {}}})
        return out
    if t == "user":
        return [{"type": "tool_result", "data": {"tool": b.get("tool_name") or b.get("name") or "tool", "tool_use_id": b.get("tool_use_id"), "content": b.get("content") or "", "is_error": bool(b.get("is_error"))}} for b in ((ev.get("message") or {}).get("content") or []) if b.get("type") == "tool_result"]
    if t == "control_request":
        request = ev.get("request") or {}
        if request.get("subtype") == "can_use_tool":
            return [{"type": "prompt", "data": {"prompt_id": ev.get("request_id"), "tool": request.get("tool_name"), "input": request.get("input") or {}}}]
        return None
    if t == "result":
        usage = ev.get("usage") or {}
        cw = usage.get("contextWindow") or next((m.get("contextWindow") for m in (usage.get("modelUsage") or {}).values() if m.get("contextWindow")), None)
        return [{"type": "complete", "result": ev.get("result") or "", "subtype": ev.get("subtype"), "usage": usage, "cost_usd": ev.get("total_cost_usd"), "context_window": cw}]
    return None
