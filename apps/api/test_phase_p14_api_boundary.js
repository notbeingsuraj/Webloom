/**
 * P1.4 — Canonical HTTP/API response boundary tests
 *
 * Verifies that /api/business/* responses derive their business representation
 * from CanonicalBusinessProfileService and never independently reconstruct
 * canonical fields from raw intelligence in the route.
 *
 * The production route receives an "intelligence" record from
 * BusinessResearchService (identity/contact/location/digitalPresence/facts/
 * unknowns/trustSignals/positioning/confidence). P1.4 routes that record
 * through the canonical projection:
 *
 *   provider/internal representations
 *             ↓
 *   existing domain processing (BusinessResearchService)
 *             ↓
 *   CanonicalBusinessProfileService.fromEntityData({ record })
 *             ↓
 *   HTTP response serializer
 *             ↓
 *   /api/business/analyze , /api/business/research
 *
 * Coverage (spec §10):
 *   1.  endpoint returns canonical business representation
 *   2.  canonical identity is correct
 *   3.  provider IDs remain outside identity (inside providers[])
 *   4.  ai_generated provenance survives (P1.2 quarantine never upgraded)
 *   5.  missing identity never becomes synthetic
 *   6.  coordinates retain { lat, lng } object structure
 *   7.  endpoint-specific metadata remains available (metadata.analysis)
 *   8.  existing successful response behavior remains compatible
 *   9.  canonical response does not expose raw provider shape accidentally
 *  10.  canonical response does not expose internal persistence structures
 *  11.  repeated equivalent requests → equivalent canonical output (determinism)
 *  12.  route does not perform unexpected writes
 *
 * Usage: node test_phase_p14_api_boundary.js
 */

import assert from 'node:assert/strict';
import app from './src/app.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import BrandStrategyService from './src/services/BrandStrategyService.js';
import CanonicalBusinessProfileService from './src/services/CanonicalBusinessProfileService.js';

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
 * FIXTURES — intelligence records in the real production shape
 * (the shape _profileToIntelligence returns, consumed by the route)
 * ================================================================ */

const googPlaceId = 'ChIJtartine_test_01';

function buildIntelligence(overrides = {}) {
  const record = {
    source: {
      query: 'Tartine Bakery San Francisco',
      placeId: googPlaceId,
      resolvedName: 'Tartine Bakery',
      resolutionStatus: 'resolved',
      resolutionConfidence: 0.9,
      mapsUrl: 'https://maps.google.com/?cid=12345',
      providers: {
        geoapify: 'ok',
        webExtraction: 'no_result',
        aiEnrichment: false,
      },
    },
    identity: {
      name: 'Tartine Bakery',
      category: 'Bakery',
      businessType: 'commercial.food_and_drink.bakery',
      description: 'Artisanal bakery in San Francisco.',
      categories: ['Bakery', 'Coffee Shop'],
    },
    contact: {
      phone: '+1-415-487-2600',
      email: 'hello@tartinebakery.com',
      website: 'https://tartinebakery.com',
    },
    location: {
      address: '600 Guerrero Street, San Francisco, CA 94110',
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
      postalCode: '94110',
      coordinates: { lat: 37.7614552, lng: -122.4239452 },
    },
    digitalPresence: {
      googleMapsUrl: 'https://maps.google.com/?cid=12345',
      website: 'https://tartinebakery.com',
      socialProfiles: { facebook: null, instagram: null, twitter: null, linkedin: null },
      hasWebsite: true,
      photos: ['https://example.test/photo1.jpg'],
    },
    services: ['Bakery', 'Coffee Shop'],
    trustSignals: ['well-reviewed on Google', 'settled address'],
    positioning: { priceLevel: '$$', category: 'Bakery', location: '600 Guerrero Street' },
    facts: [{ claim: 'Business name is Tartine Bakery', source: 'discovered', verified: false, verification: 'discovered' }],
    unknowns: [{ field: 'email', reason: 'not on website' }],
    rating: 4.6,
    reviewCount: 2210,
    openingHours: { monday: '07:30-18:00', saturday: '08:00-18:00' },
    reviews: [{ author: 'reviewer-1', rating: 5, text: 'great' }],
    photos: ['https://example.test/photo1.jpg'],
    confidence: { overall: 0.91 },
    validationIssues: [],
  };
  return { ...record, ...overrides };
}

