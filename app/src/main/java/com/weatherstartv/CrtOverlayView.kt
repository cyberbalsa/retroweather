package com.weatherstartv

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import java.util.Random

/**
 * Transparent View overlay that draws CRT shader effects using Canvas.
 * Sits above the WebView in a FrameLayout; transparency is handled by
 * the normal View compositing pipeline (no GL surface compositing needed).
 */
class CrtOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var preset: CrtPreset = CrtPreset.NONE
    private val paint = Paint()
    private val rng = Random()

    init {
        isClickable = false
        isFocusable = false
    }

    fun setPreset(p: CrtPreset) {
        preset = p
        if (p.noiseStr > 0f || p.id != "none") invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val p = preset
        if (p.id == "none") return

        val w = width.toFloat()
        val h = height.toFloat()
        if (w == 0f || h == 0f) return

        // ── Scanlines ────────────────────────────────────────────────────────
        if (p.scanlineStr > 0f) {
            paint.color = Color.argb(
                (p.scanlineStr * 160f).toInt().coerceIn(0, 255),
                0, 0, 0
            )
            // scanlineFreq = lines per screen height; draw every other line dark
            val lineSpacing = h / p.scanlineFreq
            var y = 0f
            while (y < h) {
                canvas.drawLine(0f, y, w, y, paint)
                y += lineSpacing * 2f
            }
        }

        // ── Shadow mask (aperture grille columns) ─────────────────────────────
        if (p.maskStr > 0f && p.maskType != 0) {
            val maskAlpha = (p.maskStr * 80f).toInt().coerceIn(0, 255)
            paint.color = Color.argb(maskAlpha, 0, 0, 0)
            val colW = when (p.maskType) {
                1 -> w / 720f * 1f   // aperture grille: 1px dark per 3
                2 -> w / 480f * 1f   // shadow mask: checkerboard-ish
                3 -> w / 360f * 1f   // slot mask
                else -> 0f
            }
            val period = when (p.maskType) {
                1 -> w / 720f * 3f
                2 -> w / 480f * 2f
                3 -> w / 360f * 3f
                else -> 0f
            }
            if (period > 0f) {
                var x = period - colW
                while (x < w) {
                    canvas.drawRect(x, 0f, (x + colW).coerceAtMost(w), h, paint)
                    x += period
                }
            }
        }

        // ── Vignette (corner darkening) ───────────────────────────────────────
        if (p.vignetteStr > 0f) {
            val radius = maxOf(w, h) * 0.75f
            val gradient = RadialGradient(
                w / 2f, h / 2f, radius,
                intArrayOf(
                    Color.TRANSPARENT,
                    Color.argb((p.vignetteStr * 200f).toInt().coerceIn(0, 255), 0, 0, 0)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            paint.shader = gradient
            canvas.drawRect(0f, 0f, w, h, paint)
            paint.shader = null
        }

        // ── Noise grain ───────────────────────────────────────────────────────
        if (p.noiseStr > 0f) {
            rng.setSeed(System.currentTimeMillis() / 50L)
            val count = (p.noiseStr * 800f).toInt()
            val bright = (p.noiseStr * 120f).toInt().coerceIn(0, 255)
            repeat(count) {
                val alpha = (rng.nextFloat() * bright).toInt()
                val luma = if (rng.nextBoolean()) 255 else 0
                paint.color = Color.argb(alpha, luma, luma, luma)
                canvas.drawPoint(rng.nextFloat() * w, rng.nextFloat() * h, paint)
            }
        }

        // ── Warm amber bloom tint ─────────────────────────────────────────────
        if (p.bloomStr > 0f) {
            paint.color = Color.argb(
                (p.bloomStr * 35f).toInt().coerceIn(0, 255),
                255, 160, 30
            )
            canvas.drawRect(0f, 0f, w, h, paint)
        }

        // Animate noise by requesting next frame
        if (p.noiseStr > 0f) {
            postInvalidateOnAnimation()
        }
    }

    // GLSurfaceView lifecycle stubs — called by MainActivity but no-ops here
    fun onResume() {}
    fun onPause() {}
}
