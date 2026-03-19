# CRT Shader Picker — Design Spec
_Date: 2026-03-19_

## Overview

Replace the existing Scan Lines setting (checkbox + style dropdown) with a native CRT shader system. A `GLSurfaceView` overlay renders GLSL-based CRT effects on top of the WebView at the compositor level — zero JS overhead. A native Android `AlertDialog` picker (D-pad friendly) lets users choose from presets organized by signal type (Clean, Composite, RF, VHS). Also fixes a settings persistence bug where user settings were lost on app restart.

---

## Architecture

### New Files

```
app/src/main/java/com/weatherstartv/
  CrtOverlayView.kt       — GLSurfaceView subclass; owns GL lifecycle and EGL config
  CrtRenderer.kt          — GLSurfaceView.Renderer; compiles shader, uploads uniforms, draws quad
  CrtPreset.kt            — data class + companion object with full preset catalog

app/src/main/res/raw/
  crt_shader.glsl         — single GLSL ES 2.0 fragment shader source
```

### Modified Files

```
MainActivity.kt           — adds CrtOverlayView, wires preset load from SharedPreferences,
                            wires settings persistence fix
LocationBridge.kt         — adds @JavascriptInterface methods: showCrtPicker(), saveSettings(queryString).
                            LocationBridge already holds an Activity reference — use it rather than
                            KioskWebViewClient (which only holds Context and cannot show AlertDialog).
app/src/main/res/layout/  — FrameLayout wrapping WebView + CrtOverlayView
settings.js               — replaces scan lines rows with CRT row + Pick… button;
                            adds saveSettings() call in applySettings();
                            exposes window.updateCrtLabel()
```

### Layout

```xml
<FrameLayout>
  <WebView android:id="@+id/webView" />
  <CrtOverlayView android:id="@+id/crtOverlay"
      android:layout_width="match_parent"
      android:layout_height="match_parent" />
</FrameLayout>
```

`CrtOverlayView` uses:
- `setZOrderMediaOverlay(true)` — places GL surface in the media overlay plane, above the WebView Surface but below system overlays. **Do NOT use `setZOrderOnTop(true)`** — that makes the SurfaceFlinger layer opaque regardless of EGL alpha config, blacking out the WebView.
- `setEGLConfigChooser(8, 8, 8, 8, 16, 0)` — 8-bit alpha channel
- `holder.setFormat(PixelFormat.RGBA_8888)` — transparent background

### API Guard

```kotlin
// In MainActivity, after attaching CrtOverlayView:
if (Build.VERSION.SDK_INT >= 33) {
    // Future: webView.setRenderEffect(RenderEffect.createRuntimeShaderEffect(...))
    // True pixel-processing via AGSL (Android 13+). Not available on current device.
    // GLSurfaceView path is the default for all supported SDK versions.
}
```

The GLSurfaceView path runs on all devices (API 21+). The API 33 block is a placeholder for a future upgrade — no behavior change today.

---

## GLSL Shader

Single fragment shader at `res/raw/crt_shader.glsl`. Uses GLSL ES 2.0 (compatible with Shield TV / Tegra X1 OpenGL ES 3.1).

### Uniforms

| Uniform | Type | Range | Effect |
|---|---|---|---|
| `u_time` | float | seconds | Noise animation seed |
| `u_scanline_str` | float | 0.0–1.0 | Scanline darkness |
| `u_scanline_freq` | float | 240–540 | Lines per screen height |
| `u_bloom_str` | float | 0.0–1.0 | Phosphor glow radius |
| `u_noise_str` | float | 0.0–1.0 | Grain/snow intensity |
| `u_vignette_str` | float | 0.0–1.0 | Corner darkening |
| `u_curvature` | float | 0.0–1.0 | Barrel distortion (0=flat) |
| `u_mask_type` | int | 0–3 | 0=none 1=aperture 2=shadow 3=slot |
| `u_mask_str` | float | 0.0–1.0 | Mask visibility |
| `u_brightness` | float | 0.5–1.5 | Brightness compensation |

The shader draws a fullscreen quad; where alpha=0 the WebView shows through. All effects are overlays — no WebView pixel sampling (not possible on Android 11 without CPU roundtrip).

### Preset Switch

`CrtRenderer.setPreset(preset: CrtPreset)` stores the preset and sets a dirty flag. On the next `onDrawFrame()` call, uniforms are uploaded via `glUniform1f` / `glUniform1i`. **No shader recompile on preset switch.**

