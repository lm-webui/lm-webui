"""Small authenticated host bridge for Docker or remote LM-WebUI instances."""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# The install table lives in cli.py so the bridge and the CLI cannot disagree about what is
# installable; ALLOWED_RUNTIMES was a third, unread list and has been dropped.
from .cli import INSTALL, status as host_status


def _agents() -> list[dict]:
    result = []
    for name in ("claude", "codex", "opencode", "hermes"):
        path = shutil.which(name)
        version = None
        if path:
            try:
                p = subprocess.run([name, "--version"], capture_output=True, text=True, timeout=10)
                version = (p.stdout or p.stderr).strip().splitlines()[0] or None
            except Exception:
                pass
        result.append({"id": name, "installed": bool(path), "path": path, "version": version,
                       "status": "ok" if path and version else "degraded" if path else "missing"})
    return result


def _run(command: list[str], timeout: int = 900) -> dict:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        return {"success": result.returncode == 0, "returncode": result.returncode,
                "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "operation timed out"}
    except OSError as exc:
        return {"success": False, "error": str(exc)}


class Handler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        expected = os.environ.get("LMWEBUI_HOST_AGENT_TOKEN", "")
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        return bool(expected) and secrets.compare_digest(supplied, expected)

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if not self._authorized():
            self._send(401, {"error": "unauthorized"}); return
        if urlparse(self.path).path == "/health":
            self._send(200, {"ready": True, "host": host_status.__name__})
        elif urlparse(self.path).path == "/status":
            self._send(200, {"status": "ok", "agents": _agents()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._send(401, {"error": "unauthorized"}); return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            self._send(400, {"error": "invalid JSON"}); return
        path = urlparse(self.path).path
        if path == "/runtimes/install":
            runtime = body.get("runtime")
            if runtime not in INSTALL:
                self._send(400, {"error": "runtime is not installable"}); return
            self._send(200, {"runtime": runtime, **_run(INSTALL[runtime])}); return
        self._send(404, {"error": "not found"})

    def log_message(self, *_args) -> None:
        return


def serve(host: str, port: int) -> None:
    if not os.environ.get("LMWEBUI_HOST_AGENT_TOKEN"):
        raise SystemExit("LMWEBUI_HOST_AGENT_TOKEN is required")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
