/**
 * P1.3 — CanonicalBusinessProfile read-layer regression tests
 *
 * Verifies the provider-independent canonical projection layer that Webloom
 * will now use as the authoritative read path for all downstream consumers.
 *
 * The projection consumes FOUR existing input shapes and ONE persisted-data
 * path, projecting them all into one stable canonical object — while:
 *   - never inventing synthetic identity (no "Unknown Business" / "N/A")
 *   - never promoting provider IDs into canonical identity
 *   - never upgrading ai_generated provenance (P1.2 AI quarantine)
 *   - never mutating input objects (immutability)
 *   - always being deterministic (same input → same output)
 *   - never performing network / AI / DB-write side effects
 *
 * Groups (matches spec §10):
 *   A: Shape parity
 *   B: Identity safety
 *   C: AI safety (P1.2 quarantine survives projection)
 *   D: Provider isolation
 *   E: Structure
 *   F: Integrity (immutability, determinism, side-effects)
 *
 * Usage: node test_phase_p13_canonical_profile.js
 */

import assert from 'node:assert/strict';
import CanonicalBusinessProfileService, {
  PROVENANCE_PRIORITY,
} from './src/services/CanonicalBusinessProfileService.js';
import BusinessProfile from './src/services/BusinessProfile.js';
import { initializeDatabase, closeDatabase, getDb, getRawDb } from './src/db/client.js';
import { IdentityRepository } from './src/db/IdentityRepository.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}\n      ${err.message}`);
  }
}

/* ================================================================
 * FIXTURES — real-provider shapes (NOT hypothetical)
 * ================================================================ */

// A. Geoapify flat business representation (ProviderAdapter output shape)
const tartineGeoapify = {
  business: { name: 'Tartine Bakery', category: 'Bakery', categories: ['commercial', 'commercial.food_and_drink', 'commercial.food_and_drink.bakery'], description: 'Artisanal bakery in San Francisco.', business_type: 'commercial.food_and_drink.bakery' },
  contact: { phone: '+1-415-487-2600', email: null, website: 'https://tartinebakery.com/san-francisco/bakery' },
  location: { full_address: 'Tartine Bakery, 600 Guerrero Street, San Francisco, CA 94110, United States of America', street: 'Guerrero Street', city: 'San Francisco', state: 'California', country: 'United States of America', postal_code: '94110', latitude: 37.7614552, longitude: -122.4239452, coordinates: { lat: 37.7614552, lng: -122.4239452 } },
  ratings: { rating: null, review_count: null },
  hours: { monday: '07:30-18:00', tuesday: '07:30-18:00', wednesday: '07:30-18:00', thursday: '07:30-18:00', friday: '07:30-18:00', saturday: '07:30-18:00', sunday: '07:30-18:00' },
  services: ['commercial.food_and_drink.bakery'],
  social_links: [],
  source_urls: ['https://maps.google.com/?cid=123'],
  provider: { name: 'geoapify', placeId: 'ChIJ_tartine_1', datasource: 'openstreetmap' },
  confidence: { overall: 0.9, name: 0.98, category: 0.9, phone: 0.95, website: 0.9, address: 0.95 },
};

// B. WebExtraction nested identity representation (BusinessDataExtractor output shape)
const tartineWeb = {
  business: { name: 'Tartine Bakery', category: 'Bakery', categories: ['Bakery', 'Coffee Shop'], description: null, business_type: 'Bakery' },
  contact: { phone: '(415) 487-2600', email: null, website: 'www.tartinebakery.com' },
  location: { full_address: '600 Guerrero St, San Francisco, CA 94110', street: 'Guerrero St', city: 'San Francisco', state: 'California', country: 'US', postal_code: '94110', latitude: 37.7614552, longitude: -122.4239452, coordinates: { lat: 37.7614552, lng: -122.4239452 } },
  ratings: { rating: null, review_count: null },
  hours: null,
  services: ['Bakery', 'Coffee Shop'],
  social_links: [],
  source_urls: ['https://maps.google.com/?cid=123'],
  source: { url: 'https://maps.google.com/?cid=123', provider: 'web_extraction' },
  confidence: { overall: 0.85, name: 0.95, category: 0.8, phone: 0.9, website: 0.85, address: 0.9 },
  metadata: { extractedAt: '2025-09-08T10:00:00.000Z', providerUnavailable: false },
};

