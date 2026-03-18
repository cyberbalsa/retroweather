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
