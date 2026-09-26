#!/usr/bin/env bash
set -euo pipefail

out="${1:-dist/core}"
rm -rf "$out"
mkdir -p "$out"

PYTHONPATH="${PYTHONPATH:-}:$(pwd)/backend" python3 -m nuitka \
  --standalone \
  --jobs=2 \
  --output-dir="$out" \
  --output-filename=lmwebui-core \
  --include-package=app \
  --include-data-files=backend/app/database/schema.sql=app/database/schema.sql \
  --assume-yes-for-downloads \
  packaging/core_entry.py

platform="$(python3 - <<'PY'
import platform
machine = platform.machine().lower()
machine = {"amd64": "x86_64", "aarch64": "arm64"}.get(machine, machine)
print(f"{platform.system().lower()}-{machine}")
PY
)"
binary="$out/core_entry.dist/lmwebui-core"
if [ ! -x "$binary" ]; then
  binary="$(find "$out/core_entry.dist" -maxdepth 1 -type f -perm -111 \
    ! -name '*.so' ! -name '*.so.*' -print -quit)"
fi
[ -n "$binary" ] && [ -x "$binary" ] || {
  echo "Nuitka did not produce a standalone executable" >&2
  find "$out" -maxdepth 2 -type f -print >&2
  exit 1
}
cp -R "$out/core_entry.dist/." "$out/"
cp "$binary" "$out/lmwebui-core"
chmod +x "$out/lmwebui-core"
rm -rf "$out/core_entry.dist" "$out/core_entry.build"
printf '{"platform":"%s","executable":"lmwebui-core"}\n' "$platform" > "$out/manifest.json"
