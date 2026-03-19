package com.weatherstartv

import android.content.Context
import android.graphics.PixelFormat
import android.opengl.GLSurfaceView
import android.util.AttributeSet

class CrtOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : GLSurfaceView(context, attrs) {

    private val crtRenderer = CrtRenderer(context)

    init {
        // Must use RGBA_8888 so the SurfaceFlinger layer is composited
        // with per-pixel alpha against the WebView layer below.
        // setZOrderMediaOverlay(true) places this above the WebView Surface
        // but below system overlays. Do NOT use setZOrderOnTop(true) —
        // that makes the layer opaque at the SurfaceFlinger level regardless
        // of EGL alpha config, blacking out the WebView.
        setZOrderMediaOverlay(true)
        setEGLContextClientVersion(2)
        setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        holder.setFormat(PixelFormat.RGBA_8888)
        setRenderer(crtRenderer)
        renderMode = RENDERMODE_CONTINUOUSLY
        visibility = android.view.View.GONE  // hidden until a non-none preset is selected
    }

    fun setPreset(preset: CrtPreset) {
        if (preset.id == "none") {
            visibility = android.view.View.GONE
        } else {
            visibility = android.view.View.VISIBLE
        }
        crtRenderer.setPreset(preset)
    }
}
