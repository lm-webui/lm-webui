"""The complete definition of one host-CLI agent.

Every agent's facts live in its own module (claude.py, codex.py, opencode.py, hermes.py) as a single
`AGENT` value of this type; registry.py imports those modules and builds the AGENTS table. This
module is a leaf — stdlib only, no `app.*` imports — so the agent modules can depend on it without a
cycle (registry imports the agent modules, so the type could not live there).
"""
from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class AgentDef:
    """One agent. Frozen, and `run`/`version_flag` are tuples, so a definition cannot be mutated in
    place after the registry has handed it out."""

    # ── required ──────────────────────────────────────────────────────────
    name: str
    """Registry key, `detect()["id"]`, and the key every route validates against."""

    cmd: str
    """Bare binary name. Resolved through PATH by resolve(); also the TUI's launch argv."""

    run: tuple[str, ...]
    """argv prefix for the NON-interactive one-shot path (runner.run). Interactive agents never
    reach it — claude declares one only because the field is required."""

    install: str
    """Shown to the user and run verbatim in the host terminal. `{prefix}` is substituted by
    registry.install_cmd() — see the note there for why it must stay a string."""

    # ── optional ──────────────────────────────────────────────────────────
    version_flag: tuple[str, ...] = ("--version",)
    """The CLI's own version flag. A field rather than a constant in detect(), because which flag a
    CLI takes is the CLI's business."""

    context_file: str = "AGENTS.md"
    """Filename the connected-agents manifest is written to inside the run cwd. Claude owns
    CLAUDE.md; the rest accept the AGENTS.md convention."""

    config_dir: str = "~/.config"
    config_name: str = "config.json"
    """The CLI's real config file. `~` stays unexpanded here — agent_files expands it."""

    interactive: bool = False
    """True for a CLI driven by a bidirectional stream-json session (currently claude only). This
    picks the whole SSE code path in routes/agents.py, and is what makes spawn/normalize reachable:
    they are called only by InteractiveSession."""

    model_flag: str = ""
    skill_flag: str = ""
    """The flag this CLI takes for a model / system prompt. EMPTY means the CLI does not document
    one — routes/agents.py then rejects those request fields with a 400 rather than silently
    dropping them. Declared here AND applied in the agent's own spawn(); keep the two in step."""

    spawn: Optional[Callable[[str, str, str, str], list[str]]] = None
    """(cwd, model, skill, resume_id) -> argv. Interactive agents only."""

    normalize: Optional[Callable[[dict], Optional[list[dict]]]] = None
    """One parsed stream-json event -> chat events, or None to drop it. Interactive agents only."""

    prepare_workspace: Optional[Callable[[str], None]] = None
    """Seed per-session files in the run cwd before spawn. Interactive agents only."""
