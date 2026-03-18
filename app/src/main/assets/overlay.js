/* overlay.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* Note: passive event listener option silently ignored on Chrome < 51 — that's fine */

(function () {
    'use strict';

    var pressTimer = null;
    var pressing = false;

    function isInsideBackdrop(el) {
        // Element.closest() not in Chrome 30 — walk parents manually
        while (el) {
            if (el.id === 'kiosk-backdrop') return true;
            el = el.parentElement || el.parentNode;
        }
        return false;
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

    // Bootstrap order: settings creates DOM first, then location and music
    if (window.initSettings) window.initSettings();
    if (window.initLocation) window.initLocation();
    if (window.initMusic)    window.initMusic();

    console.log('[overlay] WeatherStar Kiosk overlay ready');
})();
