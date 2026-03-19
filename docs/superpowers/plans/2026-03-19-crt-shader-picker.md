# CRT Shader Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Scan Lines setting with a native GLSurfaceView CRT shader overlay, a native AlertDialog preset picker organized by signal type, and fix the settings persistence bug.

**Architecture:** A transparent `GLSurfaceView` (`CrtOverlayView`) sits above the WebView in a `FrameLayout`, rendering a single GLSL ES 2.0 fragment shader as a fullscreen quad. Preset selection uses a native Android `AlertDialog` (D-pad friendly) invoked via a JS bridge method in `LocationBridge`. Selected preset ID is stored in `SharedPreferences`; all other settings are persisted via `saveSettings()` which saves the URL query string (stripped of `latLon`) to `SharedPreferences` and restores it on startup.

**Tech Stack:** Kotlin, OpenGL ES 2.0 (`GLSurfaceView`/`GLSurfaceView.Renderer`), Android `AlertDialog`, `SharedPreferences`, JUnit 4 + Mockito for Kotlin unit tests, Node.js test runner for JS tests.

**Reference:** `docs/superpowers/specs/2026-03-19-crt-shader-picker-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/src/main/res/raw/crt_shader.glsl` | GLSL ES 2.0 fragment + vertex shader source (both in one file, split by `---VERTEX---`/`---FRAGMENT---` markers) |
| Create | `app/src/main/java/com/weatherstartv/CrtPreset.kt` | Data class + companion object catalog of all 13 presets |
| Create | `app/src/main/java/com/weatherstartv/CrtRenderer.kt` | `GLSurfaceView.Renderer` — compiles shader, uploads uniforms, draws fullscreen quad |
| Create | `app/src/main/java/com/weatherstartv/CrtOverlayView.kt` | `GLSurfaceView` subclass — EGL config, attaches renderer, exposes `setPreset()` |
| Modify | `app/src/main/res/layout/activity_main.xml` | Replace bare `<WebView>` with `<FrameLayout>` containing WebView + CrtOverlayView |
| Modify | `app/src/main/java/com/weatherstartv/MainActivity.kt` | Wire CrtOverlayView; load saved URL on startup; pass overlay to LocationBridge |
| Modify | `app/src/main/java/com/weatherstartv/LocationBridge.kt` | Add `crtOverlay` constructor param; add `showCrtPicker()` and `saveSettings()` bridge methods |
| Modify | `app/src/main/java/com/weatherstartv/KioskWebViewClient.kt` | Prepend `window.__initialCrtLabel` assignment outside the `__kioskOK` guard |
| Modify | `app/src/main/assets/settings.js` | Remove scan lines rows; add CRT row; wire Pick… button; add `saveSettings` call; expose `updateCrtLabel` |
| Create | `app/src/test/java/com/weatherstartv/CrtPresetTest.kt` | Unit tests for preset catalog completeness and value ranges |
| Modify | `tests/settings.test.js` | Tests for `saveSettings` stripping logic and `updateCrtLabel` behavior |

---

## Task 1: GLSL Shader Source

**Files:**
- Create: `app/src/main/res/raw/crt_shader.glsl`

The shader file contains vertex and fragment sources separated by sentinel comments. `CrtRenderer` will split on these when compiling. This is a common Android pattern for bundling shader pairs.

- [ ] **Step 1: Create the raw resource directory and shader file**

```bash
mkdir -p app/src/main/res/raw
```

Write `app/src/main/res/raw/crt_shader.glsl`:

```glsl
// ---VERTEX---
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
// ---FRAGMENT---
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform float u_scanline_str;
uniform float u_scanline_freq;
uniform float u_bloom_str;
uniform float u_noise_str;
uniform float u_vignette_str;
uniform int   u_mask_type;
uniform float u_mask_str;

varying vec2 v_uv;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_uv;

    // Scanlines: alternate rows darkened
    float scanAlpha = step(0.5, fract(uv.y * u_scanline_freq * 0.5))
                      * u_scanline_str * (1.0 - u_bloom_str * 0.6);

    // Shadow mask
    float maskAlpha = 0.0;
    if (u_mask_type == 1) {
        // Aperture grille: vertical dark stripe every 3 columns
        float col = mod(floor(uv.x * 720.0), 3.0);
        maskAlpha = step(2.0, col) * u_mask_str;
    } else if (u_mask_type == 2) {
        // Shadow mask: checkerboard
        float col = mod(floor(uv.x * 480.0) + floor(uv.y * 480.0), 2.0);
        maskAlpha = step(1.0, col) * u_mask_str;
    } else if (u_mask_type == 3) {
        // Slot mask
        float col = mod(floor(uv.x * 360.0), 3.0);
        maskAlpha = step(2.0, col) * u_mask_str;
    }

    // Vignette: darken corners
    vec2 center = uv * 2.0 - 1.0;
    float vigAlpha = clamp(dot(center, center) * u_vignette_str, 0.0, 0.9);

    // Noise grain
    float grain = rand(uv + fract(u_time * 0.03)) - 0.5;
    float noiseAlpha = grain * u_noise_str * 0.35;

    // Combine
    float alpha = max(max(scanAlpha, maskAlpha), vigAlpha);
    alpha = clamp(alpha + noiseAlpha, 0.0, 1.0);

    // Warm amber tint (phosphor approximation) where bloom is active
    float warm = u_bloom_str * 0.06;
    gl_FragColor = vec4(warm, warm * 0.4, 0.0, alpha);
}
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la app/src/main/res/raw/crt_shader.glsl
```

