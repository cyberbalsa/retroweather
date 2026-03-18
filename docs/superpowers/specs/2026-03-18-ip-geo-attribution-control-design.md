# IP Geolocation Attribution & Control

**Date:** 2026-03-18
**Status:** Approved

## Summary

Add an About section to the kiosk settings modal that attributes the IP geolocation
services used by the app, lets the user disable those services, and introduces a
blocking Location Modal that replaces ws4kp's city picker as the last-resort fallback
when all automatic location detection has failed or IP geo is disabled.

## Background

`location.js` currently falls back through a two-service IP geolocation chain when
GPS is unavailable:

1. `ipinfo.io` (50 k req/month free, no key)
2. `ipapi.co` (MaxMind-backed, no key)

Mozilla Location Service was considered but retired by Mozilla in 2024 and is no
longer available to third parties.

## Location Detection Flow

The detection logic lives across two functions in `location.js`:

**`initLocation()`** (runs on page load):
```
latLon param already present?
  ├─ Yes → use saved coords, done  [existing early-return — no change needed]
  └─ No →
       Android bridge available?
         ├─ Yes → requestLocation() with 8 s safety-net timeout
         └─ No  → onLocationError()
```

**`tryIpGeo()`** (called on GPS fail / timeout):
```
latLon param present?  [defensive guard — normally caught by initLocation() early-return]
  ├─ Yes → return silently (coords already set, nothing to do)
  └─ No →
       kiosk_ipgeo === "0"?
         ├─ Yes → openLocationModal(), return  [NEW guard]
         └─ No  → try ipinfo.io → ipapi.co
                      ├─ Success → applyLocationAndReload()
                      └─ All failed → openLocationModal()  [replaces console.log no-op]
```

Note: `initLocation()`'s existing `hasLatLon` early-return means `tryIpGeo()` is
never reached when coords are already set under normal flow. The `latLon` guard in
`tryIpGeo()` is a defensive check only — it protects against the edge case where
the 8-second safety-net timeout fires after coords were set by another path (e.g.,
the Location Modal submitting and reloading on the same page instance).

## Location Modal

A blocking full-screen overlay defined in `location.js` (z-index 100000, above the
settings modal at 99999). Triggered when all automatic detection has failed, or when
IP geo is disabled and no fixed location is saved. The modal is intentionally
non-dismissable — location is required for the app to function.

**Non-dismissable behaviour:**
- No close button, no click-outside-to-close
- The `keydown` handler inside `openLocationModal()` intercepts `Escape`, `27`, and
  `GoBack` keys and calls `event.preventDefault()` + `event.stopPropagation()` so
  they cannot close the Settings modal behind it or trigger Android Back navigation.
  The handler is removed when the modal is closed via `closeLocationModal()`.

**Contents:**
- Heading: "Enter your location"
- Single `input[type=text]` — "Lat, Lon" (e.g. `40.7128, -74.0060`)
- "Set Location" button
- On submit: validates with the same `parseManualLatLon` logic already in
  `location.js`, calls `Android.saveLocation()`, sets `latLon` URL param, reloads.

**Styling:** matches the existing `#kiosk-modal` palette (`#0d1b2a` background,
`#7cb9e8` heading, `#1e3a5f` input). Uses `#kiosk-loc-backdrop` and `#kiosk-loc-modal`
IDs to avoid conflicts with the settings modal.

**Injection:** HTML/CSS injected once into the DOM by `openLocationModal()` (guarded
by an ID presence check so re-triggering is safe).

## About Section (settings.js)

New `k-section` block appended to the settings modal HTML string, above the Apply
button.

```
┌─ ABOUT ───────────────────────────────────────────────┐
│ WeatherStar Kiosk                                      │
│ github.com/cyberbalsa/retroweather  (MIT License)      │
│                                                        │
│ Based on WeatherStar 4000+                             │
│ github.com/netbymatt/ws4kp                             │
│                                                        │
│ When GPS is unavailable, location is detected via:     │
│   • ipinfo.io  •  ipapi.co                             │
│                                                        │
│ [✓] Enable IP geolocation                             │
│                                                        │
│ Fixed location: 40.71, -74.01  [Change]               │
└────────────────────────────────────────────────────────┘
```

Links are rendered as `<a href="..." target="_blank">` elements styled in `#7cb9e8`
(the existing heading blue), matching the modal palette. `KioskWebViewClient` does
not override `onCreateWindow`, so `target="_blank"` links are silently ignored on
device — they are no-ops, which is the correct kiosk behaviour (no risk of navigating
away). The URLs remain visible as readable text credits in the UI.

**Fixed-location row visibility rule (single canonical rule):**
The `#k-fixed-loc-row` is visible **only when `kiosk_ipgeo === "0"`** (IP geo
disabled). The presence or absence of a saved `latLon` param does not affect
visibility. When IP geo is re-enabled the row is always hidden, even if `latLon` is
saved (the saved value stays as a warm-start cache but is not surfaced to the user
while IP geo is active).

