package com.weatherstartv

import org.junit.Assert.*
import org.junit.Test

class CrtPresetTest {

    @Test fun `catalog contains none preset`() {
        assertNotNull(CrtPreset.catalog["none"])
    }

    @Test fun `catalog contains all 13 expected ids`() {
        val expected = setOf(
            "none",
            "clean_subtle", "clean_std", "clean_heavy",
            "comp_warm", "comp_dense", "comp_heavy",
            "rf_light", "rf_heavy",
            "vhs_480p", "vhs_720p", "vhs_1080p", "vhs_2160p"
        )
        assertEquals(expected, CrtPreset.catalog.keys)
    }

    @Test fun `none preset has zero effect strengths`() {
        val none = CrtPreset.catalog["none"]!!
        assertEquals(0f, none.scanlineStr, 0.001f)
        assertEquals(0f, none.noiseStr, 0.001f)
        assertEquals(0f, none.vignetteStr, 0.001f)
        assertEquals(0, none.maskType)
    }

    @Test fun `all presets have scanlineFreq in valid range`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} scanlineFreq out of range",
                p.scanlineFreq in 0f..2000f)
        }
    }

    @Test fun `all presets have strengths in 0-1 range`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} scanlineStr", p.scanlineStr in 0f..1f)
            assertTrue("${p.id} bloomStr",    p.bloomStr    in 0f..1f)
            assertTrue("${p.id} noiseStr",    p.noiseStr    in 0f..1f)
            assertTrue("${p.id} vignetteStr", p.vignetteStr in 0f..1f)
            assertTrue("${p.id} maskStr",     p.maskStr     in 0f..1f)
        }
    }

    @Test fun `all presets have non-blank displayLabel`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} empty label", p.displayLabel.isNotBlank())
        }
    }

    @Test fun `all presets have valid maskType (0-3)`() {
        CrtPreset.catalog.values.forEach { p ->
            assertTrue("${p.id} maskType", p.maskType in 0..3)
        }
    }
}