Expected: file present, non-zero size.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/res/raw/crt_shader.glsl
git commit -m "feat: add CRT GLSL ES 2.0 overlay shader"
```

---

## Task 2: CrtPreset Data Class + Catalog

**Files:**
- Create: `app/src/main/java/com/weatherstartv/CrtPreset.kt`
- Create: `app/src/test/java/com/weatherstartv/CrtPresetTest.kt`

- [ ] **Step 1: Write the failing unit test first**

Create `app/src/test/java/com/weatherstartv/CrtPresetTest.kt`:

```kotlin
package com.weatherstartv

import org.junit.Assert.*
import org.junit.Test

class CrtPresetTest {

    @Test fun `catalog contains none preset`() {
        assertNotNull(CrtPreset.catalog["none"])
    }

    @Test fun `catalog contains all 13 expected ids`() {
        val expected = setOf(
            "none",
            "clean_subtle", "clean_std", "clean_heavy",
            "comp_warm", "comp_dense", "comp_heavy",
            "rf_light", "rf_heavy",
            "vhs_480p", "vhs_720p", "vhs_1080p", "vhs_2160p"
        )
        assertEquals(expected, CrtPreset.catalog.keys)
    }

    @Test fun `none preset has zero effect strengths`() {
        val none = CrtPreset.catalog["none"]!!
        assertEquals(0f, none.scanlineStr, 0.001f)
        assertEquals(0f, none.noiseStr, 0.001f)
        assertEquals(0f, none.vignetteStr, 0.001f)
        assertEquals(0, none.maskType)
    }

    @Test fun `all presets have scanlineFreq in valid range`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} scanlineFreq out of range",
                p.scanlineFreq in 0f..2000f)
        }
    }

    @Test fun `all presets have strengths in 0-1 range`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} scanlineStr", p.scanlineStr in 0f..1f)
            assertTrue("${p.id} bloomStr",    p.bloomStr    in 0f..1f)
            assertTrue("${p.id} noiseStr",    p.noiseStr    in 0f..1f)
            assertTrue("${p.id} vignetteStr", p.vignetteStr in 0f..1f)
            assertTrue("${p.id} maskStr",     p.maskStr     in 0f..1f)
        }
    }

    @Test fun `all presets have non-blank displayLabel`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} empty label", p.displayLabel.isNotBlank())
        }
    }

    @Test fun `all presets have valid maskType (0-3)`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} maskType", p.maskType in 0..3)
        }
    }
}
```

- [ ] **Step 2: Run test — expect compilation failure (class missing)**

```bash
./gradlew test 2>&1 | grep -E "error|FAILED|CrtPreset"
```

Expected: compilation error — `CrtPreset` not found.

- [ ] **Step 3: Create CrtPreset.kt**

Create `app/src/main/java/com/weatherstartv/CrtPreset.kt`:

```kotlin
package com.weatherstartv

