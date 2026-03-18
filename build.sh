#!/usr/bin/env bash
# build.sh — Build unsigned APK + AAB and upload to GitHub release.
#
# Usage:
#   ./build.sh [TAG]      # defaults to v1.0
#
# After this, run ./sign-release.sh [TAG] to sign and re-upload.

set -euo pipefail

REPO="cyberbalsa/retroweather"
RELEASE_TAG="${1:-v1.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

cd "$SCRIPT_DIR"

# ── Ensure Java ───────────────────────────────────────────────────────────────
if ! command -v java &>/dev/null; then
    info "Java not found — installing..."
    if command -v dnf5 &>/dev/null; then
        sudo dnf5 install -y java-latest-openjdk-devel
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y java-latest-openjdk-devel
    elif command -v apt-get &>/dev/null; then
        sudo apt-get install -y default-jdk-headless
    else
        die "Java not found and no supported package manager. Install a JDK manually."
    fi
fi

# ── Ensure gh CLI ─────────────────────────────────────────────────────────────
command -v gh &>/dev/null || die "gh not installed. Run: ./sign-release.sh --setup"
gh auth status &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"

# ── Ensure Gradle 8.12 ────────────────────────────────────────────────────────
GRADLE_HOME="$HOME/.local/gradle-8.12"
GRADLE="$GRADLE_HOME/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
    info "Downloading Gradle 8.12..."
    tmp_zip=$(mktemp --suffix=.zip)
    curl -fL "https://services.gradle.org/distributions/gradle-8.12-bin.zip" -o "$tmp_zip"
    mkdir -p "$HOME/.local"
    unzip -q "$tmp_zip" -d "$HOME/.local"
    mv "$HOME/.local/gradle-8.12" "$GRADLE_HOME" 2>/dev/null || true
    rm -f "$tmp_zip"
    [[ -x "$GRADLE" ]] || die "Gradle download failed."
    success "Gradle 8.12 installed at $GRADLE_HOME"
fi

info "Building release APK + AAB (targetSdk 35)..."
"$GRADLE" assembleRelease bundleRelease

apk="app/build/outputs/apk/release/app-release-unsigned.apk"
aab="app/build/outputs/bundle/release/app-release.aab"

[[ -f "$apk" ]] || die "APK not found: $apk"
[[ -f "$aab" ]] || die "AAB not found: $aab"

info "Uploading unsigned artifacts to GitHub release $RELEASE_TAG..."
gh release upload "$RELEASE_TAG" "$apk" "$aab" \
    --repo "$REPO" \
    --clobber

success "Build uploaded. Now run: ./sign-release.sh $RELEASE_TAG"
