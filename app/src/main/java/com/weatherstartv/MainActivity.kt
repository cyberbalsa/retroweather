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
