#!/usr/bin/env bash
# sign-release.sh — Sign WeatherStar Kiosk APK + AAB with YubiKey FIDO2.
#
# The signing key lives on the YubiKey as a resident FIDO2 credential.
# It is derived on every run via HMAC-secret and never written to disk.
# One physical touch signs both artifacts.
#
# First-time setup (burn credential to YubiKey):
#   ./sign-release.sh --setup
#
# Sign a release:
#   ./sign-release.sh [TAG]      # defaults to v1.0

set -euo pipefail

REPO="cyberbalsa/retroweather"
RELEASE_TAG="${1:-v1.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNED_DIR="$SCRIPT_DIR/releases-signed"
FIDO2_SCRIPT="$SCRIPT_DIR/fido2_keysign.py"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── Install dependencies ──────────────────────────────────────────────────────
install_deps() {
    local pkgs=()
    command -v gh &>/dev/null || pkgs+=(gh)

    # jarsigner lives in the JDK (devel), not the JRE.
    # Use java-latest-openjdk-devel so it works on Fedora 38-43+ regardless of version.
    if ! command -v jarsigner &>/dev/null; then
        pkgs+=(java-latest-openjdk-devel)
    fi

    python3 -c "import fido2"        2>/dev/null || pkgs+=(python3-fido2)
    python3 -c "import cryptography" 2>/dev/null || pkgs+=(python3-cryptography)

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing: ${pkgs[*]}"
        sudo dnf install -y "${pkgs[@]}"
    fi

    # pip fallback if dnf packages weren't found
    python3 -c "import fido2"        2>/dev/null || pip3 install --user fido2
    python3 -c "import cryptography" 2>/dev/null || pip3 install --user cryptography

    gh auth status &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"
}

# ── Drop release asset (silent if already gone) ───────────────────────────────
drop_asset() { gh release delete-asset "$1" "$2" --repo "$REPO" --yes 2>/dev/null || true; }

# ── Setup ─────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--setup" ]]; then
    install_deps
    python3 "$FIDO2_SCRIPT" setup
    exit 0
fi

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}WeatherStar Kiosk — Release Signing${NC}"
echo -e "Tag: ${YELLOW}$RELEASE_TAG${NC}  Repo: ${YELLOW}$REPO${NC}"
echo ""

install_deps

[[ -f "$FIDO2_SCRIPT" ]] || die "fido2_keysign.py not found next to this script."
python3 -c "
from pathlib import Path
import sys
cert = Path.home() / '.android' / 'weatherstar-signing-cert.pem'
cred = Path.home() / '.android' / 'weatherstar-fido2.json'
if not cert.exists() or not cred.exists():
    sys.exit('Signing not set up. Run: ./sign-release.sh --setup')
"

mkdir -p "$SIGNED_DIR"

# Download unsigned artifacts
info "Downloading artifacts from $RELEASE_TAG..."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

gh release download "$RELEASE_TAG" \
    --repo "$REPO" \
    --pattern "*.apk" \
    --pattern "*.aab" \
    --dir "$tmp"

unsigned_apk=$(find "$tmp" -name "*.apk" | head -1)
unsigned_aab=$(find "$tmp" -name "*.aab" | head -1)

[[ -z "$unsigned_apk" && -z "$unsigned_aab" ]] && \
    die "No APK or AAB found in release $RELEASE_TAG"

base="${RELEASE_TAG#v}"
signed_apk="$SIGNED_DIR/weatherstarkiosk-${base}-signed.apk"
signed_aab="$SIGNED_DIR/weatherstarkiosk-${base}-signed.aab"

echo ""
info "One touch will sign both artifacts..."
echo ""

# sign-both derives the key once (one touch) and signs APK + AAB
python3 "$FIDO2_SCRIPT" sign-apk "$unsigned_apk" "$signed_apk"
python3 "$FIDO2_SCRIPT" sign-aab "$unsigned_aab" "$signed_aab"

echo ""
info "Updating GitHub release $RELEASE_TAG..."
drop_asset "$RELEASE_TAG" "app-release-unsigned.apk"
drop_asset "$RELEASE_TAG" "app-release.aab"
[[ -f "$signed_apk" ]] && drop_asset "$RELEASE_TAG" "$(basename "$signed_apk")"
[[ -f "$signed_aab" ]] && drop_asset "$RELEASE_TAG" "$(basename "$signed_aab")"

[[ -f "$signed_apk" ]] && gh release upload "$RELEASE_TAG" "$signed_apk" --repo "$REPO"
[[ -f "$signed_aab" ]] && gh release upload "$RELEASE_TAG" "$signed_aab" --repo "$REPO"

success "Release updated: https://github.com/$REPO/releases/tag/$RELEASE_TAG"
echo ""
info "Signed artifacts in releases-signed/:"
ls -lh "$SIGNED_DIR/"
echo ""
