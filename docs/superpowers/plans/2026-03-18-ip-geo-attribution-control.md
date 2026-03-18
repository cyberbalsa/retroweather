# IP Geolocation Attribution & Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an About section to the kiosk settings modal with project credits, IP geo service attribution, an enable/disable toggle, and a blocking Location Modal fallback when all automatic location detection fails.

**Architecture:** Two JS asset files are modified. `location.js` gains two guards at the top of `tryIpGeo()` and a new `openLocationModal()` / `closeLocationModal()` implementation. `settings.js` gains a new About `k-section` with credits HTML, wires the IP geo toggle into `readParams` / `applySettings` / `populateForm`, and exposes a "Change" button that opens the Location Modal. No Kotlin changes.

**Tech Stack:** ES5 JavaScript (Chrome 30 / Android 4.4 KitKat compatible — no const/let/arrow functions/template literals/fetch/URLSearchParams), Node.js for unit tests (`assert` module, no framework), Android Gradle for Kotlin tests.

---

## File Map

| File | Change |
|------|--------|
| `app/src/main/assets/location.js` | Add `tryIpGeo()` guards; replace console.log no-op with `openLocationModal()`; add Location Modal functions |
| `app/src/main/assets/settings.js` | Add About section HTML/CSS; update `readParams`, `applySettings`, `populateForm`, Apply handler; wire checkbox + Change button |
| `tests/location.test.js` | Add tests for `tryIpGeo` guard logic |
| `tests/settings.test.js` | Add tests for `kiosk_ipgeo` param read/write and `latLon` clearing logic |

---

## Task 1: `location.js` — tryIpGeo guards and Location Modal

**Files:**
- Modify: `app/src/main/assets/location.js`
- Test: `tests/location.test.js`

- [ ] **Step 1.1: Add tests for the tryIpGeo guard logic**

Open `tests/location.test.js`. Append the following at the end, before the final `console.log`:

```javascript
// ── tryIpGeo guard logic ────────────────────────────────────────────────────
// Mirrors the two guards added at the top of tryIpGeo() in location.js.
// Returns 'has-coords', 'disabled', or null (proceed).
function tryIpGeoGuard(latLon, kiosk_ipgeo) {
    if (latLon !== null) return 'has-coords';
    if (kiosk_ipgeo === '0') return 'disabled';
    return null;
}

{
    const r = tryIpGeoGuard('{"lat":1,"lon":2}', '1');
    assert.strictEqual(r, 'has-coords');
    console.log('✓ tryIpGeoGuard: latLon present → skip (defensive)');
    passed++;
}

{
    const r = tryIpGeoGuard(null, '0');
    assert.strictEqual(r, 'disabled');
    console.log('✓ tryIpGeoGuard: kiosk_ipgeo=0 → disabled');
    passed++;
}

{
    const r = tryIpGeoGuard(null, '1');
    assert.strictEqual(r, null);
    console.log('✓ tryIpGeoGuard: enabled, no coords → proceed');
    passed++;
}

{
    const r = tryIpGeoGuard(null, null); // absent param defaults to enabled
    assert.strictEqual(r, null);
    console.log('✓ tryIpGeoGuard: missing param → defaults to enabled (proceed)');
    passed++;
}
```

- [ ] **Step 1.2: Run tests to confirm new tests fail correctly**

```bash
cd /home/cyberrange/weatherstartv && node tests/location.test.js
```

