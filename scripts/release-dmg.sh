#!/usr/bin/env bash
# Build the macOS DMG on this machine and attach it to a GitHub release.
#
#   ./scripts/release-dmg.sh [tag]        # tag defaults to v<version in package.json>
#
# gh is OPTIONAL. With it the asset is uploaded for you; without it the script still builds
# and verifies, then prints the release page to drop the file onto. Attaching an asset is a
# drag-and-drop in the release editor — no tooling or token required.
#
# The DMG is uploaded as a RELEASE ASSET and never committed. It is a multi-MB binary and git
# keeps every version forever, so each rebuild would permanently grow every clone; releases
# give the same public download link without that.
#
# Why the build lives here rather than in CI:
#   * The app is ad-hoc signed (bundle.macOS.signingIdentity "-"), and the only way to be sure
#     the shipped artifact is the one that was tested is to test the artifact being shipped.
#     Building locally means the DMG you double-click is byte-for-byte the DMG that is uploaded.
#   * A DMG downloaded from GitHub is quarantined by macOS, so it shows the Gatekeeper prompt
#     wherever it is hosted. A locally built DMG opens only because it was never downloaded —
#     that is not "working", it is unquarantined. Only notarizing with a Developer ID removes
#     the prompt; see desktop/README.md.
#
# Requires: a macOS host, Rust, node, git and curl. (curl only to confirm the release exists.)
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

fail() { echo "  FAIL $*" >&2; exit 1; }
pass() { echo "  ok   $*"; }

[ "$(uname)" = "Darwin" ] || fail "the macOS DMG can only be built on macOS"

# owner/repo from the origin remote, so the release URL can be checked and printed for either
# remote form: git@host:owner/repo.git or https://host/owner/repo.git
remote="$(git -C "$repo_dir" remote get-url origin 2>/dev/null)" || fail "no origin remote"
slug="${remote%.git}"
case "$slug" in
  *://*) slug="${slug#*://}"; slug="${slug#*/}" ;;   # https://host/owner/repo -> owner/repo
  *:*)   slug="${slug#*:}" ;;                        # git@host:owner/repo   -> owner/repo
esac
[ -n "$slug" ] || fail "could not derive owner/repo from origin remote"

tag="${1:-v$(node -p "require('./package.json').version")}"

# -f makes curl exit non-zero on 404, so this doubles as the "does the release exist" check.
# The repo is public (install.sh fetches release assets unauthenticated), so no token is needed.
curl -fsSL -o /dev/null "https://github.com/$slug/releases/tag/$tag" \
  || fail "release $tag does not exist — push the tag first, release.yml creates it"

echo "building $tag"

# version:sync writes package.json's version into tauri.conf.json and Cargo.toml, so the bundle
# metadata cannot drift from the tag being released.
(cd desktop && npm run version:sync && npm run tauri -- build --bundles dmg)

# Newest by mtime: old builds accumulate in bundle/dmg and a plain `find | head -1` can pick a
# stale one from a previous version.
dmg="$(ls -t desktop/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
[ -n "$dmg" ] || fail "the build produced no DMG"

out="$repo_dir/LM-WebUI-macos-arm64.dmg"
cp "$dmg" "$out"
echo "  built $(du -h "$out" | cut -f1) $(basename "$out")"

# ── Verify the artifact, not the config ──────────────────────────────────
# Tauri only writes CFBundleIconFile when bundle.icon is set, and only seals the bundle when a
# signing identity exists. Neither failure errors the build — both shipped broken in 0.8.18 as
# a "damaged and can't be opened" dialog and a blank icon. So assert on the mounted app. This
# check used to run in CI; it moved here along with the build.
mnt="$(mktemp -d)"
detach() { hdiutil detach "$mnt" >/dev/null 2>&1 || true; rm -rf "$mnt"; }
trap detach EXIT
hdiutil attach "$out" -nobrowse -readonly -mountpoint "$mnt" >/dev/null
app="$mnt/LM-WebUI.app"

[ -d "$app" ] || fail "no LM-WebUI.app inside the DMG"
codesign --verify --deep --strict "$app" 2>/dev/null || fail "the code signature does not verify"
pass "code signature verifies"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$app/Contents/Info.plist" 2>/dev/null)" = "icon.icns" ] \
  || fail "CFBundleIconFile is missing — the app would show a generic icon"
[ -f "$app/Contents/Resources/icon.icns" ] || fail "Resources/icon.icns is missing"
pass "icon present"
[ ! -e "$app/Contents/Resources/binaries" ] || fail "a backend is bundled — the app must stay a shell"
pass "no bundled backend"

detach
trap - EXIT

# ── Attach it ────────────────────────────────────────────────────────────
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "uploading to $tag"
  gh release upload "$tag" "$out" --clobber
  echo "✅ $tag now serves $(basename "$out")"
else
  cat <<EOF
✅ built and verified: $out

Not uploaded — gh is absent or not authenticated. Attach it by hand:

  1. open  https://github.com/$slug/releases/edit/$tag
  2. drag  $(basename "$out")  into the assets box on that page

To have this step automated instead:  brew install gh && gh auth login
EOF
fi

cat <<EOF

Downloaders get a Gatekeeper prompt ("Apple cannot check it for malicious software") because
macOS quarantines anything downloaded. That is the ceiling without notarization; they clear it
with:

  xattr -dr com.apple.quarantine /Applications/LM-WebUI.app

EOF
