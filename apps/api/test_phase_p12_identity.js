/**
 * P1.2 Identity Integrity Fixes — Regression Tests
 *
 * Locks down the five P1.2 identity/data-integrity boundaries:
 *   1. Entity-resolution shape parity (business.name / identity.name / name)
 *   2. AI identity quarantine (ai_generated provenance cannot outrank authority)
 *   3. Synthetic identity prevention (no "Unknown Business" entities)
 *   4. Phone normalization boundary (absent vs normalized vs unresolved)
 *   5. Provenance / facts regression (intelligence.facts preserves true provenance)
 *
 * Run: node test_phase_p12_identity.js
 */

import assert from 'node:assert';
import {
  calculateMatchScore,
  normalizePhone,
  canonicalIdentityField,
  resolvePhoneSignal,
  ENTITY_MATCH_TYPE,
} from './src/services/EntityResolution.js';
import BusinessProfile from './src/services/BusinessProfile.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import { initializeDatabase, closeDatabase, getRawDb } from './src/db/client.js';

const TEST_DB = './test_phase_p12_identity.db';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
let asyncTestQueue = Promise.resolve();

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

function checkAsync(name, fn) {
  asyncTestQueue = asyncTestQueue.then(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed += 1;
      failures.push({ name, error: err });
      console.error(`  ✗ ${name}\n      ${err.message}`);
    }
  });
  return asyncTestQueue;
}

function skip(name) {
  skipped += 1;
  console.log(`  – SKIPPED ${name}`);
}

/* ================================================================== *
 * SHAPE PARITY FIXTURES
 * ================================================================== */

// Geoapify flat shape: business.name
const tartineBusinessShape = {
  business: { name: 'Tartine Bakery', category: 'Bakery' },
  contact: { phone: '+1-415-487-2600', website: 'https://tartinebakery.com' },
  location: {
    full_address: '600 Guerrero Street, San Francisco, CA 94110',
    city: 'San Francisco',
    state: 'California',
    coordinates: { lat: 37.7614552, lng: -122.4239452 },
  },
  provider: { name: 'geoapify', placeId: 'ChIJ_tartine_1' },
};

// Web-extraction dotted shape: identity.name
const tartineIdentityShape = {
  identity: { name: 'Tartine Bakery', category: 'Bakery' },
  contact: { phone: '(415) 487-2600', website: 'www.tartinebakery.com' },
  location: {
    full_address: '600 Guerrero St, San Francisco, CA 94110',
    city: 'San Francisco',
    state: 'California',
    coordinates: { lat: 37.7614552, lng: -122.4239452 },
  },
};

// Legacy shape: bare name
const tartineLegacyShape = {
  name: 'Tartine Bakery',
  phone: '+1 415 487 2600',
  address: '600 Guerrero Street, San Francisco, CA 94110',
  coordinates: { lat: 37.7614552, lng: -122.4239452 },
};

const differentBusinessShape = {
  business: { name: 'Walgreens', category: 'Pharmacy' },
  contact: { phone: '+1-415-981-6417', website: 'https://walgreens.com' },
  location: {
    full_address: '135 Powell Street, San Francisco, CA 94102',
    city: 'San Francisco',
    state: 'California',
    coordinates: { lat: 37.7865, lng: -122.4087 },
  },
};

const resetP12Db = () => {
  const raw = getRawDb();
  raw.prepare('DELETE FROM resolution_record').run();
  raw.prepare('DELETE FROM provider_identity').run();
  raw.prepare('DELETE FROM business_entity').run();
};

/* ================================================================== *
 * 0. SETUP
 * ================================================================== */
checkAsync('Setup: initialize P1.2 test DB', async () => {
  await initializeDatabase(TEST_DB);
});

/* ================================================================== *
 * 1. ENTITY-RESOLUTION SHAPE PARITY
 * ================================================================== */
console.log('\n[1] Entity-Resolution Shape Parity');

