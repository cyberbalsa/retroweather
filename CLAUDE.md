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

---

## Overlay System (Our Custom JS Layer)

The four JS assets are injected by `KioskWebViewClient.onPageFinished` into ws4kp's page context after every load. They run in dependency order:

```
location.js   → GPS/IP geo detection, exposes onLocationResult/onLocationError
music.js      → Archive.org retro music playback state machine
settings.js   → Settings overlay UI, exposes window.openKioskSettings
overlay.js    → Bootstraps the above three; handles long-press and D-pad key events
```

**Injection guard** (`KioskWebViewClient.kt`): The combined script is wrapped in:
```js
(function(){if(window.__kioskOK||!document.head)return;window.__kioskOK=true; ... })()
```
- `window.__kioskOK` prevents double-injection when `onPageFinished` fires multiple times for the same JS context (hash changes, sub-resource callbacks).
- `!document.head` prevents injection if the DOM isn't ready yet — `onPageFinished` can fire before the DOM is fully parsed on reloads. Without this guard, the scripts crash setting `__kioskOK=true` and the next (real) `onPageFinished` call silently skips injection.

**Reloading after settings apply**: Use `window.Android.requestReload()` (native bridge), NOT `window.location.reload()`. JS-initiated reloads called from within an `evaluateJavascript` execution context are unreliable on Android WebView — they can silently fail or complete without reinitializing the overlay.

---

## Android TV / Remote Control Handling

The device is a NVIDIA Shield TV. All remote input comes as D-pad key events, not mouse/touch.

### Key event architecture
- **D-pad LEFT/RIGHT/UP/DOWN** → `keydown` events (keyCodes 37/38/39/40) in the WebView
- **OK/Select/Center** → `keydown` keyCode 13 (Enter)
- **Back button** → handled natively by `Activity.onBackPressed()` before WebView JS ever sees it

### What we handle and where

| Input | Handler | What it does |
|-------|---------|--------------|
| Long-press OK (600ms) | `overlay.js` keydown | Opens settings overlay |
| D-pad LEFT/RIGHT/UP/DOWN | `overlay.js` keydown | `preventDefault()` when settings closed — prevents WebView scrolling and Android TV system UI popups |
| D-pad in settings | `overlay.js` keydown | Arrow keys pass through when `isSettingsOpen()` — allows form navigation |
| Volume slider UP/DOWN | `settings.js` keydown on `#k-vol` | Blocked at native WebView level; use ± buttons instead (range inputs trap D-pad focus on Android TV) |
| Back button | `MainActivity.onBackPressed()` | Calls `window.kioskHandleBack()` via evaluateJavascript; saves+closes settings if open, no-op otherwise |

### Long-press detection
`overlay.js` tracks `enterDown` flag (not `e.repeat` — unreliable on older WebViews) and fires a 600ms timer. Cancels on keyup.

### TV-hostile form elements
- `input[type=range]` — **never use in the D-pad nav flow**. Android TV WebView handles arrow keys at native level before JS can `preventDefault()`. Replace with +/- buttons and a hidden range input.
- `select` elements — fine, D-pad navigates them normally.
- `tabindex="-1"` removes elements from D-pad focus order entirely.

---

## Settings System

### Two-layer param architecture
Settings live in the page URL as query params. There are two namespaces:

**Our kiosk params** (managed by settings.js/location.js/music.js):
```
kiosk_music=1         kiosk_vol=0.7      kiosk_shuffle=1
kiosk_loc_mode=auto   kiosk_ipgeo=1
```
These use `1`/`0` for booleans.

