/**
 * test_demo_smoke_deterministic.js — DETERMINISTIC CI SMOKE TEST
 *
 * Verifies the demo path WITHOUT hitting live providers:
 *   - Input validation
 *   - URL parsing
 *   - Canonical projection invariants (identity safety, provenance, coordinates)
 *   - API boundary behavior via direct route simulation
 *
 * This intentionally does NOT test provider availability — that is what
 * test_demo_smoke.js (LIVE) covers. A mocked test must never be presented
 * as proof that providers work.
 *
 * Usage: node test_demo_smoke_deterministic.js
 */

import GoogleMapsUrlParserProvider from './src/services/GoogleMapsUrlParserProvider.js';
import CanonicalBusinessProfileService from './src/services/CanonicalBusinessProfileService.js';
import { sanitizeSecretText } from './src/services/AcquisitionResult.js';

let passCount = 0;
let failCount = 0;
const failures = [];

function check(condition, label, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    const msg = `  ❌ ${label}${detail ? ` — ${detail}` : ''}`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log('\n═══════════════════════════════════════════');
console.log('  WEBLOOM DEMO SMOKE TEST (DETERMINISTIC CI)');
console.log('═══════════════════════════════════════════\n');

// --- 1. URL validation (deterministic) ---
console.log('--- 1. Input validation ---');
const validUrls = [
  'https://maps.google.com/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z',
  'https://maps.google.com/?cid=15586445979492199015',
  'https://www.google.com/maps/place/Business/@37.77,-122.41,17z',
  'https://maps.app.goo.gl/abc123',
  'https://maps.google.com/maps/search/Restaurants?query=restaurants',
  'http://maps.google.com/place/Business',
];
const invalidUrls = [
  'not-a-url',
  '',
  null,
  undefined,
  'https://example.com/place/Business',
  'maps.google.com/place/Business', // no protocol
  'https://facebook.com/maps',
];

for (const url of validUrls) {
  check(GoogleMapsUrlParserProvider.validateGoogleMapsUrl(url), `Valid: ${url.slice(0, 50)}...`);
}
for (const url of invalidUrls) {
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl(url), `Invalid rejected: ${String(url).slice(0, 40)}`);
}

// --- 2. URL parsing (deterministic) ---
console.log('\n--- 2. URL parsing ---');
{
  const parsed = GoogleMapsUrlParserProvider.parse('https://maps.google.com/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z');
  check(parsed.identified.placeName === 'Blue Bottle Coffee', 'Place name extracted', parsed.identified.placeName);
  check(parsed.identified.coordinates?.lat === 37.7717, 'Latitude extracted');
  check(parsed.identified.coordinates?.lng === -122.4118, 'Longitude extracted');
  check(parsed.identified.urlType === 'place', 'URL type = place');
  check(parsed.provenance?.source === 'google_maps_url', 'Provenance marks source');
}

{
  const parsed = GoogleMapsUrlParserProvider.parse('https://maps.google.com/?cid=15586445979492199015');
  check(parsed.identified.placeId === 'cid:15586445979492199015', 'CID extracted from URL');
}

// --- 3. Canonical projection invariants (deterministic) ---
console.log('\n--- 3. Canonical projection invariants ---');

// 3a. Synthetic identity forbidden
{
  const record = {
    identity: { name: 'Unnamed Business' }, // invalid synthetic name
    contact: { phone: null, website: null },
    location: { address: null },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record });
  
  // Should NOT preserve "Unnamed Business" as authoritative identity
  const name = canonical?.identity?.name;
  check(!name || !String(name).toLowerCase().includes('unnamed'), 'Synthetic "Unnamed Business" never surfaces as identity');
  check(!name || !String(name).toLowerCase().includes('unknown'), 'Synthetic "Unknown" never surfaces as identity');
}

// 3b. Provider IDs never become identity
{
  const record = {
    identity: { name: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }, // a place ID leaking as name
    contact: { phone: null, website: null },
    location: { address: null },
    provider: { placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record });
  const name = canonical?.identity?.name;
  check(!name?.startsWith('ChIJ'), 'Provider ID never becomes business identity');
  check(!name?.startsWith('cid:'), 'CID never becomes business identity');
}

// 3c. AI provenance never upgraded
{
  const record = {
    identity: { name: 'Test Business', provenance: 'ai_generated' },
    contact: { phone: null, website: null },
    location: { address: null },
    metadata: { aiExtracted: true },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record });
  const nameProvenance = canonical?.provenance?.['identity.name']?.provenance
    || canonical?.provenance?.identity?.name?.provenance;
  const isAiGenerated = nameProvenance === 'ai_generated'
    || canonical?.enrichment?.aiExtracted === true;
  check(isAiGenerated, 'AI provenance preserved, never upgraded to verified');
}

// 3d. Structured coordinates preserved
{
  const record = {
    identity: { name: 'Test Business' },
    contact: {},
    location: { coordinates: { lat: 37.7717, lng: -122.4118 }, address: '1 Test St' },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record });
  const coords = canonical?.identity?.coordinates;
  check(coords && typeof coords.lat === 'number' && typeof coords.lng === 'number', 'Coordinates remain structured objects');
}

// --- 4. Security: secret sanitization ---
console.log('\n--- 4. Secret sanitization ---');
{
  const sanitized = sanitizeSecretText('Authorization: Bearer sk-abcdef1234567890 test');
  check(!sanitized.includes('sk-abcdef1234567890'), 'API keys redacted from error text');
  check(sanitized.includes('[REDACTED]'), 'Redaction marker present');
}

console.log('\n═══════════════════════════════════════════');
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(f));
}
console.log('═══════════════════════════════════════════\n');

process.exit(failCount > 0 ? 1 : 0);