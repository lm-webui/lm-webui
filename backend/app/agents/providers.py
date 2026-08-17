"""Per-provider CLI adapters: spawn command + event normalization per host agent.

The Agent Hub wraps host CLI agents (claude/codex/opencode/hermes). Each speaks a different
protocol; this module maps agent id → how to spawn it and how to normalize its output into the
shared event shape (output/prompt/complete). The runner + routes consume this instead of
hardcoding one agent.
"""
from typing import Optional

CLAUDE_BASE = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
               "--permission-mode", "manual", "--verbose"]


def _claude_spawn(cwd: str, model: str, skill: str) -> list[str]:
    cmd = [*CLAUDE_BASE]
    if model:
        cmd += ["--model", model]
    if skill:
        cmd += ["--append-system-prompt", skill]
    return cmd


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


def spawn_cmd(agent: str, cwd: str, model: str = "", skill: str = "") -> list[str]:
    spawn = PROVIDERS.get(agent, {}).get("spawn")
    return spawn(cwd, model, skill) if spawn else []


def normalize(agent: str, ev: dict) -> Optional[list[dict]]:
    norm = PROVIDERS.get(agent, {}).get("normalize")
    return norm(ev) if norm else None
