const assert = require('assert');

function readKioskParams(searchParams) {
    return {
        music: searchParams.get('kiosk_music') !== '0',
        volume: parseFloat(searchParams.get('kiosk_vol') ?? '0.7'),
        shuffle: searchParams.get('kiosk_shuffle') !== '0',
        locMode: searchParams.get('kiosk_loc_mode') ?? 'auto',
        wide: searchParams.get('settings-wide-checkbox') === 'true',
        units: searchParams.get('settings-units-select') ?? 'us',
        speed: searchParams.get('settings-speed-select') ?? '1.0',
    };
}

function writeKioskParams(urlStr, values) {
    const u = new URL(urlStr);
    u.searchParams.set('kiosk_music', values.music ? '1' : '0');
    u.searchParams.set('kiosk_vol', String(values.volume));
    u.searchParams.set('kiosk_shuffle', values.shuffle ? '1' : '0');
    u.searchParams.set('kiosk_loc_mode', values.locMode);
    u.searchParams.set('settings-wide-checkbox', values.wide ? 'true' : 'false');
    u.searchParams.set('settings-units-select', values.units);
    u.searchParams.set('settings-speed-select', values.speed);
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

console.log(`\n${passed} tests passed`);
