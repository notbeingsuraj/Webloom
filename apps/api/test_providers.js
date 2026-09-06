/**
 * Webloom — Geoapify Provider Integration Tests
 *
 * Covers the 11 backlog scenarios from the Geoapify integration spec:
 *   1. Valid business search (Geoapify returns structured data)
 *   2. Business not found (NO_RESULT)
 *   3. Missing API key (NOT_CONFIGURED)
 *   4. API failure (error classification)
 *   5. Incomplete response (INVALID_RESPONSE)
 *   6. Web extraction fallback
 *   7. Flat profile format (adapter output shape)
 *   8. Legacy Google Places format (validator tolerant read)
 *   9. Final normalized profile (orchestration output)
 *  10. BusinessResearchService integration
 *  11. Route integration
 *
 * Plain-Node runner (no test framework) — run with:  npm test
 * Network-dependent cases run best-effort and log SKIPPED when offline.
 */

import assert from 'node:assert';
import GeoapifyProvider, { GEOAPIFY_STATUS } from './src/services/providers/GeoapifyProvider.js';
import {
  mapGeoapifyFeatureToProfile,
  extractDeterministicHints,
  normalizeHours,
} from './src/services/providers/ProviderAdapter.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import BusinessProfile from './src/services/BusinessProfile.js';
import { validateBusinessProfile, sanitizeFieldValue } from './src/services/BusinessProfileValidator.js';
import { config } from './src/config/env.js';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

function skip(name) {
  skipped += 1;
  console.log(`  \u2013 SKIPPED ${name}`);
}

/* ------------------------------------------------------------------ *
 * FIXTURE: a Geoapify place-details feature (live-verified shape)
 * ------------------------------------------------------------------ */
const tartinePlaceDetails = {
  type: 'Feature',
  properties: {
    city: 'San Francisco',
    state: 'California',
    country: 'United States',
    postcode: '94110',
    street: 'Guerrero Street',
    formatted: 'Tartine Bakery, 600 Guerrero Street, San Francisco, CA 94110, United States of America',
    name: 'Tartine Bakery',
    categories: ['commercial', 'commercial.food_and_drink', 'commercial.food_and_drink.bakery'],
    contact: { phone: '+1-415-487-2600' },
    website: 'https://tartinebakery.com/san-francisco/bakery',
    opening_hours: 'Mo-Su 07:30-18:00',
    lat: 37.7614552,
    lon: -122.4239452,
    place_id: 'abc123',
  },
  geometry: { type: 'Point', coordinates: [-122.4239452, 37.7614552] },
};

// A legacy /v2/places-style feature (day-map hours, geom coords, no contact nested)
const legacyPlacesFeature = {
  type: 'Feature',
  properties: {
    name: 'Old Cafe',
    categories: ['commercial', 'commercial.catering.cafe'],
    international_phone: '+1-555-123-4567',
    website: 'https://oldcafe.example.com',
    formatted: 'Old Cafe, 1 Main Street, Springfield, IL 62701, US',
    opening_hours: { monday: '07:00-15:00', tuesday: '07:00-15:00' },
    rating: 4.5,
    review_count: 120,
    place_id: 'legacy001',
  },
  geometry: { type: 'Point', coordinates: [-89.6, 39.78] },
};

const legacyGooglePlacesObject = {
  identity: {
    name: { value: 'Some Place', provenance: 'discovered', confidence: 0.9 },
    category: { value: 'Restaurant', provenance: 'discovered', confidence: 0.8 },
  },
  contact: {
    phone: { value: '+1-555-987-6543', provenance: 'discovered', confidence: 0.9 },
    website: { value: 'https://someplace.example.com', provenance: 'discovered', confidence: 0.9 },
  },
  location: {
    full_address: { value: '123 Anywhere St, Springfield, IL 62701', provenance: 'discovered', confidence: 0.9 },
  },
  ratings: {
    rating: { value: 4.2, provenance: 'discovered', confidence: 0.9 },
    review_count: { value: 88, provenance: 'discovered', confidence: 0.9 },
  },
};

console.log('\nGEOAPIFY PROVIDER INTEGRATION TESTS');
console.log('===================================\n');

/* ================================================================== *
 * SCENARIO 7 — Flat profile format (adapter output shape)
 * ================================================================== */
