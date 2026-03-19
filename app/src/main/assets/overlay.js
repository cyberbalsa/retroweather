/* overlay.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* Note: passive event listener option silently ignored on Chrome < 51 — that's fine */

(function () {
    'use strict';

    var pressTimer = null;
    var pressing = false;

    // Keyboard long-press state (TV remote OK/select fires Enter, keyCode 13)
    var keyLongPressTimer = null;
    var enterDown = false;

    function isInsideBackdrop(el) {
        // Element.closest() not in Chrome 30 — walk parents manually
        while (el) {
            if (el.id === 'kiosk-backdrop') return true;
            el = el.parentElement || el.parentNode;
        }
        return false;
    }

    function isSettingsOpen() {
        var bd = document.getElementById('kiosk-backdrop');
        return bd && bd.className.indexOf('open') !== -1;
    }

    function startPress(target) {
        if (isInsideBackdrop(target)) return;
        pressing = true;
        pressTimer = setTimeout(function () {
            if (pressing && window.openKioskSettings) window.openKioskSettings();
        }, 600);
    }

    function cancelPress() {
        pressing = false;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    // Touch events (phone/tablet)
    document.addEventListener('touchstart',  function (e) { startPress(e.target); });
    document.addEventListener('touchmove',   cancelPress);
    document.addEventListener('touchend',    cancelPress);
    document.addEventListener('touchcancel', cancelPress);

    // Mouse events (TV remote / D-pad / desktop testing)
    document.addEventListener('mousedown', function (e) { startPress(e.target); });
    document.addEventListener('mouseup',   cancelPress);
    document.addEventListener('mousemove', cancelPress);

    // Keyboard events — TV remote D-pad / directional keys
    document.addEventListener('keydown', function (e) {
        var key = e.keyCode || e.which;

        // Prevent arrow keys from scrolling the WebView or triggering Android TV
        // system focus UI (the "weird box") when the settings overlay is closed.
        // Allow arrow keys through when settings is open so form elements are navigable.
        if (!isSettingsOpen() && (key === 37 || key === 38 || key === 39 || key === 40)) {
            e.preventDefault();
        }

        // Long-press Enter to open settings. Track first keydown only (not auto-repeat).
        // e.repeat is unreliable on older WebViews — use enterDown flag instead.
        if (key === 13 && !enterDown && !isSettingsOpen()) {
            enterDown = true;
            keyLongPressTimer = setTimeout(function () {
                keyLongPressTimer = null;
                if (window.openKioskSettings) window.openKioskSettings();
            }, 600);
        }
    });

    document.addEventListener('keyup', function (e) {
        if ((e.keyCode || e.which) === 13) {
            enterDown = false;
            if (keyLongPressTimer) {
                clearTimeout(keyLongPressTimer);
                keyLongPressTimer = null;
            }
        }
    });

    // Bootstrap order: settings creates DOM first, then location and music
    if (window.initSettings) window.initSettings();
    if (window.initLocation) window.initLocation();
    if (window.initMusic)    window.initMusic();

    console.log('[overlay] WeatherStar Kiosk overlay ready');
})();