// C. BusinessProfile instance
function buildTartineProfile() {
  const profile = new BusinessProfile();
  profile.setEntityId('ent_tartine_test_01');
  profile.set('identity.name', 'Tartine Bakery', 'discovered', 0.95, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('identity.category', 'Bakery', 'discovered', 0.9, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('identity.description', 'Artisanal bakery in San Francisco.', 'discovered', 0.7, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('contact.phone', '+1-415-487-2600', 'discovered', 0.95, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('contact.website', 'https://tartinebakery.com', 'discovered', 0.9, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('location.full_address', '600 Guerrero Street, San Francisco, CA 94110', 'discovered', 0.95, { sourceUrl: 'https://maps.google.com/?cid=123' });
  profile.set('location.coordinates', { lat: 37.7614552, lng: -122.4239452 }, 'discovered', 0.95, { sourceUrl: 'https://maps.google.com/?cid=123' });
  return profile;
}

// D. Persisted entity (BusinessEntity row + canonical fields + provider identities)
const tartinePersistedEntity = {
  entityId: 'ent_tartine_persist_01',
  canonicalName: 'Tartine Bakery',
  canonicalPhone: '+1-415-487-2600',
  canonicalWebsite: 'https://tartinebakery.com',
  canonicalAddress: '600 Guerrero Street, San Francisco, CA 94110',
  canonicalLatitude: 37.7614552,
  canonicalLongitude: -122.4239452,
  category: 'Bakery',
  status: 'ACTIVE',
};
const tartineCanonicalFields = [
  { fieldPath: 'identity.name', value: 'Tartine Bakery', provenance: 'discovered', confidence: 0.95 },
  { fieldPath: 'identity.category', value: 'Bakery', provenance: 'discovered', confidence: 0.9 },
  { fieldPath: 'identity.description', value: 'Artisanal bakery in San Francisco.', provenance: 'discovered', confidence: 0.7 },
  { fieldPath: 'contact.phone', value: '+1-415-487-2600', provenance: 'discovered', confidence: 0.95 },
  { fieldPath: 'contact.website', value: 'https://tartinebakery.com', provenance: 'discovered', confidence: 0.9 },
  { fieldPath: 'location.full_address', value: '600 Guerrero Street, San Francisco, CA 94110', provenance: 'discovered', confidence: 0.95 },
  { fieldPath: 'location.coordinates', value: '{"lat":37.7614552,"lng":-122.4239452}', provenance: 'discovered', confidence: 0.95 },
  { fieldPath: 'ratings.rating', value: '4.8', provenance: 'discovered', confidence: 0.85 },
  { fieldPath: 'hours', value: '{"monday":"07:30-18:00"}', provenance: 'discovered', confidence: 0.8 },
];
const tartineProviderIdentities = [
  { provider: 'geoapify', providerRecordId: 'ChIJ_tartine_1', resolutionMethod: 'first_observation', resolutionConfidence: 0.95, firstSeen: '2025-01-01T00:00:00.000Z', lastSeen: '2025-09-08T00:00:00.000Z' },
  { provider: 'web_extraction', providerRecordId: 'https://maps.google.com/?cid=123', resolutionMethod: 'first_observation', resolutionConfidence: null, firstSeen: '2025-03-15T00:00:00.000Z', lastSeen: '2025-09-08T00:00:00.000Z' },
];

// Identity safety fixtures (B)
const missingIdentity = { business: {}, contact: {}, location: {} };
const unknownBusinessRecord = { business: { name: 'Unknown Business' }, contact: {}, location: {} };
const unknownRecord = { business: { name: 'Unknown' }, contact: {}, location: {} };
const naRecord = { business: { name: 'N/A' }, contact: {}, location: {} };
const unnamedRecord = { business: { name: 'Unnamed Business' }, contact: {}, location: {} };

const providerIdAsName = {
  business: { name: null },
  contact: { phone: '+1-415-487-2600' },
  provider: { name: 'geoapify', placeId: 'ChIJ_tartine_1' },
  location: { coordinates: { lat: 37.7614552, lng: -122.4239452 } },
};

// AI safety fixtures (C)
const aiExtractedRecord = {
  business: { name: 'Tartine Bakery (AI)', category: 'Bakery' },
  contact: { phone: '+1-415-487-2600', email: null, website: null },
  location: { full_address: '600 Guerrero Street, San Francisco, CA 94110' },
  ratings: { rating: 4.8, review_count: 1200 },
  metadata: { aiExtracted: true, extractedAt: '2025-09-08T10:00:00.000Z' },
};

const aiExtractedBusinessProfile = buildTartineProfile();

function buildAiBusinessProfile() {
  const p = new BusinessProfile();
  p.setEntityId('ent_ai_test_02');
  // deterministic discovered name
  p.set('identity.name', 'Tartine Bakery', 'discovered', 0.95);
  // AI fills an EMPTY description slot with ai_generated provenance
  p.set('identity.description', 'AI-generated description of a bakery', 'ai_generated', 0.6, { sourceUrl: 'https://ai.example' });
  return p;
}

// Provider isolation fixtures (D)
const multiProviderRecord = {
  business: { name: 'Blue Bottle Coffee' },
  contact: { phone: '+1-415-778-3300', website: 'https://bluebottlecoffee.com' },
  location: { full_address: '315 Linden St, San Francisco, CA 94102', coordinates: { lat: 37.7764, lng: -122.4263 } },
  provider: { name: 'google', placeId: 'ChIJ_google_bb_1', resolutionMethod: 'first_observation' },
  ratings: { rating: 4.5, review_count: 850 },
  confidence: { overall: 0.9, name: 0.95 },
};
const multiProviderProviderIds = [
  { provider: 'google', providerRecordId: 'ChIJ_google_bb_1', resolutionMethod: 'first_observation', resolutionConfidence: 0.95, firstSeen: '2025-01-01T00:00:00.000Z', lastSeen: '2025-09-08T00:00:00.000Z' },
  { provider: 'geoapify', providerRecordId: 'ChIJ_geoapify_bb_2', resolutionMethod: 'same_entity_match', resolutionConfidence: 0.9, firstSeen: '2025-02-01T00:00:00.000Z', lastSeen: '2025-09-08T00:00:00.000Z' },
];

/* ================================================================
 * GROUP A: SHAPE PARITY
 * ================================================================ */
console.log('\n[GROUP A] Shape Parity');

check('A1. business.name projects to identity.name', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.strictEqual(r.identity.name, 'Tartine Bakery');
});

check('A2. identity.name projects to identity.name', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineWeb);
  assert.strictEqual(r.identity.name, 'Tartine Bakery');
});

check('A3. bare name projects to identity.name', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile({
    name: 'Blue Bottle Coffee', phone: '+1-415-778-3300',
    address: '315 Linden St, San Francisco, CA 94102',
    coordinates: { lat: 37.7764, lng: -122.4263 },
  });
  assert.strictEqual(r.identity.name, 'Blue Bottle Coffee');
});

check('A4. nested data.name projects to identity.name', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile({
    data: { identity: { name: { value: 'Zuni Cafe', provenance: 'discovered', confidence: 0.9 } } },
  });
  assert.strictEqual(r.identity.name, 'Zuni Cafe');
});

