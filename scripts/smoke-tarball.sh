#!/usr/bin/env bash
# Smoke test a built release tarball: does it contain everything an install reads, and does
# installing it over an existing install leave the user's data and config alone?
#
# Run by .github/workflows/release.yml between `tar -czf` and `gh release upload`, so a broken
# tarball fails the release instead of shipping. Also runnable locally:
#
#   ./scripts/smoke-tarball.sh [path/to/lm-webui.tar.gz]
#
# Needs no network, no sudo, no npm, and touches nothing outside a temp dir.
set -euo pipefail

tarball="${1:-lm-webui.tar.gz}"
[ -f "$tarball" ] || { echo "no such tarball: $tarball" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tree="$work/tree"
home="$work/home"

fail() { echo "  FAIL $*" >&2; exit 1; }
pass() { echo "  ok   $*"; }

echo "smoke-testing $tarball ($(du -h "$tarball" | cut -f1))"

# ── 1. Shape ─────────────────────────────────────────────────────────────
# Both install.sh and `lm-webui update` extract with --strip-components=1, so the archive must
# have exactly one top-level directory or everything lands flat.
[ "$(tar -tzf "$tarball" | head -1)" = "lm-webui/" ] \
  || fail "top-level entry is not 'lm-webui/'"
pass "top-level directory"

mkdir -p "$tree"
tar -xzf "$tarball" -C "$tree" --strip-components=1

# Every one of these is read by an install step. A missing requirements.txt, for instance, only
# surfaces several steps later as a confusing pip error.
for f in app/main.py web/dist/index.html web/package.json config.yaml \
         requirements.txt requirements.lock install.sh lmwebui package.json; do
  [ -f "$tree/$f" ] || fail "missing $f"
done
pass "all install-time files present"

# index.html with no hashed bundles is a dist that built to nothing.
[ -n "$(ls -A "$tree/web/dist/assets" 2>/dev/null)" ] || fail "web/dist/assets is empty"
pass "frontend bundle has assets"

# install.sh and lmwebui each carry their own copy of the service unit, and they have drifted:
# LMWEBUI_BASE_DIR was added to one and not the other, so an `update` rewrote the unit WITHOUT it,
# undoing what a fresh install had just written. Any divergence in the variables the SERVICE UNIT
# sets means the two disagree about the environment the service runs in.
#
# Scoped to the service unit's own declarations — `Environment=NAME=` (systemd) and `<key>NAME</key>`
# (launchd) — rather than every LMWEBUI_* token in the file. Grepping all tokens also collected
# install-time knobs: LMWEBUI_INSTALL_APP is read once by install.sh to decide whether to copy the
# desktop app into /Applications, and it has no business appearing in the service unit. That false
# positive failed this check on v0.8.22 and v0.8.23, so the release job never published a tarball
# and `lm-webui update` stayed pinned to the last release that did.
grep -oE '(Environment=|<key>)LMWEBUI_[A-Z_]+' "$tree/install.sh" | sed 's/^Environment=//;s/^<key>//' | sort -u > "$work/env.install"
grep -oE '(Environment=|<key>)LMWEBUI_[A-Z_]+' "$tree/lmwebui"    | sed 's/^Environment=//;s/^<key>//' | sort -u > "$work/env.cli"
if ! diff -q "$work/env.install" "$work/env.cli" >/dev/null; then
  fail "install.sh and lmwebui disagree on LMWEBUI_* env vars:
$(diff "$work/env.install" "$work/env.cli" | sed 's/^/       /')"
fi
pass "install.sh and lmwebui agree on the service environment"

# Catches a truncated or half-copied script that would still extract fine.
bash -n "$tree/install.sh" || fail "install.sh does not parse"
bash -n "$tree/lmwebui"    || fail "lmwebui does not parse"
pass "shipped scripts parse"

# ── 2. Behaviour ─────────────────────────────────────────────────────────
# The regression test. `__install-tree` is what both the installer and `update` call, and the
# bug this guards is that a copy of it in install.sh preserved a live config.yaml while the
# CLI's copy replaced it. Assert the config and the data dirs come out the other side intact.
mkdir -p "$home/data" "$home/models"
printf 'sentinel: keep-me\n' > "$home/config.yaml"
echo keep > "$home/data/marker"
mkdir -p "$home/backend" && echo stale > "$home/backend/junk"   # a leftover git-clone dir

LMWEBUI_HOME="$home" bash "$tree/lmwebui" __install-tree "$tree" >/dev/null

grep -qx 'sentinel: keep-me' "$home/config.yaml" || fail "live config.yaml was replaced"
pass "config.yaml preserved"
grep -qx keep "$home/data/marker" || fail "data/ was destroyed"
pass "data/ preserved"
[ -f "$home/app/main.py" ] && [ -f "$home/web/dist/index.html" ] || fail "tree was not installed"
pass "application tree installed"
[ ! -e "$home/config.yaml.template" ] || fail "config.yaml.template left behind"
pass "template consumed"
[ ! -e "$home/backend" ] || fail "stale git-clone layout survived"
pass "stale clone layout cleared"

# The config the install ships must never leak the template's un-substituted home.
grep -qF '~/.lmwebui' "$home/config.yaml" && fail "config.yaml has an un-substituted ~/.lmwebui" || true
pass "config paths substituted"

# A fresh home (no config at all) gets one created from the template. Needs its own extraction:
# __install_tree consumes its source — it stages config.yaml AND lmwebui out of the tree, then
# deletes both — which is fine in practice because every real caller passes a freshly extracted
# temp dir and discards it. `$tree` no longer has an lmwebui in it by this point, so run the CLI
# from the tree being installed from; it can unlink its own script safely (the shell holds an fd).
fresh_tree="$work/tree2"; mkdir -p "$fresh_tree"
tar -xzf "$tarball" -C "$fresh_tree" --strip-components=1
fresh="$work/fresh"; mkdir -p "$fresh"
LMWEBUI_HOME="$fresh" bash "$fresh_tree/lmwebui" __install-tree "$fresh_tree" >/dev/null
[ -f "$fresh/config.yaml" ] || fail "no config.yaml created for a fresh install"
grep -q "$fresh" "$fresh/config.yaml" || fail "created config does not point at LMWEBUI_HOME"
pass "fresh install gets a config"

echo "tarball smoke test passed"
