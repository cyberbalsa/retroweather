# WeatherStar Kiosk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android APK that displays WeatherStar 4000+ in a fullscreen kiosk WebView with Archive.org ambient music, GPS-based location detection, and a long-press settings overlay — targeting both Android phones and Android TV.

**Architecture:** A thin Kotlin shell (~200 lines) hosts a WebView that loads ws4kp's bundled static build (`assets/ws4kp/index.html`) directly. `KioskWebViewClient.onPageFinished()` injects four JS files to layer kiosk behavior on top of ws4kp without modifying its source. All configuration is stored in URL params and written via `history.replaceState`.

**Tech Stack:** Kotlin (min SDK 21), AndroidX WebView, FusedLocationProviderClient, WindowCompat (immersive mode), Vanilla JS/HTML5 Audio (web layer), Node.js assert (JS unit tests only)

---

## File Map

### Android / Kotlin

| File | Responsibility |
|------|----------------|
| `settings.gradle` | Project name |
| `build.gradle` | Project-level repo config |
| `app/build.gradle` | Dependencies, SDK versions, ProGuard rules |
| `app/src/main/AndroidManifest.xml` | Permissions, TV + phone launcher intent filters |
| `app/src/main/java/com/weatherstartv/MainActivity.kt` | WebView host, immersive mode, keep-screen-on, initial URL builder |
| `app/src/main/java/com/weatherstartv/LocationBridge.kt` | `@JavascriptInterface` → `FusedLocationProviderClient` → `evaluateJavascript` callback |
| `app/src/main/java/com/weatherstartv/KioskWebViewClient.kt` | Reads overlay/location/music/settings from assets, injects on page load |
| `app/src/main/res/values/themes.xml` | No-action-bar fullscreen theme |
| `app/src/main/res/drawable/tv_banner.png` | 320x180px Android TV launcher banner |
| `app/proguard-rules.pro` | Preserve `@JavascriptInterface` methods |

### JS Assets

| File | Responsibility |
|------|----------------|
| `app/src/main/assets/overlay.js` | Bootstrap: attaches long-press listener, calls `initLocation()`, `initMusic()`, `initSettings()` |
| `app/src/main/assets/location.js` | Location chain: GPS bridge → IP geo fallback → URL param fallback; exports `initLocation()` |
| `app/src/main/assets/music.js` | Fetches Archive.org XML, builds playlist, HTML5 Audio with shuffle/sequential; exports `initMusic()` |
| `app/src/main/assets/settings.js` | Injects settings overlay HTML/CSS, handles open/close/apply; exports `initSettings()` |

### ws4kp Bundle

| Path | Source |
|------|--------|
| `app/src/main/assets/ws4kp/` | `dist/` output of `npm run build` in `netbymatt/ws4kp` clone |

### Tests

| File | What It Tests |
|------|---------------|
| `tests/music.test.js` | XML parsing, playlist URL construction, Fisher-Yates shuffle |
| `tests/settings.test.js` | URL param serialization / deserialization |
| `tests/location.test.js` | Location fallback chain pure functions |

---

## Task 1: Project Scaffold

**Files:**
- Create: `settings.gradle`
- Create: `build.gradle`
- Create: `app/build.gradle`
- Create: `app/proguard-rules.pro`
- Create: `app/src/main/res/values/themes.xml`
- Create: `.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p app/src/main/java/com/weatherstartv
mkdir -p app/src/main/assets/ws4kp
mkdir -p app/src/main/res/values
mkdir -p app/src/main/res/drawable
mkdir -p app/src/test/java/com/weatherstartv
mkdir -p tests
```

- [ ] **Step 2: Create `settings.gradle`**

```gradle
rootProject.name = "WeatherStarKiosk"
include ':app'
```

- [ ] **Step 3: Create project-level `build.gradle`**

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.2'
        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