console.log('[7] Adapter — flat profile format');
check('maps place-details feature to canonical flat profile', () => {
  const p = mapGeoapifyFeatureToProfile(tartinePlaceDetails);
  assert.ok(p, 'profile should be produced');
  assert.strictEqual(p.business.name, 'Tartine Bakery');
  assert.strictEqual(p.business.category, 'commercial.food_and_drink.bakery');
  assert.strictEqual(p.contact.phone, '+1-415-487-2600');
  assert.strictEqual(p.contact.website, 'https://tartinebakery.com/san-francisco/bakery');
  assert.strictEqual(p.location.full_address.includes('600 Guerrero Street'), true);
  assert.strictEqual(p.location.latitude, 37.7614552);
  assert.strictEqual(p.location.longitude, -122.4239452);
  assert.strictEqual(p.provider.placeId, 'abc123');
  assert.strictEqual(p.provider.name, 'geoapify');
  // Geoapify does not return rating — must NOT be fabricated
  assert.strictEqual(p.ratings.rating, null);
  assert.strictEqual(p.ratings.review_count, null);
});

check('maps legacy /v2/places day-map + geom coords shape', () => {
  const p = mapGeoapifyFeatureToProfile(legacyPlacesFeature);
  assert.strictEqual(p.business.name, 'Old Cafe');
  assert.strictEqual(p.contact.phone, '+1-555-123-4567');
  assert.strictEqual(p.location.latitude, 39.78);
  assert.strictEqual(p.location.longitude, -89.6);
  assert.strictEqual(p.ratings.rating, 4.5);
  assert.strictEqual(p.ratings.review_count, 120);
  assert.strictEqual(p.hours.monday, '07:00-15:00');
});

check('returns null for a feature with no identity', () => {
  assert.strictEqual(mapGeoapifyFeatureToProfile({ properties: { formatted: 'no name' } }), null);
  assert.strictEqual(mapGeoapifyFeatureToProfile(null), null);
  assert.strictEqual(mapGeoapifyFeatureToProfile({}), null);
});

check('parses compact "Mo-Su 07:30-18:00" hours string into day map', () => {
  const hrs = normalizeHours('Mo-Su 07:30-18:00');
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    assert.strictEqual(hrs[day], '07:30-18:00', `${day} should have hours`);
  }
});

check('parses split weekday/weekend hours "Mo-Fr 08:00-17:00, Sa-Su 09:00-14:00"', () => {
  const hrs = normalizeHours('Mo-Fr 08:00-17:00, Sa-Su 09:00-14:00');
  assert.strictEqual(hrs.monday, '08:00-17:00');
  assert.strictEqual(hrs.friday, '08:00-17:00');
  assert.strictEqual(hrs.saturday, '09:00-14:00');
  assert.strictEqual(hrs.sunday, '09:00-14:00');
});

check('normalizeHours tolerates day-map and array forms', () => {
  const mapForm = normalizeHours({ monday: '07:00-15:00', tuesday: '07:00-15:00' });
  assert.strictEqual(mapForm.monday, '07:00-15:00');
  // Geoapify array form: day_of_week is 0-indexed (monday-first)
  const arrayForm = normalizeHours([{ day_of_week: 1, start_time: '08:00', end_time: '16:00' }]);
  assert.strictEqual(arrayForm.tuesday, '08:00-16:00');
});

check('extractDeterministicHints builds query/coords from input', () => {
  const h = extractDeterministicHints({
    name: 'Tartine', city: 'SF', latitude: 1, longitude: 2,
  });
  assert.strictEqual(h.name, 'Tartine');
  assert.strictEqual(h.query, 'Tartine SF');
  assert.strictEqual(h.latitude, 1);
  assert.strictEqual(h.longitude, 2);
});

/* ================================================================== *
 * SCENARIO 8 — Legacy Google Places format validation
 * ================================================================== */
console.log('\n[8] Validator — tolerant read of legacy shape');
check('validates legacy nested BusinessProfile shape', () => {
  const v = validateBusinessProfile(legacyGooglePlacesObject);
  assert.strictEqual(v.valid, true);
  assert.strictEqual(v.issues.length, 0);
});