data class CrtPreset(
    val id: String,
    val displayLabel: String,
    val scanlineStr: Float,
    val scanlineFreq: Float,
    val bloomStr: Float,
    val noiseStr: Float,
    val vignetteStr: Float,
    val maskType: Int,   // 0=none 1=aperture grille 2=shadow mask 3=slot mask
    val maskStr: Float
) {
    companion object {
        val NONE = CrtPreset(
            id = "none", displayLabel = "None",
            scanlineStr = 0f, scanlineFreq = 480f, bloomStr = 0f,
            noiseStr = 0f, vignetteStr = 0f, maskType = 0, maskStr = 0f
        )

        val catalog: Map<String, CrtPreset> = mapOf(
            "none" to NONE,

            // ── Clean ──────────────────────────────────────────────────────
            "clean_subtle" to CrtPreset(
                id = "clean_subtle", displayLabel = "Clean \u00b7 Subtle",
                scanlineStr = 0.30f, scanlineFreq = 540f, bloomStr = 0.20f,
                noiseStr = 0.00f, vignetteStr = 0.20f, maskType = 2, maskStr = 0.15f
            ),
            "clean_std" to CrtPreset(
                id = "clean_std", displayLabel = "Clean \u00b7 Standard",
                scanlineStr = 0.50f, scanlineFreq = 480f, bloomStr = 0.15f,
                noiseStr = 0.05f, vignetteStr = 0.30f, maskType = 2, maskStr = 0.25f
            ),
            "clean_heavy" to CrtPreset(
                id = "clean_heavy", displayLabel = "Clean \u00b7 Heavy",
                scanlineStr = 0.70f, scanlineFreq = 400f, bloomStr = 0.10f,
                noiseStr = 0.05f, vignetteStr = 0.40f, maskType = 2, maskStr = 0.35f
            ),

            // ── Composite ──────────────────────────────────────────────────
            "comp_warm" to CrtPreset(
                id = "comp_warm", displayLabel = "Composite \u00b7 Warm",
                scanlineStr = 0.50f, scanlineFreq = 480f, bloomStr = 0.40f,
                noiseStr = 0.15f, vignetteStr = 0.35f, maskType = 1, maskStr = 0.20f
            ),
            "comp_dense" to CrtPreset(
                id = "comp_dense", displayLabel = "Composite \u00b7 Dense",
                scanlineStr = 0.55f, scanlineFreq = 480f, bloomStr = 0.35f,
                noiseStr = 0.20f, vignetteStr = 0.40f, maskType = 1, maskStr = 0.30f
            ),
            "comp_heavy" to CrtPreset(
                id = "comp_heavy", displayLabel = "Composite \u00b7 Heavy",
                scanlineStr = 0.65f, scanlineFreq = 400f, bloomStr = 0.45f,
                noiseStr = 0.25f, vignetteStr = 0.45f, maskType = 1, maskStr = 0.35f
            ),

            // ── RF ─────────────────────────────────────────────────────────
            "rf_light" to CrtPreset(
                id = "rf_light", displayLabel = "RF \u00b7 Light",
                scanlineStr = 0.40f, scanlineFreq = 480f, bloomStr = 0.30f,
                noiseStr = 0.30f, vignetteStr = 0.40f, maskType = 3, maskStr = 0.20f
            ),
            "rf_heavy" to CrtPreset(
                id = "rf_heavy", displayLabel = "RF \u00b7 Heavy",
                scanlineStr = 0.50f, scanlineFreq = 400f, bloomStr = 0.25f,
                noiseStr = 0.50f, vignetteStr = 0.50f, maskType = 3, maskStr = 0.30f
            ),

            // ── VHS ────────────────────────────────────────────────────────
            "vhs_480p" to CrtPreset(
                id = "vhs_480p", displayLabel = "VHS \u00b7 480p",
                scanlineStr = 0.00f, scanlineFreq = 240f, bloomStr = 0.00f,
                noiseStr = 0.40f, vignetteStr = 0.40f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_720p" to CrtPreset(
                id = "vhs_720p", displayLabel = "VHS \u00b7 720p",
                scanlineStr = 0.00f, scanlineFreq = 360f, bloomStr = 0.00f,
                noiseStr = 0.30f, vignetteStr = 0.35f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_1080p" to CrtPreset(
                id = "vhs_1080p", displayLabel = "VHS \u00b7 1080p",
                scanlineStr = 0.00f, scanlineFreq = 540f, bloomStr = 0.00f,
                noiseStr = 0.20f, vignetteStr = 0.30f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_2160p" to CrtPreset(
                id = "vhs_2160p", displayLabel = "VHS \u00b7 2160p",
                scanlineStr = 0.00f, scanlineFreq = 1080f, bloomStr = 0.00f,
                noiseStr = 0.15f, vignetteStr = 0.25f, maskType = 0, maskStr = 0.00f
            )
        )
    }
}
```

- [ ] **Step 4: Run tests — expect all 7 to pass**

```bash
./gradlew test 2>&1 | grep -E "CrtPresetTest|tests|PASSED|FAILED"
```

Expected: 7 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/weatherstartv/CrtPreset.kt \
        app/src/test/java/com/weatherstartv/CrtPresetTest.kt
git commit -m "feat: add CrtPreset data class and preset catalog (13 presets)"
```

---

## Task 3: CrtRenderer

**Files:**
- Create: `app/src/main/java/com/weatherstartv/CrtRenderer.kt`

No unit test — GL rendering requires a device. Verified by build success + visual inspection in Task 9.

- [ ] **Step 1: Create CrtRenderer.kt**

Create `app/src/main/java/com/weatherstartv/CrtRenderer.kt`:

