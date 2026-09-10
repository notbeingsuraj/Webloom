/**
 * test_demo_urls.js — Google Maps URL compatibility audit (Demo hardening)
 *
 * Tests GoogleMapsUrlParserProvider against real-world Google Maps URL formats:
 *   1. Standard place URL:  maps.google.com/place/BusinessName/@lat,lng,17z
 *   2. CID URL:             maps.google.com/?cid=1234567890
 *   3. Place ID URL:        maps.google.com/place/?q=place_id:ChIJ...
 *   4. Coordinates URL:     maps.google.com/@lat,lng,15z
 *   5. Share/copy-link:     maps.app.goo.gl/abc123 (short URL - hostname only)
 *   6. Tracking params:     maps.google.com/place/Business/?utm_source=x&gclid=y
 *   7. Query params:        maps.google.com/maps/search/Restaurant?query=...&hl=en
 *   8. Trailing slash:      maps.google.com/place/Business/
 *   9. Encoded business:    maps.google.com/place/Blue+Bottle+Coffee/@37.77,-122.41,17z
 *  10. Regional host:       www.google.co.uk/maps/place/Business/@51.50,-0.12,17z
 *  11. Non-Google URL:      example.com (must FAIL)
 *  12. Malformed URL:       "not a url" (must FAIL)
 */

import GoogleMapsUrlParserProvider from './src/services/GoogleMapsUrlParserProvider.js';

const tests = [
  {
    name: 'Standard place URL',
    url: 'https://maps.google.com/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z',
    valid: true,
    expect: { placeName: 'Blue Bottle Coffee', coordinates: { lat: 37.7717, lng: -122.4118 } },
  },
  {
    name: 'CID URL',
    url: 'https://maps.google.com/?cid=15586445979492199015',
    valid: true,
    expect: { placeId: 'cid:15586445979492199015' },
  },
  {
    name: 'Place ID URL (query)',
    url: 'https://maps.google.com/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4',
    valid: true,
  },
  {
    name: 'Place ID in data path',
    url: 'https://www.google.com/maps/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z/data=!4m5!3m4!1s0x808f7e2f3b5f9d81:0x115d69a81d7b0d5e!8m2!3d37.7717!4d-122.4118',
    valid: true,
    expect: { placeId: '0x808f7e2f3b5f9d81:0x115d69a81d7b0d5e' },
  },
  {
    name: 'Coordinates-only URL',
    url: 'https://maps.google.com/@37.7717,-122.4118,17z',
    valid: true,
    expect: { coordinates: { lat: 37.7717, lng: -122.4118 } },
  },
  {
    name: 'Share/copy-link (goo.gl short)',
    url: 'https://maps.app.goo.gl/abc123xyz',
    valid: true,
  },
  {
    name: 'Tracking params',
    url: 'https://maps.google.com/maps/place/Blue+Bottle+Coffee/?utm_source=share&utm_campaign=test&gclid=abc123',
    valid: true,
    expect: { placeName: 'Blue Bottle Coffee' },
  },
  {
    name: 'Search URL with query param',
    url: 'https://maps.google.com/maps/search/Restaurants+near+me?query=restaurants&hl=en',
    valid: true,
    expect: { query: 'restaurants' },
  },
  {
    name: 'Trailing slash variation',
    url: 'https://maps.google.com/place/Blue+Bottle+Coffee/',
    valid: true,
    expect: { placeName: 'Blue Bottle Coffee' },
  },
  {
    name: 'Encoded business name',
    url: 'https://maps.google.com/place/The+French+Laundry/@38.3529,-122.5054,17z',
    valid: true,
    expect: { placeName: 'The French Laundry' },
  },
  {
    name: 'Regional host (google.co.uk)',
    url: 'https://www.google.co.uk/maps/place/Cafe+Deluxe/@51.5125,-0.1234,17z',
    valid: true,
    expect: { placeName: 'Cafe Deluxe' },
  },
  {
    name: 'Non-Google URL (must fail)',
    url: 'https://example.com/business/123',
    valid: false,
  },
  {
    name: 'Malformed URL (must fail)',
    url: 'not a url at all',
    valid: false,
  },
  {
    name: 'No protocol (must fail)',
    url: 'maps.google.com/place/Business',
    valid: false,
  },
  {
    name: 'HTTP (must pass)',
    url: 'http://maps.google.com/place/Business/@37.77,-122.41,17z',
    valid: true,
  },
];

let passCount = 0;
let failCount = 0;
const failures = [];

for (const test of tests) {
  const valid = GoogleMapsUrlParserProvider.validateGoogleMapsUrl(test.url);
  const pass = valid === test.valid;
  
  if (!pass) {
    failCount++;
    failures.push(`  ❌ ${test.name}: expected valid=${test.valid}, got ${valid}`);
    continue;
  }
  passCount++;

  // Verify extractions when expectations given
  if (test.expect && valid) {
    let ok = true;
    const issues = [];
    const parsed = GoogleMapsUrlParserProvider.parse(test.url);
    
    if (test.expect.placeName !== undefined) {
      const name = parsed.identified.placeName;
      if (name !== test.expect.placeName) {
        ok = false;
        issues.push(`placeName expected "${test.expect.placeName}", got "${name}"`);
      }
    }
    if (test.expect.coordinates !== undefined) {
      const coords = parsed.identified.coordinates;
      if (!coords || Math.abs(coords.lat - test.expect.coordinates.lat) > 0.001 || Math.abs(coords.lng - test.expect.coordinates.lng) > 0.001) {
        ok = false;
        issues.push(`coordinates expected ${JSON.stringify(test.expect.coordinates)}, got ${JSON.stringify(coords)}`);
      }
    }
    if (test.expect.placeId !== undefined) {
      const pid = parsed.identified.placeId;
      if (pid !== test.expect.placeId) {
        ok = false;
        issues.push(`placeId expected "${test.expect.placeId}", got "${pid}"`);
      }
    }
    if (test.expect.query !== undefined) {
      const q = parsed.identified.query;
      if (q !== test.expect.query) {
        ok = false;
        issues.push(`query expected "${test.expect.query}", got "${q}"`);
      }
    }

    if (!ok) {
      failCount++;
      failures.push(`  ❌ ${test.name} extraction: ${issues.join('; ')}`);
    } else {
      passCount++;
    }
  }
}

console.log(`\n=== Google Maps URL Compatibility Audit ===`);
console.log(`Total tests: ${tests.length}`);
console.log(`PASS: ${passCount}`);
console.log(`FAIL: ${failCount}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(f));
}

// Normalization check
console.log('\n=== URL Normalization Checks ===');
const normTests = [
  ['https://maps.google.com/place/Business/?utm_source=x&gclid=abc', 'https://maps.google.com/place/Business/'],
  ['https://www.google.com/maps/place/Business/', 'https://maps.google.com/place/Business/'],
];
for (const [input, _expected] of normTests) {
  const normalized = GoogleMapsUrlParserProvider.normalizeUrl(input);
  console.log(`  ${input}\n    → ${normalized}`);
}

process.exit(failCount > 0 ? 1 : 0);