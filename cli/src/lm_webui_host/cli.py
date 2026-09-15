from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import urlparse

# Every host runtime that can be installed, and how. This is the single table: the host bridge
# (agent_server.py) imports it, so a runtime can no longer be installable over the API but rejected
# by this CLI — `runtime install comfyui` used to be impossible for exactly that reason.
INSTALL = {
    "ollama": ["sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
    "mlx": [sys.executable, "-m", "pip", "install", "mlx", "mlx-lm", "mlx-optiq"],
    "gguf": [sys.executable, "-m", "pip", "install", "llama-cpp-python"],
    "vllm": [sys.executable, "-m", "pip", "install", "vllm"],
    "comfyui": ["sh", "-c", (
        'test -d "$HOME/ComfyUI" || git clone https://github.com/comfyanonymous/ComfyUI "$HOME/ComfyUI"; '
        'python -m pip install -r "$HOME/ComfyUI/requirements.txt"'
    )],
}


def _run(command: list[str]) -> int:
    try:
        return subprocess.run(command, check=False).returncode
    except FileNotFoundError:
        return 127


def status() -> int:
    print(json.dumps({
        "platform": sys.platform,
        "python": sys.version.split()[0],
        "docker": bool(shutil.which("docker")),
        "ollama": bool(shutil.which("ollama")),
        "mlx_python": _module_available("mlx"),
        "llama_cpp_python": _module_available("llama_cpp"),
    }, indent=2))
    return 0


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode())


def doctor_check(url: str) -> int:
    """Check a running LM-WebUI instance and report the host inventory alongside it.

    `url` is explicit (flag or LMWEBUI_APP_URL) because the app is not necessarily on this machine
    — it may be in Docker behind host.docker.internal, or on another host entirely.
    """
    if not _valid_endpoint(url):
        print("URL must be a valid http or https URL", file=sys.stderr)
        return 2
    base = url.rstrip("/")
    # flush: the failure below writes to stderr, which would otherwise appear before this line
    print(f"Checking LM-WebUI at {base} ...", flush=True)
    try:
        health = _get_json(base + "/api/health")
    except Exception as exc:
        print(f"❌ Not reachable: {exc}", file=sys.stderr)
        status()
        return 1

    print("Status:", health.get("status", "unknown"))
    print("✅ Service is healthy" if health.get("ready") else "⏳ Starting up...")
    if health.get("error"):
        print("   Reason:", health["error"])
    print(f"Open: {base}")
    try:
        # There is no setup token: the first account to register becomes admin.
        if _get_json(base + "/api/auth/status").get("hasUser") is False:
            print(f"⚠️  No account yet — the first user to register at {base} becomes admin.")
    except Exception:
        pass  # older backend, or the route is unavailable — not worth failing a doctor run over
    status()
    return 0


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def test_runtime(endpoint: str) -> int:
    if not _valid_endpoint(endpoint):
        print("Endpoint must be a valid http or https URL", file=sys.stderr)
        return 2
    try:
        with urllib.request.urlopen(endpoint.rstrip("/") + "/api/tags", timeout=5) as response:
            print(response.read().decode())
        return 0
    except Exception as exc:
        print(f"Runtime unavailable: {exc}", file=sys.stderr)
        return 1


def _valid_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def install(runtime: str, dry_run: bool) -> int:
    command = INSTALL[runtime]  # argparse restricts this to INSTALL's keys
    print("Planned command:", " ".join(command))
    if dry_run:
        return 0
    answer = input("Install this host runtime? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled")
        return 0
    return _run(command)


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="lm-webui-host",
        description="Inspect this host and manage the runtimes and host bridge LM-WebUI uses",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="JSON inventory of this host (no network calls)")
    doctor = sub.add_parser("doctor", help="check a running LM-WebUI, then show the host inventory")
    doctor.add_argument(
        "--url",
        default=os.environ.get("LMWEBUI_APP_URL", "http://localhost:7070"),
        help="base URL of the running app (env: LMWEBUI_APP_URL)",
    )
    runtime = sub.add_parser("runtime")
    runtime_sub = runtime.add_subparsers(dest="runtime_command", required=True)
    test = runtime_sub.add_parser("test", help="probe an Ollama-compatible endpoint")
    test.add_argument("endpoint", nargs="?", default="http://127.0.0.1:11434")
    install_parser = runtime_sub.add_parser("install")
    install_parser.add_argument("runtime", choices=sorted(INSTALL))
    install_parser.add_argument("--dry-run", action="store_true")
    serve_parser = runtime_sub.add_parser("serve", help="run the authenticated host bridge")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if args.command == "status":
        return status()
    if args.command == "doctor":
        return doctor_check(args.url)
    if args.command == "runtime":
        if args.runtime_command == "test":
            return test_runtime(args.endpoint)
        if args.runtime_command == "install":
            return install(args.runtime, args.dry_run)
        if args.runtime_command == "serve":
            from .agent_server import serve
            serve(args.host, args.port)
            return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
