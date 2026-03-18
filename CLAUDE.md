# WeatherStar Kiosk — CLAUDE.md

## Project Overview

**Retro Weather** (package `com.weatherstartv`) is an Android kiosk app that displays the [WeatherStar 4000+](https://github.com/netbymatt/ws4kp) retro weather experience full-screen on a TV or tablet. No user interaction is needed — it runs autonomously.

- **Repo:** `cyberbalsa/retroweather` on GitHub
- **License:** MIT
- **Target devices:** Android TVs, tablets, phones (Android 5.0+ / API 21+)

---

## Architecture

The app is a thin native shell around a WebView that loads the ws4kp web app from bundled assets.

```
MainActivity (Kotlin)
  └── WebView (full-screen, no UI chrome)
        ├── KioskWebViewClient.kt   — intercepts navigation, handles errors
        ├── LocationBridge.kt       — JS bridge: provides GPS/IP geo coords to web app
        └── app/src/main/assets/
              ├── ws4kp/            — bundled WeatherStar 4000+ web app (DO NOT EDIT)
              ├── location.js       — location detection logic (GPS → IP geo fallback)
              ├── music.js          — background Archive.org retro music playback
              ├── settings.js       — settings overlay (long-press to open)
              └── overlay.js        — UI overlay helpers
```

### Key Design Decisions

- **No signingConfig in `app/build.gradle`** — signing is done post-build by GitHub Actions, not by Gradle. Local builds produce unsigned APKs intentionally.
- **`versionCode` = git commit count** (`git rev-list --count HEAD`), **`versionName`** = short commit hash. CI uses `fetch-depth: 0` for this reason.
- **JS assets are ES5** — enforced by ESLint (`.eslintrc.json`). Required for Android 4.4+ KitKat WebView compatibility even though minSdk is 21, because the ws4kp web content targets older devices too.
- **ws4kp/ is vendored** — don't edit files under `app/src/main/assets/ws4kp/`. Update by replacing the whole directory from upstream.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Android app | Kotlin + Java 1.8 compat |
| Build system | Gradle 8.12, AGP 8.2.2 |
| WebView content | JavaScript (ES5), HTML/CSS |
| JS tooling | ESLint 8.x, Node.js test runner |
| Location | GPS via `play-services-location:21.3.0`, IP geo fallback via ipinfo.io / ipapi.co |
| CI/CD | GitHub Actions (`.github/workflows/release.yml`) |

---

## Building

```bash
# Debug build (unsigned)
./gradlew assembleDebug

# Release build (unsigned — signing happens in CI)
./gradlew assembleRelease bundleRelease
```

Java 21 is required. The Gradle wrapper (`gradle/wrapper/gradle-wrapper.jar`) is committed and handles the Gradle download automatically.

---

## Testing

```bash
# JS unit tests (19 tests across 3 suites)
npm test

# JS lint (ES5 enforcement)
npm run lint

# Android unit tests
./gradlew test
```

Test files live in `tests/`:
- `location.test.js` — location detection and fallback logic
- `music.test.js` — music playback state machine
- `settings.test.js` — settings persistence and overlay logic

The `conftest.py` and `test_fido2_export.py` files in `tests/` are leftover from the old FIDO2 signing workflow and can be removed.

---

## Releasing

Releasing is fully automated via GitHub Actions. Just tag and push:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The pipeline (`.github/workflows/release.yml`) will:
1. Run JS tests and Android unit tests
2. Build the release APK and AAB
3. Sign both artifacts using the keystore stored in GitHub Secrets
4. Create a GitHub Release at `cyberbalsa/retroweather/releases` with signed artifacts attached

**Never commit a keystore or signing credentials.** The keystore lives only in GitHub Secrets (`KEYSTORE_BASE64`, `STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).

To set up signing secrets on a new machine or repo, run:
```bash
./setup-signing-secrets.sh
```

---

## GitHub Actions Pipeline

**Trigger:** Push to tags matching `v*.*.*`

**Steps:** checkout → Java 21 → Gradle cache → chmod gradlew → npm ci + test → gradlew test → assembleRelease bundleRelease → add build-tools to PATH → decode keystore → apksigner (APK) → jarsigner (AAB) → apksigner verify → cleanup → gh release create

**Secrets required:**

| Secret | Purpose |
|--------|---------|
| `KEYSTORE_BASE64` | Base64-encoded `.jks` keystore |
| `STORE_PASSWORD` | Keystore store password |
| `KEY_ALIAS` | Key alias (`weatherstar`) |
| `KEY_PASSWORD` | Key password |

---

## File Map

```
/
├── .github/workflows/release.yml   — CI/CD release pipeline
├── app/
│   ├── build.gradle                — app-level build config (no signingConfig)
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/                 — JS/HTML bundled web app
│       ├── java/com/weatherstartv/
│       │   ├── MainActivity.kt
│       │   ├── KioskWebViewClient.kt
│       │   └── LocationBridge.kt
│       └── res/                    — icons, theme, drawables
├── build.gradle                    — root build config (AGP + Kotlin classpath)
├── gradle/wrapper/                 — Gradle wrapper (JAR committed)
├── tests/                          — JS test suites (Node.js)
├── package.json                    — npm scripts: test, lint
├── package-lock.json               — committed for reproducible CI installs
├── setup-signing-secrets.sh        — one-time script to generate keystore + upload secrets
├── generate_icons.py               — icon generation helper (run manually)
└── build.sh                        — local build helper (downloads Gradle directly)
```

---

## Permissions

```
INTERNET              — loads ws4kp web content
ACCESS_FINE_LOCATION  — GPS for weather location
ACCESS_COARSE_LOCATION
WAKE_LOCK             — keeps screen on
```

The app is also configured for Android TV (`LEANBACK_LAUNCHER`) while remaining installable on phones (`touchscreen required=false`).

---

## Common Gotchas

- **`versionCode` requires full git history** — always use `fetch-depth: 0` in CI; shallow clones produce wrong version numbers.
- **`gradle-wrapper.jar` must be committed** — CI has no way to bootstrap Gradle without it.
- **`npm ci` requires `package-lock.json`** — it's committed; don't delete it.
- **ES5 only in JS assets** — no arrow functions, `const`/`let`, template literals, etc. Run `npm run lint` to check.
- **`app/build.gradle` has no `signingConfig`** — this is intentional. Local release builds are unsigned. Don't add one.