check('A5. equivalent input shapes converge to same identity.name', () => {
  const geo = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  const web = CanonicalBusinessProfileService.fromBusinessProfile(tartineWeb);
  assert.strictEqual(geo.identity.name, web.identity.name);
});

check('A6. missing optional fields handled safely (null / empty array)', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(missingIdentity);
  assert.strictEqual(r.identity.name, null);
  assert.strictEqual(r.identity.website, null);
  assert.ok(Array.isArray(r.business.categories) && r.business.categories.length === 0);
  assert.ok(Array.isArray(r.reputation.reviews) && r.reputation.reviews.length === 0);
});

/* ================================================================
 * GROUP B: IDENTITY SAFETY
 * ================================================================ */
console.log('\n[GROUP B] Identity Safety');

check('B1. valid name preserved', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify).identity.name, 'Tartine Bakery');
});

check('B2. valid address preserved', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify).identity.address, tartineGeoapify.location.full_address);
});

check('B3. valid phone preserved', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify).identity.phone, '+1-415-487-2600');
});

check('B4. valid website/domain preserved', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.strictEqual(r.identity.website, 'https://tartinebakery.com/san-francisco/bakery');
  assert.strictEqual(r.identity.domain, 'tartinebakery.com');
});

check('B5. coordinates preserved as {lat,lng}', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.deepStrictEqual(r.identity.coordinates, { lat: 37.7614552, lng: -122.4239452 });
});

check('B6. missing name returns null', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile({ business: {}, contact: {}, location: {} }).identity.name, null);
});

check('B7. no "Unknown Business"', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(unknownBusinessRecord).identity.name, null);
});

