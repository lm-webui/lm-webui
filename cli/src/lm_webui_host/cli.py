from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import urlparse


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


def register_runtime(runtime: str, endpoint: str, server: str) -> int:
    if not _valid_endpoint(endpoint) or not _valid_endpoint(server):
        print("Server and endpoint must be valid http or https URLs", file=sys.stderr)
        return 2
    print(json.dumps({
        "next": "Register this endpoint from the admin Runtime Manager",
        "server": server.rstrip("/"),
        "runtime_type": runtime,
        "endpoint": endpoint.rstrip("/"),
    }, indent=2))
    return 0


def install(runtime: str, dry_run: bool) -> int:
    commands = {
        "ollama": ["sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
        "mlx": [sys.executable, "-m", "pip", "install", "mlx", "mlx-lm"],
        "gguf": [sys.executable, "-m", "pip", "install", "llama-cpp-python"],
        "vllm": [sys.executable, "-m", "pip", "install", "vllm"],
    }
    if runtime not in commands:
        print(f"Unsupported host runtime: {runtime}", file=sys.stderr)
        return 2
    command = commands[runtime]
    print("Planned command:", " ".join(command))
    if dry_run:
        return 0
    answer = input("Install this host runtime? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled")
        return 0
    return _run(command)


def main() -> int:
    parser = argparse.ArgumentParser(prog="lm-webui-host", description="Manage host runtimes used by LM-WebUI")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    sub.add_parser("doctor")
    runtime = sub.add_parser("runtime")
    runtime_sub = runtime.add_subparsers(dest="runtime_command", required=True)
    runtime_sub.add_parser("list")
    detect = runtime_sub.add_parser("detect")
    test = runtime_sub.add_parser("test")
    test.add_argument("endpoint", nargs="?", default="http://127.0.0.1:11434")
    register = runtime_sub.add_parser("register")
    register.add_argument("runtime", choices=["ollama", "openai_compatible", "vllm", "llamacpp"])
    register.add_argument("--endpoint", required=True)
    register.add_argument("--server", default="http://127.0.0.1:7070")
    install_parser = runtime_sub.add_parser("install")
    install_parser.add_argument("runtime", choices=["ollama", "mlx", "gguf", "vllm"])
    install_parser.add_argument("--dry-run", action="store_true")
    uninstall_parser = runtime_sub.add_parser("uninstall")
    uninstall_parser.add_argument("runtime", choices=["ollama", "mlx", "gguf", "vllm"])
    args = parser.parse_args()
    if args.command in {"status", "doctor"}:
        return status()
    if args.runtime_command in {"list", "detect"}:
        return status()
    if args.runtime_command == "test":
        return test_runtime(args.endpoint)
    if args.runtime_command == "register":
        return register_runtime(args.runtime, args.endpoint, args.server)
    if args.runtime_command == "install":
        return install(args.runtime, args.dry_run)
    if args.runtime_command == "uninstall":
        print(f"Remove {args.runtime} using the host operating system's package/service manager.")
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
