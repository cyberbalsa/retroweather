package com.weatherstartv

import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class CrtRenderer(private val context: Context) : GLSurfaceView.Renderer {

    @Volatile private var preset: CrtPreset = CrtPreset.NONE
    @Volatile private var presetDirty = true
    private var startTimeMs = System.currentTimeMillis()

    // GL handles
    private var program = 0
    private var quadVbo = 0

    // Uniform locations (cached after link)
    private var uTime = -1
    private var uScanlineStr = -1
    private var uScanlineFreq = -1
    private var uBloomStr = -1
    private var uNoiseStr = -1
    private var uVignetteStr = -1
    private var uMaskType = -1
    private var uMaskStr = -1

    fun setPreset(p: CrtPreset) {
        preset = p
        presetDirty = true
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 0f)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        val src = loadShaderSource()
        val vertSrc = src.substringAfter("// ---VERTEX---").substringBefore("// ---FRAGMENT---").trim()
        val fragSrc = src.substringAfter("// ---FRAGMENT---").trim()

        program = buildProgram(vertSrc, fragSrc)
        GLES20.glUseProgram(program)

        // Cache uniform locations
        uTime        = GLES20.glGetUniformLocation(program, "u_time")
        uScanlineStr = GLES20.glGetUniformLocation(program, "u_scanline_str")
        uScanlineFreq= GLES20.glGetUniformLocation(program, "u_scanline_freq")
        uBloomStr    = GLES20.glGetUniformLocation(program, "u_bloom_str")
        uNoiseStr    = GLES20.glGetUniformLocation(program, "u_noise_str")
        uVignetteStr = GLES20.glGetUniformLocation(program, "u_vignette_str")
        uMaskType    = GLES20.glGetUniformLocation(program, "u_mask_type")
        uMaskStr     = GLES20.glGetUniformLocation(program, "u_mask_str")

        // Fullscreen quad: two triangles covering NDC (-1..1)
        val verts = floatArrayOf(-1f, -1f,  1f, -1f,  -1f,  1f,  1f,  1f)
        val buf: FloatBuffer = ByteBuffer.allocateDirect(verts.size * 4)
            .order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
                put(verts); position(0)
            }
        val vbo = IntArray(1)
        GLES20.glGenBuffers(1, vbo, 0)
        quadVbo = vbo[0]
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo)
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, verts.size * 4, buf, GLES20.GL_STATIC_DRAW)

        startTimeMs = System.currentTimeMillis()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        val p = preset
        if (p.id == "none") return  // Transparent — nothing drawn

        GLES20.glUseProgram(program)

        // Time uniform (seconds, wraps every ~11 hours — fine for noise seed)
        val t = (System.currentTimeMillis() - startTimeMs) / 1000f
        GLES20.glUniform1f(uTime, t)

        if (presetDirty) {
            GLES20.glUniform1f(uScanlineStr,  p.scanlineStr)
            GLES20.glUniform1f(uScanlineFreq, p.scanlineFreq)
            GLES20.glUniform1f(uBloomStr,     p.bloomStr)
            GLES20.glUniform1f(uNoiseStr,     p.noiseStr)
            GLES20.glUniform1f(uVignetteStr,  p.vignetteStr)
            GLES20.glUniform1i(uMaskType,     p.maskType)
            GLES20.glUniform1f(uMaskStr,      p.maskStr)
            presetDirty = false
        }

        // Draw fullscreen quad
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo)
        val posLoc = GLES20.glGetAttribLocation(program, "a_position")
        GLES20.glEnableVertexAttribArray(posLoc)
        GLES20.glVertexAttribPointer(posLoc, 2, GLES20.GL_FLOAT, false, 0, 0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(posLoc)
    }

    private fun loadShaderSource(): String =
        context.resources.openRawResource(R.raw.crt_shader).bufferedReader().readText()

    private fun compileShader(type: Int, src: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, src)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            android.util.Log.e("CrtRenderer", "Shader compile error: ${GLES20.glGetShaderInfoLog(shader)}")
            GLES20.glDeleteShader(shader)
            return 0
        }
        return shader
    }

    private fun buildProgram(vertSrc: String, fragSrc: String): Int {
        val vert = compileShader(GLES20.GL_VERTEX_SHADER, vertSrc)
        val frag = compileShader(GLES20.GL_FRAGMENT_SHADER, fragSrc)
        val prog = GLES20.glCreateProgram()
        GLES20.glAttachShader(prog, vert)
        GLES20.glAttachShader(prog, frag)
        GLES20.glLinkProgram(prog)
        val status = IntArray(1)
        GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            android.util.Log.e("CrtRenderer", "Program link error: ${GLES20.glGetProgramInfoLog(prog)}")
        }
        GLES20.glDeleteShader(vert)
        GLES20.glDeleteShader(frag)
        return prog
    }
}
