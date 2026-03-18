# WeatherStar Kiosk — Design Spec

**Date:** 2026-03-18
**Project:** weatherstartv

---

## Overview

An Android APK kiosk app that embeds the WeatherStar 4000+ (`ws4kp`) weather display in a fullscreen WebView, with ambient music from Archive.org, automatic location detection, and a long-press-triggered settings overlay. Targets both Android phones and Android TV.

---

## Architecture

A thin Kotlin shell (~200 lines) hosts a WebView that loads a self-contained web layer from bundled assets. The Kotlin layer handles only what the web cannot: screen control, system bar hiding, and a JavaScript bridge for native location. All UI, music, settings, and configuration logic live in HTML/JS written in **ES5** (no ES6+) for compatibility with Android 4.4 KitKat's Chrome 30-based WebView.

### File Structure

```
app/src/main/
  java/com/weatherstartv/
    MainActivity.kt              # thin shell — WebView host, kiosk flags
    LocationBridge.kt            # @JavascriptInterface — requestLocation() → GPS
    KioskWebViewClient.kt        # WebViewClient — injects overlay.js on page load
  assets/
    overlay.js                   # injected into ws4kp page: bootstraps music + settings
    music.js                     # Archive.org playlist fetch + HTML5 Audio playback
    settings.js                  # settings overlay UI + URL param serialization
    ws4kp/                       # bundled static build of ws4kp (dist/)
  res/drawable/
    tv_banner.png                # 320x180px Android TV banner
AndroidManifest.xml
build.gradle
```

---

## Section 1: Android Shell

### MainActivity.kt
- Sets `window.addFlags(FLAG_KEEP_SCREEN_ON)`
- Uses `WindowCompat.getInsetsController()` + `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` to hide system bars (bars reappear on edge-swipe, re-hide on `onWindowFocusChanged`)
- Locks orientation to landscape via manifest
- Configures WebView: `setJavaScriptEnabled(true)`, `setDomStorageEnabled(true)`, `setMediaPlaybackRequiresUserGesture(false)` (enables ws4kp audio autoplay), `setMixedContentMode(MIXED_CONTENT_ALWAYS_ALLOW)`
- Sets `KioskWebViewClient` and registers `LocationBridge` as JS interface under name `"Android"`
- Loads `file:///android_asset/ws4kp/index.html` + full query string of kiosk params on start
- `onWindowFocusChanged`: re-hides system bars when focus returns

### LocationBridge.kt
- `@JavascriptInterface fun requestLocation()` — requests location from `FusedLocationProviderClient.getLastLocation()`
- On success: calls `evaluateJavascript("onLocationResult(lat, lon)")` back into the page
- On failure or permission denied: calls `evaluateJavascript("onLocationError()")`
- Runtime `ACCESS_FINE_LOCATION` permission request handled via `ActivityCompat.requestPermissions()`; result forwarded to pending bridge callback via `onRequestPermissionsResult`

### KioskWebViewClient.kt
- Extends `WebViewClient`
- `onPageFinished()`: reads `overlay.js`, `music.js`, `settings.js` from assets and injects them into the loaded page via `evaluateJavascript()`
- Suppresses error pages (shows blank on network failure — ws4kp handles its own error states)

### AndroidManifest.xml
- Permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `WAKE_LOCK`
- `android:screenOrientation="landscape"`
- Activity intent filters:
  - `android.intent.category.LAUNCHER` (phones)
  - `android.intent.category.LEANBACK_LAUNCHER` (Android TV)
- `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>` (TV compatibility)

---

## Section 2: Web Layer

### Loading Strategy
ws4kp's `dist/index.html` is loaded **directly** in the Android WebView (no wrapper `index.html` needed). The settings overlay and music player are injected as a floating `<div>` layer via a `WebViewClient.onPageFinished()` hook that injects `overlay.js` into the ws4kp page after it loads.

### URL Params Convention
All configuration lives in the WebView's URL query string. ws4kp's own params are set directly; wrapper params are prefixed with `kiosk_`.

**ws4kp params (passed directly):**
| Param | Value | Description |
|-------|-------|-------------|
| `latLon` | `{"lat":X,"lon":Y}` URL-encoded JSON | Location coordinates |
| `latLonQuery` | city name string | Location display name |
| `settings-kiosk-checkbox` | `true` | Hide ws4kp toolbar |
| `settings-wide-checkbox` | `true` | Widescreen 16:9 mode |
| `settings-mediaPlaying-boolean` | `true` | Enable ws4kp audio autoplay |
| `settings-speed-select` | `1.0` | Playback speed |
| `settings-units-select` | `us`/`si` | Units |

**Wrapper params (kiosk_-prefixed):**
| Param | Values | Description |
|-------|--------|-------------|
| `kiosk_music` | `0`/`1` | Music on/off |
| `kiosk_vol` | `0.0`–`1.0` | Music volume |
| `kiosk_shuffle` | `0`/`1` | Shuffle mode |
| `kiosk_loc_mode` | `auto`/`manual` | Location detection mode |

Settings writes all params to `history.replaceState` then triggers a WebView reload.

---

## Section 3: Settings Overlay

### Trigger
- `document` listens for `touchstart`/`mousedown`; if held ≥ 600ms without move, opens settings
- On Android TV: long-press of the remote OK/Enter button fires the same event via D-pad focus
- WebView's native long-press context menu is suppressed in Kotlin

### Layout (Center Modal)
- Semi-transparent dark backdrop covers full screen
- Centered card with three collapsible sections:
  1. **Location** — radio: "Auto-detect" / "Manual entry". Manual shows a text input (accepts `lat,lon` decimal format only — no city name geocoding). "Re-detect" button clears manual coords and re-runs the auto chain.
  2. **Music** — on/off toggle, sequential/shuffle radio, volume slider (0–100%), currently playing track name display.
  3. **Display** — widescreen toggle (enforces 16:9 on phone), ws4kp skin/loop selector (populates from ws4kp's own param options).
- **Apply** button: serializes state → URL params → `history.replaceState` → reloads ws4kp iframe
- Tapping the backdrop (outside the card) closes without saving
- D-pad navigable: all controls focusable, Back key closes

---

## Section 4: Music Player (`music.js`)

1. On load, fetch `https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml`
2. Parse XML (`<files>` root, `<file name="..." source="original">` entries), extract all where `<format>` is `VBR MP3` or `Ogg Vorbis`
3. Build playlist of canonical streaming URLs: `https://archive.org/download/weatherscancompletecollection/{encodeURIComponent(filename)}`
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

- **Min SDK:** 19 (Android 4.4 KitKat) — covers Android TV gen 1+ and older phones
- **Target SDK:** 34
- **Dependencies (app/build.gradle):**
  - `androidx.appcompat:appcompat:1.6.1`
  - `androidx.core:core:1.12.0`
  - `androidx.webkit:webkit:1.8.0`
  - `com.google.android.gms:play-services-location:21.3.0`
- **ProGuard:** preserve `@JavascriptInterface` methods
- **ws4kp build:** `git clone https://github.com/netbymatt/ws4kp && cd ws4kp && npm install && npm run build` → copy `dist/` into `app/src/main/assets/ws4kp/`
- **Music XML:** fetched at runtime from `https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml` (not bundled)
- **TV banner:** `res/drawable/tv_banner.png` at 320×180px (required for Android TV launcher)

---

## Out of Scope

- Authentication or multi-user profiles
- Offline music caching
- Push notifications or remote management
- Custom ws4kp themes beyond what ws4kp's own params support
