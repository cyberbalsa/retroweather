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
