package com.weatherstartv

data class CrtPreset(
    val id: String,
    val displayLabel: String,
    val scanlineStr: Float,
    val scanlineFreq: Float,
    val bloomStr: Float,
    val noiseStr: Float,
    val vignetteStr: Float,
    val maskType: Int,   // 0=none 1=aperture grille 2=shadow mask 3=slot mask
    val maskStr: Float
) {
    companion object {
        val NONE = CrtPreset(
            id = "none", displayLabel = "None",
            scanlineStr = 0f, scanlineFreq = 480f, bloomStr = 0f,
            noiseStr = 0f, vignetteStr = 0f, maskType = 0, maskStr = 0f
        )

        val catalog: Map<String, CrtPreset> = mapOf(
            "none" to NONE,

            // ── Clean ──────────────────────────────────────────────────────
            "clean_subtle" to CrtPreset(
                id = "clean_subtle", displayLabel = "Clean · Subtle",
                scanlineStr = 0.30f, scanlineFreq = 540f, bloomStr = 0.20f,
                noiseStr = 0.00f, vignetteStr = 0.20f, maskType = 2, maskStr = 0.15f
            ),
            "clean_std" to CrtPreset(
                id = "clean_std", displayLabel = "Clean · Standard",
                scanlineStr = 0.50f, scanlineFreq = 480f, bloomStr = 0.15f,
                noiseStr = 0.05f, vignetteStr = 0.30f, maskType = 2, maskStr = 0.25f
            ),
            "clean_heavy" to CrtPreset(
                id = "clean_heavy", displayLabel = "Clean · Heavy",
                scanlineStr = 0.70f, scanlineFreq = 400f, bloomStr = 0.10f,
                noiseStr = 0.05f, vignetteStr = 0.40f, maskType = 2, maskStr = 0.35f
            ),

            // ── Composite ──────────────────────────────────────────────────
            "comp_warm" to CrtPreset(
                id = "comp_warm", displayLabel = "Composite · Warm",
                scanlineStr = 0.50f, scanlineFreq = 480f, bloomStr = 0.40f,
                noiseStr = 0.15f, vignetteStr = 0.35f, maskType = 1, maskStr = 0.20f
            ),
            "comp_dense" to CrtPreset(
                id = "comp_dense", displayLabel = "Composite · Dense",
                scanlineStr = 0.55f, scanlineFreq = 480f, bloomStr = 0.35f,
                noiseStr = 0.20f, vignetteStr = 0.40f, maskType = 1, maskStr = 0.30f
            ),
            "comp_heavy" to CrtPreset(
                id = "comp_heavy", displayLabel = "Composite · Heavy",
                scanlineStr = 0.65f, scanlineFreq = 400f, bloomStr = 0.45f,
                noiseStr = 0.25f, vignetteStr = 0.45f, maskType = 1, maskStr = 0.35f
            ),

            // ── RF ─────────────────────────────────────────────────────────
            "rf_light" to CrtPreset(
                id = "rf_light", displayLabel = "RF · Light",
                scanlineStr = 0.40f, scanlineFreq = 480f, bloomStr = 0.30f,
                noiseStr = 0.30f, vignetteStr = 0.40f, maskType = 3, maskStr = 0.20f
            ),
            "rf_heavy" to CrtPreset(
                id = "rf_heavy", displayLabel = "RF · Heavy",
                scanlineStr = 0.50f, scanlineFreq = 400f, bloomStr = 0.25f,
                noiseStr = 0.50f, vignetteStr = 0.50f, maskType = 3, maskStr = 0.30f
            ),

            // ── VHS ────────────────────────────────────────────────────────
            "vhs_480p" to CrtPreset(
                id = "vhs_480p", displayLabel = "VHS · 480p",
                scanlineStr = 0.00f, scanlineFreq = 240f, bloomStr = 0.00f,
                noiseStr = 0.40f, vignetteStr = 0.40f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_720p" to CrtPreset(
                id = "vhs_720p", displayLabel = "VHS · 720p",
                scanlineStr = 0.00f, scanlineFreq = 360f, bloomStr = 0.00f,
                noiseStr = 0.30f, vignetteStr = 0.35f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_1080p" to CrtPreset(
                id = "vhs_1080p", displayLabel = "VHS · 1080p",
                scanlineStr = 0.00f, scanlineFreq = 540f, bloomStr = 0.00f,
                noiseStr = 0.20f, vignetteStr = 0.30f, maskType = 0, maskStr = 0.00f
            ),
            "vhs_2160p" to CrtPreset(
                id = "vhs_2160p", displayLabel = "VHS · 2160p",
                scanlineStr = 0.00f, scanlineFreq = 1080f, bloomStr = 0.00f,
                noiseStr = 0.15f, vignetteStr = 0.25f, maskType = 0, maskStr = 0.00f
            )
        )
    }
}
