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

        // getLastLocation() works on all API levels (API 19+).
        // getCurrentLocation() is API 26+ only — do not use for min SDK 19.
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