Expected: the existing 3 tests pass, the 4 new ones pass too (they test pure logic extracted inline — they should pass immediately since they don't depend on the source file). Confirm output shows `7 tests passed`.

> Note: Unlike Kotlin tests, these tests extract pure functions inline rather than importing the source file (the source is an IIFE targeting browser globals). If the 4 new tests all pass immediately, that's expected — proceed.

- [ ] **Step 1.3: Modify `tryIpGeo()` in `location.js`**

Open `app/src/main/assets/location.js`. Find the `tryIpGeo` function (currently starts at `function tryIpGeo() {`). Add the two guards at the very top:

```javascript
    function tryIpGeo() {
        // Defensive: coords already set — nothing to do (normally caught by initLocation early-return)
        if (getParam('latLon') !== null) return;
        // User disabled IP geo services — go straight to manual entry modal
        if (getParam('kiosk_ipgeo') === '0') { openLocationModal(); return; }
        // ipinfo.io: 50k req/month free, accurate, own proprietary database
        tryIpGeoUrl(
```

- [ ] **Step 1.4: Replace the all-fail console.log with `openLocationModal()`**

In the same file, find the innermost failure callback — currently:

```javascript
                    function () {
                        console.log('[location] IP geo unavailable, ws4kp will show city picker');
                    }
```

Replace with:

```javascript
                    function () {
                        openLocationModal();
                    }
```

- [ ] **Step 1.5: Add the Location Modal functions**

In `location.js`, add the following block immediately before the line `var locationCallbackTimer = null;`:

```javascript
    // ── Location Modal ───────────────────────────────────────────────────────
    // Blocking modal shown when all automatic detection fails or IP geo is disabled.
    // Cannot be dismissed without supplying valid coordinates.

    var _locKeyHandler = null;

    function openLocationModal() {
        if (!document.getElementById('kiosk-loc-backdrop')) {
            var style = document.createElement('style');
            style.type = 'text/css';
            style.appendChild(document.createTextNode(
                '#kiosk-loc-backdrop{'
                + 'display:-webkit-box;display:-webkit-flex;display:flex;'
                + 'position:fixed;top:0;left:0;right:0;bottom:0;'
                + 'background:rgba(0,0,0,0.85);z-index:100000;'
                + '-webkit-box-align:center;-webkit-align-items:center;align-items:center;'
                + '-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;'
                + '}'
                + '#kiosk-loc-modal{'
                + 'background:#0d1b2a;border:1px solid #1e3a5f;border-radius:12px;'
                + 'padding:24px;width:80vw;max-width:360px;color:#e0e8f0;'
                + 'font-family:sans-serif;'
                + '-webkit-box-sizing:border-box;box-sizing:border-box;'
                + '}'
                + '#kiosk-loc-modal h2{margin:0 0 8px;font-size:1.1em;color:#7cb9e8;}'
                + '#kiosk-loc-modal p{font-size:0.8em;color:#9ab;margin:0 0 12px;}'
                + '#kiosk-loc-input{'
                + 'background:#1e3a5f;border:1px solid #3a6a9f;border-radius:4px;'
                + 'color:#e0e8f0;padding:4px 8px;font-size:0.9em;width:100%;'
                + '-webkit-box-sizing:border-box;box-sizing:border-box;margin-bottom:6px;'
                + '}'
                + '#kiosk-loc-error{color:#f08080;font-size:0.8em;min-height:1.2em;margin-bottom:10px;}'
                + '#kiosk-loc-submit{'
                + 'background:#1e5a9f;color:white;border:none;border-radius:6px;'
                + 'padding:10px 24px;font-size:0.95em;cursor:pointer;width:100%;'
                + '}'
            ));
            document.head.appendChild(style);

            document.body.insertAdjacentHTML('beforeend',
                '<div id="kiosk-loc-backdrop">'
                + '<div id="kiosk-loc-modal">'
                + '<h2>Enter your location</h2>'
                + '<p>Location could not be detected automatically.</p>'
                + '<input type="text" id="kiosk-loc-input" placeholder="40.7128,-74.0060" tabindex="0">'
                + '<div id="kiosk-loc-error"></div>'
                + '<button id="kiosk-loc-submit" tabindex="0">Set Location</button>'
                + '</div></div>'
            );

            document.getElementById('kiosk-loc-submit').addEventListener('click', function () {
                var val = document.getElementById('kiosk-loc-input').value;
                var coords = parseManualLatLon(val);
                if (!coords) {
                    document.getElementById('kiosk-loc-error').textContent =
                        'Invalid. Use lat,lon — e.g. 40.7128,-74.0060';
                    return;
                }
                document.getElementById('kiosk-loc-error').textContent = '';
                applyLocationAndReload(coords.lat, coords.lon);
            });
        }

        // Block Escape / GoBack so user cannot dismiss without supplying coordinates.
        // Capture phase (true) fires before the settings modal keydown handler.
        if (!_locKeyHandler) {
            _locKeyHandler = function (e) {
                var key = e.key || e.keyCode;
                if (key === 'Escape' || key === 27 || key === 'GoBack') {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            document.addEventListener('keydown', _locKeyHandler, true);
        }
    }

    function closeLocationModal() {
        var el = document.getElementById('kiosk-loc-backdrop');
        if (el) el.parentNode.removeChild(el);
        if (_locKeyHandler) {
            document.removeEventListener('keydown', _locKeyHandler, true);
            _locKeyHandler = null;
        }
    }

    window.openLocationModal  = openLocationModal;
    window.closeLocationModal = closeLocationModal;
```

- [ ] **Step 1.6: Run lint**

```bash
cd /home/cyberrange/weatherstartv && npm run lint
```

Expected: no errors. If ESLint reports issues, fix them before continuing (common: `no-var` rule doesn't apply here since the file is explicitly ES5 — check `.eslintrc.json` if needed).

- [ ] **Step 1.7: Run tests**

```bash
cd /home/cyberrange/weatherstartv && npm test
```

Expected: all tests pass.

- [ ] **Step 1.8: Commit**

```bash
cd /home/cyberrange/weatherstartv
git add app/src/main/assets/location.js tests/location.test.js
git commit -m "feat: add IP geo disable guard and location entry modal"
```

---

## Task 2: `settings.js` — About section, IP geo toggle, credits

**Files:**
- Modify: `app/src/main/assets/settings.js`
- Test: `tests/settings.test.js`

### Step 2.1: Add tests for kiosk_ipgeo param read/write and latLon clearing

Open `tests/settings.test.js`. Update `readKioskParams` to include `ipGeo`, and `writeKioskParams` to handle `kiosk_ipgeo` and conditional `latLon` removal. Then add test cases.

Replace the existing `readKioskParams` function:

```javascript
function readKioskParams(searchParams) {
    return {
        music:   searchParams.get('kiosk_music') !== '0',
        volume:  parseFloat(searchParams.get('kiosk_vol') ?? '0.7'),
        shuffle: searchParams.get('kiosk_shuffle') !== '0',
        locMode: searchParams.get('kiosk_loc_mode') ?? 'auto',
        wide:    searchParams.get('settings-wide-checkbox') === 'true',
        units:   searchParams.get('settings-units-select') ?? 'us',
        speed:   searchParams.get('settings-speed-select') ?? '1.0',
        ipGeo:   searchParams.get('kiosk_ipgeo') !== '0',   // absent = enabled
    };
}
```

Replace `writeKioskParams`:

```javascript
function writeKioskParams(urlStr, values) {
    const u = new URL(urlStr);
    u.searchParams.set('kiosk_music',            values.music   ? '1' : '0');
    u.searchParams.set('kiosk_vol',              String(values.volume));
    u.searchParams.set('kiosk_shuffle',          values.shuffle ? '1' : '0');
    u.searchParams.set('kiosk_loc_mode',         values.locMode);
    u.searchParams.set('settings-wide-checkbox', values.wide    ? 'true' : 'false');
    u.searchParams.set('settings-units-select',  values.units);
    u.searchParams.set('settings-speed-select',  values.speed);
    u.searchParams.set('kiosk_ipgeo',            values.ipGeo   ? '1' : '0');
    // Only clear latLon when auto mode AND IP geo enabled.
    // When IP geo is disabled, latLon is the fixed location — preserve it.
    if (values.locMode === 'auto' && values.ipGeo) {
        u.searchParams.delete('latLon');
    }
    return u.toString();
}
```

Append new test cases before the final `console.log`:

```javascript
// readKioskParams — ipGeo defaults to true when param absent
{
    const p = new URLSearchParams('');
    assert.strictEqual(readKioskParams(p).ipGeo, true);
    console.log('✓ readKioskParams: kiosk_ipgeo absent → ipGeo defaults to true');
    passed++;
}

// readKioskParams — ipGeo=false when kiosk_ipgeo=0
{
    const p = new URLSearchParams('kiosk_ipgeo=0');
    assert.strictEqual(readKioskParams(p).ipGeo, false);
    console.log('✓ readKioskParams: kiosk_ipgeo=0 → ipGeo false');
    passed++;
}

// writeKioskParams — kiosk_ipgeo=1 written when ipGeo=true
{
    const url = writeKioskParams('https://appassets.androidplatform.net/assets/ws4kp/index.html', {
        music: true, volume: 0.7, shuffle: true,
        locMode: 'auto', wide: false, units: 'us', speed: '1.0', ipGeo: true
    });
    assert.strictEqual(new URL(url).searchParams.get('kiosk_ipgeo'), '1');
    console.log('✓ writeKioskParams: ipGeo=true → kiosk_ipgeo=1');
    passed++;
}

// writeKioskParams — kiosk_ipgeo=0 written when ipGeo=false
{
    const url = writeKioskParams('https://appassets.androidplatform.net/assets/ws4kp/index.html', {
        music: true, volume: 0.7, shuffle: true,
        locMode: 'auto', wide: false, units: 'us', speed: '1.0', ipGeo: false
    });
    assert.strictEqual(new URL(url).searchParams.get('kiosk_ipgeo'), '0');
    console.log('✓ writeKioskParams: ipGeo=false → kiosk_ipgeo=0');
    passed++;
}

// writeKioskParams — latLon cleared when auto + IP geo enabled
{
    const url = writeKioskParams(
        'https://appassets.androidplatform.net/assets/ws4kp/index.html?latLon=%7B%22lat%22%3A1%2C%22lon%22%3A2%7D',
        { music: true, volume: 0.7, shuffle: true, locMode: 'auto', wide: false, units: 'us', speed: '1.0', ipGeo: true }
    );
    assert.strictEqual(new URL(url).searchParams.get('latLon'), null);
    console.log('✓ writeKioskParams: auto + ipGeo=true → latLon removed');
    passed++;
}

// writeKioskParams — latLon preserved when auto + IP geo disabled
{
    const latLonVal = encodeURIComponent(JSON.stringify({lat:1,lon:2}));
    const url = writeKioskParams(
        'https://appassets.androidplatform.net/assets/ws4kp/index.html?latLon=' + latLonVal,
        { music: true, volume: 0.7, shuffle: true, locMode: 'auto', wide: false, units: 'us', speed: '1.0', ipGeo: false }
    );
    assert.notStrictEqual(new URL(url).searchParams.get('latLon'), null);
    console.log('✓ writeKioskParams: auto + ipGeo=false → latLon preserved');
    passed++;
}
```

- [ ] **Step 2.2: Run tests — confirm new tests fail**

```bash
cd /home/cyberrange/weatherstartv && npm test
```

Expected: `settings.test.js` fails on the new `ipGeo`-related tests (functions don't yet have `ipGeo` support). Existing tests still pass.

- [ ] **Step 2.3: Add `.k-link` CSS to the `CSS` string in `settings.js`**

In `app/src/main/assets/settings.js`, find the `CSS` variable (the long string starting with `'#kiosk-backdrop {'`). Append to the end of the string, before the closing semicolon:

```javascript
        + '.k-link{color:#7cb9e8;}'
        + '#k-fixed-loc-display{font-size:0.8em;color:#9ab;-webkit-box-flex:1;-webkit-flex:1;flex:1;}';
```

- [ ] **Step 2.4: Add About section to the `HTML` string in `settings.js`**

In `settings.js`, find the `HTML` variable. Locate the line:

```javascript
        + '<button id="kiosk-apply" tabindex="0">Apply</button>'
```

Insert the About section immediately before that line:

```javascript
        + '<div class="k-section"><h3>About</h3>'
        + '<p style="font-size:0.8em;margin:0 0 6px;">'
        + '<a href="https://github.com/cyberbalsa/retroweather" target="_blank" class="k-link">WeatherStar Kiosk</a>'
        + ' &mdash; MIT License</p>'
        + '<p style="font-size:0.8em;margin:0 0 12px;">'
        + 'Based on <a href="https://github.com/netbymatt/ws4kp" target="_blank" class="k-link">WeatherStar 4000+</a>'
        + ' by netbymatt</p>'
        + '<p style="font-size:0.8em;color:#9ab;margin:0 0 8px;">'
        + 'IP geolocation (GPS fallback): ipinfo.io, ipapi.co</p>'
        + '<div class="k-row">'
        + '<label for="k-ipgeo">Enable IP geolocation</label>'
        + '<input type="checkbox" id="k-ipgeo" tabindex="0">'
        + '</div>'
        + '<div id="k-fixed-loc-row" class="k-row" style="display:none">'
        + '<span id="k-fixed-loc-display">Fixed: none</span>'
        + '<button id="k-change-loc" class="k-btn-sm" tabindex="0">Change</button>'
        + '</div>'
        + '</div>'
```

- [ ] **Step 2.5: Update `readParams()` to include `ipGeo`**

Find `readParams()` in `settings.js`. Add one line inside the returned object:

```javascript
    function readParams() {
        return {
            music:   getParam('kiosk_music') !== '0',
            volume:  parseFloat(getParam('kiosk_vol') || '0.7'),
            shuffle: getParam('kiosk_shuffle') !== '0',
            locMode: getParam('kiosk_loc_mode') || 'auto',
            latLon:  getParam('latLon') || '',
            wide:    getParam('settings-wide-checkbox') === 'true',
            units:   getParam('settings-units-select') || 'us',
            speed:   getParam('settings-speed-select') || '1.0',
            ipGeo:   getParam('kiosk_ipgeo') !== '0'   // absent = enabled (default)
        };
    }
```

- [ ] **Step 2.6: Update `applySettings()` to persist `kiosk_ipgeo` and fix `latLon` clearing**

Find `applySettings()`. Add `setParam('kiosk_ipgeo', ...)` and change the `removeParam('latLon')` condition:

```javascript
    function applySettings(values) {
        setParam('kiosk_music',            values.music   ? '1' : '0');
        setParam('kiosk_vol',              String(values.volume));
        setParam('kiosk_shuffle',          values.shuffle ? '1' : '0');
        setParam('kiosk_loc_mode',         values.locMode);
        setParam('settings-wide-checkbox', values.wide    ? 'true' : 'false');
        setParam('settings-units-select',  values.units);
        setParam('settings-speed-select',  values.speed);
        setParam('kiosk_ipgeo',            values.ipGeo   ? '1' : '0');

        if (values.locMode === 'manual' && values.latLon && window.applyManualLocation) {
            window.applyManualLocation(values.latLon);
            return;
        }
        // Only clear saved location when re-enabling IP geo (auto mode).
        // When IP geo is disabled, latLon is the fixed/hard-set location — preserve it.
        if (values.locMode === 'auto' && values.ipGeo) {
            removeParam('latLon');
            if (window.Android && window.Android.clearSavedLocation) {
                window.Android.clearSavedLocation();
            }
        }
        window.location.reload();
    }
```

- [ ] **Step 2.7: Update `populateForm()` to fill About section controls**

Find `populateForm()` inside `initSettings()`. Add the following block at the end of the function, after the existing `musicGetCurrentTitle` line:

```javascript
            var ipGeoCheck   = document.getElementById('k-ipgeo');
            var fixedLocRow  = document.getElementById('k-fixed-loc-row');
            var fixedLocDisp = document.getElementById('k-fixed-loc-display');
            if (ipGeoCheck) {
                ipGeoCheck.checked = p.ipGeo;
                fixedLocRow.style.display = p.ipGeo ? 'none' : '-webkit-box';
                fixedLocRow.style.display = p.ipGeo ? 'none' : 'flex';
                if (!p.ipGeo && p.latLon) {
                    try {
                        var coord = JSON.parse(decodeURIComponent(p.latLon));
                        if (coord && coord.lat !== undefined && coord.lon !== undefined) {
                            fixedLocDisp.textContent = 'Fixed: '
                                + parseFloat(coord.lat).toFixed(4) + ', '
                                + parseFloat(coord.lon).toFixed(4);
                        }
                    } catch (e) { fixedLocDisp.textContent = 'Fixed: none'; }
                }
            }  // end if (ipGeoCheck)
```

- [ ] **Step 2.8: Add `ipGeo` to the Apply button handler's values object**

Find the `applyBtn.addEventListener('click', ...)` handler. Add `ipGeo` to the object passed to `applySettings`:

```javascript
        applyBtn.addEventListener('click', function () {
            var lc = findCheckedRadio('k-loc');
            var pc = findCheckedRadio('k-play');
            applySettings({
                music:   musicCheck.checked,
                volume:  volSlider.value / 100,
                shuffle: pc ? pc.value === 'shuffle' : true,
                locMode: lc ? lc.value : 'auto',
                latLon:  latLonInput.value.trim(),
                wide:    wideCheck.checked,
                units:   unitsSelect.value,
                speed:   speedSelect.value,
                ipGeo:   document.getElementById('k-ipgeo').checked
            });
        });
```

- [ ] **Step 2.9: Wire the `#k-ipgeo` change handler and "Change" button**

After the `redetectBtn.addEventListener` block, add:

```javascript
        var ipGeoEl     = document.getElementById('k-ipgeo');
        var fixedRowEl  = document.getElementById('k-fixed-loc-row');
        var changeLocEl = document.getElementById('k-change-loc');

        ipGeoEl.addEventListener('change', function () {
            var disabled = !ipGeoEl.checked;
            fixedRowEl.style.display = disabled ? '-webkit-box' : 'none';
            fixedRowEl.style.display = disabled ? 'flex'        : 'none';
        });

        changeLocEl.addEventListener('click', function () {
            closeSettings();
            if (window.openLocationModal) window.openLocationModal();
        });
        // end About section wiring
```

- [ ] **Step 2.10: Run lint**

```bash
cd /home/cyberrange/weatherstartv && npm run lint
```

Expected: no errors.

- [ ] **Step 2.11: Run all tests**

```bash
cd /home/cyberrange/weatherstartv && npm test
```

Expected: all tests pass including the 6 new `settings.test.js` cases.

- [ ] **Step 2.12: Commit**

```bash
cd /home/cyberrange/weatherstartv
git add app/src/main/assets/settings.js tests/settings.test.js
git commit -m "feat: add About section with credits, IP geo toggle, and location change button"
```

---

## Manual Verification Checklist

After building and installing the APK (`./gradlew assembleDebug`), verify on device or emulator:

- [ ] Long-press opens Settings; About section visible at bottom with credits and links
- [ ] Uncheck "Enable IP geolocation" → Fixed location row appears
- [ ] "Change" button → Settings closes, Location Modal appears
- [ ] Enter invalid coords → error message shown, modal stays open
- [ ] Enter valid coords (e.g. `40.7128,-74.0060`) → page reloads with weather
- [ ] Re-open Settings → IP geo still disabled, fixed location displayed
- [ ] Re-enable IP geo → fixed location row hides
- [ ] Apply with IP geo re-enabled → `latLon` cleared from URL
- [ ] With IP geo disabled and no saved coords, kill and relaunch app → Location Modal appears
- [ ] While Location Modal is open, press Back / Escape → modal stays open (non-dismissable)
