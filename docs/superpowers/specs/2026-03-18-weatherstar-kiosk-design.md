# WeatherStar Kiosk — Design Spec

**Date:** 2026-03-18
**Project:** weatherstartv

---

## Overview

An Android APK kiosk app that embeds the WeatherStar 4000+ (`ws4kp`) weather display in a fullscreen WebView, with ambient music from Archive.org, automatic location detection, and a long-press-triggered settings overlay. Targets both Android phones and Android TV.

---

## Architecture

A thin Kotlin shell (~200 lines) hosts a WebView that loads a self-contained web layer from bundled assets. The Kotlin layer handles only what the web cannot: screen control, system bar hiding, and a JavaScript bridge for native location. All UI, music, settings, and configuration logic live in HTML/JS.

### File Structure

```
app/src/main/
  java/com/weatherstartv/
    MainActivity.kt         # WebView shell, kiosk flags, JS bridge registration
    WeatherBridge.kt        # @JavascriptInterface — exposes getLocation() to JS
  assets/
    index.html              # Entry point; hosts ws4kp iframe + overlay layer
    app.js                  # Bootstrap: initializes location, music, settings
    location.js             # Location detection chain
    music.js                # Archive.org playlist fetch + HTML5 Audio playback
    settings.js             # Settings overlay logic + URL param serialization
    ws4kp/                  # Bundled static build of ws4kp (netbymatt/ws4kp)
  res/
    values/themes.xml       # Fullscreen / no title bar theme
AndroidManifest.xml
```

---

## Section 1: Android Shell

### MainActivity.kt
- Sets `window.addFlags(FLAG_KEEP_SCREEN_ON)`
- Uses `WindowInsetsController` to hide system bars in immersive sticky mode (bars reappear on edge-swipe, re-hide after 3 seconds)
- Locks orientation to landscape: `android:screenOrientation="landscape"` in manifest
- Configures WebView: JavaScript enabled, DOM storage enabled, file access to assets allowed, `setWebContentsDebuggingEnabled(true)` in debug builds
- Suppresses WebView's native long-press context menu
- Loads `file:///android_asset/index.html` on start
- Registers `WeatherBridge` as JS interface under the name `"WeatherBridge"`

### WeatherBridge.kt
- `@JavascriptInterface fun getLocation(callback: String)` — requests location from `FusedLocationProviderClient`, calls back into JS with `{ lat, lon }` on success or `{ error }` on failure
- Runtime permission request for `ACCESS_FINE_LOCATION` handled here; result forwarded to pending callback

### AndroidManifest.xml
- Permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `WAKE_LOCK`
- `android:screenOrientation="landscape"`
- Activity intent filters:
  - `android.intent.category.LAUNCHER` (phones)
  - `android.intent.category.LEANBACK_LAUNCHER` (Android TV)
- `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>` (TV compatibility)

---

## Section 2: Web Layer

### index.html
- Full-viewport layout: `ws4kp` iframe fills 100% width/height
- Transparent overlay `<div>` on top (pointer-events: none normally, enabled when settings open)
- `<audio id="player">` element for music
- Loads `app.js` which bootstraps all modules

### URL Params Convention
All configuration lives in the URL query string so the app state is shareable and bookmarkable.

| Param | Values | Description |
|-------|--------|-------------|
| `lat` | float | Latitude (manual or auto-detected) |
| `lon` | float | Longitude (manual or auto-detected) |
| `music` | `0`/`1` | Music on/off |
| `vol` | `0.0`–`1.0` | Music volume |
| `shuffle` | `0`/`1` | Shuffle mode |
| `loc_mode` | `auto`/`manual` | Location detection mode |

ws4kp's own URL params are passed through directly to the iframe `src`.

Settings writes to `history.replaceState` (no page reload), then reloads only the ws4kp iframe with updated params.

---

## Section 3: Settings Overlay

### Trigger
- `document` listens for `touchstart`/`mousedown`; if held ≥ 600ms without move, opens settings
- On Android TV: long-press of the remote OK/Enter button fires the same event via D-pad focus
- WebView's native long-press context menu is suppressed in Kotlin

### Layout (Center Modal)
- Semi-transparent dark backdrop covers full screen
- Centered card with three collapsible sections:
  1. **Location** — radio: "Auto-detect" / "Manual entry". Manual shows a text input (accepts city name or `lat,lon`). "Re-detect" button clears manual coords and re-runs the auto chain.
  2. **Music** — on/off toggle, sequential/shuffle radio, volume slider (0–100%), currently playing track name display.
  3. **Display** — widescreen toggle (enforces 16:9 on phone), ws4kp skin/loop selector (populates from ws4kp's own param options).
- **Apply** button: serializes state → URL params → `history.replaceState` → reloads ws4kp iframe
- Tapping the backdrop (outside the card) closes without saving
- D-pad navigable: all controls focusable, Back key closes

---

## Section 4: Music Player (`music.js`)

1. On load, fetch `https://dn721605.ca.archive.org/0/items/weatherscancompletecollection/weatherscancomplecollection_files.xml`
2. Parse XML, extract all `<file>` entries where format is `MP3` or `OGG`
3. Build playlist of full streaming URLs: `https://archive.org/download/weatherscancompletecollection/<filename>`
4. If `?music=1`: start playback immediately
5. **Sequential mode**: play index 0, 1, 2… loop back to 0 on end
6. **Shuffle mode**: Fisher-Yates shuffle the playlist on load, play through, re-shuffle on loop
7. `Audio.volume` set from `?vol=` param
8. If XML fetch fails (network unavailable): music silently disabled, no error shown on kiosk display

---

## Section 5: Location Detection (`location.js`)

Chain runs on page load (unless `?loc_mode=manual` and `?lat=`/`?lon=` are already set):

1. Call `window.WeatherBridge.getLocation(callbackName)` → native GPS via `FusedLocationProviderClient`
2. On success: write `lat`/`lon` to URL params via `history.replaceState`, pass to ws4kp iframe
3. On GPS failure/denial: fetch `https://ipapi.co/json/` for IP-based geolocation
4. On IP geo success: use returned `latitude`/`longitude`
5. On IP geo failure: check existing `?lat=`/`?lon=` URL params
6. If nothing works: load ws4kp with no location params (ws4kp handles its own fallback)

Manual override in settings sets `?loc_mode=manual&lat=X&lon=Y`, skipping the chain on subsequent loads.

---

## Section 6: Android TV & D-pad Support

- `LEANBACK_LAUNCHER` intent filter surfaces app in Android TV launcher
- `android.hardware.touchscreen required=false` allows TV installation
- All interactive elements in settings modal have `tabindex` and respond to Enter/D-pad
- Focus ring visible on TV (CSS `:focus-visible` outline)
- No hover-only interactions — all controls work via click/tap/enter

---

## Build & Dependencies

- **Min SDK:** 21 (Android 5.0 Lollipop) — covers Android TV gen 1+
- **Target SDK:** 34
- **Dependencies:**
  - `com.google.android.gms:play-services-location` (FusedLocationProviderClient)
  - No other native dependencies — all UI logic is vanilla JS
- **ws4kp build:** Clone `netbymatt/ws4kp`, run its build script, copy `dist/` into `assets/ws4kp/`
- **Music XML:** fetched at runtime from Archive.org (not bundled)

---

## Out of Scope

- Authentication or multi-user profiles
- Offline music caching
- Push notifications or remote management
- Custom ws4kp themes beyond what ws4kp's own params support
