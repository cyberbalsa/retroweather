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
        minSdk 19   // Android 4.4 KitKat
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
import android.os.Build
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
            // MIXED_CONTENT_ALWAYS_ALLOW added in API 21; not needed on API 19-20
            // (KitKat WebView allows mixed content by default)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                @Suppress("DEPRECATION")
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
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
/* location.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* No const/let, no arrow functions, no fetch, no new URL(), no async/await */

(function () {
    'use strict';

    // ── URL param helpers (no URLSearchParams / new URL on KitKat) ──────────

    function getParam(name) {
        var search = window.location.search.substring(1);
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var idx = pairs[i].indexOf('=');
            if (idx < 0) continue;
            var k = decodeURIComponent(pairs[i].substring(0, idx));
            if (k === name) return decodeURIComponent(pairs[i].substring(idx + 1).replace(/\+/g, ' '));
        }
        return null;
    }

    function setParam(key, value) {
        var search = window.location.search;
        var enc = encodeURIComponent(key) + '=' + encodeURIComponent(value);
        var re = new RegExp('([?&])' + encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=[^&]*');
        if (re.test(search)) {
            search = search.replace(re, function (m, pre) { return pre + enc; });
        } else {
            search = search + (search.length > 1 ? '&' : '?') + enc;
        }
        history.replaceState(null, '', window.location.pathname + search);
    }

    function removeParam(key) {
        var search = window.location.search;
        var re = new RegExp('[?&]' + encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=[^&]*', 'g');
        search = search.replace(re, '');
        if (search.charAt(0) === '&') search = '?' + search.substring(1);
        history.replaceState(null, '', window.location.pathname + search);
    }

    // ── Core functions ───────────────────────────────────────────────────────

    function buildLatLonParam(lat, lon) {
        return encodeURIComponent(JSON.stringify({ lat: lat, lon: lon }));
    }

    function parseManualLatLon(input) {
        var parts = input.trim().split(',');
        if (parts.length !== 2) return null;
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        return { lat: lat, lon: lon };
    }

    function applyLocationAndReload(lat, lon) {
        setParam('latLon', buildLatLonParam(lat, lon));
        window.location.reload();
    }

    function tryIpGeo() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://ipapi.co/json/', true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.latitude && data.longitude) {
                        applyLocationAndReload(data.latitude, data.longitude);
                        return;
                    }
                } catch (e) { /* silent */ }
            }
            console.log('[location] All methods failed, ws4kp will show city picker');
        };
        xhr.onerror = function () {
            console.log('[location] IP geo request failed');
        };
        xhr.send();
    }

    // Called by LocationBridge on GPS success
    window.onLocationResult = function (lat, lon) {
        applyLocationAndReload(lat, lon);
    };

    // Called by LocationBridge on GPS failure/denied
    window.onLocationError = function () {
        tryIpGeo();
    };

    // Called by settings.js Apply when locMode=manual
    window.applyManualLocation = function (latLonStr) {
        var parsed = parseManualLatLon(latLonStr);
        if (!parsed) { console.warn('[location] Invalid input:', latLonStr); return false; }
        setParam('latLon', buildLatLonParam(parsed.lat, parsed.lon));
        setParam('kiosk_loc_mode', 'manual');
        window.location.reload();
        return true;
    };

    // Called by settings.js "Re-detect" button
    window.redetectLocation = function () {
        removeParam('latLon');
        setParam('kiosk_loc_mode', 'auto');
        window.location.reload();
    };

    function initLocation() {
        var locMode = getParam('kiosk_loc_mode');
        var hasLatLon = getParam('latLon') !== null;

        if (locMode === 'manual' && hasLatLon) {
            console.log('[location] Manual mode with coords, skipping auto-detect');
            return;
        }

        if (window.Android) {
            window.Android.requestLocation();
        } else {
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
/* music.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* Uses XHR + DOMParser (both available in Chrome 30) */

(function () {
    'use strict';

    var ARCHIVE_XML = 'https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml';
    var ARCHIVE_BASE = 'https://archive.org/download/weatherscancompletecollection/';

    var playlist = [];
    var currentIndex = 0;
    var audio = null;
    var initialized = false;

    function getParam(name) {
        var search = window.location.search.substring(1);
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var idx = pairs[i].indexOf('=');
            if (idx < 0) continue;
            var k = decodeURIComponent(pairs[i].substring(0, idx));
            if (k === name) return decodeURIComponent(pairs[i].substring(idx + 1).replace(/\+/g, ' '));
        }
        return null;
    }

    // DOMParser is available in Chrome 30 (KitKat) — cleaner than regex
    function parsePlaylistFromXml(xmlStr) {
        var result = [];
        try {
            var parser = new DOMParser();
            var doc = parser.parseFromString(xmlStr, 'text/xml');
            var files = doc.getElementsByTagName('file');
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.getAttribute('source') !== 'original') continue;
                var formatEls = file.getElementsByTagName('format');
                if (!formatEls.length || formatEls[0].textContent !== 'VBR MP3') continue;
                var filename = file.getAttribute('name');
                var titleEls = file.getElementsByTagName('title');
                var title = titleEls.length ? titleEls[0].textContent : filename.replace(/\.\w+$/, '');
                result.push({ url: ARCHIVE_BASE + encodeURIComponent(filename), title: title });
            }
        } catch (e) {
            console.warn('[music] XML parse error:', e.message);
        }
        return result;
    }

    function fisherYatesShuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function getParams() {
        return {
            enabled: getParam('kiosk_music') !== '0',
            volume: parseFloat(getParam('kiosk_vol') || '0.7'),
            shuffle: getParam('kiosk_shuffle') !== '0'
        };
    }

    function playTrack(index) {
        if (!audio || playlist.length === 0) return;
        currentIndex = index % playlist.length;
        var track = playlist[currentIndex];
        audio.src = track.url;
        try { audio.play(); } catch (e) { /* autoplay blocked */ }
        if (window._settingsUpdateTrack) window._settingsUpdateTrack(track.title);
    }

    function nextTrack() {
        playTrack((currentIndex + 1) % playlist.length);
    }

    function initMusic() {
        if (initialized) return;
        initialized = true;

        var params = getParams();
        if (!params.enabled) return;

        audio = new Audio();
        audio.volume = Math.max(0, Math.min(1, params.volume));
        audio.addEventListener('ended', nextTrack);
        audio.addEventListener('error', function () { setTimeout(nextTrack, 1000); });

        var xhr = new XMLHttpRequest();
        xhr.open('GET', ARCHIVE_XML, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status !== 200) {
                console.warn('[music] XML fetch failed, status:', xhr.status);
                audio = null;
                return;
            }
            var tracks = parsePlaylistFromXml(xhr.responseText);
            if (tracks.length === 0) {
                console.warn('[music] No tracks found in XML');
                audio = null;
                return;
            }
            if (params.shuffle) tracks = fisherYatesShuffle(tracks);
            playlist = tracks;
            playTrack(0);
        };
        xhr.onerror = function () {
            console.warn('[music] XML request failed, music disabled');
            audio = null;
        };
        xhr.send();
    }

    window.musicSetVolume = function (vol) {
        if (audio) audio.volume = Math.max(0, Math.min(1, vol));
    };

    window.musicSetEnabled = function (enabled) {
        if (!audio) return;
        if (enabled) { try { audio.play(); } catch (e) {} }
        else audio.pause();
    };

    window.musicGetCurrentTitle = function () {
        return (playlist[currentIndex] && playlist[currentIndex].title) ? playlist[currentIndex].title : '';
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
/* settings.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* No const/let, no template literals, no new URL(), no .find(), no .closest() */
/* CSS: no gap/min() — uses margin/max-width; flexbox with -webkit- prefixes */

(function () {
    'use strict';

    var CSS = '#kiosk-backdrop {'
        + 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;'
        + 'background:rgba(0,0,0,0.75);z-index:99999;'
        + '-webkit-box-align:center;-webkit-align-items:center;align-items:center;'
        + '-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;'
        + '}'
        + '#kiosk-backdrop.open{display:-webkit-box;display:-webkit-flex;display:flex;}'
        + '#kiosk-modal{'
        + 'background:#0d1b2a;border:1px solid #1e3a5f;border-radius:12px;'
        + 'padding:24px;width:90vw;max-width:480px;max-height:80vh;'
        + 'overflow-y:auto;color:#e0e8f0;font-family:sans-serif;'
        + '-webkit-box-sizing:border-box;box-sizing:border-box;'
        + '}'
        + '#kiosk-modal h2{margin:0 0 16px;font-size:1.1em;color:#7cb9e8;}'
        + '.k-section{margin-bottom:16px;border-bottom:1px solid #1e3a5f;padding-bottom:12px;}'
        + '.k-section h3{margin:0 0 8px;font-size:0.8em;color:#9ab;text-transform:uppercase;}'
        + '.k-row{display:-webkit-box;display:-webkit-flex;display:flex;'
        + '-webkit-box-align:center;-webkit-align-items:center;align-items:center;'
        + 'margin:6px 0;font-size:0.9em;}'
        + '.k-row>label:first-child{-webkit-box-flex:1;-webkit-flex:1;flex:1;}'
        + '.k-radio label{-webkit-box-flex:0;-webkit-flex:none;flex:none;margin-right:16px;cursor:pointer;}'
        + 'input[type=range]{-webkit-box-flex:2;-webkit-flex:2;flex:2;margin-left:8px;}'
        + 'input[type=text]{'
        + 'background:#1e3a5f;border:1px solid #3a6a9f;border-radius:4px;'
        + 'color:#e0e8f0;padding:4px 8px;font-size:0.9em;'
        + '-webkit-box-flex:2;-webkit-flex:2;flex:2;margin-left:8px;'
        + '}'
        + 'select{background:#1e3a5f;border:1px solid #3a6a9f;border-radius:4px;'
        + 'color:#e0e8f0;padding:4px 8px;font-size:0.9em;margin-left:8px;}'
        + '#kiosk-track{font-size:0.75em;color:#7cb9e8;font-style:italic;margin:4px 0 0;min-height:1em;}'
        + '#kiosk-apply{background:#1e5a9f;color:white;border:none;border-radius:6px;'
        + 'padding:10px 24px;font-size:0.95em;cursor:pointer;width:100%;margin-top:8px;}'
        + '#kiosk-apply:focus{background:#2a7abf;outline:2px solid #7cb9e8;}'
        + '.k-btn-sm{font-size:0.8em;padding:4px 10px;background:#1e3a5f;'
        + 'border:1px solid #3a6a9f;border-radius:4px;color:#e0e8f0;cursor:pointer;}';

    var HTML = '<div id="kiosk-backdrop">'
        + '<div id="kiosk-modal" role="dialog">'
        + '<h2>&#9881; WeatherStar Settings</h2>'
        + '<div class="k-section"><h3>Location</h3>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-loc" value="auto" tabindex="0"> Auto-detect</label>'
        + '<label><input type="radio" name="k-loc" value="manual" tabindex="0"> Manual</label>'
        + '</div>'
        + '<div class="k-row" id="k-manual-row" style="display:none">'
        + '<label for="k-latlon">Lat,Lon:</label>'
        + '<input type="text" id="k-latlon" placeholder="40.7128,-74.0060" tabindex="0">'
        + '</div>'
        + '<div class="k-row"><button id="k-redetect" class="k-btn-sm" tabindex="0">Re-detect location</button></div>'
        + '</div>'
        + '<div class="k-section"><h3>Music</h3>'
        + '<div class="k-row"><label for="k-music">Enabled</label><input type="checkbox" id="k-music" tabindex="0"></div>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-play" value="sequential" tabindex="0"> Sequential</label>'
        + '<label><input type="radio" name="k-play" value="shuffle" tabindex="0"> Shuffle</label>'
        + '</div>'
        + '<div class="k-row"><label for="k-vol">Volume</label><input type="range" id="k-vol" min="0" max="100" tabindex="0"></div>'
        + '<div id="kiosk-track"></div>'
        + '</div>'
        + '<div class="k-section"><h3>Display</h3>'
        + '<div class="k-row"><label for="k-wide">Widescreen (16:9)</label><input type="checkbox" id="k-wide" tabindex="0"></div>'
        + '<div class="k-row"><label for="k-units">Units</label>'
        + '<select id="k-units" tabindex="0"><option value="us">US (F)</option><option value="si">Metric (C)</option></select>'
        + '</div>'
        + '<div class="k-row"><label for="k-speed">Speed</label>'
        + '<select id="k-speed" tabindex="0">'
        + '<option value="0.5">Very Fast</option><option value="0.75">Fast</option>'
        + '<option value="1.0">Normal</option><option value="1.25">Slow</option><option value="1.5">Very Slow</option>'
        + '</select></div>'
        + '</div>'
        + '<button id="kiosk-apply" tabindex="0">Apply</button>'
        + '</div></div>';

    // ── URL param helpers ────────────────────────────────────────────────────

    function getParam(name) {
        var search = window.location.search.substring(1);
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var idx = pairs[i].indexOf('=');
            if (idx < 0) continue;
            var k = decodeURIComponent(pairs[i].substring(0, idx));
            if (k === name) return decodeURIComponent(pairs[i].substring(idx + 1).replace(/\+/g, ' '));
        }
        return null;
    }

    function setParam(key, value) {
        var search = window.location.search;
        var enc = encodeURIComponent(key) + '=' + encodeURIComponent(value);
        var safeKey = encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('([?&])' + safeKey + '=[^&]*');
        if (re.test(search)) {
            search = search.replace(re, function (m, pre) { return pre + enc; });
        } else {
            search = search + (search.length > 1 ? '&' : '?') + enc;
        }
        history.replaceState(null, '', window.location.pathname + search);
    }

    function removeParam(key) {
        var search = window.location.search;
        var safeKey = encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('[?&]' + safeKey + '=[^&]*', 'g');
        search = search.replace(re, '');
        if (search.charAt(0) === '&') search = '?' + search.substring(1);
        history.replaceState(null, '', window.location.pathname + search);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // Element.closest() not in Chrome 30 — walk parents manually
    function isInsideId(el, id) {
        while (el) {
            if (el.id === id) return true;
            el = el.parentElement || el.parentNode;
        }
        return false;
    }

    function findCheckedRadio(name) {
        var radios = document.querySelectorAll('input[name="' + name + '"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) return radios[i];
        }
        return null;
    }

    // ── Param read/write ─────────────────────────────────────────────────────

    function readParams() {
        return {
            music:   getParam('kiosk_music') !== '0',
            volume:  parseFloat(getParam('kiosk_vol') || '0.7'),
            shuffle: getParam('kiosk_shuffle') !== '0',
            locMode: getParam('kiosk_loc_mode') || 'auto',
            latLon:  getParam('latLon') || '',
            wide:    getParam('settings-wide-checkbox') === 'true',
            units:   getParam('settings-units-select') || 'us',
            speed:   getParam('settings-speed-select') || '1.0'
        };
    }

    function applySettings(values) {
        setParam('kiosk_music',            values.music   ? '1' : '0');
        setParam('kiosk_vol',              String(values.volume));
        setParam('kiosk_shuffle',          values.shuffle ? '1' : '0');
        setParam('kiosk_loc_mode',         values.locMode);
        setParam('settings-wide-checkbox', values.wide    ? 'true' : 'false');
        setParam('settings-units-select',  values.units);
        setParam('settings-speed-select',  values.speed);

        if (values.locMode === 'manual' && values.latLon && window.applyManualLocation) {
            window.applyManualLocation(values.latLon);
            return;
        }
        if (values.locMode === 'auto') removeParam('latLon');
        window.location.reload();
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function initSettings() {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));
        document.head.appendChild(style);

        // insertAdjacentHTML inserts compile-time constant markup, not user input
        document.body.insertAdjacentHTML('beforeend', HTML);

        var backdrop    = document.getElementById('kiosk-backdrop');
        var manualRow   = document.getElementById('k-manual-row');
        var latLonInput = document.getElementById('k-latlon');
        var musicCheck  = document.getElementById('k-music');
        var volSlider   = document.getElementById('k-vol');
        var wideCheck   = document.getElementById('k-wide');
        var unitsSelect = document.getElementById('k-units');
        var speedSelect = document.getElementById('k-speed');
        var applyBtn    = document.getElementById('kiosk-apply');
        var redetectBtn = document.getElementById('k-redetect');
        var trackLabel  = document.getElementById('kiosk-track');

        function populateForm() {
            var p = readParams();
            var locRadios = document.querySelectorAll('input[name="k-loc"]');
            for (var i = 0; i < locRadios.length; i++) {
                locRadios[i].checked = locRadios[i].value === p.locMode;
            }
            manualRow.style.display = (p.locMode === 'manual') ? 'flex' : 'none';
            if (p.latLon) {
                try {
                    var coord = JSON.parse(decodeURIComponent(p.latLon));
                    latLonInput.value = coord.lat + ',' + coord.lon;
                } catch (e) {}
            }
            musicCheck.checked = p.music;
            volSlider.value    = Math.round(p.volume * 100);
            var playRadios = document.querySelectorAll('input[name="k-play"]');
            for (var j = 0; j < playRadios.length; j++) {
                playRadios[j].checked = playRadios[j].value === (p.shuffle ? 'shuffle' : 'sequential');
            }
            wideCheck.checked  = p.wide;
            unitsSelect.value  = p.units;
            speedSelect.value  = p.speed;
            if (window.musicGetCurrentTitle) trackLabel.textContent = window.musicGetCurrentTitle();
        }

        var locRadiosAll = document.querySelectorAll('input[name="k-loc"]');
        for (var li = 0; li < locRadiosAll.length; li++) {
            locRadiosAll[li].addEventListener('change', function () {
                var ch = findCheckedRadio('k-loc');
                manualRow.style.display = (ch && ch.value === 'manual') ? 'flex' : 'none';
            });
        }

        // KitKat fires 'change', modern browsers fire 'input' — handle both
        function onVolChange() {
            if (window.musicSetVolume) window.musicSetVolume(volSlider.value / 100);
        }
        volSlider.addEventListener('input', onVolChange);
        volSlider.addEventListener('change', onVolChange);

        applyBtn.addEventListener('click', function () {
            var lc = findCheckedRadio('k-loc');
            var pc = findCheckedRadio('k-play');
            applySettings({
                music:   musicCheck.checked,
                volume:  volSlider.value / 100,
                shuffle: pc ? pc.value === 'shuffle' : true,
                locMode: lc ? lc.value : 'auto',
                latLon:  latLonInput.value.trim(),
                wide:    wideCheck.checked,
                units:   unitsSelect.value,
                speed:   speedSelect.value
            });
        });

        redetectBtn.addEventListener('click', function () {
            if (window.redetectLocation) window.redetectLocation();
        });

        backdrop.addEventListener('click', function (e) {
            if (!isInsideId(e.target, 'kiosk-modal')) closeSettings();
        });

        document.addEventListener('keydown', function (e) {
            var key = e.key || e.keyCode;
            var isEsc = (key === 'Escape' || key === 27 || key === 'GoBack');
            if (isEsc && backdrop.className.indexOf('open') !== -1) closeSettings();
        });

        function openSettings() {
            populateForm();
            backdrop.className += ' open';
            applyBtn.focus();
        }

        function closeSettings() {
            backdrop.className = backdrop.className.replace(/\bopen\b/g, '').replace(/\s+/g, ' ').trim();
        }

        window.openKioskSettings  = openSettings;
        window.closeKioskSettings = closeSettings;
        window._settingsUpdateTrack = function (t) { trackLabel.textContent = t; };
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
/* overlay.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* Note: passive event listener option silently ignored on Chrome < 51 — that's fine */

(function () {
    'use strict';

    var pressTimer = null;
    var pressing = false;

    function isInsideBackdrop(el) {
        // Element.closest() not in Chrome 30 — walk parents manually
        while (el) {
            if (el.id === 'kiosk-backdrop') return true;
            el = el.parentElement || el.parentNode;
        }
        return false;
    }

    function startPress(target) {
        if (isInsideBackdrop(target)) return;
        pressing = true;
        pressTimer = setTimeout(function () {
            if (pressing && window.openKioskSettings) window.openKioskSettings();
        }, 600);
    }

    function cancelPress() {
        pressing = false;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    // Touch events (phone/tablet)
    document.addEventListener('touchstart',  function (e) { startPress(e.target); });
    document.addEventListener('touchmove',   cancelPress);
    document.addEventListener('touchend',    cancelPress);
    document.addEventListener('touchcancel', cancelPress);

    // Mouse events (TV remote / D-pad / desktop testing)
    document.addEventListener('mousedown', function (e) { startPress(e.target); });
    document.addEventListener('mouseup',   cancelPress);
    document.addEventListener('mousemove', cancelPress);

    // Bootstrap order: settings creates DOM first, then location and music
    if (window.initSettings) window.initSettings();
    if (window.initLocation) window.initLocation();
    if (window.initMusic)    window.initMusic();

    console.log('[overlay] WeatherStar Kiosk overlay ready');
})();
```

- [ ] **Step 2: Commit**

```bash
git add app/src/main/assets/overlay.js
git commit -m "feat: overlay.js bootstrap with long-press and module init"
```

---

## Task 11: Linting and KitKat Compatibility Checks

**Files:**
- Create: `.eslintrc.json`
- Create: `package.json` (JS dev tooling only)

Catch any ES6+ syntax that slipped into the JS assets before runtime, and verify the Android Kotlin build targets API 19 correctly.

- [ ] **Step 1: Create `package.json` for JS dev tooling**

```json
{
  "name": "weatherstar-kiosk-tools",
  "private": true,
  "scripts": {
    "lint": "eslint app/src/main/assets/*.js",
    "test": "node tests/location.test.js && node tests/music.test.js && node tests/settings.test.js"
  },
  "devDependencies": {
    "eslint": "^8.57.0"
  }
}
```

- [ ] **Step 2: Install ESLint**

```bash
npm install
```

- [ ] **Step 3: Create `.eslintrc.json` — enforce ES5 syntax**

```json
{
  "env": {
    "browser": true,
    "es5": true
  },
  "parserOptions": {
    "ecmaVersion": 5
  },
  "rules": {
    "no-var": "off",
    "prefer-const": "off",
    "no-undef": "warn"
  }
}
```

With `ecmaVersion: 5`, ESLint will error on any ES6+ syntax (`const`, `let`, arrow functions, template literals, destructuring, spread, `async`/`await`, etc.).

- [ ] **Step 4: Run linter on all JS assets**

```bash
npm run lint
```

Expected: No errors. If any ES6 syntax was missed, fix it and re-run.

Common errors to fix:
- `Parsing error: Unexpected token const` → change to `var`
- `Parsing error: Unexpected token =>` → change to `function()`
- `Parsing error: Unexpected template literal` → change to string concatenation
- `Parsing error: Unexpected token ...` → change to `Array.prototype.slice.call()`

- [ ] **Step 5: Run JS unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Verify Android minSdk is 19**

```bash
grep -n "minSdk" app/build.gradle
```

Expected output:
```
        minSdk 19   // Android 4.4 KitKat
```

- [ ] **Step 7: Run Android lint**

```bash
./gradlew :app:lint 2>&1 | grep -E "(ERROR|WARNING|minSdk)" | head -20
```

Review any warnings about API levels. Warnings about APIs used above `minSdk 19` must be addressed:
- `mixedContentMode` — already guarded with `Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP` ✓
- `WebView.setWebContentsDebuggingEnabled` — available since API 19 ✓
- `evaluateJavascript` — available since API 19 ✓

- [ ] **Step 8: Note ws4kp webpack compatibility**

ws4kp bundles its JS with webpack. On KitKat (Chrome 30), the bundled output must be ES5.
Check ws4kp's webpack config after cloning:

```bash
cat /tmp/ws4kp/webpack.config.* 2>/dev/null | grep -E "(target|browserslist)"
```

If the output targets modern browsers only, add a `browserslist` to ws4kp's `package.json` before building:
```
"browserslist": ["Android >= 4.4", "Chrome >= 30"]
```
Then rebuild (`npm run build`). If ws4kp's webpack uses Babel, this will transpile to ES5.

If ws4kp's build cannot be transpiled to ES5, KitKat support is limited to the overlay JS (our code) but ws4kp itself may not render correctly on Chrome 30.

- [ ] **Step 9: Commit lint config**

```bash
git add .eslintrc.json package.json package-lock.json
git commit -m "chore: add ESLint for ES5 enforcement on KitKat-compatible JS"
```

---

## Task 12: Build, Verify, and Ship

- [ ] **Step 1: Run lint and all JS tests**

```bash
npm run lint && npm test
```

Expected: No lint errors; all test suites report `tests passed`.

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
