# GitHub Actions CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FIDO2/YubiKey signing workflow with a GitHub Actions pipeline that builds, signs, and publishes a GitHub Release when a `v*.*.*` tag is pushed.

**Architecture:** A single workflow file (`.github/workflows/release.yml`) triggers on semver tags, builds the APK and AAB with Gradle, signs them with a standard Android keystore stored as GitHub Secrets, verifies the signature, then creates a GitHub Release with both artifacts attached. Signing happens post-build at the workflow level — not in `build.gradle` — so local builds remain simple.

**Tech Stack:** GitHub Actions, `ubuntu-latest`, Java 21 (Temurin), Gradle 8.x, `apksigner` (APK signing), `jarsigner` (AAB signing), `gh` CLI (release creation), `keytool` (keystore generation, run locally once).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `.github/workflows/release.yml` | Main CI/CD workflow |
| **Delete** | `fido2_keysign.py` | FIDO2 signing — replaced |
| **Delete** | `sign-release.sh` | Manual signing script — replaced |
| **Commit** | `package-lock.json` | Required by `npm ci` in CI (generate locally) |

No changes to `app/build.gradle` — it intentionally has no `signingConfig` block.

---

## Task 1: Generate the Android Keystore (local, one-time)

**Files:** none committed — keystore stays off-disk after uploading to GitHub Secrets

- [ ] **Step 1: Generate a new `.jks` keystore**

  Run locally (not in the repo directory — keep it out of the workspace):

  ```bash
  keytool -genkey -v \
    -keystore ~/weatherstar-release.jks \
    -alias weatherstar \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass CHOOSE_A_STRONG_PASSWORD \
    -keypass CHOOSE_A_STRONG_PASSWORD \
    -dname "CN=WeatherStar Kiosk, OU=Release, O=cyberbalsa, L=Unknown, ST=Unknown, C=US"
  ```

  Replace `CHOOSE_A_STRONG_PASSWORD` with a real password (same value for both flags is fine). Record the values — you'll need them as secrets.

- [ ] **Step 2: Base64-encode the keystore**

  ```bash
  base64 -w 0 ~/weatherstar-release.jks
  ```

  Copy the full output string — this goes into `KEYSTORE_BASE64`.

- [ ] **Step 3: Add all four secrets to the GitHub repository**

  Navigate to: `https://github.com/cyberbalsa/retroweather/settings/secrets/actions`

  Add these four repository secrets:

  | Name | Value |
  |------|-------|
  | `KEYSTORE_BASE64` | Output from Step 2 |
  | `STORE_PASSWORD` | The store password chosen in Step 1 |
  | `KEY_ALIAS` | `weatherstar` |
  | `KEY_PASSWORD` | The key password chosen in Step 1 |

  Or use `gh` CLI:
  ```bash
  gh secret set KEYSTORE_BASE64 --repo cyberbalsa/retroweather < <(base64 -w 0 ~/weatherstar-release.jks)
  gh secret set STORE_PASSWORD  --repo cyberbalsa/retroweather
  gh secret set KEY_ALIAS       --repo cyberbalsa/retroweather
  gh secret set KEY_PASSWORD    --repo cyberbalsa/retroweather
  ```

- [ ] **Step 4: Delete the local keystore file**

  ```bash
  rm ~/weatherstar-release.jks
  ```

  The keystore now lives only in GitHub Secrets. Do not commit it.

---

## Task 2: Commit `package-lock.json`

**Files:**
- Commit: `package-lock.json` (generated from existing `package.json`)

- [ ] **Step 1: Generate the lockfile**

  ```bash
  cd /home/cyberrange/weatherstartv
  npm install
  ```

  Expected: `package-lock.json` created/updated at repo root. Only `eslint` and its deps are installed.

- [ ] **Step 2: Verify tests still pass locally**

  ```bash
  npm test
  ```

  Expected output: three test files run and pass (location, music, settings tests).

- [ ] **Step 3: Commit the lockfile**

  ```bash
  git add package-lock.json
  git commit -m "chore: add package-lock.json for reproducible CI installs"
  ```

---

## Task 3: Delete FIDO2 signing files

**Files:**
- Delete: `fido2_keysign.py`
- Delete: `sign-release.sh`

- [ ] **Step 1: Delete the files**

  ```bash
  git rm fido2_keysign.py sign-release.sh
  ```

- [ ] **Step 2: Commit the deletion**

  ```bash
  git commit -m "chore: remove FIDO2/YubiKey signing — replaced by GitHub Actions"
  ```

---

## Task 4: Create the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflows directory**

  ```bash
  mkdir -p .github/workflows
  ```

