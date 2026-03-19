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
        + '#kiosk-backdrop.open{display:-webkit-box!important;display:-webkit-flex!important;display:flex!important;}'
        + '#kiosk-modal{'
        + 'background:#0d1b2a;border:1px solid #1e3a5f;border-radius:12px;'
        + 'padding:24px;width:90vw;max-width:520px;max-height:80vh;'
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
        + '.k-displays{display:-webkit-box;display:-webkit-flex;display:flex;'
        + '-webkit-flex-wrap:wrap;flex-wrap:wrap;margin-top:4px;}'
        + '.k-disp-item{-webkit-box-flex:0;-webkit-flex:0 0 50%;flex:0 0 50%;'
        + 'font-size:0.85em;padding:3px 0;cursor:pointer;}'
        ;

    var HTML = '<div id="kiosk-backdrop">'
        + '<div id="kiosk-modal" role="dialog" tabindex="-1">'
        + '<h2>&#9881; WeatherStar Settings</h2>'

        // ── Location ─────────────────────────────────────────────────────────
        + '<div class="k-section"><h3>Location</h3>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-loc" value="auto" tabindex="0"> Auto-detect</label>'
        + '<label><input type="radio" name="k-loc" value="manual" tabindex="0"> Manual</label>'
        + '</div>'
        + '<div class="k-row" id="k-manual-row" style="display:none">'
        + '<label for="k-latlon">Lat,Lon:</label>'
        + '<input type="text" id="k-latlon" placeholder="40.7128,-74.0060" tabindex="0">'
        + '</div>'
        + '<div class="k-row">'
        + '<button id="k-redetect" class="k-btn-sm" tabindex="0">Re-detect location</button>'
        + '<label style="margin-left:16px;font-size:0.9em;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;-webkit-align-items:center;align-items:center;">'
        + '<input type="checkbox" id="k-ipgeo" tabindex="0" style="margin-right:6px;"> IP geo (ipinfo.io, ipapi.co)'
        + '</label>'
        + '</div>'
        + '</div>'

        // ── Displays ─────────────────────────────────────────────────────────
        + '<div class="k-section"><h3>Displays</h3>'
        + '<div class="k-displays">'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-current-weather" tabindex="0"> Current Weather</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-latest-observations" tabindex="0"> Latest Obs.</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-hourly" tabindex="0"> Hourly</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-hourly-graph" tabindex="0"> Hourly Graph</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-local-forecast" tabindex="0"> Local Forecast</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-extended-forecast" tabindex="0"> Extended Forecast</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-regional-forecast" tabindex="0"> Regional Forecast</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-travel" tabindex="0"> Travel</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-almanac" tabindex="0"> Almanac</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-hazards" tabindex="0"> Hazards</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-spc-outlook" tabindex="0"> SPC Outlook</label>'
        + '<label class="k-disp-item"><input type="checkbox" id="k-disp-radar" tabindex="0"> Radar</label>'
        + '</div>'
        + '</div>'

        // ── Appearance ────────────────────────────────────────────────────────
        + '<div class="k-section"><h3>Appearance</h3>'
        + '<div class="k-row"><label for="k-wide">Widescreen (16:9)</label><input type="checkbox" id="k-wide" tabindex="0"></div>'
        + '<div class="k-row"><label for="k-units">Units</label>'
        + '<select id="k-units" tabindex="0"><option value="us">US (F)</option><option value="si">Metric (C)</option></select>'
        + '</div>'
        + '<div class="k-row"><label for="k-speed">Speed</label>'
        + '<select id="k-speed" tabindex="0">'
        + '<option value="0.5">Very Fast</option><option value="0.75">Fast</option>'
        + '<option value="1.0">Normal</option><option value="1.25">Slow</option><option value="1.5">Very Slow</option>'
        + '</select></div>'
        + '<div class="k-row">'
        + '<label for="k-crt-pick">CRT Shader</label>'
        + '<span id="k-crt-label" style="font-size:0.82em;color:#7cb9e8;-webkit-flex:1;flex:1;margin-left:8px;">None</span>'
        + '<button id="k-crt-pick" class="k-btn-sm" tabindex="0">Pick\u2026</button>'
        + '</div>'
        + '</div>'

        // ── Music ─────────────────────────────────────────────────────────────
        + '<div class="k-section"><h3>Music</h3>'
        + '<div class="k-row"><label for="k-music">Enabled</label><input type="checkbox" id="k-music" tabindex="0"></div>'
        + '<div class="k-row k-radio">'
        + '<label><input type="radio" name="k-play" value="sequential" tabindex="0"> Sequential</label>'
        + '<label><input type="radio" name="k-play" value="shuffle" tabindex="0"> Shuffle</label>'
        + '</div>'
        + '<div class="k-row"><label>Volume</label>'
        + '<button id="k-vol-dn" class="k-btn-sm" tabindex="0">&#8722;</button>'
        + '<span id="k-vol-val" style="margin:0 8px;min-width:3em;text-align:center;">70%</span>'
        + '<button id="k-vol-up" class="k-btn-sm" tabindex="0">+</button>'
        + '<input type="range" id="k-vol" min="0" max="100" tabindex="-1" style="display:none">'
        + '</div>'
        + '<div id="kiosk-track"></div>'
        + '</div>'

        // ── Custom Feed ───────────────────────────────────────────────────────
        + '<div class="k-section"><h3>Custom Feed</h3>'
        + '<div class="k-row"><label for="k-feed-enable">Enabled</label><input type="checkbox" id="k-feed-enable" tabindex="0"></div>'
        + '<div class="k-row"><label for="k-feed-url">URL</label>'
        + '<input type="text" id="k-feed-url" placeholder="https://example.com/feed.xml" tabindex="0">'
        + '</div>'
        + '</div>'

        // ── About ─────────────────────────────────────────────────────────────
        + '<div class="k-section"><h3>About</h3>'
        + '<p style="font-size:0.8em;margin:0 0 8px;">'
        + '<a href="https://github.com/cyberbalsa/retroweather" target="_blank" class="k-link">Retro Weather by Balsa</a>'
        + '</p>'
        + '<p style="font-size:0.8em;margin:0 0 8px;">'
        + 'Based on <a href="https://github.com/netbymatt/ws4kp" target="_blank" class="k-link">WeatherStar 4000+</a>'
        + ' by netbymatt</p>'
        + '<p style="font-size:0.8em;margin:0 0 0;">'
        + 'CRT shaders inspired by <a href="https://github.com/RetroCrisis/Retro-Crisis-GDV-NTSC" target="_blank" class="k-link">Retro Crisis GDV-NTSC</a>'
        + ' by RetroCrisis</p>'
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

    // Display checkboxes default to enabled when absent from URL
    function readDisplayParam(name) {
        var v = getParam(name + '-checkbox');
        if (v === null) return true;
        return v !== 'false';
    }

    // ── Param read/write ─────────────────────────────────────────────────────

    function readParams() {
        return {
            // kiosk music
            music:      getParam('kiosk_music') !== '0',
            volume:     parseFloat(getParam('kiosk_vol') || '0.7'),
            shuffle:    getParam('kiosk_shuffle') !== '0',
            // location
            locMode:    getParam('kiosk_loc_mode') || 'auto',
            latLon:     getParam('latLon') || '',
            ipGeo:      getParam('kiosk_ipgeo') !== '0',
            // displays (all default enabled)
            curWeather: readDisplayParam('current-weather'),
            latestObs:  readDisplayParam('latest-observations'),
            hourly:     readDisplayParam('hourly'),
            hourlyGraph: readDisplayParam('hourly-graph'),
            local:      readDisplayParam('local-forecast'),
            extended:   readDisplayParam('extended-forecast'),
            regional:   readDisplayParam('regional-forecast'),
            travel:     readDisplayParam('travel'),
            almanac:    readDisplayParam('almanac'),
            hazards:    readDisplayParam('hazards'),
            spcOutlook: readDisplayParam('spc-outlook'),
            radar:      readDisplayParam('radar'),
            // appearance
            wide:        getParam('settings-wide-checkbox') === 'true',
            units:       getParam('settings-units-select') || 'us',
            speed:       getParam('settings-speed-select') || '1.0',
            // custom feed (absent = enabled with default Kagi tech feed)
            feedEnable: getParam('settings-customFeedEnable-checkbox') !== 'false',
            feedUrl:    getParam('settings-customFeed-string') || 'https://news.kagi.com/tech.xml'
        };
    }

    function applySettings(values) {
        // kiosk music
        setParam('kiosk_music',   values.music   ? '1' : '0');
        setParam('kiosk_vol',     String(values.volume));
        setParam('kiosk_shuffle', values.shuffle ? '1' : '0');
        // location
        setParam('kiosk_loc_mode', values.locMode);
        setParam('kiosk_ipgeo',    values.ipGeo ? '1' : '0');
        // displays
        setParam('current-weather-checkbox',    values.curWeather  ? 'true' : 'false');
        setParam('latest-observations-checkbox', values.latestObs  ? 'true' : 'false');
        setParam('hourly-checkbox',             values.hourly      ? 'true' : 'false');
        setParam('hourly-graph-checkbox',       values.hourlyGraph ? 'true' : 'false');
        setParam('local-forecast-checkbox',     values.local       ? 'true' : 'false');
        setParam('extended-forecast-checkbox',  values.extended    ? 'true' : 'false');
        setParam('regional-forecast-checkbox',  values.regional    ? 'true' : 'false');
        setParam('travel-checkbox',             values.travel      ? 'true' : 'false');
        setParam('almanac-checkbox',            values.almanac     ? 'true' : 'false');
        setParam('hazards-checkbox',            values.hazards     ? 'true' : 'false');
        setParam('spc-outlook-checkbox',        values.spcOutlook  ? 'true' : 'false');
        setParam('radar-checkbox',              values.radar       ? 'true' : 'false');
        // appearance
        setParam('settings-wide-checkbox',       values.wide        ? 'true' : 'false');
        setParam('settings-units-select',        values.units);
        setParam('settings-speed-select',        values.speed);
        // custom feed
        setParam('settings-customFeedEnable-checkbox', values.feedEnable ? 'true' : 'false');
        if (values.feedUrl) {
            setParam('settings-customFeed-string', values.feedUrl);
        } else {
            removeParam('settings-customFeed-string');
        }

        if (window.Android && window.Android.saveSettings) {
            window.Android.saveSettings(window.location.search);
        }

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
        // Use native bridge reload — window.location.reload() is unreliable when
        // called from within an evaluateJavascript execution context on Android WebView.
        if (window.Android && window.Android.requestReload) {
            window.Android.requestReload();
        } else {
            window.location.reload();
        }
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function initSettings() {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));
        document.head.appendChild(style);

        // insertAdjacentHTML inserts compile-time constant markup, not user input
        document.body.insertAdjacentHTML('beforeend', HTML);

        var backdrop     = document.getElementById('kiosk-backdrop');
        var manualRow    = document.getElementById('k-manual-row');
        var latLonInput  = document.getElementById('k-latlon');
        var musicCheck   = document.getElementById('k-music');
        var volSlider    = document.getElementById('k-vol');
        var volValLabel  = document.getElementById('k-vol-val');
        var volDnBtn     = document.getElementById('k-vol-dn');
        var volUpBtn     = document.getElementById('k-vol-up');
        var wideCheck    = document.getElementById('k-wide');
        var unitsSelect  = document.getElementById('k-units');
        var speedSelect  = document.getElementById('k-speed');
        var crtPickBtn   = document.getElementById('k-crt-pick');
        var crtLabel     = document.getElementById('k-crt-label');

        // Set initial label from native-injected value (set by KioskWebViewClient.onPageFinished)
        if (window.__initialCrtLabel) {
            crtLabel.textContent = window.__initialCrtLabel;
        }

        var feedEnableChk  = document.getElementById('k-feed-enable');
        var feedUrlInput   = document.getElementById('k-feed-url');
        var applyBtn     = document.getElementById('kiosk-apply');
        var redetectBtn  = document.getElementById('k-redetect');
        var trackLabel   = document.getElementById('kiosk-track');

        function populateForm() {
            var p = readParams();

            // location
            var locRadios = document.querySelectorAll('input[name="k-loc"]');
            for (var i = 0; i < locRadios.length; i++) {
                locRadios[i].checked = locRadios[i].value === p.locMode;
            }
            manualRow.style.display = (p.locMode === 'manual') ? '-webkit-box' : 'none';
            if (p.latLon) {
                try {
                    var coord = JSON.parse(decodeURIComponent(p.latLon));
                    latLonInput.value = coord.lat + ',' + coord.lon;
                } catch (e) {}
            }
            document.getElementById('k-ipgeo').checked = p.ipGeo;

            // displays
            document.getElementById('k-disp-current-weather').checked    = p.curWeather;
            document.getElementById('k-disp-latest-observations').checked = p.latestObs;
            document.getElementById('k-disp-hourly').checked              = p.hourly;
            document.getElementById('k-disp-hourly-graph').checked        = p.hourlyGraph;
            document.getElementById('k-disp-local-forecast').checked      = p.local;
            document.getElementById('k-disp-extended-forecast').checked   = p.extended;
            document.getElementById('k-disp-regional-forecast').checked   = p.regional;
            document.getElementById('k-disp-travel').checked              = p.travel;
            document.getElementById('k-disp-almanac').checked             = p.almanac;
            document.getElementById('k-disp-hazards').checked             = p.hazards;
            document.getElementById('k-disp-spc-outlook').checked         = p.spcOutlook;
            document.getElementById('k-disp-radar').checked               = p.radar;

            // appearance
            wideCheck.checked    = p.wide;
            unitsSelect.value    = p.units;
            speedSelect.value    = p.speed;

            // music
            musicCheck.checked = p.music;
            volSlider.value    = Math.round(p.volume * 100);
            volValLabel.textContent = volSlider.value + '%';
            var playRadios = document.querySelectorAll('input[name="k-play"]');
            for (var j = 0; j < playRadios.length; j++) {
                playRadios[j].checked = playRadios[j].value === (p.shuffle ? 'shuffle' : 'sequential');
            }
            if (window.musicGetCurrentTitle) trackLabel.textContent = window.musicGetCurrentTitle();

            // custom feed
            feedEnableChk.checked = p.feedEnable;
            feedUrlInput.value    = p.feedUrl;
        }

        var locRadiosAll = document.querySelectorAll('input[name="k-loc"]');
        for (var li = 0; li < locRadiosAll.length; li++) {
            locRadiosAll[li].addEventListener('change', function () {
                var ch = findCheckedRadio('k-loc');
                manualRow.style.display = (ch && ch.value === 'manual') ? '-webkit-box' : 'none';
            });
        }

        crtPickBtn.addEventListener('click', function () {
            if (window.Android && window.Android.showCrtPicker) {
                window.Android.showCrtPicker();
            }
        });

        function setVol(pct) {
            pct = Math.max(0, Math.min(100, pct));
            volSlider.value = pct;
            volValLabel.textContent = pct + '%';
            if (window.musicSetVolume) window.musicSetVolume(pct / 100);
        }
        volDnBtn.addEventListener('click', function () { setVol(parseInt(volSlider.value, 10) - 10); });
        volUpBtn.addEventListener('click', function () { setVol(parseInt(volSlider.value, 10) + 10); });

        applyBtn.addEventListener('click', function () {
            var lc = findCheckedRadio('k-loc');
            var pc = findCheckedRadio('k-play');
            applySettings({
                music:       musicCheck.checked,
                volume:      volSlider.value / 100,
                shuffle:     pc ? pc.value === 'shuffle' : true,
                locMode:     lc ? lc.value : 'auto',
                latLon:      latLonInput.value.trim(),
                ipGeo:       document.getElementById('k-ipgeo').checked,
                curWeather:  document.getElementById('k-disp-current-weather').checked,
                latestObs:   document.getElementById('k-disp-latest-observations').checked,
                hourly:      document.getElementById('k-disp-hourly').checked,
                hourlyGraph: document.getElementById('k-disp-hourly-graph').checked,
                local:       document.getElementById('k-disp-local-forecast').checked,
                extended:    document.getElementById('k-disp-extended-forecast').checked,
                regional:    document.getElementById('k-disp-regional-forecast').checked,
                travel:      document.getElementById('k-disp-travel').checked,
                almanac:     document.getElementById('k-disp-almanac').checked,
                hazards:     document.getElementById('k-disp-hazards').checked,
                spcOutlook:  document.getElementById('k-disp-spc-outlook').checked,
                radar:       document.getElementById('k-disp-radar').checked,
                wide:        wideCheck.checked,
                units:       unitsSelect.value,
                speed:       speedSelect.value,
                feedEnable:  feedEnableChk.checked,
                feedUrl:     feedUrlInput.value.trim()
            });
        });

        redetectBtn.addEventListener('click', function () {
            if (window.redetectLocation) window.redetectLocation();
        });

        backdrop.addEventListener('click', function (e) {
            if (!isInsideId(e.target, 'kiosk-modal')) closeSettings();
        });

        document.addEventListener('keydown', function (e) {
            var key = e.key || e.keyCode;
            // Escape on keyboard closes settings (back key is handled natively via kioskHandleBack)
            if ((key === 'Escape' || key === 27) && backdrop.className.indexOf('open') !== -1) {
                applyBtn.click();
            }
        });

        function openSettings() {
            populateForm();
            backdrop.className += ' open';
            // Focus the modal container (tabindex=-1) rather than a button, so the
            // Enter key still in-flight from the long-press doesn't trigger anything,
            // but D-pad spatial navigation has a starting point inside the modal.
            var modal = document.getElementById('kiosk-modal');
            if (modal) modal.focus();
        }

        function closeSettings() {
            backdrop.className = backdrop.className.replace(/\bopen\b/g, '').replace(/\s+/g, ' ').trim();
        }

        window.openKioskSettings  = openSettings;
        window.closeKioskSettings = closeSettings;
        window._settingsUpdateTrack = function (t) { trackLabel.textContent = t; };
        // Called by native onBackPressed — save+close if open, no-op otherwise
        window.kioskHandleBack = function () {
            if (backdrop.className.indexOf('open') !== -1) applyBtn.click();
        };
        window.updateCrtLabel = function (label) {
            var el = document.getElementById('k-crt-label');
            if (el) el.textContent = label || 'None';
        };
    }

    window.initSettings = initSettings;
})();
