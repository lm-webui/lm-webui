#!/usr/bin/env bash
set -euo pipefail

out="${1:-dist/core}"
rm -rf "$out"
mkdir -p "$out"

python3 -m nuitka \
  --standalone \
  --output-dir="$out" \
  --output-filename=lmwebui-core \
  --include-package=app \
  --assume-yes-for-downloads \
  backend/core_entry.py

platform="$(python3 - <<'PY'
import platform
machine = platform.machine().lower()
machine = {"amd64": "x86_64", "aarch64": "arm64"}.get(machine, machine)
print(f"{platform.system().lower()}-{machine}")
PY
)"
mkdir -p "$out/$platform"
cp -R "$out/core_entry.dist/." "$out/$platform/"
rm -rf "$out/core_entry.dist" "$out/core_entry.build"
printf '{"platform":"%s","executable":"lmwebui-core"}\n' "$platform" > "$out/manifest.json"
