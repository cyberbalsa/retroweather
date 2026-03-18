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
| `app/src/main/res/mipmap-mdpi/ic_launcher.png` | New icon, 48×48px |
| `app/src/main/res/mipmap-hdpi/ic_launcher.png` | New icon, 72×72px |
| `app/src/main/res/mipmap-xhdpi/ic_launcher.png` | New icon, 96×96px |
| `app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | New icon, 144×144px |
| `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | New icon, 192×192px |
| `app/src/main/res/drawable/tv_banner.png` | New banner, 320×180px |
| `app/src/main/res/values/strings.xml` | `app_name` → `Retro Weather` |

---

## Icon Spec (all mipmap sizes)

### Visual Design
- **Background:** dark blue radial gradient — `#0d1a5e` → `#060d30` at 160°
- **Starfield:** subtle fixed radial dot pattern (white dots at ~20–50% opacity, ~7 dots per icon)
- **Weather icon:** `app/src/main/assets/ws4kp/images/icons/regional-maps/Scattered-Showers-1994.gif`, first frame extracted, width ~62% of icon, vertically centered in the upper portion
- **Label:** Star4000 font (`ws4kp/fonts/Star4000.woff`), color `#FFD700`, centered at bottom
  - 96px and larger: two-line `RETRO` / `WEATHER`
  - 72px and 48px: abbreviated single/two-line `RETRO` / `WX`
- **Corner radius:** 22.5% of icon dimension (standard Android launcher shape)

### Size Table

| Density | px | Label |
|---|---|---|
| mdpi | 48×48 | RETRO / WX |
| hdpi | 72×72 | RETRO / WX |
| xhdpi | 96×96 | RETRO / WEATHER |
| xxhdpi | 144×144 | RETRO / WEATHER |
| xxxhdpi | 192×192 | RETRO / WEATHER |

---

## TV Banner Spec

- **Output size:** 320×180px
- **Background:** same dark blue gradient (`#0d1a5e` → `#060d30`) + starfield dots
- **Left side:** `Scattered-Showers-1994.gif` first frame, height 52% of banner, vertically centered, left-aligned with ~7% padding
- **Right side (text block):**
  - `RETRO WEATHER` — Star4000 font, `#FFD700`, large (~52px equivalent at 2× preview scale), two lines, letter-spacing 3px
  - Gold divider line — 60px wide, 3px tall, `#FFD700` at 50% opacity
  - `WS 4000+ KIOSK` — Star4000 font, `#87CEEB`, smaller (~18px equivalent), letter-spacing 4px

---

## Generation Method

A standalone HTML file (`generate-icons.html`) is written into the brainstorm screen dir. It renders each icon size as a precisely dimensioned `<div>` using the same CSS/font as the approved mockup. A shell script invokes Playwright (via the MCP Playwright tool) to:

1. Open `generate-icons.html`
2. Screenshot each icon element at exact pixel dimensions (device pixel ratio 1)
3. Save PNGs directly to the correct `res/mipmap-*/` and `res/drawable/` paths

The Star4000 font is served from the brainstorm server (`/files/Star4000.woff`). The GIF icon is served from the same server (`/files/Scattered-Showers-1994.gif`).

The script is a one-off run — output PNGs are committed to the repo. The script itself is not kept.

---

## App Name

`app/src/main/res/values/strings.xml`: change `app_name` value from its current string to `Retro Weather`.

---

## Out of Scope

- Adaptive icon (`ic_launcher_foreground` / `ic_launcher_background`) — not currently used, not added
- Round icon variant — not currently used, not added
- Animated launcher icon — static PNG only
- Any changes to ws4kp assets or the kiosk overlay