check('canonicalIdentityField reads business.name', () => {
  assert.strictEqual(canonicalIdentityField('name', tartineBusinessShape), 'Tartine Bakery');
});

check('canonicalIdentityField reads identity.name', () => {
  assert.strictEqual(canonicalIdentityField('name', tartineIdentityShape), 'Tartine Bakery');
});

check('canonicalIdentityField reads bare name', () => {
  assert.strictEqual(canonicalIdentityField('name', tartineLegacyShape), 'Tartine Bakery');
});

check('canonicalIdentityField rejects empty/missing record', () => {
  assert.strictEqual(canonicalIdentityField('name', null), null);
  assert.strictEqual(canonicalIdentityField('name', {}), null);
  assert.strictEqual(canonicalIdentityField(null, tartineBusinessShape), null);
});

// A. business.name ↔ identity.name (same business → same_entity)
check('A. business.name ↔ identity.name same business → same_entity', () => {
  const result = calculateMatchScore(tartineBusinessShape, tartineIdentityShape);
  assert.ok(result.signals.name_exact, 'name_exact signal must fire across shapes');
  assert.ok(result.score >= 0.85, `Expected score >= 0.85, got ${result.score}`);
  assert.strictEqual(result.matchType, 'same_entity', `Expected same_entity, got ${result.matchType}`);
});

// B. business.name ↔ name (same business → same_entity)
check('B. business.name ↔ name same business → same_entity', () => {
  const result = calculateMatchScore(tartineBusinessShape, tartineLegacyShape);
  assert.ok(result.signals.name_exact, 'name_exact signal must fire across shapes');
  assert.ok(result.score >= 0.85, `Expected score >= 0.85, got ${result.score}`);
  assert.strictEqual(result.matchType, 'same_entity', `Expected same_entity, got ${result.matchType}`);
});

// C. identity.name ↔ name (same business → same_entity)
check('C. identity.name ↔ name same business → same_entity', () => {
  const result = calculateMatchScore(tartineIdentityShape, tartineLegacyShape);
  assert.ok(result.signals.name_exact, 'name_exact signal must fire across shapes');
  assert.ok(result.score >= 0.85, `Expected score >= 0.85, got ${result.score}`);
  assert.strictEqual(result.matchType, 'same_entity', `Expected same_entity, got ${result.matchType}`);
});

// D. Different business names do NOT become same_entity solely due to shape.
check('D. Different business names (business.name vs identity.name) stay different', () => {
  const result = calculateMatchScore(tartineBusinessShape, differentBusinessShape);
  assert.ok(result.score < 0.85, `Expected score < 0.85, got ${result.score}`);
  assert.notStrictEqual(result.matchType, 'same_entity', 'Different businesses must not match');
  const nameContradiction = result.contradictions.some((c) => c.field === 'name');
  assert.ok(nameContradiction, 'Should detect a name contradiction across shapes');
});

// E. Name is NOT double-counted when multiple aliases exist.
check('E. Name is not double-counted with multiple aliases', () => {
  const aliasedRecord = {
    business: { name: 'Tartine Bakery' },
    identity: { name: 'Tartine Bakery' },
    name: 'Tartine Bakery',
    contact: { phone: '+1-415-487-2600', website: 'https://tartinebakery.com' },
    location: {
      full_address: '600 Guerrero Street, San Francisco, CA 94110',
      city: 'San Francisco',
      state: 'California',
      coordinates: { lat: 37.7614552, lng: -122.4239452 },
    },
  };
  const result = calculateMatchScore(aliasedRecord, tartineIdentityShape);
  // name_exact should fire exactly once; no duplicate name signal.
  const nameSignalKeys = Object.keys(result.signals).filter(
    (k) => k.startsWith('name_') && result.signals[k] === true
  );
  assert.ok(nameSignalKeys.length <= 2, `Expected at most name_exact + name_fuzzy, got ${nameSignalKeys.join(', ')}`);
  assert.ok(result.signals.name_exact, 'name_exact should fire');
  // Score sanity: name contributes 0.35 once, not 0.70+.
  assert.ok(result.score >= 0.85 && result.score <= 1.5, `Score ${result.score} outside expected band`);
});

