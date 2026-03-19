package com.weatherstartv

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.ArrayAdapter
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import org.json.JSONObject

class LocationBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val crtOverlay: CrtOverlayView
) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(activity)

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

        // Play Services task callbacks require a Looper thread.
        // @JavascriptInterface methods run on a non-Looper background thread, so we must
        // dispatch to the main thread before calling any FusedLocationProviderClient method.
        activity.runOnUiThread {
            fusedClient.lastLocation
                .addOnSuccessListener { location ->
                    if (location != null) callbackSuccess(location.latitude, location.longitude)
                    else callbackError() // No cached fix — location.js falls back to IP geo
                }
                .addOnFailureListener { callbackError() }
        }
    }

    private fun callbackSuccess(lat: Double, lon: Double) {
        android.util.Log.d("LocationBridge", "Location fix: lat=$lat lon=$lon")
        val js = buildSuccessJs(lat, lon)
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun callbackError() {
        android.util.Log.d("LocationBridge", "Location unavailable, falling back to IP geo")
        webView.post { webView.evaluateJavascript(buildErrorJs(), null) }
    }

    /** Called from JS when a location is successfully resolved (GPS, Wi-Fi, or IP geo). */
    @JavascriptInterface
    fun saveLocation(lat: Double, lon: Double) {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putFloat(KEY_LAT, lat.toFloat())
            .putFloat(KEY_LON, lon.toFloat())
            .apply()
    }

    /** Called from JS (settings apply) to trigger a native WebView reload. */
    @JavascriptInterface
    fun requestReload() {
        activity.runOnUiThread { webView.reload() }
    }

    /** Called from JS when the user triggers Re-detect. */
    @JavascriptInterface
    fun clearSavedLocation() {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_LAT)
            .remove(KEY_LON)
            .apply()
    }

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

    private fun showCrtPickerDialog() {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val currentId = prefs.getString("crt_preset", "none") ?: "none"

        // Build flat list: section headers (non-selectable) + leaves (selectable)
        data class Row(val id: String?, val label: String, val isHeader: Boolean)

        val rows = listOf(
            Row("none",         "None",        false),
            Row(null,           "CLEAN",       true),
            Row("clean_subtle", "  Subtle",    false),
            Row("clean_std",    "  Standard",  false),
            Row("clean_heavy",  "  Heavy",     false),
            Row(null,           "COMPOSITE",   true),
            Row("comp_warm",    "  Warm",      false),
            Row("comp_dense",   "  Dense",     false),
            Row("comp_heavy",   "  Heavy",     false),
            Row(null,           "RF",          true),
            Row("rf_light",     "  Light",     false),
            Row("rf_heavy",     "  Heavy",     false),
            Row(null,           "VHS",         true),
            Row("vhs_480p",     "  480p",      false),
            Row("vhs_720p",     "  720p",      false),
            Row("vhs_1080p",    "  1080p",     false),
            Row("vhs_2160p",    "  2160p",     false)
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

    companion object {
        const val PERMISSION_REQUEST_CODE = 1001
        const val PREFS = "kiosk"
        const val KEY_LAT = "lat"
        const val KEY_LON = "lon"

        fun buildSuccessJs(lat: Double, lon: Double): String =
            "onLocationResult(%f, %f)".format(lat, lon)

        fun buildErrorJs(): String = "onLocationError()"
    }
}
