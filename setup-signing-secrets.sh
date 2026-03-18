#!/usr/bin/env bash
# setup-signing-secrets.sh
# Generates an Android release keystore and uploads all signing secrets to GitHub.
# Run this once locally. The keystore is deleted after upload — it lives in GitHub Secrets only.
#
# Usage: ./setup-signing-secrets.sh [--repo owner/repo]
#
# Requirements: keytool (JDK), gh (GitHub CLI, authenticated)

set -euo pipefail

REPO="${REPO:-cyberbalsa/retroweather}"
KEY_ALIAS="${KEY_ALIAS:-weatherstar}"
KEYSTORE_FILE="$(mktemp --suffix=.jks)"
rm -f "$KEYSTORE_FILE"   # keytool refuses to write to an existing (even empty) file

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; rm -f "$KEYSTORE_FILE"; exit 1; }

# Parse --repo flag
while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo) REPO="$2"; shift 2 ;;
        *) die "Unknown argument: $1" ;;
    esac
done

echo ""
echo -e "${CYAN}WeatherStar Kiosk — Signing Secrets Setup${NC}"
echo -e "Repo: ${YELLOW}$REPO${NC}"
echo ""

# Check dependencies
command -v keytool &>/dev/null || die "keytool not found. Install a JDK (e.g. sudo apt install default-jdk)"
command -v gh     &>/dev/null || die "gh not found. Install from https://cli.github.com"
gh auth status    &>/dev/null || die "Not logged in to GitHub. Run: gh auth login"

# Prompt for passwords
echo "Enter a strong store password (used to protect the keystore file):"
read -r -s STORE_PASSWORD
[[ ${#STORE_PASSWORD} -ge 6 ]] || die "Password must be at least 6 characters."
echo ""

echo "Enter a strong key password (can be the same as store password):"
read -r -s KEY_PASSWORD
[[ ${#KEY_PASSWORD} -ge 6 ]] || die "Password must be at least 6 characters."
echo ""

# Generate keystore
info "Generating Android release keystore..."
keytool -genkey -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass  "$KEY_PASSWORD" \
    -dname "CN=WeatherStar Kiosk, OU=Release, O=cyberbalsa, L=Unknown, ST=Unknown, C=US" \
    2>/dev/null

success "Keystore generated."

# Upload secrets
info "Uploading secrets to $REPO..."

base64 -w 0 "$KEYSTORE_FILE" | gh secret set KEYSTORE_BASE64 --repo "$REPO"
success "KEYSTORE_BASE64 set"

printf '%s' "$STORE_PASSWORD" | gh secret set STORE_PASSWORD --repo "$REPO"
success "STORE_PASSWORD set"

printf '%s' "$KEY_ALIAS"     | gh secret set KEY_ALIAS      --repo "$REPO"
success "KEY_ALIAS set"

printf '%s' "$KEY_PASSWORD"  | gh secret set KEY_PASSWORD   --repo "$REPO"
success "KEY_PASSWORD set"

# Wipe keystore and passwords from memory
rm -f "$KEYSTORE_FILE"
unset STORE_PASSWORD KEY_PASSWORD

echo ""
success "All 4 secrets uploaded. Local keystore deleted."
echo ""
echo "Secrets now set on $REPO:"
gh secret list --repo "$REPO" | grep -E 'KEYSTORE_BASE64|STORE_PASSWORD|KEY_ALIAS|KEY_PASSWORD'
echo ""
echo -e "${CYAN}You're ready to release. Tag and push:${NC}"
echo "  git tag v1.0.0 && git push origin v1.0.0"
echo ""