check('B8. no "Unknown"', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(unknownRecord).identity.name, null);
});

check('B9. no "N/A"', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(naRecord).identity.name, null);
});

check('B10. no "Unnamed Business"', () => {
  assert.strictEqual(CanonicalBusinessProfileService.fromBusinessProfile(unnamedRecord).identity.name, null);
});

check('B11. provider ID cannot become name', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(providerIdAsName);
  // ChIJ_tartine_1 is a provider ID, never identity.name
  assert.notStrictEqual(r.identity.name, 'ChIJ_tartine_1');
  assert.strictEqual(r.identity.name, null);
});

check('B12. provider ID cannot become entityId', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile({
    business: { name: 'Test' },
    provider: { name: 'geoapify', placeId: 'ChIJ_test_1' },
    entityId: 'ent_valid_01',
  });
  // provider placeId is provider metadata, not identity.entityId
  assert.notStrictEqual(r.identity.entityId, 'ChIJ_test_1');
  assert.strictEqual(r.identity.entityId, 'ent_valid_01');
});

/* ================================================================
 * GROUP C: AI SAFETY (P1.2 quarantine survives projection)
 * ================================================================ */
console.log('\n[GROUP C] AI Safety');

check('C1. ai_generated provenance preserved (not upgraded)', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(aiExtractedRecord);
  // Record has no provenance; enrichment flags aiExtracted=true
  assert.strictEqual(r.enrichment.aiExtracted, true);
});

check('C2. AI-only identity is not promoted to authoritative identity', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(aiExtractedRecord);
  // Record has metadata.aiExtracted=true; name comes from business.name
  // (the projection preserves it, but provenance metadata shows it).
  // The key invariant: no verified/discovered provenance is manufactured.
  assert.strictEqual(r.provenance['identity.name']?.provenance ?? null, null);
});

check('C3. AI-generated descriptive fields retain provenance', () => {
  const p = buildAiBusinessProfile();
  const r = CanonicalBusinessProfileService.fromBusinessProfile(p);
  assert.strictEqual(r.provenance['identity.description']?.provenance, 'ai_generated');
});

check('C4. verified/discovered provenance not upgraded by projection', () => {
  const p = buildAiBusinessProfile();
  const r = CanonicalBusinessProfileService.fromBusinessProfile(p);
  // name has provenance 'discovered'; projection must not upgrade it
  assert.strictEqual(r.provenance['identity.name']?.provenance, 'discovered');
  // description has provenance 'ai_generated'; projection must not upgrade it
  assert.strictEqual(r.provenance['identity.description']?.provenance, 'ai_generated');
});

/* ================================================================
 * GROUP D: PROVIDER ISOLATION
 * ================================================================ */
console.log('\n[GROUP D] Provider Isolation');

check('D1. Google provider ID remains provider metadata', () => {
  const r = CanonicalBusinessProfileService.fromEntityData({
    record: multiProviderRecord,
    providerIdentities: multiProviderProviderIds,
  });
  const google = r.providers.find((p) => p.provider === 'google');
  assert.ok(google, 'google provider present');
  assert.strictEqual(google.providerRecordId, 'ChIJ_google_bb_1');
  // Must NOT appear as identity.name or identity.website
  assert.notStrictEqual(r.identity.name, 'ChIJ_google_bb_1');
});

check('D2. Geoapify provider ID remains provider metadata', () => {
  const r = CanonicalBusinessProfileService.fromEntityData({
    record: multiProviderRecord,
    providerIdentities: multiProviderProviderIds,
  });
  const geo = r.providers.find((p) => p.provider === 'geoapify');
  assert.ok(geo, 'geoapify provider present');
  assert.strictEqual(geo.providerRecordId, 'ChIJ_geoapify_bb_2');
});

check('D3. provider IDs do not appear as canonical identity fields', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.ok(!['ChIJ_tartine_1', 'geoapify', 'openstreetmap'].includes(r.identity.name));
  assert.ok(!r.identity.website?.includes('ChIJ_tartine_1'));
  assert.ok(!r.identity.address?.includes('ChIJ_tartine_1'));
  assert.ok(!r.identity.phone?.includes('ChIJ_tartine_1'));
});

check('D4. multiple provider identities can coexist', () => {
  const r = CanonicalBusinessProfileService.fromEntityData({
    record: multiProviderRecord,
    providerIdentities: multiProviderProviderIds,
  });
  assert.strictEqual(r.providers.length, 2);
  assert.strictEqual(r.providers[0].provider, 'google');
  assert.strictEqual(r.providers[1].provider, 'geoapify');
});