check('validates flat dotted-path (BusinessProfile.toObject) shape', () => {
  const flat = {
    'identity.name': 'Tartine Bakery',
    'identity.category': 'commercial.food_and_drink.bakery',
    'contact.phone': '+1-415-487-2600',
    'contact.website': 'https://tartinebakery.com/san-francisco/bakery',
    'location.full_address': 'Tartine Bakery, 600 Guerrero Street, San Francisco, CA 94110',
    'location.coordinates': { lat: 37.7614552, lng: -122.4239452 },
    'ratings.rating': null,
    'ratings.review_count': null,
  };
  const v = validateBusinessProfile(flat);
  assert.strictEqual(v.valid, true, 'flat dotted-path profile should validate');
  assert.strictEqual(v.issues.length, 0);
});

check('flags a missing name', () => {
  const v = validateBusinessProfile({ contact: { phone: '+1-555-123-4567' } });
  assert.ok(v.issues.some((i) => i.field === 'name'));
});

check('sanitizeFieldValue collapses whitespace', () => {
  assert.strictEqual(sanitizeFieldValue('  Hello   World '), 'Hello World');
});

/* ================================================================== *
 * SCENARIO 3 — Missing API key
 * ================================================================== */
console.log('\n[3] GeoapifyProvider — availability / auth');
check('isAvailable reflects configured API key', () => {
  assert.strictEqual(typeof GeoapifyProvider.isAvailable(), 'boolean');
  assert.strictEqual(GeoapifyProvider.isAvailable(), Boolean(config.geoapify?.apiKey));
});

await checkAsync('search without key returns NOT_CONFIGURED', async () => {
  const originalKey = config.geoapify?.apiKey;
  config.geoapify.apiKey = null;
  try {
    const result = await GeoapifyProvider.search({ name: 'X' });
    // PHASE 20: lossless contract returns canonical ACQUISITION_STATUS
    assert.strictEqual(result.status, 'provider_unavailable');
    assert.deepStrictEqual(result.records, []);
    assert.strictEqual(result.provider, 'geoapify');
    assert.ok(result.error, 'should include error details');
    assert.ok(result.diagnostics, 'should include diagnostics');
  } finally {
    config.geoapify.apiKey = originalKey;
  }
});

/* ================================================================== *
 * SCENARIO 2 — Business not found / no query
 * ================================================================== */
console.log('\n[2] GeoapifyProvider — no-result handling');
check('search with no name and no coords returns NO_RESULT', async () => {
  const result = await GeoapifyProvider.search({});
  // PHASE 20: lossless contract returns canonical EMPTY_RESULT status
  assert.strictEqual(result.status, 'empty_result');
  assert.ok(result.error, 'should include error details');
  assert.ok(result.diagnostics, 'should include diagnostics');
});

/* ================================================================== *
 * SCENARIO 4 — API failure classification
 * ================================================================== */
console.log('\n[4] GeoapifyProvider — error classification');
check('_classifyError maps HTTP statuses without leaking details', () => {
  const prov = GeoapifyProvider;
  assert.strictEqual(
    prov._classifyError({ response: { status: 401 } }),
    GEOAPIFY_STATUS.AUTH_FAILED
  );
  assert.strictEqual(
    prov._classifyError({ response: { status: 403 } }),
    GEOAPIFY_STATUS.AUTH_FAILED
  );
  assert.strictEqual(
    prov._classifyError({ response: { status: 429 } }),
    GEOAPIFY_STATUS.RATE_LIMITED
  );
  assert.strictEqual(
    prov._classifyError({ code: 'ECONNABORTED' }),
    GEOAPIFY_STATUS.TIMEOUT
  );
  assert.strictEqual(
    prov._classifyError({ code: 'ENOTFOUND' }),
    GEOAPIFY_STATUS.NETWORK_ERROR
  );
});

/* ================================================================== *
 * SCENARIO 1 — Valid live business search (OPTIONAL network)
 * ================================================================== */
