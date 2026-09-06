/**
 * PHASE 14 — Entity Resolution Refinement: focused evaluation
 *
 * A small, hand-labelled set of cases that exercise the three refinements made
 * to calculateMatchScore()/classifyMatchType() in this phase:
 *
 *   (A) same brand / different location no longer collapses to different_entity
 *       just because the local phone differs;
 *   (B) a genuine relocation (stable phone + domain, changed location) is
 *       recognised as relocated_entity instead of same_entity;
 *   (C) confidence is evidence-coverage aware — records missing core identity
 *       fields cannot reach the same confidence (or same_entity) as a fully
 *       corroborated match, WITHOUT any arbitrary per-null penalty.
 *
 * Each case documents WHY the expected label is the semantically defensible
 * one, not merely what makes a number go up. This file is additive: it does not
 * modify the engine or any other test.
 *
 * Run: node test_phase14_entity_resolution.js
 */

import { calculateMatchScore } from './src/services/EntityResolution.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function run(id, description, r1, r2, assertFn) {
  const result = calculateMatchScore(r1, r2);
  console.log(
    `\n[${id}] ${description}\n     -> matchType=${result.matchType} ` +
      `score=${result.score.toFixed(3)} coverage=${result.signals.evidence_coverage} ` +
      `contradictions=${result.contradictions.map((c) => c.field).join(',') || 'none'}`
  );
  assertFn(result);
  return result;
}

console.log('='.repeat(72));
console.log('PHASE 14 — Entity Resolution refinement focused cases');
console.log('='.repeat(72));

// ---------------------------------------------------------------------------
// (A) SAME BRAND, DIFFERENT LOCATION
// ---------------------------------------------------------------------------

// P14-1: same brand + shared website domain + different location + different
// LOCAL phone. This is the canonical chain-outlet pattern. The differing phone
// must NOT be read as "different entity"; the shared domain + strong name +
// affirmatively different location identify it as one brand at two locations.
run(
  'P14-1',
  'Same brand, same domain, different location, different local phone',
  {
    name: "Peet's Coffee",
    phone: '415-111-1111',
    website: 'peets.com',
    address: '100 Main St, San Francisco, CA 94105',
    country: 'US',
  },
  {
    name: "Peet's Coffee",
    phone: '510-222-2222',
    website: 'peets.com',
    address: '200 Broadway, Oakland, CA 94607',
    country: 'US',
  },
  (r) => {
    check('P14-1 classified same_brand_different_location', r.matchType === 'same_brand_different_location', r.matchType);
    check('P14-1 not same_entity', r.matchType !== 'same_entity');
  }
);

// P14-2: same brand name BUT different website domains + different location +
// different phone. Without a shared hard identifier (domain), we cannot PROVE
// the two are the same brand, and the differing phone is a genuine conflict.
// The conservative, defensible call is different_entity — we do not upgrade to
// same_brand on name similarity alone. (Missing corroboration != invented one.)
run(
  'P14-2',
  'Same brand name, DIFFERENT domains, different location — conservative',
  {
    name: "Peet's Coffee",
    phone: '415-111-1111',
    website: 'peets.com',
    address: '100 Main St, San Francisco, CA 94105',
    country: 'US',
  },
  {
    name: "Peet's Coffee",
    phone: '510-222-2222',
    website: 'peets-oakland.com',
    address: '200 Broadway, Oakland, CA 94607',
    country: 'US',
  },
  (r) => {
    check('P14-2 not same_entity', r.matchType !== 'same_entity', r.matchType);
    check('P14-2 not same_brand (no shared domain to prove it)', r.matchType !== 'same_brand_different_location', r.matchType);
    check('P14-2 not relocated', r.matchType !== 'relocated_entity', r.matchType);
  }
);

// ---------------------------------------------------------------------------
// (B) RELOCATED ENTITY
// ---------------------------------------------------------------------------