**"Change" button:** The handler is wired inside `initSettings()` (where the private
`closeSettings` function is in scope). It calls `closeSettings()` directly (not
`window.closeKioskSettings`) then `window.openLocationModal()`.

**`#k-ipgeo` checkbox change handler** (also wired inside `initSettings()`):
- Shows/hides `#k-fixed-loc-row` live based on checked state.

## URL Params

| Param | Values | Default | Meaning |
|-------|--------|---------|---------|
| `kiosk_ipgeo` | `"0"`, `"1"` | `"1"` | Enable/disable IP geo service calls |
| `latLon` | JSON `{"lat":x,"lon":y}` | absent | Saved/fixed coordinates (existing) |

## File Changes

### `app/src/main/assets/location.js`

1. **`tryIpGeo()`** — add two guards at the very top:
   - If `getParam('latLon')` is non-null, return silently (defensive; coords already set).
   - If `getParam('kiosk_ipgeo') === '0'`, call `openLocationModal()` and return.
2. **All-fail path** — in the ipapi.co failure callback, replace `console.log(...)` with
   `openLocationModal()`.
3. **`openLocationModal()` / `closeLocationModal()`** — new private functions, exposed
   on `window` as `window.openLocationModal` / `window.closeLocationModal`.
   - Inject `#kiosk-loc-backdrop` HTML and `<style>` once (guarded by
     `document.getElementById('kiosk-loc-backdrop')` check).
   - Wire "Set Location" button to `parseManualLatLon` → `applyLocationAndReload`.
   - Add `keydown` listener on `document` that blocks Escape/GoBack while modal is open;
     remove it in `closeLocationModal()`.

### `app/src/main/assets/settings.js`

1. **About section HTML** — add `k-section` to the `HTML` string constant with:
   - App name + link to `github.com/cyberbalsa/retroweather` + "(MIT License)" label
   - "Based on WeatherStar 4000+" + link to `github.com/netbymatt/ws4kp`
   - IP geo attribution text listing ipinfo.io and ipapi.co
   - `#k-ipgeo` checkbox
   - `#k-fixed-loc-row` (fixed location display + Change button)
   Initial `display:none` on `#k-fixed-loc-row` (hidden by default since
   `kiosk_ipgeo` defaults to `"1"`).
   Links use `<a href="..." target="_blank">` styled in the `#7cb9e8` link colour;
   add `.k-link { color:#7cb9e8; }` to the CSS string.
2. **CSS** — add `#k-fixed-loc-display` small muted text style.
3. **`readParams()`** — add `ipGeo: getParam('kiosk_ipgeo') !== '0'`.
4. **`applySettings()`** — add `setParam('kiosk_ipgeo', values.ipGeo ? '1' : '0')`.
   The existing `removeParam('latLon')` when `locMode === 'auto'` must be conditioned:
   only remove `latLon` when **both** `locMode === 'auto'` **and** `ipGeo === true`.
   When IP geo is disabled, `latLon` is preserved (it is the fixed location).
   Additionally, when `locMode === 'auto'` **and** `ipGeo === true`, call
   `window.Android.clearSavedLocation()` (mirroring `redetectLocation()`) so the
   Android SharedPreferences cache does not override re-enabled IP geo detection on
   the next cold start.
5. **`populateForm()`** — set `#k-ipgeo` checked state; show/hide `#k-fixed-loc-row`
   based on `ipGeo` value; populate the display with parsed coords from `latLon` param
   if present.
6. **Apply button handler** — the `values` object built in the `applyBtn` click
   handler must include `ipGeo: document.getElementById('k-ipgeo').checked` so
   `applySettings()` receives the current checkbox state.
7. **Change button + checkbox handlers** — wired inside `initSettings()` scope so
   `closeSettings` is directly accessible (no `window.closeKioskSettings` indirection).

### No other files change

`LocationBridge.kt`, `MainActivity.kt`, `KioskWebViewClient.kt`, `AndroidManifest.xml`
— no modifications required.

## Testing

| Scenario | Expected |
|----------|----------|
| GPS available | No IP geo calls, no modal, regardless of `kiosk_ipgeo` |
| GPS fails, IP geo enabled, ipinfo.io succeeds | Modal never appears |
| GPS fails, IP geo enabled, both services fail | Location Modal appears, blocking |
| GPS fails, IP geo disabled, no saved coords | Location Modal appears immediately |
| GPS fails, IP geo disabled, saved coords present | Saved coords used, no modal, no XHR |
| User submits Location Modal | Coords saved, page reloads with `latLon` param |
| Escape / GoBack while Location Modal open | Key swallowed, modal stays open |
| "Change" in About section | Settings closes, Location Modal opens |
| Toggle IP geo back on + Apply | Fixed-location row hides, `latLon` cleared, `Android.clearSavedLocation()` called |
| Cold start after re-enabling IP geo | No saved coords in SharedPreferences → IP geo detection runs normally |
| Apply with auto mode + IP geo enabled | `latLon` cleared (existing behaviour preserved) |
| Apply with auto mode + IP geo disabled | `latLon` preserved (fixed location kept) |
