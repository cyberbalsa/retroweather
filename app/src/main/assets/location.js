/* location.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* No const/let, no arrow functions, no fetch, no new URL(), no async/await */

(function () {
    'use strict';

    // ── URL param helpers (no URLSearchParams / new URL on KitKat) ──────────

    function getParam(name) {
        var search = window.location.search.substring(1);
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var idx = pairs[i].indexOf('=');
            if (idx < 0) continue;
            var k = decodeURIComponent(pairs[i].substring(0, idx));
            if (k === name) return decodeURIComponent(pairs[i].substring(idx + 1).replace(/\+/g, ' '));
        }
        return null;
    }

    function setParam(key, value) {
        var search = window.location.search;
        var enc = encodeURIComponent(key) + '=' + encodeURIComponent(value);
        var re = new RegExp('([?&])' + encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=[^&]*');
        if (re.test(search)) {
            search = search.replace(re, function (m, pre) { return pre + enc; });
        } else {
            search = search + (search.length > 1 ? '&' : '?') + enc;
        }
        history.replaceState(null, '', window.location.pathname + search);
    }

    function removeParam(key) {
        var search = window.location.search;
        var re = new RegExp('[?&]' + encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=[^&]*', 'g');
        search = search.replace(re, '');
        if (search.charAt(0) === '&') search = '?' + search.substring(1);
        history.replaceState(null, '', window.location.pathname + search);
    }

    // ── Core functions ───────────────────────────────────────────────────────

    function buildLatLonParam(lat, lon) {
        // Return raw JSON — setParam() will call encodeURIComponent on it
        return JSON.stringify({ lat: lat, lon: lon });
    }

    function parseManualLatLon(input) {
        var parts = input.trim().split(',');
        if (parts.length !== 2) return null;
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        return { lat: lat, lon: lon };
    }

    function applyLocationAndReload(lat, lon) {
        setParam('latLon', buildLatLonParam(lat, lon));
        // Persist so next app start skips IP geo lookup
        if (window.Android && window.Android.saveLocation) {
            window.Android.saveLocation(lat, lon);
        }
        window.location.reload();
    }

    function tryIpGeoUrl(url, extractFn, onFail) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    var coords = extractFn(data);
                    if (coords) {
                        applyLocationAndReload(coords.lat, coords.lon);
                        return;
                    }
                } catch (e) { /* silent */ }
            }
            onFail();
        };
        xhr.onerror = onFail;
        xhr.send();
    }

    function tryIpGeo() {
        // Defensive: coords already set — nothing to do (normally caught by initLocation early-return)
        if (getParam('latLon') !== null) return;
        // User disabled IP geo services — go straight to manual entry modal
        if (getParam('kiosk_ipgeo') === '0') { openLocationModal(); return; }
        // ipinfo.io: 50k req/month free, accurate, own proprietary database
        tryIpGeoUrl(
            'https://ipinfo.io/json',
            function (d) {
                // loc field is "lat,lon" string
                if (d.loc) {
                    var parts = d.loc.split(',');
                    if (parts.length === 2) {
                        var lat = parseFloat(parts[0]);
                        var lon = parseFloat(parts[1]);
                        if (!isNaN(lat) && !isNaN(lon)) return { lat: lat, lon: lon };
                    }
                }
                return null;
            },
            function () {
                // ipinfo.io failed — try ipapi.co (MaxMind database, accurate for residential IPs)
                tryIpGeoUrl(
                    'https://ipapi.co/json/',
                    function (d) {
                        return (d.latitude && d.longitude) ? { lat: d.latitude, lon: d.longitude } : null;
                    },
                    function () {
                        openLocationModal();
                    }
                );
            }
        );
    }

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

    var locationCallbackTimer = null;

    function cancelLocationTimer() {
        if (locationCallbackTimer) { clearTimeout(locationCallbackTimer); locationCallbackTimer = null; }
    }

    // Called by LocationBridge on GPS success
    window.onLocationResult = function (lat, lon) {
        cancelLocationTimer();
        applyLocationAndReload(lat, lon);
    };

    // Called by LocationBridge on GPS failure/denied
    window.onLocationError = function () {
        cancelLocationTimer();
        tryIpGeo();
    };

    // Called by settings.js Apply when locMode=manual
    window.applyManualLocation = function (latLonStr) {
        var parsed = parseManualLatLon(latLonStr);
        if (!parsed) { console.warn('[location] Invalid input:', latLonStr); return false; }
        setParam('latLon', buildLatLonParam(parsed.lat, parsed.lon));
        setParam('kiosk_loc_mode', 'manual');
        if (window.Android && window.Android.saveLocation) {
            window.Android.saveLocation(parsed.lat, parsed.lon);
        }
        window.location.reload();
        return true;
    };

    // Called by settings.js "Re-detect" button
    window.redetectLocation = function () {
        removeParam('latLon');
        setParam('kiosk_loc_mode', 'auto');
        if (window.Android && window.Android.clearSavedLocation) {
            window.Android.clearSavedLocation();
        }
        window.location.reload();
    };

    function initLocation() {
        var locMode = getParam('kiosk_loc_mode');
        var hasLatLon = getParam('latLon') !== null;

        // Skip detection whenever coords are already present (auto, ws4kp city picker, or manual).
        // Re-detection is triggered explicitly via redetectLocation() in settings.
        if (hasLatLon) {
            // Persist to Android SharedPreferences so next app restart loads immediately.
            // This captures locations set by ws4kp's own city picker too.
            try {
                var coords = JSON.parse(getParam('latLon'));
                if (coords && coords.lat && coords.lon && window.Android && window.Android.saveLocation) {
                    window.Android.saveLocation(coords.lat, coords.lon);
                }
            } catch (e) { /* silent */ }
            console.log('[location] Coords already set, skipping detection');
            return;
        }

        if (window.Android) {
            // Safety net: if LocationBridge never calls back (e.g. dead Play Services),
            // fall through to IP geo after 8 s rather than hanging forever.
            locationCallbackTimer = setTimeout(function () {
                console.log('[location] Location callback timeout, falling back to IP geo');
                tryIpGeo();
            }, 8000);
            window.Android.requestLocation();
        } else {
            window.onLocationError();
        }
    }

    window.initLocation = initLocation;
})();
