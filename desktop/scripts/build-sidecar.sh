#!/usr/bin/env bash
set -euo pipefail

desktop_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$(cd "$desktop_dir/.." && pwd)"
output="$desktop_dir/src-tauri/binaries"
rm -rf "$output" "$desktop_dir/src-tauri/web-dist"
mkdir -p "$output" "$desktop_dir/src-tauri/web-dist"

cp -R "$repo_dir/web/dist/." "$desktop_dir/src-tauri/web-dist/"

pyinstaller_bin="${PYINSTALLER_BIN:-pyinstaller}"
if ! command -v "$pyinstaller_bin" >/dev/null 2>&1; then
  echo "pyinstaller is required to build the backend sidecar" >&2
  exit 1
fi

"$pyinstaller_bin" --noconfirm --clean --onefile \
  --name lm-webui-backend \
  --paths "$repo_dir/backend" \
  --distpath "$output" \
  --workpath "$desktop_dir/.pyinstaller" \
  --specpath "$desktop_dir/.pyinstaller" \
  "$desktop_dir/scripts/backend_entry.py"
