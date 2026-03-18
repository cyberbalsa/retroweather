package com.weatherstartv

import android.Manifest
import android.app.Activity
import android.content.Context
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

    /** Called from JS when the user triggers Re-detect. */
    @JavascriptInterface
    fun clearSavedLocation() {
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_LAT)
            .remove(KEY_LON)
            .apply()
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