// P14-3: stable identity — same name + SAME phone + shared domain — but a
// different street address and NO coordinates. This is the address-only
// relocation signal: identity carried over, physical location changed.
run(
  'P14-3',
  'Relocation: same name + same phone + same domain, changed address, no coords',
  {
    name: 'Dandelion Chocolate',
    phone: '415-349-0942',
    website: 'dandelionchocolate.com',
    address: '740 Valencia St, San Francisco, CA 94110',
    country: 'US',
  },
  {
    name: 'Dandelion Chocolate',
    phone: '415-349-0942',
    website: 'dandelionchocolate.com',
    address: '2600 16th St, San Francisco, CA 94103',
    country: 'US',
  },
  (r) => {
    check('P14-3 classified relocated_entity', r.matchType === 'relocated_entity', r.matchType);
    check('P14-3 not same_entity', r.matchType !== 'same_entity');
  }
);

// P14-4: the same relocation but with coordinates ~1.2km apart. Coordinates are
// authoritative for location: they confirm the move, so this is relocated_entity
// (not same_entity, despite identical name/phone/domain).
run(
  'P14-4',
  'Relocation confirmed by coordinates (~1.2km apart)',
  {
    name: 'Dandelion Chocolate',
    phone: '415-349-0942',
    website: 'dandelionchocolate.com',
    address: '740 Valencia St, San Francisco, CA 94110',
    coordinates: { lat: 37.7599, lng: -122.4214 },
    country: 'US',
  },
  {
    name: 'Dandelion Chocolate',
    phone: '415-349-0942',
    website: 'dandelionchocolate.com',
    address: '2600 16th St, San Francisco, CA 94103',
    coordinates: { lat: 37.7663, lng: -122.411 },
    country: 'US',
  },
  (r) => {
    check('P14-4 classified relocated_entity', r.matchType === 'relocated_entity', r.matchType);
    check('P14-4 not same_entity', r.matchType !== 'same_entity');
  }
);

// P14-5: same name + different address + INSUFFICIENT other evidence (no phone,
// no website). Relocation must NOT be inferred from name + a location change
// alone — without a stable hard identifier we cannot distinguish a move from two
// unrelated same-named shops. Correct call is uncertain (preserve the ambiguity),
// certainly not same_entity or relocated_entity.
run(
  'P14-5',
  'Same name + different address + insufficient evidence — ambiguous',
  {
    name: 'Corner Store',
    address: '10 Market Street, San Francisco, CA 94105',
    location: { city: 'San Francisco', state: 'California' },
  },
  {
    name: 'Corner Store',
    address: '500 Market Street, San Francisco, CA 94105',
    location: { city: 'San Francisco', state: 'California' },
  },
  (r) => {
    check('P14-5 classified uncertain', r.matchType === 'uncertain', r.matchType);
    check('P14-5 not same_entity', r.matchType !== 'same_entity');
    check('P14-5 not relocated_entity', r.matchType !== 'relocated_entity');
  }
);

// ---------------------------------------------------------------------------
// (C) EVIDENCE-COVERAGE-AWARE CONFIDENCE
// ---------------------------------------------------------------------------

// P14-6: one record is missing a phone; everything else (name, domain, address,
// coordinates) matches exactly. This is still the same entity — a MISSING phone
// is not a WRONG phone — but the confidence must be visibly below a
// fully-corroborated match to reflect the reduced evidence coverage.
run(
  'P14-6',
  'Missing phone on one side, else exact — same_entity at reduced confidence',
  {
    name: 'Ritual Coffee',
    website: 'ritualcoffee.com',
    address: '1026 Valencia Street, San Francisco, CA 94110',
    coordinates: { lat: 37.7566, lng: -122.4213 },
  },
  {
    name: 'Ritual Coffee',
    phone: '415-641-1011',
    website: 'ritualcoffee.com',
    address: '1026 Valencia Street, San Francisco, CA 94110',
    coordinates: { lat: 37.7566, lng: -122.4213 },
    country: 'US',
  },
  (r) => {
    check('P14-6 classified same_entity', r.matchType === 'same_entity', r.matchType);
    check('P14-6 confidence reduced below full (score < 1.0)', r.score < 1.0, `score=${r.score}`);
    check('P14-6 still confident enough (score >= 0.85)', r.score >= 0.85, `score=${r.score}`);
    check('P14-6 coverage reflects the gap (< 1.0)', r.signals.evidence_coverage < 1.0, `coverage=${r.signals.evidence_coverage}`);
  }
);

