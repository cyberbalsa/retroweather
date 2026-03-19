package com.weatherstartv

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection

class KioskWebViewClient(private val context: Context) : WebViewClient() {

    // Injected in dependency order: location and music before overlay bootstrap
    private val assetFiles = listOf("location.js", "music.js", "settings.js", "overlay.js")

    // ws4kp uses absolute paths like /data/travelcities.json and /scripts/custom.js
    // These get served from our ws4kp/ assets subfolder via custom path handlers
    private val ws4kpDataHandler = WebViewAssetLoader.PathHandler { path ->
        serveAsset("ws4kp/data/$path")
    }

    private val ws4kpScriptsHandler = WebViewAssetLoader.PathHandler { path ->
        serveAsset("ws4kp/scripts/$path")
    }

    // ws4kp JS sets img.src to absolute paths like /images/maps/radar/map-0-0.webp,
    // which resolve to appassets.androidplatform.net/images/... — map them to assets.
    private val ws4kpImagesHandler = WebViewAssetLoader.PathHandler { path ->
        serveAsset("ws4kp/images/$path")
    }

    // Serves file:///android_asset/ content via https://appassets.androidplatform.net/assets/
    // so ws4kp's fetch() calls work (modern WebView blocks fetch on file:// origins)
    private val assetLoader = WebViewAssetLoader.Builder()
        .setDomain("appassets.androidplatform.net")
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .addPathHandler("/data/", ws4kpDataHandler)
        .addPathHandler("/scripts/", ws4kpScriptsHandler)
        .addPathHandler("/images/", ws4kpImagesHandler)
        .build()

    private fun serveAsset(assetPath: String): WebResourceResponse? {
        return try {
            val stream = context.assets.open(assetPath)
            val mime = URLConnection.guessContentTypeFromName(assetPath) ?: "application/octet-stream"
            WebResourceResponse(mime, "utf-8", stream)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Proxy requests to external URLs that would be blocked by CORS from our
     * https://appassets.androidplatform.net origin (archive.org, ipapi.co).
     * We make the request natively and return the response with CORS headers added.
     */
    private fun proxyExternalRequest(urlStr: String): WebResourceResponse? {
        return try {
            android.util.Log.d("KioskProxy", "Proxying: $urlStr")
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.connectTimeout = 10_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("User-Agent", "WeatherStarKiosk/1.0")
            val code = conn.responseCode
            android.util.Log.d("KioskProxy", "Proxy response $code for $urlStr")
            val mime = conn.contentType?.substringBefore(';') ?: "application/octet-stream"
            val headers = mapOf(
                "Access-Control-Allow-Origin" to "*",
                "Access-Control-Allow-Methods" to "GET"
            )
            // inputStream throws FileNotFoundException for 4xx/5xx; use errorStream instead
            val stream = if (code >= 400) conn.errorStream ?: conn.inputStream else conn.inputStream
            WebResourceResponse(mime, "utf-8", code, "OK", headers, stream)
        } catch (e: Exception) {
            android.util.Log.e("KioskProxy", "Proxy failed for $urlStr: ${e.message}")
            null
        }
    }

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        val url = request.url
        val urlStr = url.toString()

        // Serve our bundled assets via WebViewAssetLoader
        val assetResponse = assetLoader.shouldInterceptRequest(url)
        if (assetResponse != null) return assetResponse

        // If the asset loader claimed the domain but found no matching file, return a proper
        // 404 rather than null — null lets the request escape to the real network, where
        // appassets.androidplatform.net has no server and returns ERR_INVALID_RESPONSE.
        if (url.host == "appassets.androidplatform.net") {
            return WebResourceResponse(
                "text/plain", "utf-8", 404, "Not Found",
                emptyMap(), ByteArrayInputStream(ByteArray(0))
            )
        }

        // Proxy external CORS-restricted requests through native code.
        // NOTE: archive.org MP3/audio files are NOT proxied — <audio src> doesn't enforce
        // CORS so WebView's native media player handles them directly with proper range request
        // support. Only the XHR playlist XML fetch needs CORS headers.
        val isArchiveXml = urlStr.startsWith("https://archive.org/") && urlStr.contains(".xml")
        if (isArchiveXml ||
            urlStr.startsWith("https://ipinfo.io/") ||
            urlStr.startsWith("https://ipapi.co/")) {
            return proxyExternalRequest(urlStr)
        }

        return null
    }

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