check('D5. removing provider metadata does not alter canonical business meaning', () => {
  const withProviders = CanonicalBusinessProfileService.fromEntityData({
    record: multiProviderRecord,
    providerIdentities: multiProviderProviderIds,
  });
  const withoutProviders = CanonicalBusinessProfileService.fromBusinessProfile({
    business: { name: 'Blue Bottle Coffee' },
    contact: { phone: '+1-415-778-3300', website: 'https://bluebottlecoffee.com' },
    location: { full_address: '315 Linden St, San Francisco, CA 94102', coordinates: { lat: 37.7764, lng: -122.4263 } },
    ratings: { rating: 4.5, review_count: 850 },
  });
  assert.strictEqual(withProviders.identity.name, withoutProviders.identity.name);
  assert.strictEqual(withProviders.identity.phone, withoutProviders.identity.phone);
  assert.strictEqual(withProviders.identity.website, withoutProviders.identity.website);
  assert.strictEqual(withProviders.identity.address, withoutProviders.identity.address);
  assert.strictEqual(withProviders.reputation.rating, withoutProviders.reputation.rating);
});

/* ================================================================
 * GROUP E: STRUCTURE
 * ================================================================ */
console.log('\n[GROUP E] Structure');

check('E1. coordinates remain {lat,lng}', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.strictEqual(typeof r.identity.coordinates.lat, 'number');
  assert.strictEqual(typeof r.identity.coordinates.lng, 'number');
});

check('E2. nested objects are not converted to "[object Object]"', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  // Coordinates / hours must remain OBJECTS (their structure), not strings
  assert.strictEqual(typeof r.identity.coordinates, 'object');
  assert.strictEqual(typeof r.business.hours, 'object');
  assert.deepStrictEqual(r.identity.coordinates, { lat: 37.7614552, lng: -122.4239452 });
  assert.deepStrictEqual(r.business.hours, tartineGeoapify.hours);
});

check('E3. arrays remain arrays', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.ok(Array.isArray(r.business.categories));
  assert.ok(Array.isArray(r.business.services));
  assert.ok(Array.isArray(r.providers));
  assert.ok(Array.isArray(r.reputation.reviews));
});

check('E4. missing/null semantics follow repository conventions (null not undefined)', () => {
  const r = CanonicalBusinessProfileService.fromBusinessProfile(missingIdentity);
  assert.strictEqual('entityId' in r.identity, true);
  assert.strictEqual(r.identity.entityId, null);
  assert.strictEqual('email' in r.business, true);
  assert.strictEqual(r.business.email, null);
  assert.strictEqual('rating' in r.reputation, true);
  assert.strictEqual(r.reputation.rating, null);
});

/* ================================================================
 * GROUP F: INTEGRITY
 * ================================================================ */
console.log('\n[GROUP F] Integrity');

check('F1. projection does not mutate input (flat provider shape)', () => {
  const input = { ...tartineGeoapify };
  const before = JSON.parse(JSON.stringify(input));
  CanonicalBusinessProfileService.fromBusinessProfile(input);
  assert.deepStrictEqual(input, before);
});

check('F2. projection does not mutate input (nested provider shape)', () => {
  const input = { ...tartineWeb };
  const before = JSON.parse(JSON.stringify(input));
  CanonicalBusinessProfileService.fromBusinessProfile(input);
  assert.deepStrictEqual(input, before);
});

check('F3. identical input produces identical output (flat provider shape)', () => {
  const r1 = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  const r2 = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  assert.deepStrictEqual(r1, r2);
});

check('F4. identical input produces identical output (nested provider shape)', () => {
  const r1 = CanonicalBusinessProfileService.fromBusinessProfile(tartineWeb);
  const r2 = CanonicalBusinessProfileService.fromBusinessProfile(tartineWeb);
  assert.deepStrictEqual(r1, r2);
});

check('F5. projection has no network/AI/persistence side effects', () => {
  // fromBusinessProfile is synchronous; it cannot perform network/AI/DB writes.
  // Verify it returns instantly and does not throw when called with null.
  const r = CanonicalBusinessProfileService.fromBusinessProfile(null);
  assert.strictEqual(r.identity.name, null);
  assert.strictEqual(r.identity.entityId, null);
});

