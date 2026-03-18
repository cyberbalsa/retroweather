const assert = require('assert');

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

let passed = 0;

// readKioskParams — defaults for empty query string
{
    const p = new URLSearchParams('');
    const params = readKioskParams(p);
    assert.strictEqual(params.music, true);
    assert.strictEqual(params.volume, 0.7);
    assert.strictEqual(params.shuffle, true);
    assert.strictEqual(params.locMode, 'auto');
    console.log('✓ readKioskParams returns correct defaults');
    passed++;
}

// readKioskParams — explicit values
{
    const p = new URLSearchParams('kiosk_music=0&kiosk_vol=0.3&kiosk_shuffle=0&kiosk_loc_mode=manual');
    const params = readKioskParams(p);
    assert.strictEqual(params.music, false);
    assert.strictEqual(params.volume, 0.3);
    assert.strictEqual(params.shuffle, false);
    assert.strictEqual(params.locMode, 'manual');
    console.log('✓ readKioskParams reads explicit values correctly');
    passed++;
}

// writeKioskParams preserves existing ws4kp params
{
    const url = 'file:///android_asset/ws4kp/index.html?settings-kiosk-checkbox=true';
    const updated = writeKioskParams(url, {
        music: false, volume: 0.5, shuffle: false,
        locMode: 'auto', wide: true, units: 'si', speed: '1.25'
    });
    const p = new URL(updated).searchParams;
    assert.strictEqual(p.get('kiosk_music'), '0');
    assert.strictEqual(p.get('kiosk_vol'), '0.5');
    assert.strictEqual(p.get('settings-kiosk-checkbox'), 'true'); // preserved
    assert.strictEqual(p.get('settings-units-select'), 'si');
    console.log('✓ writeKioskParams preserves existing params');
    passed++;
}

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

console.log(`\n${passed} tests passed`);