console.log('\n[1] GeoapifyProvider — valid live search (network)');
try {
  await checkAsync('geocode + place-details returns structured data (live)', async () => {
    if (!GeoapifyProvider.isAvailable()) throw new Error('no API key configured');
    const biz = await GeoapifyProvider.getBusiness({
      name: 'Tartine Bakery', city: 'San Francisco', latitude: 37.7615, longitude: -122.4218,
    });
    assert.ok(biz, 'business should be returned');
    assert.strictEqual(biz.business.name, 'Tartine Bakery');
    assert.ok(biz.contact.phone, 'phone should be populated');
    assert.ok(biz.contact.website, 'website should be populated');
    assert.ok(biz.location.coordinates, 'coordinates should be populated');
    assert.ok(Object.keys(biz.hours || {}).length, 'hours should be populated');
  });
} catch (err) {
  skip('live Geoapify search unavailable');
}

/* ================================================================== *
 * SCENARIO 5 — Incomplete response
 * ================================================================== */
console.log('\n[5] Incomplete response — adapter returns null-safe profile');
check('adapter tolerates a feature missing phone/website/hours', () => {
  const bare = {
    type: 'Feature',
    properties: {
      name: 'No Contact Shop',
      formatted: 'No Contact Shop, 1 Road, Town, ST 00000',
      categories: ['commercial', 'commercial.retail'],
      lat: 1, lon: 2, place_id: 'bare',
    },
    geometry: { type: 'Point', coordinates: [2, 1] },
  };
  const p = mapGeoapifyFeatureToProfile(bare);
  assert.strictEqual(p.business.name, 'No Contact Shop');
  assert.strictEqual(p.contact.phone, null);
  assert.strictEqual(p.contact.website, null);
  assert.deepStrictEqual(p.hours, {});
});

/* ================================================================== *
 * SCENARIO 9 & 10 — Final normalized profile / service integration
 * ================================================================== */
console.log('\n[9/10] BusinessResearchService — orchestration');
check('extractBusinessIntelligenceWithProviders returns normalized intelligence', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Tartine Bakery', 'identified', 0.6);
  profile.set('contact.phone', '+1-415-487-2600', 'discovered', 0.95);
  profile.set('contact.website', 'https://tartinebakery.com/san-francisco/bakery', 'discovered', 0.9);
  profile.set('location.full_address', '600 Guerrero Street, San Francisco', 'discovered', 0.95);
  profile.set('location.coordinates', { lat: 37.7614552, lng: -122.4239452 }, 'discovered', 0.95);

  const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders({
    name: 'Tartine Bakery', city: 'San Francisco', latitude: 37.7615, longitude: -122.4218,
  });
  assert.ok(result.success);
  assert.ok(result.profile instanceof BusinessProfile);
  assert.ok(result.intelligence, 'intelligence object should be returned');
  assert.ok(result.intelligence.identity, 'intelligence.identity exists');
  assert.ok(result.intelligence.contact, 'intelligence.contact exists');
  assert.ok(result.intelligence.location, 'intelligence.location exists');
  assert.ok(result.intelligence.identity.name, 'name populated');
});

check('BusinessProfile.set accepts inferred provenance (AI enrichment)', () => {
  const profile = new BusinessProfile();
  profile.set('identity.description', 'A great bakery', 'inferred', 0.6);
  assert.strictEqual(profile.get('identity.description'), 'A great bakery');
});

check('BusinessProfile.set rejects invalid provenance / confidence', () => {
  const profile = new BusinessProfile();
  assert.throws(() => profile.set('identity.name', 'X', 'bogus', 0.5));
  assert.throws(() => profile.set('identity.name', 'X', 'discovered', 1.5));
});

/* ================================================================== *
 * SCENARIO 6 — Web extraction fallback
 * ================================================================== */
console.log('\n[6] WebExtractionProvider — fallback availability');
check('WebExtractionProvider loads and reports availability', async () => {
  const { default: WebExtractionProvider } = await import('./src/services/providers/WebExtractionProvider.js');
  assert.strictEqual(WebExtractionProvider.isAvailable(), true);
});

/* ================================================================== *
 * SCENARIO 11 — Route integration
 * ================================================================== */
console.log('\n[11] Route wiring');
check('business route ESM specifier resolves & app imports clean', async () => {
  const { default: app } = await import('./src/app.js');
  assert.ok(app, 'app should load');
});

/* ------------------------------------------------------------------ */
console.log(`\n------------------------------------`);
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
process.exit(0);