```kotlin
package com.weatherstartv

import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class CrtRenderer(private val context: Context) : GLSurfaceView.Renderer {

    @Volatile private var preset: CrtPreset = CrtPreset.NONE
    @Volatile private var presetDirty = true
    private var startTimeMs = System.currentTimeMillis()

    // GL handles
    private var program = 0
    private var quadVbo = 0

    // Uniform locations (cached after link)
    private var uTime = -1
    private var uScanlineStr = -1
    private var uScanlineFreq = -1
    private var uBloomStr = -1
    private var uNoiseStr = -1
    private var uVignetteStr = -1
    private var uMaskType = -1
    private var uMaskStr = -1

    fun setPreset(p: CrtPreset) {
        preset = p
        presetDirty = true
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 0f)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        val src = loadShaderSource()
        val vertSrc = src.substringAfter("// ---VERTEX---").substringBefore("// ---FRAGMENT---").trim()
        val fragSrc = src.substringAfter("// ---FRAGMENT---").trim()

        program = buildProgram(vertSrc, fragSrc)
        GLES20.glUseProgram(program)

        // Cache uniform locations
        uTime        = GLES20.glGetUniformLocation(program, "u_time")
        uScanlineStr = GLES20.glGetUniformLocation(program, "u_scanline_str")
        uScanlineFreq= GLES20.glGetUniformLocation(program, "u_scanline_freq")
        uBloomStr    = GLES20.glGetUniformLocation(program, "u_bloom_str")
        uNoiseStr    = GLES20.glGetUniformLocation(program, "u_noise_str")
        uVignetteStr = GLES20.glGetUniformLocation(program, "u_vignette_str")
        uMaskType    = GLES20.glGetUniformLocation(program, "u_mask_type")
        uMaskStr     = GLES20.glGetUniformLocation(program, "u_mask_str")

        // Fullscreen quad: two triangles covering NDC (-1..1)
        val verts = floatArrayOf(-1f, -1f,  1f, -1f,  -1f,  1f,  1f,  1f)
        val buf: FloatBuffer = ByteBuffer.allocateDirect(verts.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
                put(verts); position(0)
            }
        val vbo = IntArray(1)
        GLES20.glGenBuffers(1, vbo, 0)
        quadVbo = vbo[0]
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo)
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, verts.size * 4, buf, GLES20.GL_STATIC_DRAW)

        startTimeMs = System.currentTimeMillis()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        val p = preset
        if (p.id == "none") return  // Transparent — nothing drawn

        GLES20.glUseProgram(program)

        // Time uniform (seconds, wraps every ~11 hours — fine for noise seed)
        val t = (System.currentTimeMillis() - startTimeMs) / 1000f
        GLES20.glUniform1f(uTime, t)

        if (presetDirty) {
            GLES20.glUniform1f(uScanlineStr,  p.scanlineStr)
            GLES20.glUniform1f(uScanlineFreq, p.scanlineFreq)
            GLES20.glUniform1f(uBloomStr,     p.bloomStr)
            GLES20.glUniform1f(uNoiseStr,     p.noiseStr)
            GLES20.glUniform1f(uVignetteStr,  p.vignetteStr)
            GLES20.glUniform1i(uMaskType,     p.maskType)
            GLES20.glUniform1f(uMaskStr,      p.maskStr)
            presetDirty = false
        }

        // Draw fullscreen quad
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo)
        val posLoc = GLES20.glGetAttribLocation(program, "a_position")
        GLES20.glEnableVertexAttribArray(posLoc)
        GLES20.glVertexAttribPointer(posLoc, 2, GLES20.GL_FLOAT, false, 0, 0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(posLoc)
    }

    private fun loadShaderSource(): String =
        context.resources.openRawResource(R.raw.crt_shader).bufferedReader().readText()

    private fun compileShader(type: Int, src: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, src)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            android.util.Log.e("CrtRenderer", "Shader compile error: ${GLES20.glGetShaderInfoLog(shader)}")
            GLES20.glDeleteShader(shader)
            return 0
        }
        return shader
    }

    private fun buildProgram(vertSrc: String, fragSrc: String): Int {
        val vert = compileShader(GLES20.GL_VERTEX_SHADER, vertSrc)
        val frag = compileShader(GLES20.GL_FRAGMENT_SHADER, fragSrc)
        val prog = GLES20.glCreateProgram()
        GLES20.glAttachShader(prog, vert)
        GLES20.glAttachShader(prog, frag)
        GLES20.glLinkProgram(prog)
        val status = IntArray(1)
        GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            android.util.Log.e("CrtRenderer", "Program link error: ${GLES20.glGetProgramInfoLog(prog)}")
        }
        GLES20.glDeleteShader(vert)
        GLES20.glDeleteShader(frag)
        return prog
    }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
./gradlew assembleDebug 2>&1 | grep -E "error|warning|BUILD"
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/weatherstartv/CrtRenderer.kt
git commit -m "feat: add CrtRenderer (GLSurfaceView.Renderer with GLSL shader pipeline)"
```

---

## Task 4: CrtOverlayView

**Files:**
- Create: `app/src/main/java/com/weatherstartv/CrtOverlayView.kt`

- [ ] **Step 1: Create CrtOverlayView.kt**

```kotlin
package com.weatherstartv

import android.content.Context
import android.graphics.PixelFormat
import android.opengl.GLSurfaceView
import android.util.AttributeSet

class CrtOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : GLSurfaceView(context, attrs) {

    private val crtRenderer = CrtRenderer(context)

    init {
        // Must use RGBA_8888 so the SurfaceFlinger layer is composited
        // with per-pixel alpha against the WebView layer below.
        // setZOrderMediaOverlay(true) places this above the WebView Surface
        // but below system overlays. Do NOT use setZOrderOnTop(true) —
        // that makes the layer opaque at the SurfaceFlinger level regardless
        // of EGL alpha config, blacking out the WebView.
        setZOrderMediaOverlay(true)
        setEGLContextClientVersion(2)
        setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        holder.setFormat(PixelFormat.RGBA_8888)
        setRenderer(crtRenderer)
        renderMode = RENDERMODE_CONTINUOUSLY
    }

    fun setPreset(preset: CrtPreset) {
        crtRenderer.setPreset(preset)
    }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
./gradlew assembleDebug 2>&1 | grep -E "error|BUILD"
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/weatherstartv/CrtOverlayView.kt
git commit -m "feat: add CrtOverlayView (transparent GLSurfaceView overlay)"
```

---

## Task 5: Layout + MainActivity Wiring

**Files:**
- Modify: `app/src/main/res/layout/activity_main.xml`
- Modify: `app/src/main/java/com/weatherstartv/MainActivity.kt`

- [ ] **Step 1: Update activity_main.xml**

Replace the entire file with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <com.weatherstartv.CrtOverlayView
        android:id="@+id/crtOverlay"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</FrameLayout>
```

- [ ] **Step 2: Update MainActivity.kt**

Make the following changes to `MainActivity.kt`:

**Add field declarations** (after `private lateinit var locationBridge: LocationBridge`):
```kotlin
private lateinit var crtOverlayView: CrtOverlayView
```

**In `onCreate()`, after `webView = findViewById(R.id.webview)`**, add:
```kotlin
crtOverlayView = findViewById(R.id.crtOverlay)

