#!/usr/bin/env bash
# sign-release.sh — Sign WeatherStar Kiosk APK + AAB using YubiKey FIDO2 HMAC-secret.
#
# Run this on your Fedora laptop where the YubiKey is plugged in.
#
# First-time setup:
#   ./sign-release.sh --setup
#
# Subsequent releases:
#   ./sign-release.sh [TAG]          # defaults to v1.0
#   ./sign-release.sh v1.1
#
# The YubiKey derives a deterministic keystore password via FIDO2 HMAC-secret.
# Physical touch is required for every signing operation.

set -euo pipefail

REPO="cyberbalsa/retroweather"
RELEASE_TAG="${1:-v1.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNED_DIR="$SCRIPT_DIR/releases-signed"

KEYSTORE="$HOME/.android/weatherstarkiosk.jks"
KEY_ALIAS="weatherstarkiosk"
FIDO2_SCRIPT="$SCRIPT_DIR/fido2_keysign.py"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── Package installation ──────────────────────────────────────────────────────
install_deps() {
    local pkgs=()

    command -v gh        &>/dev/null || pkgs+=(gh)
    command -v keytool   &>/dev/null || pkgs+=(java-17-openjdk)
    command -v jarsigner &>/dev/null || pkgs+=(java-17-openjdk)

    # python3-fido2 for YubiKey HMAC-secret
    python3 -c "import fido2" 2>/dev/null || pkgs+=(python3-fido2)

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing: ${pkgs[*]}"
        sudo dnf install -y "${pkgs[@]}"
    fi

    # python3-fido2 might not be in all Fedora repos — pip fallback
    if ! python3 -c "import fido2" 2>/dev/null; then
        info "python3-fido2 not found in dnf, installing via pip..."
        pip3 install --user fido2
    fi

    gh auth status &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"
}

# ── Locate apksigner ──────────────────────────────────────────────────────────
find_apksigner() {
    command -v apksigner 2>/dev/null && return
    local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
    if [[ -d "$sdk/build-tools" ]]; then
        local ver
        ver=$(ls "$sdk/build-tools/" | sort -V | tail -1)
        local bin="$sdk/build-tools/$ver/apksigner"
        [[ -x "$bin" ]] && echo "$bin" && return
    fi
    echo ""
}

# ── Derive password from YubiKey ──────────────────────────────────────────────
derive_password() {
    local pw
    pw=$(python3 "$FIDO2_SCRIPT" derive) || die "YubiKey signing failed."
    [[ -n "$pw" ]] || die "Empty password returned from YubiKey."
    echo "$pw"
}

# ── Keystore setup (first run) ────────────────────────────────────────────────
setup_keystore() {
    info "Running first-time FIDO2 credential setup..."
    python3 "$FIDO2_SCRIPT" setup || die "FIDO2 setup failed."

    if [[ -f "$KEYSTORE" ]]; then
        success "Keystore already exists: $KEYSTORE"
        return
    fi

    info "Generating Android signing keystore (password derived from YubiKey)..."
    local pw
    pw=$(derive_password)

    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -alias "$KEY_ALIAS" \
        -keyalg RSA \
        -keysize 4096 \
        -validity 10000 \
        -storetype pkcs12 \
        -storepass "$pw" \
        -keypass "$pw" \
        -dname "CN=WeatherStar Kiosk, OU=Android, O=cyberbalsa, C=US"

    success "Keystore created: $KEYSTORE"
    warn "Back up $KEYSTORE and ~/.android/weatherstar-fido2.json — losing either"
    warn "means you cannot publish updates to the Play Store."
    echo ""
    success "Setup complete. Run ./sign-release.sh to sign a release."
}

# ── Sign APK ──────────────────────────────────────────────────────────────────
sign_apk() {
    local input="$1" output="$2" pw="$3"
    local apksigner
    apksigner=$(find_apksigner)

    if [[ -z "$apksigner" ]]; then
        warn "apksigner not found — signing APK with jarsigner (v1 only)."
        warn "For full v2/v3 signing install Android build-tools."
        sign_jar "$input" "$output" "$pw"
        return
    fi

    info "Signing APK (apksigner v2/v3)..."
    "$apksigner" sign \
        --ks "$KEYSTORE" \
        --ks-key-alias "$KEY_ALIAS" \
        --ks-pass "pass:$pw" \
        --key-pass "pass:$pw" \
        --out "$output" \
        "$input"

    info "Verifying APK signature..."
    "$apksigner" verify --print-certs "$output"
    success "APK signed: $(basename "$output")"
}

# ── Sign AAB ──────────────────────────────────────────────────────────────────
sign_jar() {
    local input="$1" output="$2" pw="$3"
    cp "$input" "$output"

    info "Signing AAB (jarsigner)..."
    jarsigner \
        -keystore "$KEYSTORE" \
        -storepass "$pw" \
        -keypass "$pw" \
        -tsa http://timestamp.digicert.com \
        "$output" "$KEY_ALIAS"

    info "Verifying AAB signature..."
    jarsigner -verify "$output"
    success "AAB signed: $(basename "$output")"
}

# ── Remove release asset (silent if missing) ──────────────────────────────────
drop_asset() {
    gh release delete-asset "$1" "$2" --repo "$REPO" --yes 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    if [[ "${1:-}" == "--setup" ]]; then
        install_deps
        setup_keystore
        exit 0
    fi

    echo ""
    echo -e "${CYAN}WeatherStar Kiosk — Release Signing${NC}"
    echo -e "Tag: ${YELLOW}$RELEASE_TAG${NC}  Repo: ${YELLOW}$REPO${NC}"
    echo ""

    install_deps

    [[ -f "$KEYSTORE" ]] || die "Keystore not found. Run first: ./sign-release.sh --setup"
    [[ -f "$FIDO2_SCRIPT" ]] || die "fido2_keysign.py not found alongside this script."

    mkdir -p "$SIGNED_DIR"

    # Single YubiKey touch — derive password once, reuse for both artifacts
    info "Deriving signing password from YubiKey HMAC-secret..."
    KEYSTORE_PW=$(derive_password)
    echo ""

    # Download unsigned artifacts
    info "Downloading artifacts from GitHub release $RELEASE_TAG..."
    local tmp
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

    local base="${RELEASE_TAG#v}"
    signed_apk="$SIGNED_DIR/weatherstarkiosk-${base}-signed.apk"
    signed_aab="$SIGNED_DIR/weatherstarkiosk-${base}-signed.aab"

    echo ""
    [[ -n "$unsigned_apk" ]] && sign_apk "$unsigned_apk" "$signed_apk" "$KEYSTORE_PW"
    echo ""
    [[ -n "$unsigned_aab" ]] && sign_jar "$unsigned_aab" "$signed_aab" "$KEYSTORE_PW"
    echo ""

    # Replace unsigned with signed on GitHub release
    info "Updating GitHub release $RELEASE_TAG..."
    drop_asset "$RELEASE_TAG" "app-release-unsigned.apk"
    drop_asset "$RELEASE_TAG" "app-release.aab"

    [[ -f "$signed_apk" ]] && gh release upload "$RELEASE_TAG" "$signed_apk" --repo "$REPO"
    [[ -f "$signed_aab" ]] && gh release upload "$RELEASE_TAG" "$signed_aab" --repo "$REPO"

    success "Release updated: https://github.com/$REPO/releases/tag/$RELEASE_TAG"
    echo ""
    info "Signed artifacts in releases-signed/:"
    ls -lh "$SIGNED_DIR/"
    echo ""
}

main "$@"
