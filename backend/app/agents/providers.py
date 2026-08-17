"""Per-provider CLI adapters: spawn command + event normalization per host agent.

The Agent Hub wraps host CLI agents (claude/codex/opencode/hermes). Each speaks a different
protocol; this module maps agent id → how to spawn it and how to normalize its output into the
shared event shape (output/prompt/complete). The runner + routes consume this instead of
hardcoding one agent.
"""
import json
from pathlib import Path
from typing import Optional

# Skip all permission prompts: `-p` is non-interactive and can't render a permission yes/no, so
# keeping a prompt mode here made agents auto-deny tool calls and finish immediately. skip-permissions
# matches the reference project (zeto) — agents just run. (ponytail: per-tool approval later needs
# --permission-prompt-tool / Agent SDK, not the stdio result frames.)
CLAUDE_BASE = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
               "--dangerously-skip-permissions", "--verbose"]


def _claude_spawn(cwd: str, model: str, skill: str, resume_id: str = "") -> list[str]:
    cmd = [*CLAUDE_BASE]
    if resume_id:
        cmd += ["--resume", resume_id]
    if model:
        cmd += ["--model", model]
    if skill:
        cmd += ["--append-system-prompt", skill]
    return cmd


def prepare_workspace(agent: str, cwd: str) -> None:
    """Pre-trust the session workspace so claude doesn't show a trust dialog on first run.

    Writes a `.claude/settings.json` in the session cwd with the default permission mode.
    """
    if agent != "claude":
        return
    try:
        d = Path(cwd) / ".claude"
        d.mkdir(parents=True, exist_ok=True)
        settings = {"permissions": {"defaultMode": "acceptEdits"}}
        (d / "settings.json").write_text(json.dumps(settings), encoding="utf-8")
    except OSError:
        pass


def _claude_normalize(ev: dict) -> Optional[list[dict]]:
    t = ev.get("type")
    if t == "assistant":
        blocks = (ev.get("message") or {}).get("content") or []
        out: list[dict] = []
        for b in blocks:
            bt = b.get("type")
            if bt == "text" and b.get("text"):
                out.append({"type": "output", "content": b["text"]})
            elif bt == "tool_use":
                out.append({"type": "prompt", "data": {
                    "prompt_id": b.get("id"), "tool": b.get("name"), "input": b.get("input") or {}}})
        return out
    if t == "result":
        usage = ev.get("usage") or {}
        # contextWindow may live top-level or nested under usage.modelUsage.<model>.
        cw = usage.get("contextWindow")
        if cw is None:
            model_usage = (usage.get("modelUsage") or {}).values()
            cw = next((m.get("contextWindow") for m in model_usage if m.get("contextWindow")), None)
        return [{"type": "complete", "result": ev.get("result") or "", "subtype": ev.get("subtype"),
                 "usage": usage, "cost_usd": ev.get("total_cost_usd"), "context_window": cw}]
    return None


PROVIDERS = {
    "claude": {"interactive": True, "spawn": _claude_spawn, "normalize": _claude_normalize,
               "context_file": "CLAUDE.md"},
    "codex": {"interactive": False, "context_file": "AGENTS.md"},
    "opencode": {"interactive": False, "context_file": "AGENTS.md"},
    "hermes": {"interactive": False, "context_file": "AGENTS.md"},
}


def is_interactive(agent: str) -> bool:
    return bool(PROVIDERS.get(agent, {}).get("interactive"))


def context_file(agent: str) -> str:
    """Filename the agent auto-reads in its cwd (claude→CLAUDE.md, codex→AGENTS.md)."""
    return PROVIDERS.get(agent, {}).get("context_file", "AGENTS.md")


def spawn_cmd(agent: str, cwd: str, model: str = "", skill: str = "", resume_id: str = "") -> list[str]:
    spawn = PROVIDERS.get(agent, {}).get("spawn")
    return spawn(cwd, model, skill, resume_id) if spawn else []


def normalize(agent: str, ev: dict) -> Optional[list[dict]]:
    norm = PROVIDERS.get(agent, {}).get("normalize")
    return norm(ev) if norm else None