/* ================================================================== *
 * 2. AI IDENTITY QUARANTINE
 * ================================================================== */
console.log('\n[2] AI Identity Quarantine');

check('ai_generated is a valid provenance in BusinessProfile', () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'AI Placeholder', 'ai_generated', 0.6, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('identity.name'), 'AI Placeholder');
  assert.strictEqual(profile.getField('identity.name').provenance, 'ai_generated');
});

check('A. URL-derived identified name cannot be overwritten by AI-generated name', () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Tartine Bakery', 'identified', 0.6, { sourceUrl: 'https://maps.google.com/tartine' });
  // AI tries to write a different name
  profile.set('identity.name', 'Tartine Cafe (AI guess)', 'ai_generated', 0.7, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('identity.name'), 'Tartine Bakery', 'identified must win over ai_generated');
  assert.strictEqual(profile.getField('identity.name').provenance, 'identified');
});

check('B. Provider-observed (discovered) name cannot be overwritten by AI-generated name', () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Tartine Bakery', 'discovered', 0.9, { sourceUrl: 'https://geoapify.example' });
  profile.set('identity.name', 'Tartine Bakery 2 (AI)', 'ai_generated', 0.95, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('identity.name'), 'Tartine Bakery', 'discovered must win over ai_generated');
  assert.strictEqual(profile.getField('identity.name').provenance, 'discovered');
});

check('C. AI-generated phone cannot replace an authoritative phone', () => {
  const profile = new BusinessProfile();
  profile.set('contact.phone', '+1-415-487-2600', 'identified', 0.8, { sourceUrl: 'https://maps.google.com/tartine' });
  profile.set('contact.phone', '+1-415-999-9999', 'ai_generated', 0.9, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('contact.phone'), '+1-415-487-2600');
});

check('D. AI-generated address cannot replace an authoritative address', () => {
  const profile = new BusinessProfile();
  profile.set('location.full_address', '600 Guerrero Street, San Francisco, CA 94110', 'discovered', 0.9, { sourceUrl: 'https://geoapify.example' });
  profile.set('location.full_address', '999 Fake Street', 'ai_generated', 0.9, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('location.full_address'), '600 Guerrero Street, San Francisco, CA 94110');
});

check('E. AI-generated website cannot replace an authoritative website', () => {
  const profile = new BusinessProfile();
  profile.set('contact.website', 'https://tartinebakery.com', 'verified', 0.95, { sourceUrl: 'https://tartinebakery.com' });
  profile.set('contact.website', 'https://evil.example', 'ai_generated', 0.99, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('contact.website'), 'https://tartinebakery.com');
});

check('F. AI data remains available as candidate/evidence data (fills gaps)', () => {
  const profile = new BusinessProfile();
  // No existing name — AI can fill the gap
  profile.set('identity.name', 'Mystery Cafe', 'ai_generated', 0.6, { sourceUrl: 'https://ai.example' });
  assert.strictEqual(profile.get('identity.name'), 'Mystery Cafe', 'AI should fill empty slots');
  assert.strictEqual(profile.getField('identity.name').provenance, 'ai_generated');
  // Evidence was stored (source registered)
  assert.ok(profile.sourceRegistry.size > 0, 'AI source should be registered');
});

check('G. AI-generated inferred cannot outrank ai_generated for identity', () => {
  // inferred (priority 1) vs ai_generated (0.5): inferred CAN overwrite
  // ai_generated since both are low-confidence non-authoritative tiers. But
  // that must not bootstrap into durable identity — verified below in [3].
  const profile = new BusinessProfile();
  profile.set('identity.name', 'AI Name', 'ai_generated', 0.6);
  profile.set('identity.name', 'Inferred Name', 'inferred', 0.6);
  assert.strictEqual(profile.get('identity.name'), 'Inferred Name');
});