// Load saved CRT preset from SharedPreferences
val prefs = getSharedPreferences(LocationBridge.PREFS, MODE_PRIVATE)
val savedPresetId = prefs.getString("crt_preset", "none") ?: "none"
crtOverlayView.setPreset(CrtPreset.catalog[savedPresetId] ?: CrtPreset.NONE)
```

**Replace** the `LocationBridge` constructor call:
```kotlin
// Before:
locationBridge = LocationBridge(this, webView)

// After:
locationBridge = LocationBridge(this, webView, crtOverlayView)
```

**Replace** the `webView.loadUrl(buildInitialUrl())` block:
```kotlin
// Before:
if (savedInstanceState == null) {
    webView.loadUrl(buildInitialUrl())
}

// After:
if (savedInstanceState == null) {
    val savedQuery = prefs.getString("saved_query", null)
    val url = if (savedQuery != null) {
        // Must use the HTTPS appassets origin — fetch() is blocked on file:// origins
        "https://appassets.androidplatform.net/assets/ws4kp/index.html$savedQuery"
    } else {
        buildInitialUrl()
    }
    webView.loadUrl(url)
}
```

**Add lifecycle forwarding** for GLSurfaceView (add these two overrides):
```kotlin
override fun onResume() {
    super.onResume()
    crtOverlayView.onResume()
}

override fun onPause() {
    super.onPause()
    crtOverlayView.onPause()
}
```

- [ ] **Step 3: Build and deploy to Shield TV**

```bash
./gradlew assembleDebug && \
adb -s 127.0.0.1:5556 install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected: `BUILD SUCCESSFUL`, install succeeds.

- [ ] **Step 4: Smoke-check — app launches, WebView visible**

```bash
adb -s 127.0.0.1:5556 shell am start -n com.weatherstartv/.MainActivity
```

Verify in logcat that the app opens and WeatherStar content is visible (no black screen):

```bash
adb -s 127.0.0.1:5556 logcat --pid=$(adb -s 127.0.0.1:5556 shell pidof com.weatherstartv) \
  -d | grep -E "overlay ready|CrtRenderer|chromium"
```

Expected: `[overlay] WeatherStar Kiosk overlay ready` appears. No `CrtRenderer` shader errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/res/layout/activity_main.xml \
        app/src/main/java/com/weatherstartv/MainActivity.kt
