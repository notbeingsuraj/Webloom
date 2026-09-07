/**
 * Phase 20 — Stabilization invariant tests
 *
 * Proves the invariants required by the architecture stabilization audit:
 *   A. Phone normalization is country-aware (requirement #4)
 *   B. Identity evidence has strength semantics (requirement #5)
 *   C. Normalization is single-authority (requirement #3)
 *   D. Provider contract is enforced (requirement #1)
 *   E. Metamorphic normalization (requirement #16f)
 *
 * Run: node test_phase20_stabilization.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { normalizePhone, normalizeHours, normalizeCoordinates, normalizeWebsite, normalizeDomain, normalizeField } from './src/services/FieldNormalizer.js';
import { calculateIdentityStrength, IDENTITY_EVIDENCE_STRENGTH, createAcquisitionResult, createProviderError, sanitizeSecretText, ACQUISITION_STATUS } from './src/services/AcquisitionResult.js';
import { normalizePhone as erNormalizePhone, normalizeWebsite as erNormalizeWebsite } from './src/services/EntityResolution.js';

// ============================================================================
// A. COUNTRY-AWARE PHONE NORMALIZATION (#4)
// ============================================================================

test('phone — India country context', () => {
  assert.strictEqual(normalizePhone('+91 9876543210'), '+919876543210');
  assert.strictEqual(normalizePhone('09876543210', 'IN'), '+919876543210');
  assert.strictEqual(normalizePhone('9876543210', 'IN'), '+919876543210');
  assert.strictEqual(normalizePhone('9876543210', 'India'), '+919876543210');
});

test('phone — US and UK context', () => {
  assert.strictEqual(normalizePhone('+1 415 555 0100'), '+14155550100');
  assert.strictEqual(normalizePhone('(415) 555-0100', 'US'), '+14155550100');
  assert.strictEqual(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.strictEqual(normalizePhone('020 7946 0958', 'GB'), '+442079460958');
});

test('phone — invalid / ambiguous without country context returns null (never invents)', () => {
  assert.strictEqual(normalizePhone('not a number'), null);
  assert.strictEqual(normalizePhone(''), null);
  assert.strictEqual(normalizePhone(null), null);
  // 10-digit number without country context is ambiguous — MUST NOT become +1...
  assert.strictEqual(normalizePhone('4155550100'), null);
  // Short local number without country is ambiguous too
  assert.strictEqual(normalizePhone('555-0100'), null);
});

test('phone — already E.164 preserved', () => {
  assert.strictEqual(normalizePhone('+14155550100'), '+14155550100');
  assert.strictEqual(normalizePhone('+919876543210'), '+919876543210');
});

test('phone — Australia (non-NANP) country context', () => {
  assert.strictEqual(normalizePhone('+61491570156'), '+61491570156');
  assert.strictEqual(normalizePhone('0491 570 156', 'AU'), '+61491570156');
});

// ============================================================================
// B. IDENTITY EVIDENCE STRENGTH (#5)
// ============================================================================

test('identity evidence — name only is WEAK', () => {
  const r = calculateIdentityStrength({ 'identity.name': 'Acme Cafe' });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.WEAK);
  assert.strictEqual(r.hasName, true);
  assert.strictEqual(r.hasHardIdentifier, false);
});

test('identity evidence — generic name only is INSUFFICIENT', () => {
  const r = calculateIdentityStrength({ 'identity.name': 'Restaurant' });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.INSUFFICIENT);
});

test('identity evidence — name + address is MODERATE', () => {
  const r = calculateIdentityStrength({
    'identity.name': 'Acme Cafe',
    'location.full_address': '100 Main St, SF',
  });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.MODERATE);
});

test('identity evidence — name + phone is STRONG', () => {
  const r = calculateIdentityStrength({
    'identity.name': 'Acme Cafe',
    'contact.phone': '+14155550100',
  });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.STRONG);
});

test('identity evidence — name + address + phone is VERY_STRONG', () => {
  const r = calculateIdentityStrength({
    'identity.name': 'Acme Cafe',
    'contact.phone': '+14155550100',
    'location.full_address': '100 Main St, San Francisco, CA 94105',
  });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.VERY_STRONG);
});

test('identity evidence — stable place id + corroborating fields is VERY_STRONG', () => {
  const r = calculateIdentityStrength({
    'identity.name': 'Acme Cafe',
    'provider.placeId': 'ChIJabc123',
    'contact.website': 'acme.example.com',
  });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.VERY_STRONG);
});

test('identity evidence — phone only is MODERATE (not weak)', () => {
  const r = calculateIdentityStrength({ 'contact.phone': '+14155550100' });
  assert.strictEqual(r.strength, IDENTITY_EVIDENCE_STRENGTH.MODERATE);
});

// ============================================================================
// C. SINGLE-AUTHORITY NORMALIZATION (#3)
// ============================================================================

test('normalization — EntityResolution delegates to FieldNormalizer (same outputs)', () => {
  // Same raw value → same normalized value regardless of entry point.
  assert.strictEqual(erNormalizePhone('+1 415 555 0100'), normalizePhone('+1 415 555 0100'));
  assert.strictEqual(erNormalizePhone('9876543210', 'IN'), normalizePhone('9876543210', 'IN'));
  assert.strictEqual(erNormalizePhone('4155550100'), normalizePhone('4155550100'));
  // ER.normalizeWebsite is a domain normalizer — delegates to FieldNormalizer.normalizeDomain.
  assert.strictEqual(erNormalizeWebsite('https://www.Acme.com/path'), normalizeDomain('https://www.Acme.com/path'));
});

test('normalization — normalizeField dispatches phone/hours/coords/website', () => {
  assert.strictEqual(normalizeField('contact.phone', '+1 415 555 0100'), '+14155550100');
  assert.deepStrictEqual(normalizeField('location.coordinates', '37.77, -122.42'), { lat: 37.77, lng: -122.42 });
  assert.deepStrictEqual(normalizeField('hours', 'Mo-Fr 09:00-17:00').monday, '09:00-17:00');
  // normalizeField('contact.website') uses the URL canonicalizer.
  assert.strictEqual(normalizeField('contact.website', 'www.acme.com'), 'https://www.acme.com/');
});

test('normalization — hours equivalent representations normalize identically', () => {
  const a = normalizeHours([{ day_of_week: 0, start_time: '08:00', end_time: '16:00' }]); // 0=Sunday
  const b = normalizeHours('Su 08:00-16:00');
  const c = normalizeHours({ sunday: '08:00-16:00' });
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(b, c);
});

test('normalization — coordinate key order does not affect output', () => {
  const a = normalizeCoordinates({ lat: 37.77, lng: -122.42 });
  const b = normalizeCoordinates({ lng: -122.42, lat: 37.77 });
  assert.deepStrictEqual(a, b);
});

test('normalization — changing URL tracking params does not change normalized domain', () => {
  const w1 = normalizeDomain('https://acme.example.com/?utm_source=google&utm_medium=cpc');
  const w2 = normalizeDomain('https://acme.example.com/?ref=xyz');
  const w3 = normalizeDomain('https://acme.example.com/');
  assert.strictEqual(w1, w2);
  assert.strictEqual(w2, w3);
  assert.strictEqual(w1, 'acme.example.com');
});

// ============================================================================
// D. PROVIDER CONTRACT (#1)
// ============================================================================

const REQUIRED_ENVELOPE_KEYS = ['provider', 'status', 'records', 'error', 'diagnostics', 'source'];

test('AcquisitionResult — createAcquisitionResult enforces canonical envelope', () => {
  const r = createAcquisitionResult({
    provider: 'test-provider',
    sourceUrl: 'https://example.com',
    status: ACQUISITION_STATUS.SUCCESS,
    records: [{ business: { name: 'X' } }],
    latencyMs: 5,
  });
  for (const key of REQUIRED_ENVELOPE_KEYS) {
    assert.ok(key in r, `missing ${key}`);
  }
  assert.strictEqual(r.provider, 'test-provider');
  assert.strictEqual(r.status, ACQUISITION_STATUS.SUCCESS);
  assert.ok(Array.isArray(r.records));
  assert.strictEqual(r.error, null);
  assert.ok(r.diagnostics);
  assert.ok(r.source);
  assert.ok(Object.isFrozen(r), 'result should be frozen');
});

test('AcquisitionResult — error preserves structured fields', () => {
  const err = createProviderError({
    category: ACQUISITION_STATUS.RATE_LIMITED,
    safeMessage: 'API key sk-abcdef1234567890 rate limited',
    httpStatus: 429,
    provider: 'omniroute',
    model: 'reasoning',
    retryCount: 2,
    latencyMs: 100,
  });
  assert.strictEqual(err.category, ACQUISITION_STATUS.RATE_LIMITED);
  assert.strictEqual(err.retryable, true);
  assert.strictEqual(err.httpStatus, 429);
  assert.strictEqual(err.retryCount, 2);
  assert.ok(!err.safeMessage.includes('sk-abcdef1234567890'), 'secrets must be sanitized');
});

test('AcquisitionResult — never exposes secrets in messages', () => {
  const safe = sanitizeSecretText('Authorization: Bearer abcdef.ghijkl, api_key=secret1234');
  assert.ok(!safe.includes('abcdef.ghijkl'));
  assert.ok(!safe.includes('secret1234'));
});

test('AcquisitionResult — statuses distinguish failure categories', () => {
  assert.notStrictEqual(ACQUISITION_STATUS.RATE_LIMITED, ACQUISITION_STATUS.PROVIDER_UNAVAILABLE);
  assert.notStrictEqual(ACQUISITION_STATUS.TIMEOUT, ACQUISITION_STATUS.EXTRACTION_FAILED);
  assert.notStrictEqual(ACQUISITION_STATUS.AUTHENTICATION_FAILED, ACQUISITION_STATUS.PROVIDER_UNAVAILABLE);
  assert.notStrictEqual(ACQUISITION_STATUS.QUOTA_EXHAUSTED, ACQUISITION_STATUS.RATE_LIMITED);
  assert.notStrictEqual(ACQUISITION_STATUS.EMPTY_RESULT, ACQUISITION_STATUS.EXTRACTION_FAILED);
});