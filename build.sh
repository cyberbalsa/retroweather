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

# ── Ensure Java 21 (Gradle 8.12 does not support Java 22+) ───────────────────
find_java21() {
    # Fedora: /usr/lib/jvm/java-21-openjdk (symlink) or versioned dir
    local j
    for j in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-21; do
        [[ -x "$j/bin/java" ]] && echo "$j" && return 0
    done
    j=$(find /usr/lib/jvm -maxdepth 1 -name "java-21*" -type d 2>/dev/null | sort -V | tail -1)
    [[ -n "$j" && -x "$j/bin/java" ]] && echo "$j" && return 0
    return 1
}
if ! JAVA21_HOME=$(find_java21); then
    info "Java 21 not found — installing..."
    if command -v dnf5 &>/dev/null; then
        sudo dnf5 install -y java-21-openjdk-devel
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y java-21-openjdk-devel
    elif command -v apt-get &>/dev/null; then
        sudo apt-get install -y openjdk-21-jdk-headless
    else
        die "No supported package manager. Install java-21-openjdk-devel manually."
    fi
    JAVA21_HOME=$(find_java21) || die "Java 21 not found after install."
fi
export JAVA_HOME="$JAVA21_HOME"
info "Using Java 21: $JAVA_HOME"

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

# ── Fetch and build ws4kp assets ─────────────────────────────────────────────
WS4KP_VERSION="6.5.3"
WS4KP_ASSETS="$SCRIPT_DIR/app/src/main/assets/ws4kp"
WS4KP_MARKER="$WS4KP_ASSETS/.version"

if [[ "$(cat "$WS4KP_MARKER" 2>/dev/null)" != "$WS4KP_VERSION" ]]; then
    info "Building ws4kp $WS4KP_VERSION assets..."

    if ! command -v node &>/dev/null; then
        if command -v dnf5 &>/dev/null; then
            sudo dnf5 install -y nodejs
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y nodejs
        elif command -v apt-get &>/dev/null; then
            sudo apt-get install -y nodejs npm
        else
            die "node not found and no supported package manager. Install Node.js manually."
        fi
    fi

    ws4kp_tmp=$(mktemp -d)
    trap 'rm -rf "$ws4kp_tmp"' EXIT
    curl -fL "https://github.com/netbymatt/ws4kp/archive/refs/tags/v${WS4KP_VERSION}.tar.gz" \
        | tar -xz -C "$ws4kp_tmp" --strip-components=1
    (cd "$ws4kp_tmp" && npm ci --silent && npx gulp buildDist)

    # Copy dist output into assets, preserving readme placeholder
    command -v rsync &>/dev/null || { sudo dnf5 install -y rsync 2>/dev/null || sudo dnf install -y rsync 2>/dev/null || sudo apt-get install -y rsync; }
    rsync -a --delete --exclude=readme.txt "$ws4kp_tmp/dist/" "$WS4KP_ASSETS/"
    echo "$WS4KP_VERSION" > "$WS4KP_MARKER"
    success "ws4kp $WS4KP_VERSION assets ready."
else
    info "ws4kp $WS4KP_VERSION assets already present."
fi

# ── Android SDK ───────────────────────────────────────────────────────────────
if [[ -z "${ANDROID_HOME:-}" ]]; then
    for candidate in "$HOME/android-sdk" "$HOME/Android/Sdk" "$HOME/Android/sdk" /opt/android-sdk; do
        [[ -d "$candidate/build-tools" ]] && { export ANDROID_HOME="$candidate"; break; }
    done
fi
[[ -n "${ANDROID_HOME:-}" ]] || die "Android SDK not found. Set ANDROID_HOME or install via ./sign-release.sh --setup"
info "Using Android SDK: $ANDROID_HOME"

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