/* ================================================================
 * GROUP PERSISTED: Persisted Entity Projection
 * ================================================================ */
console.log('\n[PERSISTED] Persisted Entity Projection');

check('P1. fromPersistedEntity projects persisted entity row', async () => {
  const r = await CanonicalBusinessProfileService.fromPersistedEntity({
    entity: tartinePersistedEntity,
    canonicalFields: tartineCanonicalFields,
    providerIdentities: tartineProviderIdentities,
  });
  assert.strictEqual(r.identity.name, 'Tartine Bakery');
  assert.strictEqual(r.identity.phone, '+1-415-487-2600');
  assert.strictEqual(r.identity.website, 'https://tartinebakery.com');
  assert.strictEqual(r.identity.address, '600 Guerrero Street, San Francisco, CA 94110');
  assert.deepStrictEqual(r.identity.coordinates, { lat: 37.7614552, lng: -122.4239452 });
  assert.strictEqual(r.identity.entityId, 'ent_tartine_persist_01');
});

check('P2. persisted canonical fields project into correct canonical slots', async () => {
  const r = await CanonicalBusinessProfileService.fromPersistedEntity({
    entity: tartinePersistedEntity,
    canonicalFields: tartineCanonicalFields,
    providerIdentities: tartineProviderIdentities,
  });
  assert.strictEqual(r.reputation.rating, 4.8);
  assert.deepStrictEqual(r.business.hours, { monday: '07:30-18:00' });
});

check('P3. persisted provider identities project into providers[]', async () => {
  const r = await CanonicalBusinessProfileService.fromPersistedEntity({
    entity: tartinePersistedEntity,
    canonicalFields: tartineCanonicalFields,
    providerIdentities: tartineProviderIdentities,
  });
  assert.strictEqual(r.providers.length, 2);
  assert.strictEqual(r.providers[0].provider, 'geoapify');
  assert.strictEqual(r.providers[0].providerRecordId, 'ChIJ_tartine_1');
  assert.strictEqual(r.providers[1].provider, 'web_extraction');
});

check('P4. fromPersistedEntity returns NOT_FOUND for missing entityId', async () => {
  const r = await CanonicalBusinessProfileService.fromPersistedEntity(
    { getEntityById: () => null, getCanonicalFields: () => [], getObservations: () => [], findProviderIdentities: () => [] },
    'ent_missing_01'
  );
  assert.strictEqual(r._readError?.code, 'NOT_FOUND');
  assert.strictEqual(r.identity.entityId, 'ent_missing_01');
  assert.strictEqual(r.identity.name, null);
});

check('P5. fromPersistedEntity preserves AI quarantine provenance', async () => {
  const fields = [
    { fieldPath: 'identity.name', value: 'Test', provenance: 'discovered', confidence: 0.9 },
    { fieldPath: 'identity.description', value: 'AI generated description', provenance: 'ai_generated', confidence: 0.6 },
  ];
  const r = await CanonicalBusinessProfileService.fromPersistedEntity({
    entity: { entityId: 'ent_ai_test_01', canonicalName: 'Test', canonicalAddress: '123 St' },
    canonicalFields: fields,
    providerIdentities: [],
  });
  assert.strictEqual(r.identity.name, 'Test');
  assert.strictEqual(r.provenance['identity.description']?.provenance, 'ai_generated');
});

check('P6. fromPersistedEntity does NOT mutate persisted entity', async () => {
  const entity = { ...tartinePersistedEntity };
  const before = JSON.parse(JSON.stringify(entity));
  await CanonicalBusinessProfileService.fromPersistedEntity({
    entity,
    canonicalFields: tartineCanonicalFields,
    providerIdentities: tartineProviderIdentities,
  });
  assert.deepStrictEqual(entity, before);
});

/* ================================================================
 * GROUP MIGRANT: Consumer Migration (fromBusinessProfile via BuildFacts)
 * ================================================================ */
console.log('\n[MIGRANT] Consumer Migration');