// P14-7: one record is missing a website; name + phone + address match exactly,
// no coordinates. Same reasoning as P14-6 — same_entity, reduced confidence.
run(
  'P14-7',
  'Missing website on one side, else exact — same_entity at reduced confidence',
  {
    name: 'Ritual Coffee',
    phone: '415-641-1011',
    address: '1026 Valencia Street, San Francisco, CA 94110',
    country: 'US',
  },
  {
    name: 'Ritual Coffee',
    phone: '415-641-1011',
    website: 'ritualcoffee.com',
    address: '1026 Valencia Street, San Francisco, CA 94110',
    country: 'US',
  },
  (r) => {
    check('P14-7 classified same_entity', r.matchType === 'same_entity', r.matchType);
    check('P14-7 confidence reduced below full (score < 1.0)', r.score < 1.0, `score=${r.score}`);
    check('P14-7 coverage reflects the gap (< 1.0)', r.signals.evidence_coverage < 1.0, `coverage=${r.signals.evidence_coverage}`);
  }
);

// P14-8: strong identifiers (name + phone + domain match) but NO address and NO
// coordinates on either side — location is entirely unconfirmable. Even with
// matching hard identifiers, we cannot assert the two records are the same
// physical entity, so this is uncertain rather than same_entity. This is the
// key guard that missing location evidence does not get "rounded up".
run(
  'P14-8',
  'Matching name+phone+domain but NO location evidence — uncertain',
  {
    name: 'Ritual Coffee',
    phone: '415-641-1011',
    website: 'ritualcoffee.com',
    country: 'US',
  },
  {
    name: 'Ritual Coffee',
    phone: '415-641-1011',
    website: 'ritualcoffee.com',
    country: 'US',
  },
  (r) => {
    check('P14-8 classified uncertain', r.matchType === 'uncertain', r.matchType);
    check('P14-8 not same_entity (location unconfirmed)', r.matchType !== 'same_entity');
  }
);

// P14-9: two genuinely different businesses whose names look similar (share many
// characters) but with conflicting phone, website and address. Name resemblance
// must not overpower hard contradictions — this is different_entity.
run(
  'P14-9',
  'Unrelated businesses with similar-looking names — different_entity',
  {
    name: 'Bay Bakery',
    phone: '415-111-1111',
    website: 'baybakery.com',
    address: '1 Alpha Street, San Francisco, CA 94105',
    country: 'US',
  },
  {
    name: 'Bakery Bay Cafe',
    phone: '415-222-2222',
    website: 'bakerybaycafe.com',
    address: '2 Beta Avenue, Oakland, CA 94607',
    country: 'US',
  },
  (r) => {
    check('P14-9 classified different_entity', r.matchType === 'different_entity', r.matchType);
    check('P14-9 not same_entity', r.matchType !== 'same_entity');
  }
);

// P14-10: identical records with full core coverage. Regression guard for the
// corrected fixture (F4) and the primary contract: identical -> same_entity,
// high score, zero contradictions, full coverage (no discount applied).
run(
  'P14-10',
  'Identical records, full coverage — same_entity at full confidence',
  {
    name: 'Souvla',
    phone: '415-400-5458',
    website: 'souvla.com',
    address: '517 Hayes Street, San Francisco, CA 94102',
    coordinates: { lat: 37.7767, lng: -122.4244 },
    country: 'US',
  },
  {
    name: 'Souvla',
    phone: '415-400-5458',
    website: 'souvla.com',
    address: '517 Hayes Street, San Francisco, CA 94102',
    coordinates: { lat: 37.7767, lng: -122.4244 },
    country: 'US',
  },
  (r) => {
    check('P14-10 classified same_entity', r.matchType === 'same_entity', r.matchType);
    check('P14-10 high confidence (score >= 0.85)', r.score >= 0.85, `score=${r.score}`);
    check('P14-10 no contradictions', r.contradictions.length === 0);
    check('P14-10 full coverage (== 1.0)', r.signals.evidence_coverage === 1.0, `coverage=${r.signals.evidence_coverage}`);
  }
);

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(72));
console.log(`PHASE 14 RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(72));
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  process.exit(1);
}