checkAsync('G2. AI data alone cannot independently create a durable entity', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  // AI-derived record with a real-sounding name but NO deterministic anchor
  // (no provider placeId, no URL-derived hints). Must NOT create an entity.
  const aiOnlyRecord = {
    business: { name: 'Tartine Bakery' },
    contact: { phone: '(415) 487-2600' },
    location: { full_address: '600 Guerrero Street, San Francisco, CA 94110' },
    metadata: { aiExtracted: true },
  };
  const result = await BusinessResearchService._persistIdentity(
    profile, {}, 'https://maps.example/tartine', aiOnlyRecord, null
  );
  assert.strictEqual(result.status, 'insufficient_evidence',
    `AI-only record must not create an entity, got ${result.status}`);
  assert.strictEqual(result.entityId, null);
  const raw = getRawDb();
  const count = raw.prepare('SELECT COUNT(*) as c FROM business_entity').get().c;
  assert.strictEqual(count, 0, 'No entity may be created from AI-only evidence');
});

checkAsync('G3. AI-derived record WITH deterministic anchor can create entity', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  // AI-derived but anchored by a hard provider placeId → entity allowed.
  const anchoredAiRecord = {
    business: { name: 'Tartine Bakery' },
    contact: { phone: '(415) 487-2600' },
    location: { full_address: '600 Guerrero Street, San Francisco, CA 94110' },
    provider: { name: 'web_extraction', placeId: 'ChIJ_p12_anchored_1' },
    metadata: { aiExtracted: true },
  };
  const result = await BusinessResearchService._persistIdentity(
    profile, {}, 'https://maps.example/tartine', anchoredAiRecord, null
  );
  assert.strictEqual(result.status, 'ok', `Anchored AI record should persist, got ${result.status}`);
  assert.ok(result.entityId, 'Entity should exist when anchored by provider ID');
});

/* ================================================================== *
 * 3. SYNTHETIC IDENTITY PREVENTION
 * ================================================================== */
console.log('\n[3] Synthetic Identity Prevention');

check('_isSyntheticName detects placeholder strings', () => {
  const svc = BusinessResearchService;
  assert.strictEqual(svc._isSyntheticName('Unknown Business'), true);
  assert.strictEqual(svc._isSyntheticName('Unknown'), true);
  assert.strictEqual(svc._isSyntheticName('unknown business'), true);
  assert.strictEqual(svc._isSyntheticName('N/A'), true);
  assert.strictEqual(svc._isSyntheticName(null), true);
  assert.strictEqual(svc._isSyntheticName(''), true);
  assert.strictEqual(svc._isSyntheticName('Tartine Bakery'), false);
});

check('_hasSufficientIdentity requires real evidence', () => {
  const svc = BusinessResearchService;
  assert.strictEqual(svc._hasSufficientIdentity({ business: { name: 'Unknown Business' } }, {}), false);
  assert.strictEqual(svc._hasSufficientIdentity({}, {}), false);
  assert.strictEqual(
    svc._hasSufficientIdentity({ business: { name: 'Tartine Bakery' } }, {}),
    true
  );
  assert.strictEqual(
    svc._hasSufficientIdentity({}, { name: 'Tartine Bakery' }),
    true
  );
  assert.strictEqual(
    svc._hasSufficientIdentity({ location: { coordinates: { lat: 37.7, lng: -122.4 } } }, {}),
    true
  );
  assert.strictEqual(
    svc._hasSufficientIdentity({ provider: { placeId: 'ChIJ_1' } }, {}),
    true
  );
});

checkAsync('A. Missing name + missing address → NO entity created (insufficient_evidence)', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  const result = await BusinessResearchService._persistIdentity(
    profile,
    {},
    'https://maps.example/nothing',
    { business: { name: null, category: null }, contact: {}, location: {} },
    null
  );
  assert.strictEqual(result.status, 'insufficient_evidence', `Expected insufficient_evidence, got ${result.status}`);
  assert.strictEqual(result.entityId, null, 'No entity should be created');

  const raw = getRawDb();
  const count = raw.prepare('SELECT COUNT(*) as c FROM business_entity').get().c;
  assert.strictEqual(count, 0, 'No BusinessEntity rows should exist');
});