- [ ] **Step 2: Write the workflow file**

  Create `.github/workflows/release.yml` with the following content:

  ```yaml
  name: Build and Release

  on:
    push:
      tags:
        - 'v*.*.*'

  permissions:
    contents: write

  jobs:
    build-and-release:
      runs-on: ubuntu-latest

      steps:
        - name: Checkout
          uses: actions/checkout@v4
          with:
            fetch-depth: 0

        - name: Set up Java 21
          uses: actions/setup-java@v4
          with:
            distribution: temurin
            java-version: '21'

        - name: Cache Gradle
          uses: actions/cache@v4
          with:
            path: |
              ~/.gradle/caches
              ~/.gradle/wrapper
            key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
            restore-keys: |
              ${{ runner.os }}-gradle-

        - name: Make gradlew executable
          run: chmod +x gradlew

        - name: JS lint and tests
          run: npm ci && npm test

        - name: Android unit tests
          run: ./gradlew test

        - name: Assemble release
          run: ./gradlew assembleRelease bundleRelease

        - name: Decode keystore
          run: |
            echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 --decode > "$RUNNER_TEMP/keystore.jks"

        - name: Sign APK
          env:
            KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
            STORE_PASSWORD: ${{ secrets.STORE_PASSWORD }}
            KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          run: |
            apksigner sign \
              --ks "$RUNNER_TEMP/keystore.jks" \
              --ks-key-alias "$KEY_ALIAS" \
              --ks-pass "env:STORE_PASSWORD" \
              --key-pass "env:KEY_PASSWORD" \
              --out app/build/outputs/apk/release/app-release-signed.apk \
              app/build/outputs/apk/release/app-release-unsigned.apk

        - name: Sign AAB
          env:
            KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
            STORE_PASSWORD: ${{ secrets.STORE_PASSWORD }}
            KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
          run: |
            jarsigner \
              -keystore "$RUNNER_TEMP/keystore.jks" \
              -storepass "$STORE_PASSWORD" \
              -keypass "$KEY_PASSWORD" \
              -signedjar app/build/outputs/bundle/release/app-release-signed.aab \
              app/build/outputs/bundle/release/app-release.aab \
              "$KEY_ALIAS"

        - name: Verify APK signature
          run: |
            apksigner verify --verbose \
              app/build/outputs/apk/release/app-release-signed.apk

        - name: Clean up keystore
          if: always()
          run: rm -f "$RUNNER_TEMP/keystore.jks"

        - name: Create GitHub Release
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          run: |
            TAG="${{ github.ref_name }}"
            gh release create "$TAG" \
              --title "$TAG" \
              --notes "Release $TAG" \
              app/build/outputs/apk/release/app-release-signed.apk \
              app/build/outputs/bundle/release/app-release-signed.aab
  ```

  Key design notes:
  - `fetch-depth: 0` is required — `app/build.gradle` computes `versionCode` via `git rev-list --count HEAD`
  - `apksigner` uses `env:STORE_PASSWORD` / `env:KEY_PASSWORD` to avoid passwords in process listings
  - `jarsigner` receives passwords as shell variables (no `env:` prefix support) — acceptable on ephemeral runners
  - `if: always()` on the keystore cleanup ensures the file is deleted even if a prior step fails
  - `github.ref_name` evaluates to the tag name (e.g. `v1.2.3`) on tag push events

- [ ] **Step 3: Commit the workflow**

  ```bash
  git add .github/workflows/release.yml
  git commit -m "ci: add GitHub Actions release pipeline with keystore signing"
  ```

---

## Task 5: Smoke-test the pipeline

**Files:** none changed

- [ ] **Step 1: Push all commits to the remote**

  ```bash
  git push origin main
  ```

  (Or whatever your default branch is — push any pending commits first.)

- [ ] **Step 2: Tag a test release and push the tag**

  ```bash
  git tag v0.0.1-test
  git push origin v0.0.1-test
  ```

- [ ] **Step 3: Watch the workflow run**

  ```bash
  gh run watch --repo cyberbalsa/retroweather
  ```

  Or open: `https://github.com/cyberbalsa/retroweather/actions`

  Expected: workflow runs, all steps pass, a new release `v0.0.1-test` appears at `https://github.com/cyberbalsa/retroweather/releases` with `app-release-signed.apk` and `app-release-signed.aab` attached.

- [ ] **Step 4: If any step fails, diagnose from the logs**

  Common failures and fixes:

  | Symptom | Likely cause | Fix |
  |---------|-------------|-----|
  | `npm ci` fails | `package-lock.json` not committed | Run `npm install`, commit lockfile |
  | `apksigner: command not found` | `build-tools` not on PATH | Add `build-tools-version` to `setup-java` or install manually |
  | `KEYSTORE_BASE64: bad base64` | Encoding issue on macOS | Use `base64 -w 0` (Linux) or `base64` without `-w` (macOS) |
  | `jarsigner: unable to open keystore` | Wrong path or corrupted decode | Verify the base64 decode step output size matches original |
  | `apksigner verify` fails | Wrong key alias or password | Double-check secret values match what was used in `keytool` |
  | Release already exists | Tag already had a release | Delete the release and re-push, or use a different tag |

- [ ] **Step 5: Delete the test release and tag (optional cleanup)**

  ```bash
  gh release delete v0.0.1-test --repo cyberbalsa/retroweather --yes
  git push origin --delete v0.0.1-test
  git tag -d v0.0.1-test
  ```

---

## Done

From now on, releasing is:

```bash
git tag v1.2.3
git push origin v1.2.3
```

GitHub Actions handles the rest.