---

## Preset Catalog

Stored in `CrtPreset.kt` as a `companion object` map. Preset values are derived from the RetroCrisis GDV-NTSC collection (v2026.02.03) — parameter values sourced from the corresponding `.slangp` files.

### Tree Structure

```
None                    id=none

Clean
  Subtle                id=clean_subtle    — SNES RGB 100 params
  Standard              id=clean_std       — NES Clean params
  Heavy                 id=clean_heavy     — Arcade Clean params

Composite
  Warm                  id=comp_warm       — NES Composite 100
  Dense                 id=comp_dense      — PCE Composite 100
  Heavy                 id=comp_heavy      — NES Composite 100 max

RF
  Light                 id=rf_light        — SNES RF 100
  Heavy                 id=rf_heavy        — Saturn RF 100

VHS
  480p                  id=vhs_480p
  720p                  id=vhs_720p
  1080p                 id=vhs_1080p
  2160p                 id=vhs_2160p
```

### Visual Character Per Family

- **None** — GLSurfaceView renders nothing (or is detached from window)
- **Clean** — crisp scanlines, shadow mask, minimal bloom, no noise
- **Composite** — heavier bloom, mild grain, warm brightness, aperture grille mask
- **RF** — max noise, heavy bloom, slight desaturation, slot mask
- **VHS** — high noise, no scanlines, soft vignette, no mask; resolution suffix controls scanline frequency

---

## Settings UI — JS Side

### What changes in `settings.js`

Remove: the `k-scanlines` checkbox row and `k-scanline-mode-row` select.

Add in Appearance section:
```html
<div class="k-row">
  <label>CRT Shader</label>
  <span id="k-crt-label" style="font-size:0.82em;color:#7cb9e8;flex:1;margin-left:8px;">None</span>
  <button id="k-crt-pick" class="k-btn-sm" tabindex="0">Pick…</button>
</div>
```

`k-crt-pick` calls `window.Android.showCrtPicker()` on click.

Remove from `readParams()`: `scanLines`, `scanLineMode` fields.
Remove from `applySettings()`: the two `setParam()` calls for scanLines and scanLineMode.

Add to `applySettings()` before `requestReload()`:
```js
if (window.Android && window.Android.saveSettings) {
    window.Android.saveSettings(window.location.search);
}
```

Expose:
```js
window.updateCrtLabel = function(label) {
    document.getElementById('k-crt-label').textContent = label || 'None';
};
```

On `populateForm()`: read the current label from `document.getElementById('k-crt-label').textContent` directly — the element's text is kept current by `window.updateCrtLabel()` calls from native. No separate `window.__crtLabel` global needed. The element exists from page load because `initSettings()` (called at overlay bootstrap) injects the full HTML including `#k-crt-label`.

To set the initial label on startup (before any user interaction), `KioskWebViewClient.onPageFinished` prepends a one-liner to the combined injection script:

```js
window.__initialCrtLabel = 'Composite \u00b7 Warm';  // native reads pref and injects this value
```

`settings.js` `initSettings()` reads `window.__initialCrtLabel` and sets `#k-crt-label` on init.

---

## Settings UI — Native Side

### `showCrtPicker()` — JS Bridge Method

New methods are added to `LocationBridge.kt`. `LocationBridge` already holds both an `Activity` reference (needed for `AlertDialog`) and a `WebView` reference (needed for `evaluateJavascript`). Add `CrtOverlayView` as a third constructor parameter:

```kotlin
class LocationBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val crtOverlay: CrtOverlayView   // NEW
) { ... }
```

`MainActivity` passes `crtOverlayView` when constructing `LocationBridge`.

```kotlin
@JavascriptInterface
fun showCrtPicker() {
    activity.runOnUiThread { showCrtPickerDialog() }
}
```

`showCrtPickerDialog()` builds an `AlertDialog` with a custom `ArrayAdapter` that renders:
- Non-selectable section header rows (CLEAN, COMPOSITE, RF, VHS) — styled with uppercase label, no radio
- Selectable leaf rows with a radio button; active preset shown checked

On selection:
1. Save `presetId` to `SharedPreferences("kiosk_prefs", "crt_preset")`
2. Call `crtOverlay.setPreset(CrtPreset.catalog[presetId])`  — immediate visual update, no reload
3. Call `webView.evaluateJavascript("window.updateCrtLabel(${JSONObject.quote(preset.displayLabel)})", null)`
   — `JSONObject.quote()` escapes the label into a safe JSON string literal, preventing JS injection.

