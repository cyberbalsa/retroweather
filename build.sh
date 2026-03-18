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

command -v gh &>/dev/null || die "gh not installed. Run: ./sign-release.sh --setup"
gh auth status &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"

info "Building release APK + AAB (targetSdk 35)..."
./gradlew assembleRelease bundleRelease

apk="app/build/outputs/apk/release/app-release-unsigned.apk"
aab="app/build/outputs/bundle/release/app-release.aab"

[[ -f "$apk" ]] || die "APK not found: $apk"
[[ -f "$aab" ]] || die "AAB not found: $aab"

info "Uploading unsigned artifacts to GitHub release $RELEASE_TAG..."
gh release upload "$RELEASE_TAG" "$apk" "$aab" \
    --repo "$REPO" \
    --clobber

success "Build uploaded. Now run: ./sign-release.sh $RELEASE_TAG"
