/**
 * test_demo_smoke.js — DEMO SMOKE TEST
 *
 * Verifies the backend demo path works:
 *   1. Accepts a valid Google Maps URL
 *   2. Processes it through the real provider pipeline
 *   3. Returns a valid canonical business response
 *   4. Preserves identity
 *   5. Preserves provenance
 *   6. Returns structured coordinates where available
 *   7. Rejects malformed input
 *   8. Does not produce synthetic identity
 *
 * This is a LIVE test — it hits real providers (Geoapify, web extraction).
 * For deterministic CI testing that doesn't hit the network, see
 * test_demo_smoke_deterministic.js.
 *
 * Usage: node test_demo_smoke.js [googleMapsUrl]
 * If no URL provided, uses a well-known business (Blue Bottle Coffee SF).
 */

import BusinessDataExtractor from './src/services/BusinessDataExtractor.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import CanonicalBusinessProfileService from './src/services/CanonicalBusinessProfileService.js';
import GoogleMapsUrlParserProvider from './src/services/GoogleMapsUrlParserProvider.js';

const DEFAULT_URL = 'https://maps.google.com/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z';

const urls = process.argv[2] ? [process.argv[2]] : [DEFAULT_URL];

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

async function run() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  WEBLOOM DEMO SMOKE TEST (LIVE PIPELINE)');
  console.log('═══════════════════════════════════════════\n');

  // --- 1. Input validation tests (no network) ---
  console.log('--- 1. Input validation ---');
  check(GoogleMapsUrlParserProvider.validateGoogleMapsUrl(DEFAULT_URL), 'Valid Maps URL accepted');
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl('not-a-url'), 'Garbage rejected');
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl('https://example.com/foo'), 'Non-Google URL rejected');
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl(''), 'Empty string rejected');
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl(null), 'Null rejected');
  check(!GoogleMapsUrlParserProvider.validateGoogleMapsUrl('maps.google.com/place/X'), 'Missing protocol rejected');

  // --- 2. URL parsing (no network) ---
  console.log('\n--- 2. URL parsing ---');
  for (const url of urls) {
    console.log(`\n  Input: ${url}`);
    const parsed = GoogleMapsUrlParserProvider.parse(url);
    check(parsed.identified.placeName || parsed.identified.placeId || parsed.identified.coordinates || parsed.identified.query, 'Parser extracted at least one identifier');
    console.log(`    placeName: ${parsed.identified.placeName}`);
    console.log(`    placeId:   ${parsed.identified.placeId}`);
    console.log(`    coords:    ${JSON.stringify(parsed.identified.coordinates)}`);
    console.log(`    query:     ${parsed.identified.query}`);
    console.log(`    urlType:   ${parsed.identified.urlType}`);

    // --- 3. Full pipeline (LIVE — hits real providers) ---
    console.log('\n  --- 3. Full provider pipeline (LIVE) ---');
    const start = Date.now();
    try {
      const extractedData = await BusinessDataExtractor.extractFromGoogleMapsUrl(url);
      check(extractedData?.metadata?.originalUrl, 'Extraction produced metadata');
      
      const businessData = await BusinessResearchService.extractBusinessIntelligence(extractedData);
      check(businessData?.identity?.name, 'Business identity resolved');
      
      // Identity safety: name must not be synthetic
      const name = businessData?.identity?.name;
      check(
        name && !/^(unknown|unnamed business|n\/a|business|store|restaurant)$/i.test(String(name).trim()),
        'Identity is not synthetic',
        `name="${name}"`
      );
      
      // No provider ID as business name
      check(
        !String(name || '').startsWith('ChIJ') && !String(name || '').startsWith('cid:'),
        'Provider IDs never become identity',
        `name="${name}"`
      );
      
      // --- 4. Canonical projection ---
      console.log('\n  --- 4. Canonical projection ---');
      const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessData });
      check(canonical?.identity?.name === businessData.identity.name, 'Canonical preserves identity');
      check(canonical?.provenance, 'Canonical has provenance');
      check(canonical?.confidence, 'Canonical has confidence');
      check(canonical?.enrichment !== undefined, 'Canonical surfaces enrichment layer');
      
      const coords = canonical?.identity?.coordinates;
      if (coords) {
        check(typeof coords.lat === 'number' && typeof coords.lng === 'number', 'Coordinates are structured', JSON.stringify(coords));
      } else {
        check(true, 'Coordinates not available (ok for this input)');
      }
      
      // No synthetic identity in canonical
      const cnName = canonical?.identity?.name;
      check(
        !cnName || !/^(unknown|unnamed business|n\/a)$/i.test(String(cnName).trim()),
        'Canonical identity is never synthetic'
      );
      
      // AI provenance preserved
      const enrichment = canonical?.enrichment || {};
      check(
        enrichment.aiGenerated !== true || enrichment.aiExtracted === true,
        'AI provenance never masquerades as verified'
      );
      
      const duration = Date.now() - start;
      console.log(`\n  ✅ Pipeline completed in ${duration}ms`);
      console.log(`  Business: ${name}`);
      console.log(`  Address:  ${businessData?.location?.address || 'n/a'}`);
      console.log(`  Phone:    ${businessData?.contact?.phone || 'n/a'}`);
      console.log(`  Website:  ${businessData?.contact?.website || 'n/a'}`);
    } catch (err) {
      failCount++;
      const msg = `  ❌ Full pipeline failed: ${err?.message || err}`;
      console.log(msg);
      failures.push(msg);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(f));
  }
  console.log('═══════════════════════════════════════════\n');

  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});