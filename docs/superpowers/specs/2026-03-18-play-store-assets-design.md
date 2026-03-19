# Play Store Assets Design — WeatherStar Kiosk

**Date:** 2026-03-18
**Project:** `cyberbalsa/retroweather` (Android app)
**Status:** Approved

---

## Overview

Extend `generate_icons.py` to produce all required Google Play Store listing assets. All assets use the existing retro WeatherStar aesthetic: deep navy gradient background, CRT scanlines, pixel-art cloud + lightning bolt, cyan/orange/yellow palette. Outputs go to a new `store/` directory at the repo root.

---

## Assets to Generate

| File | Dimensions | Format | Size Limit | Notes |
|------|-----------|--------|-----------|-------|
| `store/icon-512.png` | 512×512 | PNG | 1 MB | Play Store app icon |
| `store/feature-graphic.png` | 1024×500 | PNG | 15 MB | Play Store banner |
| `store/tv-banner.png` | 1280×720 | PNG | 8 MB | Android TV Play Store listing |
| `store/phone-1-weather.png` | 1920×1080 | PNG | 8 MB | Phone: main weather display |
| `store/phone-2-settings.png` | 1920×1080 | PNG | 8 MB | Phone: settings overlay |
| `store/tablet-7in-1-weather.png` | 1920×1200 | PNG | 8 MB | 7-inch tablet: main display |
| `store/tablet-7in-2-settings.png` | 1920×1200 | PNG | 8 MB | 7-inch tablet: settings overlay |
| `store/tablet-10in-1-weather.png` | 2560×1600 | PNG | 8 MB | 10-inch tablet: main display |
| `store/tablet-10in-2-settings.png` | 2560×1600 | PNG | 8 MB | 10-inch tablet: settings overlay |
| `store/tv-screenshot-1-weather.png` | 1920×1080 | PNG | 8 MB | Android TV: main display |
| `store/tv-screenshot-2-settings.png` | 1920×1080 | PNG | 8 MB | Android TV: settings overlay |

**Skipped:** Video URLs (require YouTube), Chromebook (not a target platform), Android XR (not applicable).

---

## Art Style

All assets use the retro WeatherStar 4000+ aesthetic established in the existing `generate_icons.py`:

- **Background:** Deep navy gradient (`#0d1b2a` → `#1a3a5c`, top to bottom)
- **CRT scanlines:** Semi-transparent horizontal lines every 3–4px
- **Pixel grid:** Subtle vertical + horizontal grid overlay
- **Accent colors:** Cyan `#7cb9e8`, Orange `#c8602a`, Yellow `#ebe600`
- **Cloud:** Pixel-art storm cloud (reuse `draw_cloud_pixel`)
- **Lightning:** Yellow/orange zigzag bolt (reuse `draw_lightning_bolt`)
- **Text:** Pixel-art block letters (reuse `draw_pixel_char`)
- **Bottom bar:** Thin orange accent bar along the bottom edge

---

## New Functions

### `create_store_icon(output_path)`
Calls existing `create_icon(512, output_path)`. No new logic needed.

### `create_feature_graphic(output_path)`
1024×500 landscape banner:
- Left third: cloud + lightning bolt (scaled to ~2/5 of height)
- Vertical cyan dashed separator at ~30% width
- Center-right: "RETRO WEATHER" in large pixel-art cyan text
- Below title: "WeatherStar 4000+ for Android TV & Tablet" in smaller yellow text
- Bottom: orange accent bar
- Scattered cyan pixel dots in background

### `create_tv_store_banner(output_path)`
1280×720 (16:9), same layout as feature graphic with more breathing room:
- Left quarter: larger cloud + lightning
- Cyan separator
- "RETRO WEATHER" large pixel-art title
- Subtitle: "Retro weather on your TV"
- Bottom orange bar
- More background pixel dots scattered across the canvas

### Screenshots — Real Browser Screenshots via Playwright

Screenshots are taken from the live ws4kp kiosk at:
`http://doorpet.cyberrange.rit.edu:8080/?hazards-checkbox=true&current-weather-checkbox=true&latest-observations-checkbox=true&hourly-checkbox=true&hourly-graph-checkbox=true&travel-checkbox=true&regional-forecast-checkbox=true&local-forecast-checkbox=true&extended-forecast-checkbox=true&almanac-checkbox=true&spc-outlook-checkbox=true&radar-checkbox=true&settings-wide-checkbox=true&settings-kiosk-checkbox=false&settings-stickyKiosk-checkbox=false&settings-customFeedEnable-checkbox=true&settings-speed-select=0.75&settings-scanLineMode-select=auto&settings-units-select=us&txtLocation=Rochester%2C+NY%2C+USA&settings-customFeed-string=https%3A%2F%2Fnews.kagi.com%2Ftech.xml&share-link-url=&settings-scanLines-checkbox=false&settings-mediaVolume-select=0.75&latLonQuery=Rochester%2C+NY%2C+USA&latLon=%7B%22lat%22%3A43.1557%2C%22lon%22%3A-77.6125%7D`

Using the Playwright MCP browser tool to:
1. Navigate to the kiosk URL
2. Resize the browser viewport to each target resolution
3. Wait for the weather content to fully load (animations settle)
4. Take a full-page screenshot
5. Save to `store/`

Two scenes per form factor:
- **Scene 1 (weather_main):** Let the page load and stabilize — capture a frame mid-animation showing weather data
- **Scene 2 (settings):** Cannot be triggered via long-press in browser — capture a second weather frame at a different animation point, or capture a different weather segment (e.g. radar panel visible)

---

## Screenshot Size Groups

The same two scenes are rendered at each form-factor size:

| Group | Width | Height | Aspect |
|-------|-------|--------|--------|
| Phone | 1920 | 1080 | 16:9 |
| 7-inch tablet | 1920 | 1200 | 16:10 |
| 10-inch tablet | 2560 | 1600 | 16:10 |
| Android TV | 1920 | 1080 | 16:9 |

All screenshots are landscape (the app forces landscape orientation).

---

## File Structure Changes

```
generate_icons.py       — extended with new functions
store/                  — new directory (gitignored or committed)
  icon-512.png
  feature-graphic.png
  tv-banner.png
  phone-1-weather.png
  phone-2-settings.png
  tablet-7in-1-weather.png
  tablet-7in-2-settings.png
  tablet-10in-1-weather.png
  tablet-10in-2-settings.png
  tv-screenshot-1-weather.png
  tv-screenshot-2-settings.png
```

The `store/` directory should be committed so assets are versioned with the code.

---

## Running

```bash
# Step 1: Generate icon + banner assets
python3 generate_icons.py
# Outputs: app/src/main/res/mipmap-*/ic_launcher.png (existing)
#          app/src/main/res/drawable/tv_banner.png (existing)
#          store/icon-512.png
#          store/feature-graphic.png
#          store/tv-banner.png

# Step 2: Screenshots are captured via Playwright MCP from the live kiosk URL
# (see implementation plan for details)
```

Requires `Pillow` (`pip install Pillow`) for step 1.

---

## Out of Scope

- Actual app screenshots (would require a running emulator)
- Video assets (require YouTube URLs)
- Chromebook screenshots
- Android XR assets
- Localized variants
