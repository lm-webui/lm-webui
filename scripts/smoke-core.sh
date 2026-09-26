#!/usr/bin/env bash
set -euo pipefail

root="${1:?usage: smoke-core.sh <assembled-release-tree>}"
core="$root/core/lmwebui-core"
[ -x "$core" ] || { echo "missing executable: $core" >&2; exit 1; }

port="${LMWEBUI_SMOKE_PORT:-17070}"
data="$(mktemp -d)"
log="$data/core.log"
cleanup() {
  if [ -n "${pid:-}" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  rm -rf "$data"
}
trap cleanup EXIT

(
  cd "$root"
  LMWEBUI_BASE_DIR="$data/home" \
  LMWEBUI_PORT="$port" \
  "$core"
) >"$log" 2>&1 &
pid=$!

for _ in $(seq 1 45); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    echo "compiled core health check passed"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done

cat "$log" >&2
echo "compiled core did not become healthy" >&2
exit 1
