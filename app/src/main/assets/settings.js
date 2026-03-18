/* settings.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* No const/let, no template literals, no new URL(), no .find(), no .closest() */
/* CSS: no gap/min() — uses margin/max-width; flexbox with -webkit- prefixes */

(function () {
    'use strict';

    var CSS = '#kiosk-backdrop {'
        + 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;'
        + 'background:rgba(0,0,0,0.75);z-index:99999;'
        + '-webkit-box-align:center;-webkit-align-items:center;align-items:center;'
        + '-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;'
        + '}'
        + '#kiosk-backdrop.open{display:-webkit-box;display:-webkit-flex;display:flex;}'
        + '#kiosk-modal{'
        + 'background:#0d1b2a;border:1px solid #1e3a5f;border-radius:12px;'
        + 'padding:24px;width:90vw;max-width:480px;max-height:80vh;'
        + 'overflow-y:auto;color:#e0e8f0;font-family:sans-serif;'
        + '-webkit-box-sizing:border-box;box-sizing:border-box;'
        + '}'
        + '#kiosk-modal h2{margin:0 0 16px;font-size:1.1em;color:#7cb9e8;}'
        + '.k-section{margin-bottom:16px;border-bottom:1px solid #1e3a5f;padding-bottom:12px;}'
        + '.k-section h3{margin:0 0 8px;font-size:0.8em;color:#9ab;text-transform:uppercase;}'
        + '.k-row{display:-webkit-box;display:-webkit-flex;display:flex;'
        + '-webkit-box-align:center;-webkit-align-items:center;align-items:center;'
        + 'margin:6px 0;font-size:0.9em;}'
        + '.k-row>label:first-child{-webkit-box-flex:1;-webkit-flex:1;flex:1;}'
        + '.k-radio label{-webkit-box-flex:0;-webkit-flex:none;flex:none;margin-right:16px;cursor:pointer;}'
        + 'input[type=range]{-webkit-box-flex:2;-webkit-flex:2;flex:2;margin-left:8px;}'
        + 'input[type=text]{'
        + 'background:#1e3a5f;border:1px solid #3a6a9f;border-radius:4px;'
        + 'color:#e0e8f0;padding:4px 8px;font-size:0.9em;'
        + '-webkit-box-flex:2;-webkit-flex:2;flex:2;margin-left:8px;'
        + '}'
        + 'select{background:#1e3a5f;border:1px solid #3a6a9f;border-radius:4px;'
        + 'color:#e0e8f0;padding:4px 8px;font-size:0.9em;margin-left:8px;}'
        + '#kiosk-track{font-size:0.75em;color:#7cb9e8;font-style:italic;margin:4px 0 0;min-height:1em;}'
        + '#kiosk-apply{background:#1e5a9f;color:white;border:none;border-radius:6px;'
        + 'padding:10px 24px;font-size:0.95em;cursor:pointer;width:100%;margin-top:8px;}'
        + '#kiosk-apply:focus{background:#2a7abf;outline:2px solid #7cb9e8;}'
        + '.k-btn-sm{font-size:0.8em;padding:4px 10px;background:#1e3a5f;'
        + 'border:1px solid #3a6a9f;border-radius:4px;color:#e0e8f0;cursor:pointer;}'
        + '.k-link{color:#7cb9e8;}'
        + '#k-fixed-loc-display{font-size:0.8em;color:#9ab;-webkit-box-flex:1;-webkit-flex:1;flex:1;}';

    var HTML = '<div id="kiosk-backdrop">'
        + '<div id="kiosk-modal" role="dialog">'
        + '<h2>&#9881; WeatherStar Settings</h2>'
        + '<div class="k-section"><h3>Location</h3>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-loc" value="auto" tabindex="0"> Auto-detect</label>'
        + '<label><input type="radio" name="k-loc" value="manual" tabindex="0"> Manual</label>'
        + '</div>'
        + '<div class="k-row" id="k-manual-row" style="display:none">'
        + '<label for="k-latlon">Lat,Lon:</label>'
        + '<input type="text" id="k-latlon" placeholder="40.7128,-74.0060" tabindex="0">'
        + '</div>'
        + '<div class="k-row"><button id="k-redetect" class="k-btn-sm" tabindex="0">Re-detect location</button></div>'
        + '</div>'
        + '<div class="k-section"><h3>Music</h3>'
        + '<div class="k-row"><label for="k-music">Enabled</label><input type="checkbox" id="k-music" tabindex="0"></div>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-play" value="sequential" tabindex="0"> Sequential</label>'
        + '<label><input type="radio" name="k-play" value="shuffle" tabindex="0"> Shuffle</label>'
        + '</div>'
        + '<div class="k-row"><label for="k-vol">Volume</label><input type="range" id="k-vol" min="0" max="100" tabindex="0"></div>'
        + '<div id="kiosk-track"></div>'
        + '</div>'
        + '<div class="k-section"><h3>Display</h3>'
        + '<div class="k-row"><label for="k-wide">Widescreen (16:9)</label><input type="checkbox" id="k-wide" tabindex="0"></div>'
        + '<div class="k-row"><label for="k-units">Units</label>'
        + '<select id="k-units" tabindex="0"><option value="us">US (F)</option><option value="si">Metric (C)</option></select>'
        + '</div>'
        + '<div class="k-row"><label for="k-speed">Speed</label>'
        + '<select id="k-speed" tabindex="0">'
        + '<option value="0.5">Very Fast</option><option value="0.75">Fast</option>'
        + '<option value="1.0">Normal</option><option value="1.25">Slow</option><option value="1.5">Very Slow</option>'
        + '</select></div>'
        + '</div>'
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
        + '<button id="kiosk-apply" tabindex="0">Apply</button>'
        + '</div></div>';

    // ── URL param helpers ────────────────────────────────────────────────────

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
        var safeKey = encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('([?&])' + safeKey + '=[^&]*');
        if (re.test(search)) {
            search = search.replace(re, function (m, pre) { return pre + enc; });
        } else {
            search = search + (search.length > 1 ? '&' : '?') + enc;
        }
        history.replaceState(null, '', window.location.pathname + search);
    }

    function removeParam(key) {
        var search = window.location.search;
        var safeKey = encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('[?&]' + safeKey + '=[^&]*', 'g');
        search = search.replace(re, '');
        if (search.charAt(0) === '&') search = '?' + search.substring(1);
        history.replaceState(null, '', window.location.pathname + search);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // Element.closest() not in Chrome 30 — walk parents manually
    function isInsideId(el, id) {
        while (el) {
            if (el.id === id) return true;
            el = el.parentElement || el.parentNode;
        }
        return false;
    }

    function findCheckedRadio(name) {
        var radios = document.querySelectorAll('input[name="' + name + '"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) return radios[i];
        }
        return null;
    }

    // ── Param read/write ─────────────────────────────────────────────────────

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

    // ── Init ─────────────────────────────────────────────────────────────────

    function initSettings() {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));
        document.head.appendChild(style);

        // insertAdjacentHTML inserts compile-time constant markup, not user input
        document.body.insertAdjacentHTML('beforeend', HTML);

        var backdrop    = document.getElementById('kiosk-backdrop');
        var manualRow   = document.getElementById('k-manual-row');
        var latLonInput = document.getElementById('k-latlon');
        var musicCheck  = document.getElementById('k-music');
        var volSlider   = document.getElementById('k-vol');
        var wideCheck   = document.getElementById('k-wide');
        var unitsSelect = document.getElementById('k-units');
        var speedSelect = document.getElementById('k-speed');
        var applyBtn    = document.getElementById('kiosk-apply');
        var redetectBtn = document.getElementById('k-redetect');
        var trackLabel  = document.getElementById('kiosk-track');

        function populateForm() {
            var p = readParams();
            var locRadios = document.querySelectorAll('input[name="k-loc"]');
            for (var i = 0; i < locRadios.length; i++) {
                locRadios[i].checked = locRadios[i].value === p.locMode;
            }
            manualRow.style.display = (p.locMode === 'manual') ? 'flex' : 'none';
            if (p.latLon) {
                try {
                    var coord = JSON.parse(decodeURIComponent(p.latLon));
                    latLonInput.value = coord.lat + ',' + coord.lon;
                } catch (e) {}
            }
            musicCheck.checked = p.music;
            volSlider.value    = Math.round(p.volume * 100);
            var playRadios = document.querySelectorAll('input[name="k-play"]');
            for (var j = 0; j < playRadios.length; j++) {
                playRadios[j].checked = playRadios[j].value === (p.shuffle ? 'shuffle' : 'sequential');
            }
            wideCheck.checked  = p.wide;
            unitsSelect.value  = p.units;
            speedSelect.value  = p.speed;
            if (window.musicGetCurrentTitle) trackLabel.textContent = window.musicGetCurrentTitle();

            var ipGeoCheck   = document.getElementById('k-ipgeo');
            var fixedLocRow  = document.getElementById('k-fixed-loc-row');
            var fixedLocDisp = document.getElementById('k-fixed-loc-display');
            if (ipGeoCheck) {
                ipGeoCheck.checked = p.ipGeo;
                fixedLocRow.style.display = p.ipGeo ? 'none' : '-webkit-box';
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
        }

        var locRadiosAll = document.querySelectorAll('input[name="k-loc"]');
        for (var li = 0; li < locRadiosAll.length; li++) {
            locRadiosAll[li].addEventListener('change', function () {
                var ch = findCheckedRadio('k-loc');
                manualRow.style.display = (ch && ch.value === 'manual') ? 'flex' : 'none';
            });
        }

        // KitKat fires 'change', modern browsers fire 'input' — handle both
        function onVolChange() {
            if (window.musicSetVolume) window.musicSetVolume(volSlider.value / 100);
        }
        volSlider.addEventListener('input', onVolChange);
        volSlider.addEventListener('change', onVolChange);

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

        redetectBtn.addEventListener('click', function () {
            if (window.redetectLocation) window.redetectLocation();
        });

        var ipGeoEl     = document.getElementById('k-ipgeo');
        var fixedRowEl  = document.getElementById('k-fixed-loc-row');
        var changeLocEl = document.getElementById('k-change-loc');

        ipGeoEl.addEventListener('change', function () {
            var disabled = !ipGeoEl.checked;
            fixedRowEl.style.display = disabled ? '-webkit-box' : 'none';
        });

        changeLocEl.addEventListener('click', function () {
            closeSettings();
            if (window.openLocationModal) window.openLocationModal();
        });
        // end About section wiring

        backdrop.addEventListener('click', function (e) {
            if (!isInsideId(e.target, 'kiosk-modal')) closeSettings();
        });

        document.addEventListener('keydown', function (e) {
            var key = e.key || e.keyCode;
            var isEsc = (key === 'Escape' || key === 27 || key === 'GoBack');
            if (isEsc && backdrop.className.indexOf('open') !== -1) closeSettings();
        });

        function openSettings() {
            populateForm();
            backdrop.className += ' open';
            applyBtn.focus();
        }

        function closeSettings() {
            backdrop.className = backdrop.className.replace(/\bopen\b/g, '').replace(/\s+/g, ' ').trim();
        }

        window.openKioskSettings  = openSettings;
        window.closeKioskSettings = closeSettings;
        window._settingsUpdateTrack = function (t) { trackLabel.textContent = t; };
    }

    window.initSettings = initSettings;
})();
