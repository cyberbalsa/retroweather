# CI/CD Pipeline Design — WeatherStar Kiosk

**Date:** 2026-03-18
**Project:** `cyberbalsa/retroweather` (Android app)
**Status:** Approved

---

## Overview

Replace the current FIDO2/YubiKey signing workflow with a fully automated GitHub Actions pipeline. On every version tag push, the pipeline builds, signs, and publishes a GitHub Release with signed APK and AAB artifacts. All signing credentials are stored as GitHub repository secrets.

---

## Removed Files

The following files are deleted as part of this change:

| File | Reason |
|------|--------|
| `fido2_keysign.py` | FIDO2 signing implementation — replaced by standard keystore |
| `sign-release.sh` | Manual signing script — replaced by GitHub Actions workflow |

`generate_icons.py` and `build.sh` are retained (build helper, not signing-related).

---

## GitHub Secrets Required

Four secrets must be set in the repository (`Settings → Secrets and variables → Actions`):

| Secret name | Contents |
|-------------|----------|
| `KEYSTORE_BASE64` | Base64-encoded `.jks` Android keystore file |
| `STORE_PASSWORD` | Keystore store password |
| `KEY_ALIAS` | Key alias within the keystore |
| `KEY_PASSWORD` | Key password |

A new keystore is generated once locally with `keytool` and the base64-encoded output is pasted into `KEYSTORE_BASE64`. The raw `.jks` file is never committed.

**Prerequisite:** `package-lock.json` must be committed to the repository (run `npm install` locally and commit the lockfile) so that `npm ci` works reliably in CI.

---

## Workflow: `.github/workflows/release.yml`

### Trigger

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

Fires only when a semver tag (e.g. `v1.2.3`) is pushed. No other events trigger this workflow.

### Permissions

```yaml
permissions:
  contents: write   # required to create GitHub Releases and upload assets
```

`GITHUB_TOKEN` is passed to the `gh` CLI via `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in the environment of the release step — no PAT required.

### Jobs

#### `build-and-release`

Runs on `ubuntu-latest`.

**Steps:**

1. **Checkout** — full clone (`fetch-depth: 0`) so `git rev-list --count HEAD` works for `versionCode`
2. **Set up Java 21** — `actions/setup-java@v4` with `temurin` distribution
3. **Cache Gradle** — `actions/cache@v4` on `~/.gradle/caches` and `~/.gradle/wrapper`
4. **Make gradlew executable** — `chmod +x gradlew` (required on Linux runners; the executable bit is not always preserved)
5. **Run JS lint + tests** — `npm ci && npm test` (requires `package-lock.json` committed to repo)
6. **Run Android unit tests** — `./gradlew test`
7. **Assemble release** — `./gradlew assembleRelease bundleRelease`
8. **Decode keystore** — write `KEYSTORE_BASE64` secret to `$RUNNER_TEMP/keystore.jks` (not the workspace, to avoid accidental artifact upload):
   ```bash
   echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 --decode > "$RUNNER_TEMP/keystore.jks"
   ```
9. **Sign APK** — `apksigner sign` with secrets injected as env vars:
   ```bash
   apksigner sign \
     --ks "$RUNNER_TEMP/keystore.jks" \
     --ks-key-alias "$KEY_ALIAS" \
     --ks-pass "env:STORE_PASSWORD" \
     --key-pass "env:KEY_PASSWORD" \
     --out app/build/outputs/apk/release/app-release-signed.apk \
     app/build/outputs/apk/release/app-release-unsigned.apk
   ```
   Env vars `KEY_ALIAS`, `STORE_PASSWORD`, and `KEY_PASSWORD` are set from the corresponding secrets.

10. **Sign AAB** — `jarsigner` (the standard tool for AAB signing; apksigner does not accept AAB format). The `-signedjar` flag writes signed output to a separate file; no pre-copy is needed:
    ```bash
    jarsigner \
      -keystore "$RUNNER_TEMP/keystore.jks" \
      -storepass "$STORE_PASSWORD" \
      -keypass "$KEY_PASSWORD" \
      -signedjar app/build/outputs/bundle/release/app-release-signed.aab \
      app/build/outputs/bundle/release/app-release.aab \
      "$KEY_ALIAS"
    ```
    `STORE_PASSWORD`, `KEY_PASSWORD`, and `KEY_ALIAS` are env vars set from the corresponding secrets. Note: unlike `apksigner`, `jarsigner` does not support the `env:` prefix — passwords are passed as expanded shell variables. This means they may briefly appear in process listings (`ps aux`). On GitHub-hosted ephemeral runners this is an acceptable risk (single-tenant, discarded after the job), but should be noted.

11. **Verify APK signature** — `apksigner verify --verbose app/build/outputs/apk/release/app-release-signed.apk` — fails loudly if signing was not applied correctly, preventing a broken release.

12. **Clean up keystore** — `rm -f "$RUNNER_TEMP/keystore.jks"` — removes the keystore file from the runner immediately after signing.

13. **Create GitHub Release** — using `gh release create`:
    ```bash
    gh release create "$TAG" \
      --title "$TAG" \
      --notes "Release $TAG" \
      app/build/outputs/apk/release/app-release-signed.apk \
      app/build/outputs/bundle/release/app-release-signed.aab
    ```
    where `TAG` is the git tag (e.g. `v1.2.3`). The `GH_TOKEN` env var is set to `${{ secrets.GITHUB_TOKEN }}`.

### Signing approach

Signing is done at the workflow level (not in `build.gradle`) to keep secrets out of the Gradle config and simplify local builds. The `assembleRelease` task produces an unsigned APK; the workflow then signs it explicitly with `apksigner`. The `bundleRelease` task produces an unsigned AAB signed with `jarsigner`.

`app/build.gradle` release build type keeps `minifyEnabled true` but has no `signingConfig` block — signing happens post-build.

---

## Security Practices

- Keystore decoded to `$RUNNER_TEMP` (not the workspace), reducing risk of accidental artifact inclusion
- Keystore deleted immediately after signing (step 12), before the release is created
- Secrets accessed only via `${{ secrets.* }}` — never echoed or logged
- `apksigner` receives passwords via the `env:` prefix (not CLI args), so they don't appear in process listings; `jarsigner` does not support this mechanism and receives passwords as expanded shell variables — acceptable on ephemeral GitHub-hosted runners but worth noting
- `apksigner verify` (step 11) ensures a bad keystore fails loudly before a release is created
- Workflow has minimal permissions: `contents: write` only

---

## Local Build (unchanged)

```bash
./gradlew assembleRelease    # produces unsigned APK — sign manually if needed
./gradlew bundleRelease      # produces unsigned AAB
```

Local developers no longer need a YubiKey or any signing setup to build.

---

## Release Flow (new)

```
git tag v1.2.3
git push origin v1.2.3
  → GitHub Actions triggers
  → builds APK + AAB
  → signs with keystore from secrets
  → creates GitHub Release v1.2.3
  → uploads app-release-signed.apk + app-release-signed.aab
```

---

## Out of Scope

- Play Store publishing (no `fastlane` or `google-play` action)
- PR/push build checks (only tag releases)
- Code signing certificate rotation automation