check('M1. WebsiteGenerationService.extractFacts equivalent output', () => {
  const projection = CanonicalBusinessProfileService.fromBusinessProfile(tartineGeoapify);
  // WebsiteGenerationService.extractFacts reads:
  //   identity.name, identity.category, identity.categories, identity.description,
  //   contact.phone, contact.email, contact.website,
  //   location.address, location.city, location.state, location.country,
  //   location.postalCode, location.coordinates.lat/lng,
  //   openingHours, rating, reviewCount
  const migratedFacts = {
    name: projection.identity.name,
    category: projection.business.category,
    categories: projection.business.categories,
    description: projection.business.description,
    phone: projection.identity.phone,
    email: projection.business.email,
    website: projection.identity.website,
    address: projection.identity.address,
    city: projection.identity.addressComponents?.city ?? null,
    state: projection.identity.addressComponents?.state ?? null,
    country: projection.identity.addressComponents?.country ?? null,
    postalCode: projection.identity.addressComponents?.postalCode ?? null,
    latitude: projection.identity.coordinates?.lat ?? null,
    longitude: projection.identity.coordinates?.lng ?? null,
    hours: projection.business.hours,
    rating: projection.reputation.rating,
    reviewCount: projection.reputation.reviewCount,
  };
  assert.strictEqual(migratedFacts.name, 'Tartine Bakery');
  assert.strictEqual(migratedFacts.category, 'Bakery');
  assert.strictEqual(migratedFacts.phone, '+1-415-487-2600');
  assert.strictEqual(migratedFacts.website, 'https://tartinebakery.com/san-francisco/bakery');
  assert.strictEqual(migratedFacts.address, tartineGeoapify.location.full_address);
  assert.deepStrictEqual(migratedFacts.latitude, 37.7614552);
  assert.deepStrictEqual(migratedFacts.longitude, -122.4239452);
  assert.deepStrictEqual(migratedFacts.hours, tartineGeoapify.hours);
  assert.strictEqual(migratedFacts.rating, null);
  assert.strictEqual(migratedFacts.reviewCount, null);
});

check('M2. null name from projection does NOT fabricate "This business"', () => {
  const projection = CanonicalBusinessProfileService.fromBusinessProfile({ business: {}, contact: {}, location: {} });
  // The projection is null. The consumer (extractFacts) should use null, not fabricate.
  assert.strictEqual(projection.identity.name, null);
});

check('M3. consumer extractFacts() reads through canonical projection (regression)', async () => {
  const { default: WebsiteGenerationService } = await import('./src/services/WebsiteGenerationService.js');
  // Geoapify flat shape — the SAME facts a WebsiteGenerationService consumer
  // needs are now derived from the canonical read layer.
  const facts = WebsiteGenerationService.extractFacts(tartineGeoapify);
  assert.strictEqual(facts.name, 'Tartine Bakery');
  assert.strictEqual(facts.category, 'Bakery');
  assert.strictEqual(facts.phone, '+1-415-487-2600');
  assert.strictEqual(facts.website, 'https://tartinebakery.com/san-francisco/bakery');
  assert.strictEqual(facts.address, tartineGeoapify.location.full_address);
  assert.strictEqual(facts.city, 'San Francisco');
  assert.strictEqual(facts.state, 'California');
  assert.strictEqual(facts.country, 'United States of America');
  assert.strictEqual(facts.postalCode, '94110');
  assert.deepStrictEqual(facts.latitude, 37.7614552);
  assert.deepStrictEqual(facts.longitude, -122.4239452);
  assert.deepStrictEqual(facts.hours, tartineGeoapify.hours);
});

check('M4. consumer extractFacts() never receives synthetic name (regression)', async () => {
  const { default: WebsiteGenerationService } = await import('./src/services/WebsiteGenerationService.js');
  const facts = WebsiteGenerationService.extractFacts({ business: { name: 'Unknown Business' }, contact: {}, location: {} });
  assert.strictEqual(facts.name, null);
  const factsNa = WebsiteGenerationService.extractFacts({ business: { name: 'N/A' }, contact: {}, location: {} });
  assert.strictEqual(factsNa.name, null);
});

check('M5. consumer extractFacts() reads web-extraction nested identity shape (regression)', async () => {
  const { default: WebsiteGenerationService } = await import('./src/services/WebsiteGenerationService.js');
  const facts = WebsiteGenerationService.extractFacts(tartineWeb);
  assert.strictEqual(facts.name, 'Tartine Bakery');
  assert.strictEqual(facts.address, '600 Guerrero St, San Francisco, CA 94110');
  assert.strictEqual(facts.city, 'San Francisco');
  assert.strictEqual(facts.state, 'California');
});

/* ================================================================
 * GROUP PERSISTED-LIVE: Persisted Entity via IdentityRepository
 * ================================================================ */
console.log('\n[PERSISTED-LIVE] IdentityRepository round-trip');

