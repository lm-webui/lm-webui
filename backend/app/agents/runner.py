"""Invoke a CLI agent non-interactively and return its raw output."""
import asyncio

from .registry import AGENTS


async def run(agent: str, prompt: str, cwd: str) -> str:
    """Run the agent once with `prompt`, return stdout+stderr as text."""
    cmd = [*AGENTS[agent]["run"], prompt]
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=cwd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    out, _ = await proc.communicate()
    return out.decode(errors="replace")