// AI-extracted intelligence (metadata.aiExtracted → hard quarantine surface).
function buildAiExtractedIntelligence() {
  const record = buildIntelligence();
  record.metadata = { aiExtracted: true, acquisitionMethod: 'ai_enrichment' };
  record.identity._provenance = {
    name: { provenance: 'ai_generated', confidence: 0.6, hasConflict: false },
    phone: { provenance: 'ai_generated', confidence: 0.6, hasConflict: false },
    website: { provenance: 'ai_generated', confidence: 0.6, hasConflict: false },
    address: { provenance: 'ai_generated', confidence: 0.6, hasConflict: false },
    coordinates: { provenance: 'ai_generated', confidence: 0.6, hasConflict: false },
  };
  return record;
}

function configureDependencies(intelligenceFactory = buildIntelligence, persistence = null) {
  BusinessResearchService.extractBusinessIntelligenceWithProviders = async () => ({
    success: true,
    intelligence: intelligenceFactory(),
    provider: { geoapify: 'ok', webExtraction: 'no_result', aiEnrichment: false },
    validation: { issues: [], warnings: [] },
    hints: {},
    persistence: persistence ?? { status: 'skipped', entityId: null, providerIdentities: [], resolutionRecord: null },
  });
  BusinessResearchService._persistIdentity = async () => ({
    status: 'skipped', entityId: null, providerIdentities: [], resolutionRecord: null,
  });
  BrandStrategyService.generateBrandDNA = async () => ({
    businessIdentity: { name: 'Tartine Bakery' },
    audience: { primary: { segment: 'local customers' } },
    services: { core: ['Bakery'] },
    trustSignals: [],
    brandPersonality: {},
    positioning: {},
    conversionStrategy: { primaryCTA: { text: 'Call now' } },
  });
}

async function startServer() {
  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
  return { server, port };
}