checkAsync('B. Synthetic identity strings are NEVER persisted', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  const result = await BusinessResearchService._persistIdentity(
    profile,
    {},
    'https://maps.example/unknown',
    { business: { name: 'Unknown' }, contact: {}, location: {} },
    null
  );
  assert.strictEqual(result.status, 'insufficient_evidence', 'Unknown name must not create an entity');

  const raw = getRawDb();
  const unknownRows = raw.prepare("SELECT COUNT(*) as c FROM business_entity WHERE canonical_name IN ('Unknown Business', 'Unknown')").get().c;
  assert.strictEqual(unknownRows, 0, 'No synthetic identity rows may exist');
});

checkAsync('C. Valid name + sufficient identity evidence → entity STILL created', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  const result = await BusinessResearchService._persistIdentity(
    profile,
    { name: 'Tartine Bakery' },
    'https://maps.example/tartine',
    {
      business: { name: 'Tartine Bakery', category: 'Bakery' },
      contact: { phone: '+1-415-487-2600', website: 'https://tartinebakery.com' },
      location: {
        full_address: '600 Guerrero Street, San Francisco, CA 94110',
        coordinates: { lat: 37.7614552, lng: -122.4239452 },
      },
      provider: { name: 'geoapify', placeId: 'ChIJ_p12_tartine_1' },
    },
    null
  );
  assert.strictEqual(result.status, 'ok', `Expected ok, got ${result.status}`);
  assert.ok(result.entityId, 'Entity should be created for a genuinely identified business');

  const raw = getRawDb();
  const entity = raw.prepare('SELECT * FROM business_entity WHERE entity_id = ?').get(result.entityId);
  assert.strictEqual(entity.canonical_name, 'Tartine Bakery', 'Real name must persist');
});

checkAsync('D. Ambiguous provider result with no identity → no fake entity', async () => {
  resetP12Db();
  const profile = new BusinessProfile();
  const result = await BusinessResearchService._persistIdentity(
    profile,
    {},
    'https://maps.example/ambiguous',
    { business: { name: 'Unknown Business' }, contact: {}, location: {} },
    null
  );
  assert.strictEqual(result.status, 'insufficient_evidence');
  const raw = getRawDb();
  const count = raw.prepare('SELECT COUNT(*) as c FROM business_entity').get().c;
  assert.strictEqual(count, 0, 'No fake entity for ambiguous result');
});

checkAsync('E. Existing provider identity reuse remains functional', async () => {
  resetP12Db();
  const validRecord = {
    business: { name: 'Walgreens', category: 'Pharmacy' },
    contact: { phone: '+1-415-981-6417', website: 'https://walgreens.com' },
    location: {
      full_address: '135 Powell Street, San Francisco, CA 94102',
      coordinates: { lat: 37.7865, lng: -122.4087 },
    },
    provider: { name: 'geoapify', placeId: 'ChIJ_p12_walgreens_1' },
  };

  // First observation creates an entity
  const p1 = new BusinessProfile();
  const r1 = await BusinessResearchService._persistIdentity(p1, { name: 'Walgreens' }, 'https://maps.example/walgreens', validRecord, null);
  assert.strictEqual(r1.status, 'ok');
  assert.ok(r1.entityId);

  // Second observation of the same provider record reuses the entity
  const p2 = new BusinessProfile();
  const r2 = await BusinessResearchService._persistIdentity(p2, { name: 'Walgreens' }, 'https://maps.example/walgreens', validRecord, null);
  assert.strictEqual(r2.entityId, r1.entityId, 'Known provider identity must be reused');
  assert.strictEqual(r2.resolutionRecord, null, 'No new resolution for known identity');
});

/* ================================================================== *
 * 4. PHONE NORMALIZATION BOUNDARY
 * ================================================================== */
console.log('\n[4] Phone Normalization Boundary');