```

- [ ] **Step 4: Create `app/build.gradle`**

```gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace 'com.weatherstartv'
    compileSdk 34

    defaultConfig {
        applicationId "com.weatherstartv"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        debug {
            minifyEnabled false
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = '1.8'
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.webkit:webkit:1.8.0'
    implementation 'com.google.android.gms:play-services-location:21.3.0'
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito.kotlin:mockito-kotlin:5.2.1'
}
```

- [ ] **Step 5: Create `app/proguard-rules.pro`**

```
# Preserve @JavascriptInterface methods — required for WebView JS bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

- [ ] **Step 6: Create `app/src/main/res/values/themes.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.WeatherKiosk" parent="Theme.AppCompat.NoActionBar">
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowContentOverlay">@null</item>
    </style>
</resources>
```

- [ ] **Step 7: Create `.gitignore`**

```
.gradle/
.idea/
build/
app/build/
*.iml
local.properties
app/src/main/assets/ws4kp/
.superpowers/
```

Note: `ws4kp/` assets are excluded from git — they're built locally per Task 2.

- [ ] **Step 8: Commit**

```bash
git add settings.gradle build.gradle app/build.gradle app/proguard-rules.pro \
        app/src/main/res/ .gitignore
git commit -m "feat: android project scaffold with build config"
```

---

## Task 2: Build and Bundle ws4kp

**Files:**
- Create: `app/src/main/assets/ws4kp/` (from ws4kp dist/ build output)
- Create: `docs/rebuilding-ws4kp.md`

Prerequisites: Node.js 18+ and npm installed.

- [ ] **Step 1: Clone and build ws4kp**

```bash
cd /tmp
git clone https://github.com/netbymatt/ws4kp.git
cd ws4kp
npm install
npm run build
```

Expected: `dist/` directory created containing `index.html`, `resources/ws.min.js`, `resources/ws.min.css`, `data/`, `fonts/`, `images/`, `manifest.json`.

- [ ] **Step 2: Copy dist/ into assets**

```bash
cp -r /tmp/ws4kp/dist/. /home/cyberrange/weatherstartv/app/src/main/assets/ws4kp/
```

- [ ] **Step 3: Verify required files exist**

```bash
ls app/src/main/assets/ws4kp/
test -f app/src/main/assets/ws4kp/index.html && echo "OK" || echo "MISSING"
```

Expected output: `OK`

- [ ] **Step 4: Create `docs/rebuilding-ws4kp.md`**

```markdown
# Rebuilding ws4kp Assets

`app/src/main/assets/ws4kp/` is not tracked in git. To rebuild after cloning:

    cd /tmp && git clone https://github.com/netbymatt/ws4kp.git
    cd ws4kp && npm install && npm run build
    cp -r dist/. /path/to/weatherstartv/app/src/main/assets/ws4kp/
```

- [ ] **Step 5: Commit**

```bash
git add docs/rebuilding-ws4kp.md
git commit -m "docs: add ws4kp rebuild instructions"
```

---

## Task 3: AndroidManifest.xml + TV Banner

**Files:**
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/res/drawable/tv_banner.png` (placeholder)

- [ ] **Step 1: Create `app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Android TV: required=false also allows install on phones -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <!-- No touchscreen required = installs on TVs -->
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <application
        android:allowBackup="false"
        android:banner="@drawable/tv_banner"
        android:icon="@mipmap/ic_launcher"
        android:label="WeatherStar"
        android:theme="@style/Theme.WeatherKiosk"
        android:hardwareAccelerated="true">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:screenOrientation="landscape">

            <!-- Phone/tablet launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Android TV launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>

        </activity>
    </application>

</manifest>
```

- [ ] **Step 2: Create placeholder TV banner (320x180px)**

Android TV requires a 320x180px banner PNG at `res/drawable/tv_banner.png`.

**Option A — ImageMagick:**
```bash
convert -size 320x180 xc:'#0a1432' \
  -fill '#64b4ff' -pointsize 24 -gravity center \
  -annotate 0 'WeatherStar Kiosk' \
  app/src/main/res/drawable/tv_banner.png
```

**Option B — Any image editor:** Create a 320x180px PNG (solid dark blue is fine) and save to `app/src/main/res/drawable/tv_banner.png`. This is a placeholder — replace with real branding anytime.

**Option C — Android Studio:** After importing the project, use Tools → Image Asset Studio to generate the banner.

Note: The banner only appears in the Android TV launcher. The app builds and runs on phones without it.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/AndroidManifest.xml app/src/main/res/drawable/tv_banner.png
git commit -m "feat: manifest with TV + phone launcher, permissions"
```

---

## Task 4: LocationBridge.kt

**Files:**
- Create: `app/src/main/java/com/weatherstartv/LocationBridge.kt`
- Create: `app/src/test/java/com/weatherstartv/LocationBridgeTest.kt`

Exposes `requestLocation()` to JS. Calls back `window.onLocationResult(lat, lon)` on success or `window.onLocationError()` on failure.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/com/weatherstartv/LocationBridgeTest.kt`:

```kotlin
package com.weatherstartv

import org.junit.Test
import org.junit.Assert.*

class LocationBridgeTest {

    @Test
    fun `buildSuccessJs formats lat lon correctly`() {
        val js = LocationBridge.buildSuccessJs(28.431, -81.308)
        assertEquals("onLocationResult(28.431000, -81.308000)", js)
    }

    @Test
    fun `buildSuccessJs handles southern hemisphere`() {
        val js = LocationBridge.buildSuccessJs(-33.865, 151.209)
        assertEquals("onLocationResult(-33.865000, 151.209000)", js)
    }

    @Test
    fun `buildErrorJs returns correct string`() {
        assertEquals("onLocationError()", LocationBridge.buildErrorJs())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./gradlew :app:test --tests "com.weatherstartv.LocationBridgeTest" 2>&1 | tail -10
```

Expected: `FAILED` — `LocationBridge` does not exist yet.

- [ ] **Step 3: Implement `LocationBridge.kt`**

```kotlin
package com.weatherstartv

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices

class LocationBridge(
    private val activity: Activity,
    private val webView: WebView
) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(activity)

    companion object {
        const val PERMISSION_REQUEST_CODE = 1001

        fun buildSuccessJs(lat: Double, lon: Double): String =
            "onLocationResult(%f, %f)".format(lat, lon)

        fun buildErrorJs(): String = "onLocationError()"
    }

    @JavascriptInterface
    fun requestLocation() {
        if (ContextCompat.checkSelfPermission(
                activity, Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            activity.runOnUiThread {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
                    PERMISSION_REQUEST_CODE
                )
            }
            return // result forwarded via onPermissionResult()
        }
        fetchLocation()
    }

    fun onPermissionResult(granted: Boolean) {
        if (granted) fetchLocation() else callbackError()
    }

    private fun fetchLocation() {
        if (ContextCompat.checkSelfPermission(
                activity, Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            callbackError(); return
        }

        // getLastLocation() works on all API levels (API 21+).
        // getCurrentLocation() is API 26+ only — do not use for min SDK 21.
        fusedClient.lastLocation
            .addOnSuccessListener { location ->
                if (location != null) callbackSuccess(location.latitude, location.longitude)
                else callbackError() // No cached location — location.js falls back to IP geo
            }
            .addOnFailureListener { callbackError() }
    }

    private fun callbackSuccess(lat: Double, lon: Double) {
        val js = buildSuccessJs(lat, lon)
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun callbackError() {
        webView.post { webView.evaluateJavascript(buildErrorJs(), null) }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./gradlew :app:test --tests "com.weatherstartv.LocationBridgeTest" 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL` / `3 tests completed`

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/com/weatherstartv/LocationBridge.kt \
        app/src/test/java/com/weatherstartv/LocationBridgeTest.kt
git commit -m "feat: LocationBridge with GPS and JS callback"
```

---

## Task 5: KioskWebViewClient.kt

**Files:**
- Create: `app/src/main/java/com/weatherstartv/KioskWebViewClient.kt`

Injects JS asset files into the ws4kp page after it finishes loading.

- [ ] **Step 1: Implement `KioskWebViewClient.kt`**

```kotlin
package com.weatherstartv

import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient

class KioskWebViewClient(private val context: Context) : WebViewClient() {

    // Injected in dependency order: location and music before overlay bootstrap
    private val assetFiles = listOf("location.js", "music.js", "settings.js", "overlay.js")

    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        val combined = assetFiles.joinToString("\n;\n") { filename ->
            context.assets.open(filename).bufferedReader().readText()
        }
        view.evaluateJavascript(combined, null)
    }

    @Deprecated("Deprecated in API 23")
    override fun onReceivedError(
        view: WebView,
        errorCode: Int,
        description: String,
        failingUrl: String
    ) {
        // Suppress error pages — ws4kp handles its own network error states
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/java/com/weatherstartv/KioskWebViewClient.kt
git commit -m "feat: KioskWebViewClient injects JS overlay on page load"
```

---

## Task 6: MainActivity.kt

**Files:**
- Create: `app/src/main/java/com/weatherstartv/MainActivity.kt`
- Create: `app/src/main/res/layout/activity_main.xml`

- [ ] **Step 1: Create layout**

```bash
mkdir -p app/src/main/res/layout
```

Create `app/src/main/res/layout/activity_main.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<WebView xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

- [ ] **Step 2: Implement `MainActivity.kt`**

```kotlin
package com.weatherstartv

import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var locationBridge: LocationBridge
    private lateinit var insetsController: WindowInsetsControllerCompat

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Kiosk: keep screen on at all times
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_main)

        // Immersive sticky mode: hides nav/status bars, reappear briefly on edge swipe
        WindowCompat.setDecorFitsSystemWindows(window, false)
        insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        hideSystemBars()

        webView = findViewById(R.id.webview)
        configureWebView()

        locationBridge = LocationBridge(this, webView)
        webView.addJavascriptInterface(locationBridge, "Android")
        webView.webViewClient = KioskWebViewClient(this)

        if (savedInstanceState == null) {
            webView.loadUrl(buildInitialUrl())
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LocationBridge.PERMISSION_REQUEST_CODE) {
            val granted = grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED
            locationBridge.onPermissionResult(granted)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    private fun hideSystemBars() {
        insetsController.hide(WindowInsetsCompat.Type.systemBars())
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // ws4kp loads from file:// but calls HTTPS weather APIs
            @Suppress("DEPRECATION")
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // Allow Archive.org audio to autoplay without user gesture
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            // Allow file:// pages to access other file:// resources
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
        }
        // Suppress native long-press context menu — handled in JS
        webView.setOnLongClickListener { true }
        webView.isHapticFeedbackEnabled = false
    }

    /**
     * Builds the initial ws4kp URL with kiosk defaults.
     * Location is NOT set here — location.js handles it after page load.
     */
    private fun buildInitialUrl(): String {
        val base = "file:///android_asset/ws4kp/index.html"
        val params = listOf(
            "settings-kiosk-checkbox=true",
            "settings-wide-checkbox=true",
            "settings-mediaPlaying-boolean=false", // we supply our own music
            "settings-speed-select=1.0",
            "settings-units-select=us",
            "kiosk_music=1",
            "kiosk_vol=0.7",
            "kiosk_shuffle=1",
            "kiosk_loc_mode=auto"
        )
        return "$base?${params.joinToString("&")}"
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/com/weatherstartv/MainActivity.kt \
        app/src/main/res/layout/activity_main.xml
git commit -m "feat: MainActivity with WebView, immersive kiosk mode, location bridge"
```

---

## Task 7: location.js

**Files:**
- Create: `app/src/main/assets/location.js`
- Create: `tests/location.test.js`

Location chain: GPS bridge → IP geo → URL params fallback.

- [ ] **Step 1: Write test `tests/location.test.js`**

```js
const assert = require('assert');

function buildLatLonParam(lat, lon) {
    return encodeURIComponent(JSON.stringify({ lat, lon }));
}

function parseManualLatLon(input) {
    const parts = input.trim().split(',').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    const [lat, lon] = parts;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

let passed = 0;

{
    const encoded = buildLatLonParam(28.431, -81.308);
    const decoded = JSON.parse(decodeURIComponent(encoded));
    assert.strictEqual(decoded.lat, 28.431);
    assert.strictEqual(decoded.lon, -81.308);
    console.log('✓ buildLatLonParam encodes lat/lon to URL-encoded JSON');
    passed++;
}

{
    const result = parseManualLatLon('40.7128, -74.0060');
    assert.deepStrictEqual(result, { lat: 40.7128, lon: -74.006 });
    console.log('✓ parseManualLatLon parses valid lat,lon string');
    passed++;
}

{
    assert.strictEqual(parseManualLatLon('New York'), null);
    assert.strictEqual(parseManualLatLon('999, 0'), null);
    assert.strictEqual(parseManualLatLon(''), null);
    console.log('✓ parseManualLatLon rejects invalid input');
    passed++;
}

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run test**

```bash
node tests/location.test.js
```

Expected: `3 tests passed`

- [ ] **Step 3: Implement `app/src/main/assets/location.js`**

```js
/* location.js — injected into ws4kp page by KioskWebViewClient */

(function () {
    'use strict';

    function buildLatLonParam(lat, lon) {
        return encodeURIComponent(JSON.stringify({ lat, lon }));
    }

    function parseManualLatLon(input) {
        const parts = input.trim().split(',').map(Number);
        if (parts.length !== 2 || parts.some(isNaN)) return null;
        const [lat, lon] = parts;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        return { lat, lon };
    }

    function applyLocationAndReload(lat, lon) {
        const url = new URL(window.location.href);
        url.searchParams.set('latLon', buildLatLonParam(lat, lon));
        history.replaceState(null, '', url.toString());
        window.location.reload();
    }

    async function tryIpGeo() {
        try {
            const resp = await fetch('https://ipapi.co/json/');
            if (!resp.ok) return false;
            const data = await resp.json();
            if (data.latitude && data.longitude) {
                applyLocationAndReload(data.latitude, data.longitude);
                return true;
            }
        } catch (_) { /* silent */ }
        return false;
    }

    // Called by LocationBridge on GPS success
    window.onLocationResult = function (lat, lon) {
        applyLocationAndReload(lat, lon);
    };

    // Called by LocationBridge on GPS failure/denied
    window.onLocationError = async function () {
        const ok = await tryIpGeo();
        if (!ok) {
            console.log('[location] All methods failed, ws4kp will show city picker');
        }
    };

    // Called by settings.js Apply when locMode=manual
    window.applyManualLocation = function (latLonStr) {
        const parsed = parseManualLatLon(latLonStr);
        if (!parsed) { console.warn('[location] Invalid input:', latLonStr); return false; }
        const url = new URL(window.location.href);
        url.searchParams.set('latLon', buildLatLonParam(parsed.lat, parsed.lon));
        url.searchParams.set('kiosk_loc_mode', 'manual');
        history.replaceState(null, '', url.toString());
        window.location.reload();
        return true;
    };

    // Called by settings.js "Re-detect" button
    window.redetectLocation = function () {
        const url = new URL(window.location.href);
        url.searchParams.delete('latLon');
        url.searchParams.set('kiosk_loc_mode', 'auto');
        history.replaceState(null, '', url.toString());
        window.location.reload();
    };

    function initLocation() {
        const url = new URL(window.location.href);
        const locMode = url.searchParams.get('kiosk_loc_mode');
        const hasLatLon = url.searchParams.has('latLon');

        if (locMode === 'manual' && hasLatLon) {
            console.log('[location] Manual mode with coords, skipping auto-detect');
            return;
        }

        if (window.Android) {
            window.Android.requestLocation();
        } else {
            // Fallback for browser testing (no Android bridge)
            window.onLocationError();
        }
    }

    window.initLocation = initLocation;
})();
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/assets/location.js tests/location.test.js
git commit -m "feat: location.js with GPS bridge, IP geo fallback, manual override"
```

---

## Task 8: music.js

**Files:**
- Create: `app/src/main/assets/music.js`
- Create: `tests/music.test.js`

Fetches Archive.org XML, parses MP3 entries, builds playlist, plays via HTML5 Audio.

- [ ] **Step 1: Write test `tests/music.test.js`**

```js
const assert = require('assert');

const ARCHIVE_BASE = 'https://archive.org/download/weatherscancompletecollection/';

function parsePlaylistFromXml(xmlStr) {
    const result = [];
    // Match source=original files only (not derivatives)
    const fileRegex = /<file\s+name="([^"]+)"\s+source="original"([\s\S]*?)<\/file>/g;
    let match;
    while ((match = fileRegex.exec(xmlStr)) !== null) {
        const filename = match[1];
        const body = match[2];
        if (!/<format>VBR MP3<\/format>/.test(body)) continue;
        const titleMatch = body.match(/<title>([^<]+)<\/title>/);
        result.push({
            url: ARCHIVE_BASE + encodeURIComponent(filename),
            title: titleMatch ? titleMatch[1] : filename.replace(/\.\w+$/, '')
        });
    }
    return result;
}

function fisherYatesShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let passed = 0;

// parsePlaylistFromXml — only source=original MP3s
{
    const xml = `<files>
  <file name="01 Fair Weather.mp3" source="original">
    <format>VBR MP3</format><title>Fair Weather</title>
  </file>
  <file name="01 Fair Weather.ogg" source="derivative">
    <format>Ogg Vorbis</format><original>01 Fair Weather.mp3</original>
  </file>
  <file name="Weatherscan Track 1.mp3" source="original">
    <format>VBR MP3</format>
  </file>
</files>`;
    const pl = parsePlaylistFromXml(xml);
    assert.strictEqual(pl.length, 2, 'Both original MP3s, no derivatives');
    assert.ok(pl[0].url.includes('01%20Fair%20Weather.mp3'));
    assert.strictEqual(pl[0].title, 'Fair Weather');
    console.log('✓ parsePlaylistFromXml extracts source=original MP3s only');
    passed++;
}

// URL encoding of spaces
{
    const xml = `<files>
  <file name="Weatherscan Track 3.mp3" source="original">
    <format>VBR MP3</format>
  </file>
</files>`;
    const pl = parsePlaylistFromXml(xml);
    assert.ok(pl[0].url.includes('Weatherscan%20Track%203.mp3'));
    assert.ok(pl[0].url.startsWith(ARCHIVE_BASE));
    console.log('✓ parsePlaylistFromXml URL-encodes spaces in filename');
    passed++;
}

// Fisher-Yates preserves elements
{
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = fisherYatesShuffle(arr);
    assert.strictEqual(shuffled.length, arr.length);
    assert.deepStrictEqual([...shuffled].sort((a, b) => a - b), arr);
    console.log('✓ fisherYatesShuffle preserves all elements');
    passed++;
}

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run test**

```bash
node tests/music.test.js
```

Expected: `3 tests passed`

- [ ] **Step 3: Implement `app/src/main/assets/music.js`**

```js
/* music.js — injected into ws4kp page by KioskWebViewClient */

(function () {
    'use strict';

    const ARCHIVE_XML = 'https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml';
    const ARCHIVE_BASE = 'https://archive.org/download/weatherscancompletecollection/';

    let playlist = [];
    let currentIndex = 0;
    let audio = null;
    let initialized = false;

    function parsePlaylistFromXml(xmlStr) {
        const result = [];
        const fileRegex = /<file\s+name="([^"]+)"\s+source="original"([\s\S]*?)<\/file>/g;
        let match;
        while ((match = fileRegex.exec(xmlStr)) !== null) {
            const filename = match[1];
            const body = match[2];
            if (!/<format>VBR MP3<\/format>/.test(body)) continue;
            const titleMatch = body.match(/<title>([^<]+)<\/title>/);
            result.push({
                url: ARCHIVE_BASE + encodeURIComponent(filename),
                title: titleMatch ? titleMatch[1] : filename.replace(/\.\w+$/, '')
            });
        }
        return result;
    }

    function fisherYatesShuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function getParams() {
        const p = new URL(window.location.href).searchParams;
        return {
            enabled: p.get('kiosk_music') !== '0',
            volume: parseFloat(p.get('kiosk_vol') ?? '0.7'),
            shuffle: p.get('kiosk_shuffle') !== '0'
        };
    }

    function playTrack(index) {
        if (!audio || playlist.length === 0) return;
        currentIndex = index % playlist.length;
        const track = playlist[currentIndex];
        audio.src = track.url;
        audio.play().catch(() => {});
        if (window._settingsUpdateTrack) window._settingsUpdateTrack(track.title);
    }

    function nextTrack() {
        playTrack((currentIndex + 1) % playlist.length);
    }

    async function initMusic() {
        if (initialized) return;
        initialized = true;

        const params = getParams();
        if (!params.enabled) return;

        audio = new Audio();
        audio.volume = Math.max(0, Math.min(1, params.volume));
        audio.addEventListener('ended', nextTrack);
        audio.addEventListener('error', () => setTimeout(nextTrack, 1000));

        try {
            const resp = await fetch(ARCHIVE_XML);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const xml = await resp.text();
            let tracks = parsePlaylistFromXml(xml);
            if (tracks.length === 0) throw new Error('No tracks found');
            if (params.shuffle) tracks = fisherYatesShuffle(tracks);
            playlist = tracks;
            playTrack(0);
        } catch (err) {
            console.warn('[music] Playlist load failed, music disabled:', err.message);
            audio = null;
        }
    }

    window.musicSetVolume = function (vol) {
        if (audio) audio.volume = Math.max(0, Math.min(1, vol));
    };

    window.musicSetEnabled = function (enabled) {
        if (!audio) return;
        if (enabled) audio.play().catch(() => {});
        else audio.pause();
    };

    window.musicGetCurrentTitle = function () {
        return playlist[currentIndex]?.title ?? '';
    };

    window.initMusic = initMusic;
})();
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/assets/music.js tests/music.test.js
git commit -m "feat: music.js with Archive.org playlist, shuffle, HTML5 Audio"
```

---

## Task 9: settings.js

**Files:**
- Create: `app/src/main/assets/settings.js`
- Create: `tests/settings.test.js`

Injects settings overlay HTML/CSS, handles form state, writes URL params on Apply.

- [ ] **Step 1: Write test `tests/settings.test.js`**

```js
const assert = require('assert');

function readKioskParams(searchParams) {
    return {
        music: searchParams.get('kiosk_music') !== '0',
        volume: parseFloat(searchParams.get('kiosk_vol') ?? '0.7'),
        shuffle: searchParams.get('kiosk_shuffle') !== '0',
        locMode: searchParams.get('kiosk_loc_mode') ?? 'auto',
        wide: searchParams.get('settings-wide-checkbox') === 'true',
        units: searchParams.get('settings-units-select') ?? 'us',
        speed: searchParams.get('settings-speed-select') ?? '1.0',
    };
}

function writeKioskParams(urlStr, values) {
    const u = new URL(urlStr);
    u.searchParams.set('kiosk_music', values.music ? '1' : '0');
    u.searchParams.set('kiosk_vol', String(values.volume));
    u.searchParams.set('kiosk_shuffle', values.shuffle ? '1' : '0');
    u.searchParams.set('kiosk_loc_mode', values.locMode);
    u.searchParams.set('settings-wide-checkbox', values.wide ? 'true' : 'false');
    u.searchParams.set('settings-units-select', values.units);
    u.searchParams.set('settings-speed-select', values.speed);
    return u.toString();
}

let passed = 0;

// readKioskParams — defaults for empty query string
{
    const p = new URLSearchParams('');
    const params = readKioskParams(p);
    assert.strictEqual(params.music, true);
    assert.strictEqual(params.volume, 0.7);
    assert.strictEqual(params.shuffle, true);
    assert.strictEqual(params.locMode, 'auto');
    console.log('✓ readKioskParams returns correct defaults');
    passed++;
}

// readKioskParams — explicit values
{
    const p = new URLSearchParams('kiosk_music=0&kiosk_vol=0.3&kiosk_shuffle=0&kiosk_loc_mode=manual');
    const params = readKioskParams(p);
    assert.strictEqual(params.music, false);
    assert.strictEqual(params.volume, 0.3);
    assert.strictEqual(params.shuffle, false);
    assert.strictEqual(params.locMode, 'manual');
    console.log('✓ readKioskParams reads explicit values correctly');
    passed++;
}

// writeKioskParams preserves existing ws4kp params
{
    const url = 'file:///android_asset/ws4kp/index.html?settings-kiosk-checkbox=true';
    const updated = writeKioskParams(url, {
        music: false, volume: 0.5, shuffle: false,
        locMode: 'auto', wide: true, units: 'si', speed: '1.25'
    });
    const p = new URL(updated).searchParams;
    assert.strictEqual(p.get('kiosk_music'), '0');
    assert.strictEqual(p.get('kiosk_vol'), '0.5');
    assert.strictEqual(p.get('settings-kiosk-checkbox'), 'true'); // preserved
    assert.strictEqual(p.get('settings-units-select'), 'si');
    console.log('✓ writeKioskParams preserves existing params');
    passed++;
}

console.log(`\n${passed} tests passed`);
```

- [ ] **Step 2: Run test**

```bash
node tests/settings.test.js
```

Expected: `3 tests passed`

- [ ] **Step 3: Implement `app/src/main/assets/settings.js`**

```js
/* settings.js — injected into ws4kp page by KioskWebViewClient */

(function () {
    'use strict';

    const CSS = `
#kiosk-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.75); z-index: 99999;
    align-items: center; justify-content: center;
}
#kiosk-backdrop.open { display: flex; }
#kiosk-modal {
    background: #0d1b2a; border: 1px solid #1e3a5f; border-radius: 12px;
    padding: 24px; width: min(480px, 90vw); max-height: 80vh;
    overflow-y: auto; color: #e0e8f0; font-family: sans-serif;
}
#kiosk-modal h2 { margin: 0 0 16px; font-size: 1.1rem; color: #7cb9e8; }
.k-section { margin-bottom: 16px; border-bottom: 1px solid #1e3a5f; padding-bottom: 12px; }
.k-section:last-child { border-bottom: none; }
.k-section h3 { margin: 0 0 8px; font-size: 0.8rem; color: #9ab; text-transform: uppercase; letter-spacing: 0.05em; }
.k-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 0.9rem; }
.k-row label { flex: 1; }
.k-radio { display: flex; gap: 16px; }
.k-radio label { display: flex; align-items: center; gap: 4px; cursor: pointer; flex: unset; }
input[type=range] { flex: 2; accent-color: #7cb9e8; }
input[type=text] {
    background: #1e3a5f; border: 1px solid #3a6a9f; border-radius: 4px;
    color: #e0e8f0; padding: 4px 8px; font-size: 0.9rem; flex: 2;
}
select {
    background: #1e3a5f; border: 1px solid #3a6a9f; border-radius: 4px;
    color: #e0e8f0; padding: 4px 8px; font-size: 0.9rem;
}
#kiosk-track { font-size: 0.75rem; color: #7cb9e8; font-style: italic; margin: 4px 0 0; min-height: 1em; }
#kiosk-apply {
    background: #1e5a9f; color: white; border: none; border-radius: 6px;
    padding: 10px 24px; font-size: 0.95rem; cursor: pointer; width: 100%; margin-top: 8px;
}
#kiosk-apply:focus, #kiosk-apply:hover { background: #2a7abf; }
*:focus-visible { outline: 2px solid #7cb9e8; outline-offset: 2px; }
.k-btn-sm {
    font-size: 0.8rem; padding: 4px 10px; background: #1e3a5f;
    border: 1px solid #3a6a9f; border-radius: 4px; color: #e0e8f0; cursor: pointer;
}`;

    const HTML = `
<div id="kiosk-backdrop">
  <div id="kiosk-modal" role="dialog" aria-label="WeatherStar Settings">
    <h2>&#9881; WeatherStar Settings</h2>
    <div class="k-section">
      <h3>Location</h3>
      <div class="k-row k-radio">
        <label><input type="radio" name="k-loc" value="auto" tabindex="0"> Auto-detect</label>
        <label><input type="radio" name="k-loc" value="manual" tabindex="0"> Manual</label>
      </div>
      <div class="k-row" id="k-manual-row" style="display:none">
        <label for="k-latlon">Lat,Lon:</label>
        <input type="text" id="k-latlon" placeholder="40.7128,-74.0060" tabindex="0">
      </div>
      <div class="k-row">
        <button id="k-redetect" class="k-btn-sm" tabindex="0">Re-detect location</button>
      </div>
    </div>
    <div class="k-section">
      <h3>Music</h3>
      <div class="k-row">
        <label for="k-music">Enabled</label>
        <input type="checkbox" id="k-music" tabindex="0">
      </div>
      <div class="k-row k-radio">
        <label><input type="radio" name="k-play" value="sequential" tabindex="0"> Sequential</label>
        <label><input type="radio" name="k-play" value="shuffle" tabindex="0"> Shuffle</label>
      </div>
      <div class="k-row">
        <label for="k-vol">Volume</label>
        <input type="range" id="k-vol" min="0" max="100" tabindex="0">
      </div>
      <div id="kiosk-track"></div>
    </div>
    <div class="k-section">
      <h3>Display</h3>
      <div class="k-row">
        <label for="k-wide">Widescreen (16:9)</label>
        <input type="checkbox" id="k-wide" tabindex="0">
      </div>
      <div class="k-row">
        <label for="k-units">Units</label>
        <select id="k-units" tabindex="0">
          <option value="us">US (°F)</option>
          <option value="si">Metric (°C)</option>
        </select>
      </div>
      <div class="k-row">
        <label for="k-speed">Speed</label>
        <select id="k-speed" tabindex="0">
          <option value="0.5">Very Fast</option>
          <option value="0.75">Fast</option>
          <option value="1.0">Normal</option>
          <option value="1.25">Slow</option>
          <option value="1.5">Very Slow</option>
        </select>
      </div>
    </div>
    <button id="kiosk-apply" tabindex="0">Apply</button>
  </div>
</div>`;

    function readParams() {
        const p = new URL(window.location.href).searchParams;
        return {
            music: p.get('kiosk_music') !== '0',
            volume: parseFloat(p.get('kiosk_vol') ?? '0.7'),
            shuffle: p.get('kiosk_shuffle') !== '0',
            locMode: p.get('kiosk_loc_mode') ?? 'auto',
            latLon: p.get('latLon') ?? '',
            wide: p.get('settings-wide-checkbox') === 'true',
            units: p.get('settings-units-select') ?? 'us',
            speed: p.get('settings-speed-select') ?? '1.0',
        };
    }

    function applySettings(values) {
        const u = new URL(window.location.href);
        u.searchParams.set('kiosk_music', values.music ? '1' : '0');
        u.searchParams.set('kiosk_vol', String(values.volume));
        u.searchParams.set('kiosk_shuffle', values.shuffle ? '1' : '0');
        u.searchParams.set('kiosk_loc_mode', values.locMode);
        u.searchParams.set('settings-wide-checkbox', values.wide ? 'true' : 'false');
        u.searchParams.set('settings-units-select', values.units);
        u.searchParams.set('settings-speed-select', values.speed);

        if (values.locMode === 'manual' && values.latLon && window.applyManualLocation) {
            // applyManualLocation handles replaceState + reload
            window.applyManualLocation(values.latLon);
            return;
        }
        if (values.locMode === 'auto') u.searchParams.delete('latLon');
        history.replaceState(null, '', u.toString());
        window.location.reload();
    }

    function initSettings() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = HTML;
        document.body.appendChild(wrapper);

        const backdrop = document.getElementById('kiosk-backdrop');
        const locRadios = document.querySelectorAll('input[name="k-loc"]');
        const manualRow = document.getElementById('k-manual-row');
        const latLonInput = document.getElementById('k-latlon');
        const musicCheck = document.getElementById('k-music');
        const volSlider = document.getElementById('k-vol');
        const playRadios = document.querySelectorAll('input[name="k-play"]');
        const wideCheck = document.getElementById('k-wide');
        const unitsSelect = document.getElementById('k-units');
        const speedSelect = document.getElementById('k-speed');
        const applyBtn = document.getElementById('kiosk-apply');
        const redetectBtn = document.getElementById('k-redetect');
        const trackLabel = document.getElementById('kiosk-track');

        function populateForm() {
            const p = readParams();
            locRadios.forEach(r => { r.checked = r.value === p.locMode; });
            manualRow.style.display = p.locMode === 'manual' ? 'flex' : 'none';
            if (p.latLon) {
                try {
                    const coord = JSON.parse(decodeURIComponent(p.latLon));
                    latLonInput.value = coord.lat + ',' + coord.lon;
                } catch (_) {}
            }
            musicCheck.checked = p.music;
            volSlider.value = Math.round(p.volume * 100);
            playRadios.forEach(r => { r.checked = r.value === (p.shuffle ? 'shuffle' : 'sequential'); });
            wideCheck.checked = p.wide;
            unitsSelect.value = p.units;
            speedSelect.value = p.speed;
            if (window.musicGetCurrentTitle) trackLabel.textContent = window.musicGetCurrentTitle();
        }

        locRadios.forEach(r => r.addEventListener('change', () => {
            manualRow.style.display = r.value === 'manual' && r.checked ? 'flex' : 'none';
        }));

        volSlider.addEventListener('input', () => {
            if (window.musicSetVolume) window.musicSetVolume(volSlider.value / 100);
        });

        applyBtn.addEventListener('click', () => {
            applySettings({
                music: musicCheck.checked,
                volume: volSlider.value / 100,
                shuffle: [...playRadios].find(r => r.checked)?.value === 'shuffle',
                locMode: [...locRadios].find(r => r.checked)?.value ?? 'auto',
                latLon: latLonInput.value.trim(),
                wide: wideCheck.checked,
                units: unitsSelect.value,
                speed: speedSelect.value,
            });
        });

        redetectBtn.addEventListener('click', () => {
            if (window.redetectLocation) window.redetectLocation();
        });

        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) closeSettings();
        });

        document.addEventListener('keydown', e => {
            if ((e.key === 'Escape' || e.key === 'GoBack') && backdrop.classList.contains('open')) {
                closeSettings();
            }
        });

        function openSettings() {
            populateForm();
            backdrop.classList.add('open');
            applyBtn.focus();
        }

        function closeSettings() {
            backdrop.classList.remove('open');
        }

        window.openKioskSettings = openSettings;
        window.closeKioskSettings = closeSettings;
        window._settingsUpdateTrack = t => { trackLabel.textContent = t; };
    }

    window.initSettings = initSettings;
})();
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/assets/settings.js tests/settings.test.js
git commit -m "feat: settings.js overlay with location, music, display controls"
```

---

## Task 10: overlay.js

**Files:**
- Create: `app/src/main/assets/overlay.js`

Bootstrap script: attaches long-press listener, calls init functions in order.

- [ ] **Step 1: Implement `app/src/main/assets/overlay.js`**

```js
/* overlay.js — injected last by KioskWebViewClient */

(function () {
    'use strict';

    let pressTimer = null;
    let pressing = false;

    function startPress(target) {
        if (target.closest && target.closest('#kiosk-backdrop')) return;
        pressing = true;
        pressTimer = setTimeout(function () {
            if (pressing && window.openKioskSettings) window.openKioskSettings();
        }, 600);
    }

    function cancelPress() {
        pressing = false;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    document.addEventListener('touchstart', e => startPress(e.target), { passive: true });
    document.addEventListener('touchmove', cancelPress, { passive: true });
    document.addEventListener('touchend', cancelPress, { passive: true });
    document.addEventListener('touchcancel', cancelPress, { passive: true });
    document.addEventListener('mousedown', e => startPress(e.target));
    document.addEventListener('mouseup', cancelPress);
    document.addEventListener('mousemove', cancelPress);

    // Bootstrap: settings creates DOM first, then location and music run
    if (window.initSettings) window.initSettings();
    if (window.initLocation) window.initLocation();
    if (window.initMusic) window.initMusic();

    console.log('[overlay] WeatherStar Kiosk overlay ready');
})();
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/assets/overlay.js
git commit -m "feat: overlay.js bootstrap with long-press and module init"
```

---

## Task 11: Build, Verify, and Ship

- [ ] **Step 1: Run all JS tests**

```bash
node tests/location.test.js && node tests/music.test.js && node tests/settings.test.js
```

Expected: All test suites report `tests passed`.

- [ ] **Step 2: Generate gradle wrapper if not present**

```bash
gradle wrapper --gradle-version 8.4
```

- [ ] **Step 3: Build debug APK**

```bash
./gradlew assembleDebug 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL` and file at `app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 4: Install on device**

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or via Gradle:
```bash
./gradlew installDebug
```

- [ ] **Step 5: Manual verification on phone**

- [ ] App launches fullscreen, landscape, no status/nav bars visible
- [ ] ws4kp weather display loads and cycles through forecast segments
- [ ] After ~5 seconds, weather updates to local area (location detected)
- [ ] Ambient music plays (check device volume)
- [ ] Hold screen 600ms → settings modal opens
- [ ] Settings: adjust volume slider → music volume changes live
- [ ] Settings: enter `40.7128,-74.0060` as manual location → Apply → weather switches to NYC
- [ ] Settings: toggle music off → Apply → music stops

- [ ] **Step 6: Manual verification on Android TV**

- [ ] App appears in TV launcher (leanback)
- [ ] D-pad navigates between settings modal controls
- [ ] Hold remote OK/Enter 600ms → settings modal opens
- [ ] Back button closes settings modal

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: WeatherStar Kiosk v1.0 complete"
```

---

## Quick Reference

### ws4kp URL Params

| Intent | Param |
|--------|-------|
| Set location | `latLon=%7B%22lat%22%3A28.431%2C%22lon%22%3A-81.308%7D` |
| Enable kiosk mode | `settings-kiosk-checkbox=true` |
| Enable widescreen | `settings-wide-checkbox=true` |
| Disable ws4kp built-in music | `settings-mediaPlaying-boolean=false` |
| Set playback speed | `settings-speed-select=1.0` |
| Set units | `settings-units-select=us` |

### Kiosk Wrapper Params

| Intent | Param |
|--------|-------|
| Enable Archive.org music | `kiosk_music=1` |
| Set volume | `kiosk_vol=0.7` |
| Enable shuffle | `kiosk_shuffle=1` |
| Manual location mode | `kiosk_loc_mode=manual` |

### Archive.org

- XML: `https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml`
- Stream base: `https://archive.org/download/weatherscancompletecollection/`
- 68 MP3 tracks total (26 Trammell Starks jazz + 27 Weatherscan + 15 bonus)