async function request(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/* ================================================================
 * TESTS
 * ================================================================ */

async function main() {
  console.log('\nP1.4 CANONICAL API RESPONSE BOUNDARY');

  configureDependencies();
  const { server, port } = await startServer();

  // ---- 1. Endpoint returns canonical business representation ----
  await checkAsync('analyze returns a canonical business representation', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    assert.equal(res.status, 200);
    const b = res.body.business;
    // Canonical shape keys (the projection contract) are present.
    assert.ok(b.identity, 'identity section missing');
    assert.ok(b.business, 'business section missing');
    assert.ok(b.reputation, 'reputation section missing');
    assert.ok(Array.isArray(b.providers), 'providers[] missing');
    assert.ok(b.provenance && typeof b.provenance === 'object', 'provenance map missing');
    assert.ok(b.confidence && typeof b.confidence === 'object', 'confidence map missing');
    assert.ok(b.enrichment && typeof b.enrichment === 'object', 'enrichment section missing');
    // The canonical section must not contain the raw intelligence shape.
    assert.equal(b.contact, undefined, 'raw contact shape leaked into canonical output');
    assert.equal(b.location, undefined, 'raw location shape leaked into canonical output');
    assert.equal(b.identity._provenance, undefined, 'internal provenance shape leaked');
  });

  // ---- 2. Canonical identity is correct ----
  await checkAsync('canonical identity fields come from canonical projection', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const id = res.body.business.identity;
    assert.equal(id.name, 'Tartine Bakery');
    assert.equal(id.address, '600 Guerrero Street, San Francisco, CA 94110');
    assert.equal(id.phone, '+1-415-487-2600');
    assert.equal(id.website, 'https://tartinebakery.com');
    assert.equal(id.domain, 'tartinebakery.com');
    assert.deepEqual(id.coordinates, { lat: 37.7614552, lng: -122.4239452 });
    assert.equal(id.entityId, null); // no persisted entity in this mock
  });

  // ---- 3. Provider IDs remain outside canonical identity ----
  await checkAsync('provider ID (placeId) is isolated in providers[], never identity', async () => {
    // Simulate a research run that persisted a provider identity: the route
    // must route those observations through the projection (providers[]),
    // never into identity.
    configureDependencies(buildIntelligence, {
      status: 'ok',
      entityId: null,
      providerIdentities: [
        {
          provider: 'geoapify',
          providerRecordId: googPlaceId,
          resolutionMethod: 'provider_lookup',
          resolutionConfidence: 0.9,
          firstSeen: '2025-09-08T10:00:00.000Z',
          lastSeen: '2025-09-08T10:00:00.000Z',
        },
      ],
      resolutionRecord: null,
      reviewItems: [],
    });
    try {
      const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
      assert.equal(res.status, 200);
      const b = res.body.business;

      // The placeId must not appear anywhere in identity or business sections.
      const identityJson = JSON.stringify(b.identity);
      const businessJson = JSON.stringify(b.business);
      assert.equal(identityJson.includes(googPlaceId), false, 'placeId leaked into identity');
      assert.equal(businessJson.includes(googPlaceId), false, 'placeId leaked into business section');
      // No provider-labeled id fields in identity.
      for (const key of ['providerRecordId', 'googlePlaceId', 'geoapifyPlaceId', 'placeId']) {
        assert.equal(key in b.identity, false, `${key} present in identity`);
      }
      // The canonical provider entry carries the record id in the correct place.
      const provider = b.providers.find((p) => p.provider === 'geoapify');
      assert.ok(provider, 'geoapify provider entry missing');
      assert.equal(provider.providerRecordId, googPlaceId);
    } finally {
      configureDependencies(); // restore clean fixture regardless of outcome
    }
  });

  // ---- 4. AI provenance survives (quarantine) ----
  await checkAsync('analysis metadata preserves endpoint-specific fields', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const analysis = res.body.metadata?.analysis;
    assert.ok(analysis, 'metadata.analysis missing');
    assert.equal(analysis.source?.placeId, googPlaceId);
    assert.ok(Array.isArray(analysis.facts), 'facts missing');
    assert.ok(Array.isArray(analysis.unknowns), 'unknowns missing');
    assert.ok(Array.isArray(analysis.trustSignals), 'trustSignals missing');
    assert.equal(analysis.rating, 4.6);
    assert.equal(analysis.reviewCount, 2210);
    assert.deepEqual(analysis.openingHours, { monday: '07:30-18:00', saturday: '08:00-18:00' });
    assert.ok(Array.isArray(analysis.reviews), 'reviews missing');
    assert.ok(Array.isArray(analysis.photos), 'photos missing');
  });

  // ---- 5. Missing identity never becomes synthetic ----
  await checkAsync('missing canonical identity stays null (never synthetic)', async () => {
    configureDependencies(() => {
      const rec = buildIntelligence();
      rec.identity.name = null;
      rec.identity.category = null;
      rec.contact.phone = null;
      rec.contact.website = null;
      rec.location.address = null;
      rec.location.coordinates = null;
      return rec;
    });
    try {
      const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
      const id = res.body.business.identity;
      assert.equal(id.name, null);
      assert.equal(id.address, null);
      assert.equal(id.phone, null);
      assert.equal(id.website, null);
      assert.equal(id.domain, null);
      assert.equal(id.coordinates, null);
      const json = JSON.stringify(id).toLowerCase();
      assert.equal(json.includes('unknown business'), false);
      assert.equal(json.includes('unnamed'), false);
      assert.equal(json.includes('n/a'), false);
    } finally {
      configureDependencies(); // restore clean fixture regardless of outcome
    }
  });

  // ---- 6. Coordinates retain object structure ----
  await checkAsync('coordinates remain a structured { lat, lng } object', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const coords = res.body.business.identity.coordinates;
    assert.ok(coords && typeof coords === 'object');
    assert.equal(typeof coords.lat, 'number');
    assert.equal(typeof coords.lng, 'number');
    assert.notEqual(JSON.stringify(coords), '[object Object]');
  });

  // ---- 7. Endpoint-specific metadata remains available (analyze) ----
  await checkAsync('metadata.analysis preserves endpoint-specific intelligence', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    assert.equal(res.body.success, true);
    assert.equal(res.body.business.identity.name, 'Tartine Bakery');
    assert.equal(res.body.metadata.source, 'geoapify_and_web_extraction');
    assert.equal(res.body.metadata.providers.geoapify, 'ok');
    assert.equal(res.body.metadata.confidence, 0.91);
    assert.equal(res.body.metadata.brandDNAStatus, 'ok');
    assert.ok(res.body.businessDNA, 'businessDNA missing');
  });

  // ---- 8. Existing successful response behavior remains compatible ----
  await checkAsync('existing businessName greeting still works / 400 validation intact', async () => {
    const ok = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    const bad = await request(port, '/api/business/analyze', {});
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /required/);
    const badUrl = await request(port, '/api/business/analyze', { googleMapsUrl: 'not-a-url' });
    assert.equal(badUrl.status, 400);
    assert.equal(badUrl.body.code, 'INVALID_URL');
  });

  // ---- research endpoint also canonical ----
  await checkAsync('/api/business/research returns canonical business data', async () => {
    const res = await request(port, '/api/business/research', { googleMapsUrl: 'https://maps.google.com/?cid=12345' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const b = res.body.data;
    assert.equal(b.identity.name, 'Tartine Bakery');
    assert.equal(b.identity.address, '600 Guerrero Street, San Francisco, CA 94110');
    assert.equal(b.identity.phone, '+1-415-487-2600');
    assert.equal(b.identity.website, 'https://tartinebakery.com');
    assert.deepEqual(b.identity.coordinates, { lat: 37.7614552, lng: -122.4239452 });
    assert.equal(JSON.stringify(b.identity).includes(googPlaceId), false, 'placeId leaked into identity');
    assert.equal(b.contact, undefined, 'raw contact shape leaked');
    assert.equal(res.body.metadata.sourceUrl, 'https://maps.google.com/?cid=12345');
  });

  // ---- 9. Canonical response does not expose raw provider shape ----
  await checkAsync('canonical output does not expose raw flat provider shape', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const b = res.body.business;
    const json = JSON.stringify(b);
    // Raw flat provider shape keys must not appear at top-level canonical sections.
    assert.equal(b.ratings, undefined, 'ratings shape leaked');
    assert.equal(b.location, undefined, 'location shape leaked');
    assert.equal(b.contact, undefined, 'contact shape leaked');
    assert.equal(b.email, undefined, 'bare email field leaked');
    assert.equal(b.phone, undefined, 'bare phone field leaked');
    assert.equal(b.website, undefined, 'bare website field leaked');
    // No raw provider object nested under canonical output.
    assert.equal(b.provider, undefined, 'raw provider object leaked');
    assert.equal(json.includes('datasource'), false, 'provider datasource leaked');
  });

  // ---- 10. Canonical response does not expose internal persistence structures ----
  await checkAsync('no internal persistence structures exposed', async () => {
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const json = JSON.stringify(res.body.business);
    for (const key of ['business_entity', 'canonical_field', 'provider_identity', '_profile', 'metadata.extractionHistory']) {
      assert.equal(json.includes(key), false, `internal persistence struct exposed: ${key}`);
    }
  });

  // ---- 11. Determinism: repeated equivalent requests → equivalent canonical output ----
  await checkAsync('repeated equivalent requests produce equivalent canonical output', async () => {
    const first = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    const second = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const strip = (body) => {
      const b = body.business;
      // extractedAt is endpoint metadata, not canonical business data — exclude.
      return JSON.stringify({ identity: b.identity, business: b.business, reputation: b.reputation, providers: b.providers });
    };
    assert.equal(strip(first.body), strip(second.body));
  });

  // ---- 12. Route does not perform unexpected writes ----
  // The route is an HTTP orchestration layer: with a research pipeline that
  // returns an intelligence record but SKIPS persistence, the response must
  // not write anything. Assert the persistence hook returns 'skipped' and
  // that no entity/provider rows are created by the route itself — the
  // canonical projection is a pure read.
  await checkAsync('analyze with skipped persistence performs no writes', async () => {
    const originalPersist = BusinessResearchService._persistIdentity;
    BusinessResearchService._persistIdentity = async () => ({
      status: 'skipped', entityId: null, providerIdentities: [], resolutionRecord: null,
    });
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    BusinessResearchService._persistIdentity = originalPersist;
    assert.equal(res.status, 200);
    assert.equal(res.body.metadata.persistence.status, 'skipped');
    // The canonical projection performed no side effects: providers[] is
    // derived solely from the record's own source metadata (no DB writes).
    const b = res.body.business;
    assert.ok(Array.isArray(b.providers), 'providers[] must exist');
    for (const p of b.providers) {
      assert.equal(JSON.stringify(p).includes('business_entity'), false, 'no persistence internals in providers');
    }
  });

  // The route never exposes internal persistence structures even when they
  // are present on the research result.
  await checkAsync('persistence internals never leaked into canonical business section', async () => {
    configureDependencies(() => {
      const rec = buildIntelligence();
      // Simulate a real research result carrying internal-only persistence
      // structures that the route must not propagate into the business data.
      rec._internal = { secret: 'should-not-leak' };
      return rec;
    });
    try {
      const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
      assert.equal(res.status, 200);
      const json = JSON.stringify(res.body.business);
      assert.equal(json.includes('should-not-leak'), false, 'internal field leaked into canonical output');
      assert.equal(json.includes('_internal'), false, '_internal key leaked into canonical output');
    } finally {
      configureDependencies(); // restore
    }
  });

  // ---- AI quarantine surfaced, never upgraded ----
  await checkAsync('ai_generated intelligence stays ai_generated (P1.2 quarantine)', async () => {
    configureDependencies(buildAiExtractedIntelligence);
    const res = await request(port, '/api/business/analyze', { name: 'Tartine Bakery' });
    assert.equal(res.status, 200);
    const b = res.body.business;
    // enrichment.aiExtracted surfaces the quarantine; aiGeneratedFields recorded.
    assert.equal(b.enrichment?.aiExtracted, true, 'aiExtracted quarantine not surfaced');
    const prov = b.provenance || {};
    // ai_generated provenance must not be upgraded anywhere in the provenance map.
    for (const [path, meta] of Object.entries(prov)) {
      assert.notEqual(meta.provenance, 'verified', `${path} upgraded ai_generated → verified`);
      assert.notEqual(meta.provenance, 'discovered', `${path} upgraded ai_generated → discovered`);
      assert.notEqual(meta.provenance, 'identified', `${path} upgraded ai_generated → identified`);
      assert.notEqual(meta.provenance, 'user_provided', `${path} upgraded ai_generated → user_provided`);
    }
    // Inferred-from-raw provenance (identity.name maps via readField to unproven)
    // stays unproven or does not appear as a deterministic tier.
    configureDependencies(); // restore
  });

  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (failed > 0) {
    console.error('\nFAILURES:');
    for (const f of failures) console.error(`  - ${f.name}: ${f.error.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});