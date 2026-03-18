#!/usr/bin/env bash
# sign-release.sh — Sign WeatherStar Kiosk APK + AAB and update GitHub release.
# Run this on your laptop (Fedora) where the YubiKey is plugged in.
# Supports YubiKey PIV (auto-detected) and file keystore fallback.
#
# Usage:
#   ./sign-release.sh [TAG]          # defaults to v1.0
#   KEYSTORE=/path/to.jks ./sign-release.sh v1.1

set -euo pipefail

REPO="cyberbalsa/retroweather"
RELEASE_TAG="${1:-v1.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGNED_DIR="$SCRIPT_DIR/releases-signed"
OPENSC_LIB="/usr/lib64/opensc-pkcs11.so"
PKCS11_CFG="$SCRIPT_DIR/.yubikey-pkcs11.cfg"

# File keystore config (used when YubiKey PIV not detected)
KEYSTORE="${KEYSTORE:-$HOME/.android/weatherstarkiosk.jks}"
KEY_ALIAS="${KEY_ALIAS:-weatherstarkiosk}"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── Install required packages (Fedora/dnf) ────────────────────────────────────
install_deps() {
    local pkgs=()

    command -v gh          &>/dev/null || pkgs+=(gh)
    command -v keytool     &>/dev/null || pkgs+=(java-17-openjdk)
    command -v jarsigner   &>/dev/null || pkgs+=(java-17-openjdk)
    command -v ykman       &>/dev/null || pkgs+=(yubikey-manager)
    [[ -f "$OPENSC_LIB" ]]             || pkgs+=(opensc)
    command -v zipalign    &>/dev/null || true  # optional, apksigner handles alignment

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing missing packages: ${pkgs[*]}"
        sudo dnf install -y "${pkgs[@]}"
    fi

    # gh auth check
    gh auth status &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"
}

# ── Locate apksigner from Android SDK ────────────────────────────────────────
find_apksigner() {
    command -v apksigner 2>/dev/null && return
    local sdk
    sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
    if [[ -d "$sdk/build-tools" ]]; then
        local ver
        ver=$(ls "$sdk/build-tools/" | sort -V | tail -1)
        local bin="$sdk/build-tools/$ver/apksigner"
        [[ -x "$bin" ]] && echo "$bin" && return
    fi
    echo ""
}

# ── YubiKey PIV detection ─────────────────────────────────────────────────────
detect_yubikey_piv() {
    command -v ykman    &>/dev/null || return 1
    [[ -f "$OPENSC_LIB" ]]         || return 1
    ykman info 2>/dev/null | grep -q "PIV.*Enabled" || return 1
    # Confirm a key is actually in slot 9c (digital signature)
    ykman piv info 2>/dev/null | grep -q "9c" || return 1
    return 0
}

write_pkcs11_cfg() {
    cat > "$PKCS11_CFG" <<EOF
name = YubiKey
library = $OPENSC_LIB
slot = 0
EOF
}

# ── Keystore setup (file fallback) ────────────────────────────────────────────
ensure_keystore() {
    if [[ -f "$KEYSTORE" ]]; then
        success "Keystore: $KEYSTORE"
        return
    fi

    warn "No keystore found at $KEYSTORE"
    info "Generating a new 4096-bit RSA signing key..."
    echo ""
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -alias "$KEY_ALIAS" \
        -keyalg RSA \
        -keysize 4096 \
        -validity 10000 \
        -storetype pkcs12 \
        -dname "CN=WeatherStar Kiosk, OU=Android, O=cyberbalsa, C=US"

    echo ""
    success "Keystore created: $KEYSTORE"
    warn "BACK THIS FILE UP. Losing it means you cannot publish updates to the Play Store."
    echo ""
}

