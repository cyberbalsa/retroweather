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
KioskWebViewClient.kt     — (or new KioskBridge.kt) adds @JavascriptInterface methods:
                            showCrtPicker(), saveSettings(queryString)
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
- `setZOrderOnTop(true)` — renders above WebView via SurfaceFlinger
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

On `populateForm()`: read label from a global `window.__crtLabel` set by native before the form opens, or default to `'None'`.

---

## Settings UI — Native Side

### `showCrtPicker()` — JS Bridge Method

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
2. Call `crtOverlayView.setPreset(CrtPreset.catalog[presetId])`  — immediate visual update, no reload
3. Call `webView.evaluateJavascript("window.updateCrtLabel('${preset.displayLabel}')", null)`

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

Native — new `@JavascriptInterface`:
```kotlin
@JavascriptInterface
fun saveSettings(queryString: String) {
    prefs.edit().putString("saved_query", queryString).apply()
}
```

`MainActivity` URL load on startup:
```kotlin
val saved = prefs.getString("saved_query", null)
val url = if (saved != null) {
    "file:///android_asset/ws4kp/index.html$saved"
} else {
    buildInitialUrl()  // first-run defaults
}
webView.loadUrl(url)
```

---

## Removed

- `settings-scanLines-checkbox` URL param
- `settings-scanLineMode-select` URL param
- `k-scanlines` checkbox and `k-scanline-mode-row` select from `settings.js` HTML/JS
- `scanLines` and `scanLineMode` fields from `readParams()` and `applySettings()`

---

## What Is NOT in Scope

- NTSC chroma bleeding / composite color artifact effects (require pixel sampling — unavailable on Android 11 without CPU roundtrip)
- Per-frame preview of shader while picker is open (the GLSurfaceView updates live automatically)
- Custom user-defined preset parameters
- Importing `.slangp` files directly (they are Libretro/RetroArch format, not WebGL/GLSL ES compatible)
