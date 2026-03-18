/* music.js — ES5, compatible with Android 4.4 KitKat (Chrome 30) */
/* Uses XHR + DOMParser (both available in Chrome 30) */

(function () {
    'use strict';

    var ARCHIVE_XML = 'https://archive.org/download/weatherscancompletecollection/weatherscancompletecollection_files.xml';
    var ARCHIVE_BASE = 'https://archive.org/download/weatherscancompletecollection/';

    var playlist = [];
    var currentIndex = 0;
    var audio = null;
    var initialized = false;

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

    // DOMParser is available in Chrome 30 (KitKat) — cleaner than regex
    function parsePlaylistFromXml(xmlStr) {
        var result = [];
        try {
            var parser = new DOMParser();
            var doc = parser.parseFromString(xmlStr, 'text/xml');
            var files = doc.getElementsByTagName('file');
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if (file.getAttribute('source') !== 'original') continue;
                var formatEls = file.getElementsByTagName('format');
                if (!formatEls.length || formatEls[0].textContent !== 'VBR MP3') continue;
                var filename = file.getAttribute('name');
                var titleEls = file.getElementsByTagName('title');
                var title = titleEls.length ? titleEls[0].textContent : filename.replace(/\.\w+$/, '');
                result.push({ url: ARCHIVE_BASE + encodeURIComponent(filename), title: title });
            }
        } catch (e) {
            console.warn('[music] XML parse error:', e.message);
        }
        return result;
    }

    function fisherYatesShuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function getParams() {
        return {
            enabled: getParam('kiosk_music') !== '0',
            volume: parseFloat(getParam('kiosk_vol') || '0.7'),
            shuffle: getParam('kiosk_shuffle') !== '0'
        };
    }

    function playTrack(index) {
        if (!audio || playlist.length === 0) return;
        currentIndex = index % playlist.length;
        var track = playlist[currentIndex];
        audio.src = track.url;
        try { audio.play(); } catch (e) { /* autoplay blocked */ }
        if (window._settingsUpdateTrack) window._settingsUpdateTrack(track.title);
    }

    function nextTrack() {
        playTrack((currentIndex + 1) % playlist.length);
    }

    function initMusic() {
        if (initialized) return;
        initialized = true;

        var params = getParams();
        if (!params.enabled) return;

        audio = new Audio();
        audio.volume = Math.max(0, Math.min(1, params.volume));
        audio.addEventListener('ended', nextTrack);
        audio.addEventListener('error', function () { setTimeout(nextTrack, 1000); });

        var xhr = new XMLHttpRequest();
        xhr.open('GET', ARCHIVE_XML, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status !== 200) {
                console.warn('[music] XML fetch failed, status:', xhr.status);
                audio = null;
                return;
            }
            var tracks = parsePlaylistFromXml(xhr.responseText);
            if (tracks.length === 0) {
                console.warn('[music] No tracks found in XML');
                audio = null;
                return;
            }
            if (params.shuffle) tracks = fisherYatesShuffle(tracks);
            playlist = tracks;
            playTrack(0);
        };
        xhr.onerror = function () {
            console.warn('[music] XML request failed, music disabled');
            audio = null;
        };
        xhr.send();
    }

    window.musicSetVolume = function (vol) {
        if (audio) audio.volume = Math.max(0, Math.min(1, vol));
    };

    window.musicSetEnabled = function (enabled) {
        if (!audio) return;
        if (enabled) { try { audio.play(); } catch (e) {} }
        else audio.pause();
    };

    window.musicGetCurrentTitle = function () {
        return (playlist[currentIndex] && playlist[currentIndex].title) ? playlist[currentIndex].title : '';
    };

    window.initMusic = initMusic;
})();