git commit -m "feat: wire CrtOverlayView into layout and MainActivity; restore saved URL on startup"
```

---

## Task 6: LocationBridge — Bridge Methods

**Files:**
- Modify: `app/src/main/java/com/weatherstartv/LocationBridge.kt`

Add `showCrtPicker()` and `saveSettings()`. Both require the `crtOverlay` reference added to the constructor.

- [ ] **Step 1: Update LocationBridge constructor and add bridge methods**

**Change the class declaration** (line 13 of `LocationBridge.kt`):
```kotlin
// Before:
class LocationBridge(
    private val activity: Activity,
    private val webView: WebView
) {

// After:
class LocationBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val crtOverlay: CrtOverlayView
) {
```

**Add these imports** at the top of the file:
```kotlin
import android.app.AlertDialog
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.RadioButton
import android.widget.TextView
import org.json.JSONObject
```

**Add these two `@JavascriptInterface` methods** inside the class body (after `clearSavedLocation()`):

```kotlin
/**
 * Called from JS (Pick… button) to open the native CRT preset picker dialog.
 * Must be dispatched to UI thread — JS bridge calls arrive on a background thread.
 */
@JavascriptInterface
fun showCrtPicker() {
    activity.runOnUiThread { showCrtPickerDialog() }
}

/**
 * Called from JS (applySettings) to persist the current URL query string.
 * Strips latLon — that is managed by the location system independently.
 */
@JavascriptInterface
fun saveSettings(queryString: String) {
    val stripped = queryString
        .replace(Regex("[?&]latLon=[^&]*"), "")
        .let { s ->
            when {
                s.isEmpty() -> ""
                s.startsWith("&") -> "?" + s.substring(1)
                else -> s
            }
        }
    activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString("saved_query", stripped)
        .apply()
}
```

**Add the private helper** `showCrtPickerDialog()` inside the class body:

```kotlin
private fun showCrtPickerDialog() {
    val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val currentId = prefs.getString("crt_preset", "none") ?: "none"

    // Build flat list: section headers (non-selectable) + leaves (selectable)
    data class Row(val id: String?, val label: String, val isHeader: Boolean)

    val rows = listOf(
        Row("none",       "None",        false),
        Row(null,         "CLEAN",       true),
        Row("clean_subtle", "  Subtle",  false),
        Row("clean_std",  "  Standard",  false),
        Row("clean_heavy","  Heavy",     false),
        Row(null,         "COMPOSITE",   true),
        Row("comp_warm",  "  Warm",      false),
        Row("comp_dense", "  Dense",     false),
        Row("comp_heavy", "  Heavy",     false),
        Row(null,         "RF",          true),
        Row("rf_light",   "  Light",     false),
        Row("rf_heavy",   "  Heavy",     false),
        Row(null,         "VHS",         true),
        Row("vhs_480p",   "  480p",      false),
        Row("vhs_720p",   "  720p",      false),
        Row("vhs_1080p",  "  1080p",     false),
        Row("vhs_2160p",  "  2160p",     false)
    )

    val adapter = object : ArrayAdapter<Row>(activity, android.R.layout.simple_list_item_1, rows) {
        override fun isEnabled(position: Int) = !rows[position].isHeader
        override fun areAllItemsEnabled() = false

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val row = rows[position]
            val tv = TextView(activity)
            tv.text = row.label
            tv.setPadding(48, 20, 48, 20)
            if (row.isHeader) {
                tv.setTextColor(0xFF7cb9e8.toInt())
                tv.textSize = 11f
                tv.typeface = android.graphics.Typeface.DEFAULT_BOLD
            } else {
                tv.setTextColor(if (row.id == currentId) 0xFFffffff.toInt() else 0xFFc0d8e8.toInt())
                tv.textSize = 14f
                tv.setBackgroundColor(if (row.id == currentId) 0xFF1e5a9f.toInt() else 0x00000000.toInt())
            }
            return tv
        }
    }

    AlertDialog.Builder(activity)
        .setTitle("CRT Shader")
        .setAdapter(adapter) { _, which ->
            val row = rows[which]
            val id = row.id ?: return@setAdapter
            val preset = CrtPreset.catalog[id] ?: CrtPreset.NONE

            // Save and apply
            prefs.edit().putString("crt_preset", id).apply()
            crtOverlay.setPreset(preset)

            // Update JS label — JSON-encode to prevent injection
            val escapedLabel = JSONObject.quote(preset.displayLabel)
            webView.post {
                webView.evaluateJavascript("if(window.updateCrtLabel)window.updateCrtLabel($escapedLabel);", null)
            }
        }
        .setNegativeButton("Cancel", null)
        .show()
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
./gradlew assembleDebug 2>&1 | grep -E "error|BUILD"
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Deploy and manually test picker opens**

```bash
./gradlew assembleDebug && \
adb -s 127.0.0.1:5556 install -r app/build/outputs/apk/debug/app-debug.apk
```

Long-press on the Shield TV remote to open Settings. At this point the CRT row does not yet exist in JS (that's Task 8) — verify the app still runs without crash.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/com/weatherstartv/LocationBridge.kt
git commit -m "feat: add showCrtPicker() and saveSettings() bridge methods to LocationBridge"
```

---

## Task 7: KioskWebViewClient — Inject Initial CRT Label

**Files:**
- Modify: `app/src/main/java/com/weatherstartv/KioskWebViewClient.kt`

The `window.__initialCrtLabel` assignment must be injected **outside** the `__kioskOK` IIFE guard so it is always set (even on the early DOM-not-ready `onPageFinished` fire that gets skipped by the guard). `initSettings()` in `settings.js` reads it to populate the CRT row label on page load.

`KioskWebViewClient` needs access to `SharedPreferences` to read the saved preset. Currently it takes only a `Context` — that is sufficient (`Context.getSharedPreferences` works).

- [ ] **Step 1: Update `onPageFinished` in KioskWebViewClient.kt**

Find the `onPageFinished` method (lines 119–134). Replace it with:

```kotlin
override fun onPageFinished(view: WebView, url: String) {
    super.onPageFinished(view, url)

    // Read current CRT preset label from SharedPreferences.
    // Injected OUTSIDE the __kioskOK guard so it is always set,
    // even on early fires where the DOM isn't ready yet.
    val prefs = context.getSharedPreferences(LocationBridge.PREFS, Context.MODE_PRIVATE)
    val presetId = prefs.getString("crt_preset", "none") ?: "none"
    val preset = CrtPreset.catalog[presetId] ?: CrtPreset.NONE
    val escapedLabel = org.json.JSONObject.quote(preset.displayLabel)
    val initLabel = "window.__initialCrtLabel=$escapedLabel;"

    val combined = assetFiles.joinToString("\n;\n") { filename ->
        context.assets.open(filename).bufferedReader().readText()
    }
    view.evaluateJavascript(
        // __initialCrtLabel is set unconditionally before the guard
        "$initLabel\n(function(){if(window.__kioskOK||!document.head||!document.body)return;window.__kioskOK=true;\n$combined\n})()",
        null
    )
}
```

- [ ] **Step 2: Build to verify**

```bash
./gradlew assembleDebug 2>&1 | grep -E "error|BUILD"
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/weatherstartv/KioskWebViewClient.kt
git commit -m "feat: inject window.__initialCrtLabel before kioskOK guard in onPageFinished"
```

---

## Task 8: settings.js — CRT Row + Persistence Fix

**Files:**
- Modify: `app/src/main/assets/settings.js`
- Modify: `tests/settings.test.js`

**Reminder:** All JS must remain ES5 (no `const`/`let`, no arrow functions, no template literals). Run `npm run lint` after changes.

- [ ] **Step 1: Add JS tests for the new behaviors first**

Add these test blocks to the end of `tests/settings.test.js` (before the final `console.log`):

```js
// saveSettings strips latLon from query string
function stripLatLon(queryString) {
    var stripped = queryString.replace(/[?&]latLon=[^&]*/g, '');
    if (stripped.length > 0 && stripped.charAt(0) === '&') {
        stripped = '?' + stripped.substring(1);
    }
    return stripped;
}

{
    var q = '?kiosk_music=1&latLon=%7B%22lat%22%3A1%7D&kiosk_vol=0.7';
    var result = stripLatLon(q);
    assert.ok(result.indexOf('latLon') === -1, 'latLon should be stripped');
    assert.ok(result.indexOf('kiosk_music') !== -1, 'kiosk_music should remain');
    console.log('✓ stripLatLon removes latLon param');
    passed++;
}

{
    var q2 = '?latLon=%7B%22lat%22%3A1%7D&kiosk_vol=0.7';
    var result2 = stripLatLon(q2);
    assert.ok(result2.indexOf('latLon') === -1, 'latLon at start should be stripped');
    assert.strictEqual(result2.charAt(0), '?', 'should still start with ?');
    console.log('✓ stripLatLon handles latLon at start of query');
    passed++;
}

{
    var q3 = '?kiosk_music=1';
    var result3 = stripLatLon(q3);
    assert.strictEqual(result3, '?kiosk_music=1', 'no latLon: unchanged');
    console.log('✓ stripLatLon leaves query unchanged when no latLon');
    passed++;
}
```

- [ ] **Step 2: Run new tests — all 3 should pass immediately**

The `stripLatLon` helper is defined inline in the test file to verify the regex logic in isolation. It does not import anything from `settings.js`. All 3 new tests should pass right now.

```bash
npm test 2>&1 | tail -5
```

Expected: `12 tests passed` (9 existing + 3 new). If any fail, fix the regex in the test helper before proceeding.

- [ ] **Step 3: Remove scan lines HTML from the `HTML` string in settings.js**

In `settings.js`, find the Appearance section of the `HTML` string (lines 90–108). Remove these two rows:
```js
// REMOVE:
+ '<div class="k-row"><label for="k-scanlines">Scan Lines</label><input type="checkbox" id="k-scanlines" tabindex="0"></div>'
+ '<div class="k-row" id="k-scanline-mode-row">'
+ '<label for="k-scanline-mode">Scan Line Style</label>'
+ '<select id="k-scanline-mode" tabindex="0">'
+ '<option value="auto">Auto</option><option value="thin">Thin</option>'
+ '<option value="medium">Medium</option><option value="thick">Thick</option>'
+ '</select></div>'
```

**Add the CRT row** in their place (right before the closing `+ '</div>'` of the Appearance section):
```js
+ '<div class="k-row">'
+ '<label for="k-crt-pick">CRT Shader</label>'
+ '<span id="k-crt-label" style="font-size:0.82em;color:#7cb9e8;-webkit-flex:1;flex:1;margin-left:8px;">None</span>'
+ '<button id="k-crt-pick" class="k-btn-sm" tabindex="0">Pick\u2026</button>'
+ '</div>'
```

- [ ] **Step 4: Remove scan lines from readParams()**

In `readParams()`, remove these two lines:
```js
// REMOVE:
scanLines:   getParam('settings-scanLines-checkbox') === 'true',
scanLineMode: getParam('settings-scanLineMode-select') || 'auto',
```

- [ ] **Step 5: Remove scan lines from applySettings()**

In `applySettings()`, remove these two lines:
```js
// REMOVE:
setParam('settings-scanLines-checkbox',  values.scanLines   ? 'true' : 'false');
setParam('settings-scanLineMode-select', values.scanLineMode);
```

**Add** the `saveSettings` call right before the `if (values.locMode === 'manual'...` block:
```js
if (window.Android && window.Android.saveSettings) {
    window.Android.saveSettings(window.location.search);
}
```

- [ ] **Step 6: Remove scan lines from the apply button click handler**

In `applyBtn.addEventListener('click', ...)`, remove:
```js
// REMOVE from the applySettings({...}) call:
scanLines:   scanlinesChk.checked,
scanLineMode: scanModeSelect.value,
```

- [ ] **Step 7: Update initSettings() variable declarations and event listeners**

Remove these variable declarations (around lines 324–326):
```js
// REMOVE:
var scanlinesChk = document.getElementById('k-scanlines');
var scanModeRow  = document.getElementById('k-scanline-mode-row');
var scanModeSelect = document.getElementById('k-scanline-mode');
```

Remove the scan lines change listener:
```js
// REMOVE:
scanlinesChk.addEventListener('change', function () {
    scanModeRow.style.display = scanlinesChk.checked ? '' : 'none';
});
```

Remove from `populateForm()`:
```js
// REMOVE:
scanlinesChk.checked = p.scanLines;
scanModeRow.style.display = p.scanLines ? '' : 'none';
scanModeSelect.value  = p.scanLineMode;
```

**Add** in `initSettings()` after the existing variable declarations:
```js
var crtPickBtn   = document.getElementById('k-crt-pick');
var crtLabel     = document.getElementById('k-crt-label');

// Set initial label from native-injected value (set by KioskWebViewClient.onPageFinished)
if (window.__initialCrtLabel) {
    crtLabel.textContent = window.__initialCrtLabel;
}

crtPickBtn.addEventListener('click', function () {
    if (window.Android && window.Android.showCrtPicker) {
        window.Android.showCrtPicker();
    }
});
```

**Add** `window.updateCrtLabel` exposure (alongside the other `window.*` assignments at the bottom of `initSettings()`):
```js
window.updateCrtLabel = function (label) {
    var el = document.getElementById('k-crt-label');
    if (el) el.textContent = label || 'None';
};
```

- [ ] **Step 8: Add RetroCrisis credit to the About section**

In `settings.js`, find the About section HTML string (the `<div class="k-section"><h3>About</h3>` block). Add a new paragraph after the existing two:

```js
+ '<p style="font-size:0.8em;margin:8px 0 0;">'
+ 'CRT shaders inspired by <a href="https://github.com/RetroCrisis/Retro-Crisis-GDV-NTSC" target="_blank" class="k-link">Retro Crisis GDV-NTSC</a>'
+ ' by RetroCrisis</p>'
```

- [ ] **Step 9: Run lint to verify ES5 compliance**

```bash
npm run lint
```

Expected: 0 errors. Fix any `const`/`let`/arrow function violations before proceeding.

- [ ] **Step 10: Run all JS tests**

```bash
npm test
```

Expected: all tests pass (was 9, now 12 with the 3 new ones).

- [ ] **Step 11: Commit**

```bash
git add app/src/main/assets/settings.js tests/settings.test.js
git commit -m "feat: replace scan lines with CRT shader row in settings.js; add saveSettings persistence"
```

---

## Task 9: Integration Test — Build, Deploy, Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Full build**

```bash
./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: Deploy to Shield TV**

```bash
adb -s 127.0.0.1:5556 install -r app/build/outputs/apk/debug/app-debug.apk && \
adb -s 127.0.0.1:5556 shell am start -n com.weatherstartv/.MainActivity
```

- [ ] **Step 3: Verify overlay injection and no shader errors**

```bash
adb -s 127.0.0.1:5556 logcat --pid=$(adb -s 127.0.0.1:5556 shell pidof com.weatherstartv) \
  -d | grep -E "overlay ready|CrtRenderer|KioskProxy|LocationBridge"
```

Expected:
- `[overlay] WeatherStar Kiosk overlay ready` — JS injected OK
- No `CrtRenderer: Shader compile error` or `Program link error`

- [ ] **Step 4: Test CRT picker**

Long-press OK/select on Shield TV remote (600ms) → settings modal opens.
Verify:
- Settings modal appears
- Appearance section shows "CRT Shader" row with "None" label and "Pick…" button
- No "Scan Lines" checkbox or "Scan Line Style" select visible

Press D-pad to focus "Pick…" button → press OK → native `AlertDialog` opens.
Verify:
- Dialog shows "CRT Shader" title
- Group headers (CLEAN, COMPOSITE, RF, VHS) are non-selectable
- Select "Composite · Warm" → dialog closes
- CRT Shader row label updates to "Composite · Warm"
- Shader overlay is visually visible on screen (scanlines + warm tint)

- [ ] **Step 5: Test settings persistence**

Press "Apply" → app reloads.
Close and reopen the app (kill from recents, relaunch):
- Verify settings (units, speed, etc.) are restored to what was set before
- Verify CRT shader is still "Composite · Warm" (not reset to None)
- Verify weather loads for the correct location (not frozen at old lat/lon)

- [ ] **Step 6: Run all unit tests one final time**

```bash
./gradlew test && npm test
```

Expected: all Kotlin tests pass, all 12 JS tests pass.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: CRT shader picker complete — GLSurfaceView overlay, native dialog, persistence fix"
```

---

## Appendix: Preset Parameter Reference

| ID | Label | scanlineStr | scanlineFreq | bloomStr | noiseStr | vignetteStr | maskType | maskStr |
|----|-------|-------------|--------------|----------|----------|-------------|----------|---------|
| none | None | 0.0 | 480 | 0.0 | 0.0 | 0.0 | 0 | 0.0 |
| clean_subtle | Clean · Subtle | 0.30 | 540 | 0.20 | 0.00 | 0.20 | 2 | 0.15 |
| clean_std | Clean · Standard | 0.50 | 480 | 0.15 | 0.05 | 0.30 | 2 | 0.25 |
| clean_heavy | Clean · Heavy | 0.70 | 400 | 0.10 | 0.05 | 0.40 | 2 | 0.35 |
| comp_warm | Composite · Warm | 0.50 | 480 | 0.40 | 0.15 | 0.35 | 1 | 0.20 |
| comp_dense | Composite · Dense | 0.55 | 480 | 0.35 | 0.20 | 0.40 | 1 | 0.30 |
| comp_heavy | Composite · Heavy | 0.65 | 400 | 0.45 | 0.25 | 0.45 | 1 | 0.35 |
| rf_light | RF · Light | 0.40 | 480 | 0.30 | 0.30 | 0.40 | 3 | 0.20 |
| rf_heavy | RF · Heavy | 0.50 | 400 | 0.25 | 0.50 | 0.50 | 3 | 0.30 |
| vhs_480p | VHS · 480p | 0.00 | 240 | 0.00 | 0.40 | 0.40 | 0 | 0.00 |
| vhs_720p | VHS · 720p | 0.00 | 360 | 0.00 | 0.30 | 0.35 | 0 | 0.00 |
| vhs_1080p | VHS · 1080p | 0.00 | 540 | 0.00 | 0.20 | 0.30 | 0 | 0.00 |
| vhs_2160p | VHS · 2160p | 0.00 | 1080 | 0.00 | 0.15 | 0.25 | 0 | 0.00 |

maskType: 0=none, 1=aperture grille, 2=shadow mask, 3=slot mask
