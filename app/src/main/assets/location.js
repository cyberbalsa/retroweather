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
                        console.log('[location] IP geo unavailable, ws4kp will show city picker');
                    }
                );
            }
        );
    }

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