# ── Sign APK ──────────────────────────────────────────────────────────────────
sign_apk() {
    local input="$1" output="$2"
    local apksigner
    apksigner=$(find_apksigner)

    if [[ -z "$apksigner" ]]; then
        warn "apksigner not found in Android SDK. Signing APK with jarsigner (v1 only)."
        warn "Install Android build-tools for full v2/v3 APK signing."
        sign_jar "$input" "$output"
        return
    fi

    info "Signing APK..."
    if detect_yubikey_piv; then
        info "  Method: YubiKey PIV slot 9c via PKCS11"
        write_pkcs11_cfg
        "$apksigner" sign \
            --ks NONE \
            --ks-type PKCS11 \
            --ks-provider-class sun.security.pkcs11.SunPKCS11 \
            --ks-provider-arg "$PKCS11_CFG" \
            --ks-key-alias "$KEY_ALIAS" \
            --out "$output" \
            "$input"
    else
        info "  Method: file keystore ($KEYSTORE)"
        "$apksigner" sign \
            --ks "$KEYSTORE" \
            --ks-key-alias "$KEY_ALIAS" \
            --out "$output" \
            "$input"
    fi

    info "Verifying APK signature..."
    "$apksigner" verify --print-certs "$output"
    success "APK signed: $(basename "$output")"
}

# ── Sign AAB (and any JAR-based artifact) ─────────────────────────────────────
sign_jar() {
    local input="$1" output="$2"
    cp "$input" "$output"

    info "Signing AAB..."
    if detect_yubikey_piv; then
        info "  Method: YubiKey PIV slot 9c via PKCS11"
        write_pkcs11_cfg
        jarsigner \
            -providerClass sun.security.pkcs11.SunPKCS11 \
            -providerArg "$PKCS11_CFG" \
            -keystore NONE \
            -storetype PKCS11 \
            -tsa http://timestamp.digicert.com \
            "$output" "$KEY_ALIAS"
    else
        info "  Method: file keystore ($KEYSTORE)"
        jarsigner \
            -keystore "$KEYSTORE" \
            -tsa http://timestamp.digicert.com \
            "$output" "$KEY_ALIAS"
    fi

    info "Verifying AAB signature..."
    jarsigner -verify "$output" && success "AAB signed: $(basename "$output")"
}

# ── Remove an asset from the release (ignore if missing) ─────────────────────
delete_release_asset() {
    local tag="$1" name="$2"
    gh release delete-asset "$tag" "$name" --repo "$REPO" --yes 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}WeatherStar Kiosk — Release Signing${NC}"
    echo -e "Tag: ${YELLOW}$RELEASE_TAG${NC}  Repo: ${YELLOW}$REPO${NC}"
    echo ""

    install_deps

    mkdir -p "$SIGNED_DIR"

    # Signing method
    if detect_yubikey_piv; then
        success "YubiKey PIV detected — hardware key signing enabled"
    else
        warn "YubiKey PIV not detected — falling back to file keystore"
        ensure_keystore
    fi
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

    local unsigned_apk unsigned_aab
    unsigned_apk=$(find "$tmp" -name "*.apk" | head -1)
    unsigned_aab=$(find "$tmp" -name "*.aab" | head -1)

    [[ -z "$unsigned_apk" && -z "$unsigned_aab" ]] && die "No APK or AAB found in release $RELEASE_TAG"

    local base="${RELEASE_TAG#v}"  # strip leading 'v'
    local signed_apk="$SIGNED_DIR/weatherstarkiosk-${base}-signed.apk"
    local signed_aab="$SIGNED_DIR/weatherstarkiosk-${base}-signed.aab"

    echo ""
    [[ -n "$unsigned_apk" ]] && sign_apk "$unsigned_apk" "$signed_apk"
    echo ""
    [[ -n "$unsigned_aab" ]] && sign_jar "$unsigned_aab" "$signed_aab"
    echo ""

    # Update GitHub release: remove unsigned, upload signed
    info "Updating GitHub release $RELEASE_TAG..."
    delete_release_asset "$RELEASE_TAG" "app-release-unsigned.apk"
    delete_release_asset "$RELEASE_TAG" "app-release.aab"

    [[ -f "$signed_apk" ]] && gh release upload "$RELEASE_TAG" "$signed_apk" --repo "$REPO"
    [[ -f "$signed_aab" ]] && gh release upload "$RELEASE_TAG" "$signed_aab" --repo "$REPO"

    echo ""
    success "Release updated: https://github.com/$REPO/releases/tag/$RELEASE_TAG"
    echo ""
    info "Signed artifacts in releases-signed/:"
    ls -lh "$SIGNED_DIR/"
    echo ""
}

main "$@"
