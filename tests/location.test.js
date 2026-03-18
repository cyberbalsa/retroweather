const assert = require('assert');

function buildLatLonParam(lat, lon) {
    return encodeURIComponent(JSON.stringify({ lat, lon }));
}

function parseManualLatLon(input) {
    const parts = input.trim().split(',').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    const [lat, lon] = parts;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

let passed = 0;

{
    const encoded = buildLatLonParam(28.431, -81.308);
    const decoded = JSON.parse(decodeURIComponent(encoded));
    assert.strictEqual(decoded.lat, 28.431);
    assert.strictEqual(decoded.lon, -81.308);
    console.log('✓ buildLatLonParam encodes lat/lon to URL-encoded JSON');
    passed++;
}

{
    const result = parseManualLatLon('40.7128, -74.0060');
    assert.deepStrictEqual(result, { lat: 40.7128, lon: -74.006 });
    console.log('✓ parseManualLatLon parses valid lat,lon string');
    passed++;
}

{
    assert.strictEqual(parseManualLatLon('New York'), null);
    assert.strictEqual(parseManualLatLon('999, 0'), null);
    assert.strictEqual(parseManualLatLon(''), null);
    console.log('✓ parseManualLatLon rejects invalid input');
    passed++;
}

console.log(`\n${passed} tests passed`);
