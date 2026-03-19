// ---VERTEX---
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
// ---FRAGMENT---
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform float u_scanline_str;
uniform float u_scanline_freq;
uniform float u_bloom_str;
uniform float u_noise_str;
uniform float u_vignette_str;
uniform int   u_mask_type;
uniform float u_mask_str;

varying vec2 v_uv;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_uv;

    // Scanlines: alternate rows darkened
    float scanAlpha = step(0.5, fract(uv.y * u_scanline_freq * 0.5))
                      * u_scanline_str * (1.0 - u_bloom_str * 0.6);

    // Shadow mask
    float maskAlpha = 0.0;
    if (u_mask_type == 1) {
        // Aperture grille: vertical dark stripe every 3 columns
        float col = mod(floor(uv.x * 720.0), 3.0);
        maskAlpha = step(2.0, col) * u_mask_str;
    } else if (u_mask_type == 2) {
        // Shadow mask: checkerboard
        float col = mod(floor(uv.x * 480.0) + floor(uv.y * 480.0), 2.0);
        maskAlpha = step(1.0, col) * u_mask_str;
    } else if (u_mask_type == 3) {
        // Slot mask
        float col = mod(floor(uv.x * 360.0), 3.0);
        maskAlpha = step(2.0, col) * u_mask_str;
    }

    // Vignette: darken corners
    vec2 center = uv * 2.0 - 1.0;
    float vigAlpha = clamp(dot(center, center) * u_vignette_str, 0.0, 0.9);

    // Noise grain
    float grain = rand(uv + fract(u_time * 0.03)) - 0.5;
    float noiseAlpha = grain * u_noise_str * 0.35;

    // Combine
    float alpha = max(max(scanAlpha, maskAlpha), vigAlpha);
    alpha = clamp(alpha + noiseAlpha, 0.0, 1.0);

    // Warm amber tint (phosphor approximation) where bloom is active
    float warm = u_bloom_str * 0.06;
    gl_FragColor = vec4(warm, warm * 0.4, 0.0, alpha);
}
