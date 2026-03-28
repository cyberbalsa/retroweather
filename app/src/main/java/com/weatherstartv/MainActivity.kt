package com.weatherstartv

import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
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
            val prefs = getSharedPreferences(LocationBridge.PREFS, MODE_PRIVATE)
            val savedQuery = prefs.getString("saved_query", null)
            val url = if (savedQuery != null) {
                // Must use the HTTPS appassets origin — fetch() is blocked on file:// origins
                "https://appassets.androidplatform.net/assets/ws4kp/index.html$savedQuery"
            } else {
                buildInitialUrl()
            }
            webView.loadUrl(url)
        }
    }

    @Deprecated("Deprecated in API 33")
    override fun onBackPressed() {
        // Intercept back before it reaches super (which would finish the Activity).
        // If settings is open JS closes/saves it; otherwise the press is swallowed
        // (kiosk apps don't exit on back).
        webView.evaluateJavascript(
            "if(window.kioskHandleBack)window.kioskHandleBack();",
            null
        )
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
            // Allow file:// access (needed for WebViewAssetLoader path handlers)
            allowFileAccess = true
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
        // Use WebViewAssetLoader's HTTPS origin so ws4kp's fetch() calls work
        // (modern Android WebView blocks fetch() on file:// origins)
        val base = "https://appassets.androidplatform.net/assets/ws4kp/index.html"
        val params = mutableListOf(
            "settings-kiosk-checkbox=true",
            "settings-wide-checkbox=true",
            "settings-mediaPlaying-boolean=false", // we supply our own music
            "settings-speed-select=1.0",
            "settings-units-select=us",
            "kiosk_music=1",
            "kiosk_vol=0.7",
            "kiosk_shuffle=1",
            "kiosk_loc_mode=auto",
            "settings-customFeedEnable-checkbox=true",
            "settings-customFeed-string=${Uri.encode("https://news.kagi.com/tech.xml")}"
        )
        // Pre-populate saved location so ws4kp loads immediately without IP geo lookup
        val prefs = getSharedPreferences(LocationBridge.PREFS, MODE_PRIVATE)
        val savedLat = prefs.getFloat(LocationBridge.KEY_LAT, Float.NaN)
        val savedLon = prefs.getFloat(LocationBridge.KEY_LON, Float.NaN)
        if (!savedLat.isNaN() && !savedLon.isNaN()) {
            val latLonJson = "{\"lat\":$savedLat,\"lon\":$savedLon}"
            params.add("latLon=${Uri.encode(latLonJson)}")
        }
        return "$base?${params.joinToString("&")}"
    }
}