### Preset Load on Startup

`MainActivity.onCreate()`:
```kotlin
val presetId = prefs.getString("crt_preset", "none")
crtOverlayView.setPreset(CrtPreset.catalog[presetId] ?: CrtPreset.NONE)
```

---

## Settings Persistence Bug Fix

**Root cause:** `applySettings()` writes params via `history.replaceState()` (in-memory). On app restart `buildInitialUrl()` rebuilds from hardcoded defaults, discarding all user changes.

**Fix:**

JS — added to `applySettings()` before `requestReload()`:
```js
if (window.Android && window.Android.saveSettings) {
    window.Android.saveSettings(window.location.search);
}
```

Native — new `@JavascriptInterface` in `LocationBridge.kt`. Strip `latLon` from the saved query before persisting — otherwise a stale GPS coordinate baked into the URL would suppress location re-detection on every subsequent app start (because `location.js` sees `latLon` in the URL and skips detection entirely):

```kotlin
@JavascriptInterface
fun saveSettings(queryString: String) {
    // Strip latLon so location.js can re-detect on the next boot.
    // latLon is managed by the location system, not the settings form.
    val stripped = queryString
        .replace(Regex("[?&]latLon=[^&]*"), "")
        .trimStart('&').let { if (it.isNotEmpty() && it[0] != '?') "?$it" else it }
    prefs.edit().putString("saved_query", stripped).apply()
}
```

`MainActivity` URL load on startup:
```kotlin
val saved = prefs.getString("saved_query", null)
val url = if (saved != null) {
    // Must use the same HTTPS origin as buildInitialUrl() — WebView blocks fetch() on file:// origins.
    "https://appassets.androidplatform.net/assets/ws4kp/index.html$saved"
} else {
    buildInitialUrl()  // first-run defaults
}
webView.loadUrl(url)
```

---

## Changes Required (Pending Implementation)

### `settings.js` — remove scan lines, add CRT row

These changes are **not yet made** to `settings.js`. All changes are JS-only; no Kotlin is needed for these removals since the scan lines params were never written by `buildInitialUrl()` or any native code.

Remove from HTML string: `k-scanlines` checkbox row and `k-scanline-mode-row` select block.

Remove from JS:
- `scanlinesChk`, `scanModeRow`, `scanModeSelect` variable declarations
- `scanlinesChk.addEventListener('change', ...)` block
- `scanLines`/`scanLineMode` fields from `readParams()`
- `setParam('settings-scanLines-checkbox', ...)` and `setParam('settings-scanLineMode-select', ...)` from `applySettings()`
- `scanlinesChk.checked` and `scanModeSelect.value` reads from `populateForm()`

Add to HTML string (in Appearance section):
```html
<div class="k-row">
  <label>CRT Shader</label>
  <span id="k-crt-label" style="font-size:0.82em;color:#7cb9e8;flex:1;margin-left:8px;">None</span>
  <button id="k-crt-pick" class="k-btn-sm" tabindex="0">Pick\u2026</button>
</div>
```

Add to `initSettings()`:
- Wire `k-crt-pick` click → `window.Android.showCrtPicker()`
- Read `window.__initialCrtLabel` and set `#k-crt-label` on init

Add to `applySettings()` before `requestReload()`:
```js
if (window.Android && window.Android.saveSettings) {
    window.Android.saveSettings(window.location.search);
}
```

Expose globally:
```js
window.updateCrtLabel = function(label) {
    var el = document.getElementById('k-crt-label');
    if (el) el.textContent = label || 'None';
};
```

Note on `window.__initialCrtLabel`: This is prepended **outside** the `__kioskOK` IIFE guard in `KioskWebViewClient.onPageFinished`, so it is set on every `onPageFinished` call (including the early DOM-not-ready fire). This ensures `initSettings()` always sees the correct initial label regardless of which `onPageFinished` call successfully completes injection.

---

## What Is NOT in Scope

- NTSC chroma bleeding / composite color artifact effects (require pixel sampling — unavailable on Android 11 without CPU roundtrip)
- Per-frame preview of shader while picker is open (the GLSurfaceView updates live automatically)
- Custom user-defined preset parameters
- Importing `.slangp` files directly (they are Libretro/RetroArch format, not WebGL/GLSL ES compatible)