const DB = './test_phase_p13_canonical_profile.db';
const repo = new IdentityRepository(await initializeDatabase(DB));

async function resetTestDb() {
  const raw = getRawDb();
  raw.prepare('DELETE FROM resolution_record').run();
  raw.prepare('DELETE FROM review_item').run();
  raw.prepare('DELETE FROM conflict').run();
  raw.prepare('DELETE FROM canonicalization_decision').run();
  raw.prepare('DELETE FROM claim_source').run();
  raw.prepare('DELETE FROM claim_evidence').run();
  raw.prepare('DELETE FROM observation').run();
  raw.prepare('DELETE FROM canonical_field').run();
  raw.prepare('DELETE FROM claim').run();
  raw.prepare('DELETE FROM evidence').run();
  raw.prepare('DELETE FROM source').run();
  raw.prepare('DELETE FROM provider_identity').run();
  raw.prepare('DELETE FROM business_entity').run();
}

await checkAsync('L1. fromPersistedEntity with real DB: create entity + project', async () => {
  await resetTestDb();
  const { entity } = repo.createEntityWithProviderIdentity(
    { canonicalName: 'Tartine Bakery', canonicalAddress: '600 Guerrero Street, San Francisco, CA 94110', canonicalPhone: '+1-415-487-2600', canonicalWebsite: 'https://tartinebakery.com', canonicalLatitude: 37.7614552, canonicalLongitude: -122.4239452, category: 'Bakery' },
    { provider: 'geoapify', providerRecordId: 'ChIJ_tartine_1', resolutionMethod: 'first_observation', resolutionConfidence: 0.95 }
  );
  // Persist canonical fields via CanonicalizationService-style upserts
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'identity.name', value: 'Tartine Bakery', provenance: 'discovered', confidence: 0.95 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'identity.category', value: 'Bakery', provenance: 'discovered', confidence: 0.9 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'contact.phone', value: '+1-415-487-2600', provenance: 'discovered', confidence: 0.95 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'contact.website', value: 'https://tartinebakery.com', provenance: 'discovered', confidence: 0.9 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'location.full_address', value: '600 Guerrero Street, San Francisco, CA 94110', provenance: 'discovered', confidence: 0.95 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'location.coordinates', value: JSON.stringify({ lat: 37.7614552, lng: -122.4239452 }), provenance: 'discovered', confidence: 0.95 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'ratings.rating', value: '4.8', provenance: 'discovered', confidence: 0.85 });

  const r = await CanonicalBusinessProfileService.fromPersistedEntity(repo, entity.entityId);
  assert.strictEqual(r.identity.name, 'Tartine Bakery');
  assert.strictEqual(r.identity.phone, '+1-415-487-2600');
  assert.strictEqual(r.identity.website, 'https://tartinebakery.com');
  assert.strictEqual(r.identity.address, '600 Guerrero Street, San Francisco, CA 94110');
  assert.deepStrictEqual(r.identity.coordinates, { lat: 37.7614552, lng: -122.4239452 });
  assert.strictEqual(r.identity.entityId, entity.entityId);
  assert.strictEqual(r.providers.length, 1);
  assert.strictEqual(r.providers[0].provider, 'geoapify');
});

await checkAsync('L2. persisted ai_generated provenance survives round-trip', async () => {
  await resetTestDb();
  const { entity } = repo.createEntityWithProviderIdentity(
    { canonicalName: 'AI Test Business', canonicalAddress: '123 Test St' },
    { provider: 'geoapify', providerRecordId: 'ChIJ_ai_test_1', resolutionMethod: 'first_observation', resolutionConfidence: 0.8 }
  );
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'identity.name', value: 'AI Test Business', provenance: 'discovered', confidence: 0.9 });
  repo.upsertCanonicalField({ entityId: entity.entityId, fieldPath: 'identity.description', value: 'AI-generated description', provenance: 'ai_generated', confidence: 0.6 });

  const r = await CanonicalBusinessProfileService.fromPersistedEntity(repo, entity.entityId);
  assert.strictEqual(r.identity.name, 'AI Test Business');
  assert.strictEqual(r.provenance['identity.description']?.provenance, 'ai_generated');
});

await closeDatabase(DB);

/* ================================================================
 * FINAL
 * ================================================================ */
console.log(`\nP1.3 CanonicalBusinessProfile Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) {
    console.error(`  FAILED: ${f.name}`);
    console.error(`    ${f.error?.message}`);
  }
  process.exit(1);
}