const assert = require('assert');

const ARCHIVE_BASE = 'https://archive.org/download/weatherscancompletecollection/';

function parsePlaylistFromXml(xmlStr) {
    const result = [];
    // Match source=original files only (not derivatives)
    const fileRegex = /<file\s+name="([^"]+)"\s+source="original"([\s\S]*?)<\/file>/g;
    let match;
    while ((match = fileRegex.exec(xmlStr)) !== null) {
        const filename = match[1];
        const body = match[2];
        if (!/<format>VBR MP3<\/format>/.test(body)) continue;
        const titleMatch = body.match(/<title>([^<]+)<\/title>/);
        result.push({
            url: ARCHIVE_BASE + encodeURIComponent(filename),
            title: titleMatch ? titleMatch[1] : filename.replace(/\.\w+$/, '')
        });
    }
    return result;
}

function fisherYatesShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let passed = 0;

// parsePlaylistFromXml — only source=original MP3s
{
    const xml = `<files>
  <file name="01 Fair Weather.mp3" source="original">
    <format>VBR MP3</format><title>Fair Weather</title>
  </file>
  <file name="01 Fair Weather.ogg" source="derivative">
    <format>Ogg Vorbis</format><original>01 Fair Weather.mp3</original>
  </file>
  <file name="Weatherscan Track 1.mp3" source="original">
    <format>VBR MP3</format>
  </file>
</files>`;
    const pl = parsePlaylistFromXml(xml);
    assert.strictEqual(pl.length, 2, 'Both original MP3s, no derivatives');
    assert.ok(pl[0].url.includes('01%20Fair%20Weather.mp3'));
    assert.strictEqual(pl[0].title, 'Fair Weather');
    console.log('✓ parsePlaylistFromXml extracts source=original MP3s only');
    passed++;
}

// URL encoding of spaces
{
    const xml = `<files>
  <file name="Weatherscan Track 3.mp3" source="original">
    <format>VBR MP3</format>
  </file>
</files>`;
    const pl = parsePlaylistFromXml(xml);
    assert.ok(pl[0].url.includes('Weatherscan%20Track%203.mp3'));
    assert.ok(pl[0].url.startsWith(ARCHIVE_BASE));
    console.log('✓ parsePlaylistFromXml URL-encodes spaces in filename');
    passed++;
}

// Fisher-Yates preserves elements
{
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = fisherYatesShuffle(arr);
    assert.strictEqual(shuffled.length, arr.length);
    assert.deepStrictEqual([...shuffled].sort((a, b) => a - b), arr);
    console.log('✓ fisherYatesShuffle preserves all elements');
    passed++;
}

console.log(`\n${passed} tests passed`);
