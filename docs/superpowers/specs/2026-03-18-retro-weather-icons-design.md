# Retro Weather — Icon & Branding Design Spec

**Date:** 2026-03-18
**Project:** weatherstartv

---

## Overview

Replace the current app launcher icons and Android TV banner with a "Retro Weather" branded design that uses the ws4kp `Scattered-Showers-1994.gif` weather icon and the WeatherStar 4000+ visual aesthetic (dark starfield background, Star4000 font, gold text). Update the app name to "Retro Weather" throughout.

Assets are generated via a one-off Playwright screenshot script — no build-time dependency added to the Android project.

---

## Files Changed

| File | Change |
|---|---|
| `app/src/main/res/mipmap-mdpi/ic_launcher.png` | Replace — new icon, 48×48px |
| `app/src/main/res/mipmap-hdpi/ic_launcher.png` | Replace — new icon, 72×72px |
| `app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Replace — new icon, 96×96px |
| `app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Replace — new icon, 144×144px |
| `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Replace — new icon, 192×192px |
| `app/src/main/res/drawable/tv_banner.png` | Replace — new banner, 320×180px |
| `app/src/main/AndroidManifest.xml` | Change `android:label="WeatherStar"` → `android:label="Retro Weather"` directly (no strings.xml indirection — strings.xml does not currently exist) |

---

## Icon Spec (all mipmap sizes)

### Visual Design
- **Background:** dark blue radial gradient — `#0d1a5e` → `#060d30` at 160°
- **Starfield:** subtle fixed radial dot pattern (white dots at 20–50% opacity, ~7 dots per icon)
- **Weather icon:** `app/src/main/assets/ws4kp/images/icons/regional-maps/Scattered-Showers-1994.gif`, first frame only (freeze via `animation-play-state: paused; animation-delay: 0s` CSS on the `<img>`), width ~62% of icon dimension, centered horizontally, upper portion vertically
- **Label:** Star4000 font (`ws4kp/fonts/Star4000.woff`), color `#FFD700`, centered at bottom, `text-shadow: 0 0 8px rgba(255,215,0,0.6)`
- **Corner radius:** 22.5% of icon dimension (standard Android launcher shape)

### Size Table

| Density | Output px | CSS div px | Label | Font size |
|---|---|---|---|---|
| mdpi | 48×48 | 48×48 | RETRO / WX | 5px |
| hdpi | 72×72 | 72×72 | RETRO / WX | 7px |
| xhdpi | 96×96 | 96×96 | RETRO / WEATHER | 9px |
| xxhdpi | 144×144 | 144×144 | RETRO / WEATHER | 14px |
| xxxhdpi | 192×192 | 192×192 | RETRO / WEATHER | 18px |

**Important:** CSS div dimensions must exactly match the target PNG output dimensions. Playwright screenshots at `deviceScaleFactor: 1` so CSS px = output px 1:1. Use element screenshot (not full-page clip) to get exact bounds.

---

## TV Banner Spec

- **Output size:** 320×180px (CSS div: 320×180px, `deviceScaleFactor: 1`)
- **Background:** same dark blue gradient (`#0d1a5e` → `#060d30`) + starfield dots
- **Left:** `Scattered-Showers-1994.gif` first frame (same paused animation technique), height 52% of banner height, vertically centered, left-aligned with ~7% padding
- **Right (text block):**
  - `RETRO WEATHER` — Star4000 font, `#FFD700`, ~52px, two lines, letter-spacing 3px, `text-shadow: 0 0 16px rgba(255,215,0,0.5)`
  - Gold divider — 60px wide, 3px tall, `#FFD700` at 50% opacity
  - `WS 4000+ KIOSK` — Star4000 font, `#87CEEB`, ~18px, letter-spacing 4px

---

## Generation Method

A standalone `generate-icons.html` is written to the brainstorm screen dir and served by the local brainstorm dev server (already running at `http://localhost:PORT` — port from `$SCREEN_DIR/.server-info`). The page renders all 6 targets (5 icon sizes + 1 banner) as precisely sized `<div>` elements using the same CSS as the approved mockup.

Assets are served from the brainstorm server's `/files/` endpoint (document root = `$SCREEN_DIR`):
- `/files/Star4000.woff` — copied from `app/src/main/assets/ws4kp/fonts/Star4000.woff`
- `/files/Scattered-Showers-1994.gif` — copied from `app/src/main/assets/ws4kp/images/icons/regional-maps/Scattered-Showers-1994.gif`

Both files are already present in `$SCREEN_DIR` from the brainstorming session.

**Playwright steps (using MCP Playwright tools):**
1. Navigate to `generate-icons.html`
2. For each target element (identified by `id`): screenshot the element at `deviceScaleFactor: 1`
3. Save each screenshot PNG directly to the correct `res/mipmap-*/` or `res/drawable/` path

The GIF is frozen to frame 1 via `img { animation-play-state: paused; animation-delay: 0s; }` in the page CSS.

The script is a one-off — output PNGs are committed to the repo. The script and brainstorm HTML are not kept.

---

## App Name

`app/src/main/AndroidManifest.xml` line 18: change `android:label="WeatherStar"` to `android:label="Retro Weather"` directly. No `strings.xml` involved — the file does not exist and is not needed for this change.

---

## Out of Scope

- `ic_launcher_round` — not currently present, not added
- Adaptive icon (`ic_launcher_foreground` / `ic_launcher_background`) — not currently used, not added
- Animated launcher icon — static PNG only
- `strings.xml` creation — app name is set directly in the manifest
- Any changes to ws4kp assets or the kiosk overlay