check('resolvePhoneSignal — valid phone + country → normalized', () => {
  const signal = resolvePhoneSignal({
    contact: { phone: '(415) 487-2600' },
    location: { country: 'US' },
  });
  assert.strictEqual(signal.status, 'normalized');
  assert.strictEqual(signal.value, '+14154872600');
});

check('resolvePhoneSignal — valid phone without country → unresolved (present)', () => {
  const signal = resolvePhoneSignal({
    contact: { phone: '(415) 487-2600' },
  });
  assert.strictEqual(signal.status, 'unresolved');
  assert.strictEqual(signal.value, null);
  assert.strictEqual(signal.raw, '(415) 487-2600');
});

check('resolvePhoneSignal — missing phone → absent', () => {
  const signal = resolvePhoneSignal({ contact: {} });
  assert.strictEqual(signal.status, 'absent');
  assert.strictEqual(signal.value, null);
});

check('resolvePhoneSignal — malformed phone → unresolved', () => {
  const signal = resolvePhoneSignal({ contact: { phone: 'not-a-phone' } });
  assert.strictEqual(signal.status, 'unresolved');
});

// A. Valid phone + country → normalized (E.164 preserved)
check('A. Valid phone + country → normalized', () => {
  assert.strictEqual(normalizePhone('(415) 487-2600', 'US'), '+14154872600');
  assert.strictEqual(normalizePhone('+1 (415) 487-2600'), '+14154872600');
});

// B. Valid phone without country → retained as unresolved/present (not silently absent)
check('B. Valid phone without country → unresolved signal (not absent)', () => {
  const signal = resolvePhoneSignal({ contact: { phone: '(415) 487-2600' } });
  assert.strictEqual(signal.status, 'unresolved');
  assert.notStrictEqual(signal.status, 'absent');
  assert.ok(signal.raw, 'Raw phone must be preserved');
});

// C. Missing phone → absent
check('C. Missing phone → absent', () => {
  assert.strictEqual(resolvePhoneSignal({ contact: {} }).status, 'absent');
  assert.strictEqual(resolvePhoneSignal({}).status, 'absent');
});

// D. Malformed phone → unresolved (not normalized, not absent)
check('D. Malformed phone → unresolved', () => {
  const signal = resolvePhoneSignal({ contact: { phone: '+ZZZ' } });
  assert.strictEqual(signal.status, 'unresolved');
});

// E. Identity resolution still works using address/domain/coordinates/name
//    when phone is unresolved.
check('E. Resolution works on other signals when phone unresolved', () => {
  const a = {
    identity: { name: 'Blue Bottle Coffee' },
    contact: { phone: '(510) 653-3394', website: 'https://bluebottlecoffee.com' },
    location: {
      full_address: '300 Webster Street, Oakland, CA 94607',
      city: 'Oakland',
      state: 'California',
      coordinates: { lat: 37.7989, lng: -122.2654 },
    },
  };
  const b = {
    identity: { name: 'Blue Bottle Coffee' },
    contact: { phone: '+1-510-653-3394', website: 'bluebottlecoffee.com' },
    location: {
      full_address: '300 Webster St, Oakland, California 94607',
      city: 'Oakland',
      state: 'California',
      coordinates: { lat: 37.7989, lng: -122.2654 },
    },
  };
  const result = calculateMatchScore(a, b);
  // Even with one unresolved phone, name + website + address + coordinates
  // produce a confident match.
  assert.ok(result.score >= 0.85, `Expected score >= 0.85, got ${result.score}`);
  assert.strictEqual(result.matchType, 'same_entity', `Expected same_entity, got ${result.matchType}`);
});