**ws4kp params** (passed through to ws4kp's own settings system):
```
settings-wide-checkbox=true       settings-units-select=us
settings-speed-select=1.0         settings-scanLines-checkbox=false
settings-scanLineMode-select=auto settings-kiosk-checkbox=true
settings-customFeedEnable-checkbox=true
settings-customFeed-string=<url>
```
These use `true`/`false` for booleans (ws4kp reads them via its own `parseQueryString()`).

**Display screen toggles** (ws4kp, default `true` when absent):
```
current-weather-checkbox    latest-observations-checkbox
hourly-checkbox             hourly-graph-checkbox
local-forecast-checkbox     extended-forecast-checkbox
regional-forecast-checkbox  travel-checkbox
almanac-checkbox            hazards-checkbox
spc-outlook-checkbox        radar-checkbox
```

### How params flow
1. `MainActivity.buildInitialUrl()` builds the first URL with kiosk defaults
2. User opens settings → `populateForm()` reads current URL params via `getParam()`
3. User applies → `applySettings()` writes all params via `setParam()` (uses `history.replaceState()`)
4. `window.Android.requestReload()` triggers native `webView.reload()`
5. ws4kp reads its params from the new URL on the fresh page load

### Default feed
Custom feed defaults to enabled with `https://news.kagi.com/tech.xml`. Both the JS default in `readParams()` and the initial URL in `buildInitialUrl()` must be kept in sync.

### Settings modal focus
On open, focus is set to `#kiosk-modal` (which has `tabindex="-1"`), NOT to any interactive element. This is intentional — the Enter keyup from the long-press that opened the modal would otherwise immediately trigger the focused button.

---

## Debugging

### Device connection
The Shield TV is connected via ADB TCP. It shows up as `127.0.0.1:5556` (not localhost:5555).
```bash
adb devices                          # verify connection
adb -s 127.0.0.1:5556 logcat ...    # always specify -s
```

### Build and deploy cycle
```bash
./gradlew assembleDebug && adb -s 127.0.0.1:5556 install -r app/build/outputs/apk/debug/app-debug.apk
```

### Reading logs
```bash
# All JS console output + errors for the app
adb -s 127.0.0.1:5556 logcat -d --pid=$(adb -s 127.0.0.1:5556 shell pidof com.weatherstartv) \
  | grep -E "chromium|KioskProxy|LocationBridge"
```

Key log patterns to watch for:

| Log message | Meaning |
|-------------|---------|
| `[overlay] WeatherStar Kiosk overlay ready` | Overlay scripts injected successfully |
| `[location] Coords already set, skipping detection` | Location loaded from saved prefs |
| `Applying deferred DOM settings: wide,kiosk` | ws4kp page initialized (from ws.min.js) |
| `Uncaught TypeError: Cannot read properties of null (reading 'appendChild')` | `onPageFinished` fired before DOM ready — overlay injection skipped this cycle, will retry |
| `KioskProxy: Proxying: ...` | External request being proxied (archive.org, ipinfo.io) |
| `LocationBridge: Location unavailable, falling back to IP geo` | GPS unavailable, using IP |

### The `onPageFinished` double-fire issue
`onPageFinished` in Android WebView fires multiple times per navigation:
1. Once early (before DOM is fully parsed) — `document.head` is null, scripts would crash
2. Once when truly finished — DOM is ready, injection succeeds

The `!document.head` guard in the injection wrapper handles this. If you ever see the `appendChild` null error in logs, the overlay will still initialize on the subsequent fire. If you see ws4kp messages (`Applying deferred DOM settings`, `Wake Lock active`) but NO `[overlay] WeatherStar Kiosk overlay ready`, the guard is broken — check `KioskWebViewClient.onPageFinished`.

### ws4kp source maps
`ws.min.js.map` is bundled and contains the original source for all 56 modules. To read a specific module:
```python
import json
data = json.load(open('app/src/main/assets/ws4kp/resources/ws.min.js.map'))
sources = data['sources']
contents = data['sourcesContent']
# find index of module by name, then print contents[index]
```
Useful modules: `settings.mjs`, `weatherdisplay.mjs`, `navigation.mjs`, `utils/setting.mjs`

### Console error line numbers
JS errors attributed to `ws4kp/index.html` at e.g. line 747 are actually errors in our **injected overlay scripts**. The combined script line maps roughly as:
- Lines 1–288: `location.js`
- Lines 289–440: `music.js`
- Lines 441–924: `settings.js`
- Lines 925+: `overlay.js`

(Exact offsets shift with file edits — use `wc -l` to recalculate.)
