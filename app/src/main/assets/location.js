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
        return encodeURIComponent(JSON.stringify({ lat: lat, lon: lon }));
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
        window.location.reload();
    }

    function tryIpGeo() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://ipapi.co/json/', true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.latitude && data.longitude) {
                        applyLocationAndReload(data.latitude, data.longitude);
                        return;
                    }
                } catch (e) { /* silent */ }
            }
            console.log('[location] All methods failed, ws4kp will show city picker');
        };
        xhr.onerror = function () {
            console.log('[location] IP geo request failed');
        };
        xhr.send();
    }

    // Called by LocationBridge on GPS success
    window.onLocationResult = function (lat, lon) {
        applyLocationAndReload(lat, lon);
    };

    // Called by LocationBridge on GPS failure/denied
    window.onLocationError = function () {
        tryIpGeo();
    };

    // Called by settings.js Apply when locMode=manual
    window.applyManualLocation = function (latLonStr) {
        var parsed = parseManualLatLon(latLonStr);
        if (!parsed) { console.warn('[location] Invalid input:', latLonStr); return false; }
        setParam('latLon', buildLatLonParam(parsed.lat, parsed.lon));
        setParam('kiosk_loc_mode', 'manual');
        window.location.reload();
        return true;
    };

    // Called by settings.js "Re-detect" button
    window.redetectLocation = function () {
        removeParam('latLon');
        setParam('kiosk_loc_mode', 'auto');
        window.location.reload();
    };

    function initLocation() {
        var locMode = getParam('kiosk_loc_mode');
        var hasLatLon = getParam('latLon') !== null;

        if (locMode === 'manual' && hasLatLon) {
            console.log('[location] Manual mode with coords, skipping auto-detect');
            return;
        }

        if (window.Android) {
            window.Android.requestLocation();
        } else {
            window.onLocationError();
        }
    }

    window.initLocation = initLocation;
})();