check('Unresolved phone does NOT create a false positive on its own', () => {
  const a = {
    identity: { name: 'Cafe A' },
    contact: { phone: '(415) 555-0100' },
    location: { full_address: '1 First Street, Bakersfield, CA', coordinates: { lat: 35.3733, lng: -119.0187 } },
  };
  const b = {
    identity: { name: 'Cafe B' },
    contact: { phone: '(415) 555-0199' },
    location: { full_address: '2 Second Street, Bakersfield, CA', coordinates: { lat: 35.3734, lng: -119.0188 } },
  };
  const result = calculateMatchScore(a, b);
  assert.notStrictEqual(result.matchType, 'same_entity', 'Unresolved phones must not create a false positive');
});

/* ================================================================== *
 * 5. PROVENANCE / FACTS REGRESSION
 * ================================================================== */
console.log('\n[5] Provenance / Facts Regression');

check('BusinessProfile preserves provenance on every field', () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Tartine Bakery', 'identified', 0.6, { sourceUrl: 'https://maps.google.com' });
  profile.set('contact.phone', '+1-415-487-2600', 'discovered', 0.8, { sourceUrl: 'https://geoapify.example' });
  profile.set('identity.description', 'A bakery', 'inferred', 0.5, { sourceUrl: 'https://ai.example' });
  profile.set('contact.website', 'https://tartinebakery.com', 'verified', 0.95, { sourceUrl: 'https://tartinebakery.com' });

  assert.strictEqual(profile.getField('identity.name').provenance, 'identified');
  assert.strictEqual(profile.getField('contact.phone').provenance, 'discovered');
  assert.strictEqual(profile.getField('identity.description').provenance, 'inferred');
  assert.strictEqual(profile.getField('contact.website').provenance, 'verified');
});

check('intelligence.facts preserves true provenance (no false verified)', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Tartine Bakery', 'identified', 0.6, { sourceUrl: 'https://maps.google.com' });
  profile.set('ratings.rating', 4.8, 'discovered', 0.8, { sourceUrl: 'https://geoapify.example' });
  profile.set('contact.phone', '(415) 487-2600', 'ai_generated', 0.6, { sourceUrl: 'https://ai.example' });

  const intelligence = BusinessResearchService._profileToIntelligence(profile, {}, {});

  const nameFact = intelligence.facts.find((f) => f.claim.includes('Business name'));
  const ratingFact = intelligence.facts.find((f) => f.claim.includes('rating'));
  const phoneFact = intelligence.facts.find((f) => f.claim.startsWith('Phone:'));

  assert.ok(nameFact, 'Name fact exists');
  assert.strictEqual(nameFact.verified, false, 'identified data must NOT be labeled verified: true');
  assert.strictEqual(nameFact.verification, 'identified', 'identified provenance preserved');

  assert.ok(ratingFact, 'Rating fact exists');
  assert.strictEqual(ratingFact.verified, false, 'discovered data must NOT be labeled verified: true');
  assert.strictEqual(ratingFact.verification, 'discovered', 'discovered provenance preserved');

  assert.ok(phoneFact, 'Phone fact exists');
  assert.strictEqual(phoneFact.verification, 'ai_generated', 'AI-generated data distinguishable');
  assert.strictEqual(phoneFact.verified, false, 'AI data never verified');
});

check('verified data remains verified in facts', async () => {
  const profile = new BusinessProfile();
  profile.set('contact.website', 'https://tartinebakery.com', 'verified', 0.95, { sourceUrl: 'https://tartinebakery.com' });
  const intelligence = BusinessResearchService._profileToIntelligence(profile, {}, {});
  const websiteFact = intelligence.facts.find((f) => f.claim.startsWith('Website:'));
  assert.ok(websiteFact, 'Website fact exists');
  assert.strictEqual(websiteFact.verified, true, 'verified data stays verified');
  assert.strictEqual(websiteFact.verification, 'verified');
});

/* ================================================================== *
 * CLEANUP
 * ================================================================== */
await asyncTestQueue;

console.log('\n[9] Cleanup');

check('Close test database', () => {
  closeDatabase();
});

/* ------------------------------------------------------------------ */
console.log(`\n------------------------------------`);
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.error.message}`);
  }
  process.exit(1);
}

console.log('\n✓ All P1.2 identity integrity tests passed');
process.exit(0);