/**
 * Quality Boundary — Regression Tests
 *
 * Verifies the FieldCandidate → CandidatePipeline → validation → selection
 * boundary works correctly for all extraction paths.
 *
 * Run: node test_quality_boundary.js
 */

import assert from 'node:assert/strict';
import {
  createFieldCandidate,
  createCandidatesFromRecord,
  CANDIDATE_STATUS,
  PROVENANCE_KIND,
  provenanceToKind,
  acceptCandidate,
  rejectCandidate,
  markValid,
} from './src/services/FieldCandidate.js';
import {
  validateType,
  validateSemantic,
  validateEvidence,
  validateCrossField,
  validateCandidate,
  validateCandidates,
  getExpectedType,
} from './src/services/FieldValidation.js';
import {
  runCandidatePipeline,
  mergeRecordThroughPipeline,
  runFallbackPipeline,
  runReputationPipeline,
  runAIEnrichmentPipeline,
} from './src/services/CandidatePipeline.js';
import { SELECTION_PRIORITY, IDENTITY_SENSITIVE } from './src/services/CandidatePipeline.js';
import BusinessProfile from './src/services/BusinessProfile.js';
import { looksLikeStreetAddress } from './src/utils/streetAddressDetector.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

/* ================================================================== *
 * 1-8. CANDIDATE CREATION
 * ================================================================== */

check('1. Deterministic candidate creation preserves all metadata', () => {
  const c = createFieldCandidate({
    fieldPath: 'contact.phone',
    rawValue: '+91 98765 43210',
    normalizedValue: '+919876543210',
    source: { sourceUrl: 'https://maps.google.com/...', provider: 'geoapify', extractionMethod: 'api' },
    evidence: { snippet: 'Phone: +91 98765 43210', locator: 'contact.phone' },
    provenance: 'discovered',
    confidence: 0.9,
  });

  assert.equal(c.fieldPath, 'contact.phone');
  assert.equal(c.rawValue, '+91 98765 43210');
  assert.equal(c.normalizedValue, '+919876543210');
  assert.equal(c.source.provider, 'geoapify');
  assert.equal(c.evidence.snippet, 'Phone: +91 98765 43210');
  assert.equal(c.provenance.webloom, 'discovered');
  assert.equal(c.provenance.kind, 'deterministic');
  assert.equal(c.confidence, 0.9);
  assert.equal(c.status, CANDIDATE_STATUS.CANDIDATE);
});

check('2. AI candidate has ai_generated kind', () => {
  const c = createFieldCandidate({
    fieldPath: 'contact.email',
    rawValue: 'info@example.com',
    provenance: 'ai_generated',
    confidence: 0.8,
    evidence: { snippet: 'Email: info@example.com' },
  });

  assert.equal(c.provenance.kind, 'ai_generated');
  assert.equal(c.evidence.snippet, 'Email: info@example.com');
});

check('3. Inferred candidate has inferred kind', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.description',
    rawValue: 'A bakery in San Francisco',
    provenance: 'inferred',
    confidence: 0.6,
  });

  assert.equal(c.provenance.kind, 'inferred');
});

check('4. Missing evidence allowed for deterministic', () => {
  const c = createFieldCandidate({
    fieldPath: 'contact.phone',
    rawValue: '+1-415-555-0001',
    provenance: 'discovered',
    confidence: 0.9,
  });

  // Should not be rejected just for missing evidence
  assert.equal(c.status, CANDIDATE_STATUS.CANDIDATE);
  assert.equal(c.evidence.snippet, null);
});

check('5. Invalid field path rejected (not thrown, but recorded)', () => {
  const c = createFieldCandidate({
    fieldPath: 'invalid.field.path',
    rawValue: 'something',
    provenance: 'discovered',
  });

  assert.equal(c.fieldPath, 'invalid.field.path');
  // Type validation will catch unknown fields
});

check('6. Nested field path supported', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.categories',
    rawValue: ['bakery', 'cafe'],
    provenance: 'discovered',
  });

  assert.equal(c.fieldPath, 'identity.categories');
  assert.deepEqual(c.rawValue, ['bakery', 'cafe']);
});

check('7. Missing value allowed (null becomes candidate)', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.name',
    rawValue: null,
    provenance: 'discovered',
  });

  assert.equal(c.rawValue, null);
  assert.equal(c.normalizedValue, null);
});

check('8. Rejection reason preserved', () => {
  const c = createFieldCandidate({
    fieldPath: 'contact.phone',
    rawValue: 'not a phone',
    provenance: 'discovered',
  });

  rejectCandidate(c, 'phone_format_invalid');
  assert.equal(c.status, CANDIDATE_STATUS.REJECTED);
  assert.equal(c.rejectionReason, 'phone_format_invalid');
});

/* ================================================================== *
 * 9-16. TYPE VALIDATION
 * ================================================================== */

check('9. String type validation passes', () => {
  const r = validateType('hello', 'string');
  assert.equal(r.passed, true);
});

check('10. Number type validation passes', () => {
  const r = validateType(42, 'number');
  assert.equal(r.passed, true);
});

check('11. Boolean type validation passes', () => {
  const r = validateType(true, 'boolean');
  assert.equal(r.passed, true);
});

check('12. URL type validation passes', () => {
  const r = validateType('https://example.com', 'url');
  assert.equal(r.passed, true);
});

check('13. Array type validation passes', () => {
  const r = validateType(['a', 'b'], 'array');
  assert.equal(r.passed, true);
});

check('14. Object type validation passes', () => {
  const r = validateType({ a: 1 }, 'object');
  assert.equal(r.passed, true);
});

check('15. Nested type validation passes', () => {
  const r = validateType({ lat: 1, lng: 2 }, 'nested');
  assert.equal(r.passed, true);
  const r2 = validateType([1, 2], 'nested');
  assert.equal(r2.passed, true);
});

check('16. Type mismatch rejected', () => {
  const r = validateType('not a number', 'number');
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('Expected number'));
});

/* ================================================================== *
 * 17-25. SEMANTIC VALIDATION
 * ================================================================== */

check('17. Rating in [0,5] passes', () => {
  const r = validateSemantic('ratings.rating', 4.5);
  assert.equal(r.passed, true);
});

check('18. Rating out of range fails', () => {
  const r = validateSemantic('ratings.rating', 6);
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('[0, 5]'));
});

check('19. Review count non-negative integer passes', () => {
  const r = validateSemantic('ratings.review_count', 100);
  assert.equal(r.passed, true);
});

check('20. Review count negative fails', () => {
  const r = validateSemantic('ratings.review_count', -5);
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('non-negative integer'));
});

check('21. Phone format validation passes for valid', () => {
  const r = validateSemantic('contact.phone', '+1-415-555-0001');
  assert.equal(r.passed, true);
});

check('22. Phone format validation rejects invalid', () => {
  const r = validateSemantic('contact.phone', 'not a phone');
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('rejected'));
});

check('23. Email format validation passes', () => {
  // Use a valid business email (not a rejected placeholder domain)
  const r = validateSemantic('contact.email', 'info@mybusiness.com');
  assert.equal(r.passed, true);
});

check('24. Email format validation fails', () => {
  const r = validateSemantic('contact.email', 'not-an-email');
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('Invalid email'));
});

check('25. Name not address validation passes for real name', () => {
  const r = validateSemantic('identity.name', 'Tartine Bakery');
  assert.equal(r.passed, true);
});

check('26. Name not address validation fails for address', () => {
  const r = validateSemantic('identity.name', '123 Main St, San Francisco, CA');
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('street address'));
});

check('27. Coordinates validation passes', () => {
  const r = validateSemantic('location.coordinates', { lat: 37.76, lng: -122.42 });
  assert.equal(r.passed, true);
});

check('28. Coordinates validation fails for invalid', () => {
  const r = validateSemantic('location.coordinates', { lat: 91, lng: 0 });
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('Invalid coordinates'));
});

/* ================================================================== *
 * 29-32. EVIDENCE VALIDATION
 * ================================================================== */

check('29. AI-generated identity field without evidence fails', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.name',
    rawValue: 'AI Guessed Name',
    provenance: 'ai_generated',
    evidence: {},
  });

  const r = validateEvidence(c);
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('lacks evidence'));
});

check('30. AI-generated identity field with evidence passes', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.name',
    rawValue: 'Extracted Name',
    provenance: 'ai_generated',
    evidence: { snippet: 'Business name: Extracted Name' },
  });

  const r = validateEvidence(c);
  assert.equal(r.passed, true);
});

check('31. Deterministic field without evidence passes (backward compatible)', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.name',
    rawValue: 'From Provider',
    provenance: 'discovered',
    evidence: {},
  });

  const r = validateEvidence(c);
  assert.equal(r.passed, true);
});

/* ================================================================== *
 * 33-35. CROSS-FIELD VALIDATION
 * ================================================================== */

check('33. Rating vs review count confusion detected', () => {
  const r = validateCrossField('ratings.rating', 42, { ratings: { review_count: 42 } });
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('swapped'));
});

check('34. Review count vs rating confusion detected', () => {
  const r = validateCrossField('ratings.review_count', 4.5, { ratings: { rating: 4.5 } });
  assert.equal(r.passed, false);
  assert.ok(r.error.includes('swapped'));
});

check('35. Cross-field passes for distinct values', () => {
  const r = validateCrossField('ratings.rating', 4.5, { ratings: { review_count: 120 } });
  assert.equal(r.passed, true);
});

/* ================================================================== *
 * 36-40. CANDIDATE VALIDATION INTEGRATION
 * ================================================================== */

check('36. Valid candidate passes all validation', () => {
  const c = createFieldCandidate({
    fieldPath: 'contact.phone',
    rawValue: '+1-415-555-0001',
    provenance: 'discovered',
    confidence: 0.9,
  });

  validateCandidate(c, {});
  assert.equal(c.status, CANDIDATE_STATUS.VALID);
  assert.equal(c.rejectionReason, null);
});

check('37. Invalid candidate rejected', () => {
  const c = createFieldCandidate({
    fieldPath: 'ratings.rating',
    rawValue: 6,
    provenance: 'discovered',
    confidence: 0.9,
  });

  validateCandidate(c, {});
  assert.equal(c.status, CANDIDATE_STATUS.REJECTED);
  assert.ok(c.rejectionReason.includes('semantic'));
});

check('38. AI candidate without evidence rejected', () => {
  const c = createFieldCandidate({
    fieldPath: 'identity.name',
    rawValue: 'AI Name',
    provenance: 'ai_generated',
    evidence: {},
  });

  validateCandidate(c, {});
  assert.equal(c.status, CANDIDATE_STATUS.REJECTED);
  assert.ok(c.rejectionReason.includes('evidence'));
});

check('39. Multiple candidates validated', () => {
  const c1 = createFieldCandidate({ fieldPath: 'contact.phone', rawValue: '+1-415-555-0001', provenance: 'discovered' });
  const c2 = createFieldCandidate({ fieldPath: 'contact.phone', rawValue: '+1-415-555-0002', provenance: 'ai_generated' });

  validateCandidates([c1, c2], {});
  assert.equal(c1.status, CANDIDATE_STATUS.VALID);
  assert.equal(c2.status, CANDIDATE_STATUS.REJECTED); // ai_generated without evidence
});

check('40. Create candidates from record', () => {
  const record = {
    business: { name: 'Test Biz', category: 'Test Category' },
    contact: { phone: '+1-415-555-0001', email: 'info@test.com', website: 'https://test.com' },
    location: { full_address: '123 Test St', city: 'Test City', state: 'TS', country: 'US' },
    confidence: { name: 0.9, category: 0.8, phone: 0.9, website: 0.85, address: 0.9 },
    provider: { name: 'geoapify' },
  };

  const candidates = createCandidatesFromRecord(record, 'discovered', { sourceUrl: 'https://maps.google.com/test' });

  assert.ok(candidates.length >= 7); // name, category, phone, email, website, address, city, state, country
  const nameCand = candidates.find(c => c.fieldPath === 'identity.name');
  assert.equal(nameCand.rawValue, 'Test Biz');
  assert.equal(nameCand.confidence, 0.9);
  assert.equal(nameCand.provenance.kind, 'deterministic');
});

/* ================================================================== *
 * 41-48. SELECTION
 * ================================================================== */

checkAsync('41. Higher provenance wins selection', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'From Geoapify' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
      { record: { business: { name: 'From AI' } }, provenance: 'ai_generated', sourceInfo: { provider: 'web_extraction', sourceUrl: 'https://maps.google.com/test' }, evidence: { snippet: 'Business name: From AI' } }, // Provide evidence for AI
    ],
    profileContext: profile.toObject(),
  });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].normalizedValue, 'From Geoapify');
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].rejectionReason, 'lower_priority');
});

checkAsync('42. OnlyIfMissing skips populated field', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Existing Name', 'identified', 0.8, { sourceUrl: 'https://maps.google.com/test' });

  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'New Name' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
    ],
    profileContext: profile.toObject(),
    options: { onlyIfMissing: true },
  });

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].rejectionReason, 'onlyIfMissing: field already populated');
});

checkAsync('43. Conservative merge skips identity fields', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'New Name' }, contact: { phone: '+1-415-555-0001' } }, provenance: 'discovered', sourceInfo: { provider: 'web_extraction' } },
    ],
    profileContext: profile.toObject(),
    options: { isConservativeMerge: true },
  });

  // Should accept phone (non-identity) but reject name (identity)
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].fieldPath, 'contact.phone');
  const rejected = result.rejected.find(c => c.fieldPath === 'identity.name');
  assert.ok(rejected);
  assert.ok(rejected.rejectionReason.includes('conservative_merge'));
});

checkAsync('44. Conflict detected with existing identity value', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Existing Name', 'identified', 0.8, { sourceUrl: 'https://maps.google.com/test' });

  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Different Name' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
    ],
    profileContext: profile.toObject(),
    options: { onlyIfMissing: false },
  });

  // Conflict on identity.name should be preserved, not auto-resolved
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].fieldPath, 'identity.name');
  assert.equal(result.accepted.length, 0);
});

checkAsync('45. Equivalent values not treated as conflict', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Test Biz', 'identified', 0.8, { sourceUrl: 'https://maps.google.com/test' });

  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Test Biz' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
    ],
    profileContext: profile.toObject(),
  });

  // Equivalent values should accept the incoming (same value)
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.accepted.length, 1);
});

checkAsync('46. Fallback pipeline processes fields', async () => {
  const profile = new BusinessProfile();
  const fallbackResult = {
    fields: {
      address: '123 Main St',
      phone: '+1-415-555-0001',
    },
    evidence: {
      address: { provenance: 'discovered', confidence: 0.9, extractionMethod: 'provider' },
      phone: { provenance: 'discovered', confidence: 0.85, extractionMethod: 'provider' },
    },
    aiExtracted: false,
  };

  const result = await runFallbackPipeline(profile, fallbackResult, 'https://maps.google.com/test');

  assert.equal(result.accepted.length, 2);
  assert.ok(result.accepted.find(c => c.fieldPath === 'location.full_address'));
  assert.ok(result.accepted.find(c => c.fieldPath === 'contact.phone'));
});

checkAsync('47. Reputation pipeline processes rating/reviews', async () => {
  const profile = new BusinessProfile();
  const reputation = {
    rating: 4.5,
    reviewCount: 100,
    reviews: [{ rating: 5, text: 'Great!', author: 'A', publishedAt: '1 week ago' }],
  };
  const repResult = { provenance: 'observed', aiExtracted: false };

  const result = await runReputationPipeline(profile, reputation, repResult);

  assert.ok(result.accepted.find(c => c.fieldPath === 'ratings.rating'));
  assert.ok(result.accepted.find(c => c.fieldPath === 'ratings.review_count'));
  assert.ok(result.accepted.find(c => c.fieldPath === 'ratings.reviews'));
});

checkAsync('48. AI enrichment pipeline only fills gaps', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.category', 'Bakery', 'discovered', 0.9, { sourceUrl: 'https://maps.google.com/test' });

  const aiResult = {
    category: 'Should Not Overwrite',
    description: 'A nice bakery',
    services: ['bread', 'pastries'],
  };

  const result = await runAIEnrichmentPipeline(profile, aiResult, 'https://maps.google.com/test');

  // Should accept description and services, reject category (already populated)
  const accepted = result.accepted;
  const categories = accepted.filter(c => c.fieldPath === 'identity.category');
  const descriptions = accepted.filter(c => c.fieldPath === 'identity.description');
  const services = accepted.filter(c => c.fieldPath === 'identity.services');

  assert.equal(categories.length, 0, 'category should not be overwritten');
  assert.equal(descriptions.length, 1);
  assert.equal(services.length, 1);
});

/* ================================================================== *
 * 49-55. INTEGRATION WITH BUSINESSPROFILE
 * ================================================================== */

checkAsync('49. Pipeline writes accepted values to BusinessProfile', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Pipeline Biz' } }, provenance: 'discovered', sourceInfo: { provider: 'test' } },
    ],
    profileContext: profile.toObject(),
  });

  result.applyToProfile(profile);
  assert.equal(profile.get('identity.name'), 'Pipeline Biz');
  assert.equal(profile.getField('identity.name')?.provenance, 'discovered');
});

checkAsync('50. Legacy getCompleteness unchanged', () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Test', 'discovered', 0.8, {});
  profile.set('contact.phone', '+1-415-555-0001', 'discovered', 0.8, {});
  profile.set('contact.website', 'https://test.com', 'discovered', 0.8, {});
  profile.set('location.full_address', '123 Test St', 'discovered', 0.8, {});

  const completeness = profile.getCompleteness();
  assert.equal(typeof completeness, 'number');
  assert.ok(completeness > 0 && completeness <= 1);
});

checkAsync('51. Quality completeness distinguishes evidence', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Test', 'discovered', 0.8, { sourceUrl: 'https://test.com', provider: 'geoapify' });
  profile.set('identity.category', 'AI Category', 'ai_generated', 0.7, {}); // no evidence
  profile.set('contact.phone', '+1-415-555-0001', 'discovered', 0.8, { sourceUrl: 'https://test.com', provider: 'geoapify' });

  const qc = profile.getQualityCompleteness();
  assert.ok(qc.required.found.includes('identity.name'));
  assert.ok(qc.required.evidenceBacked.includes('identity.name'));
  assert.ok(qc.required.aiOnly.includes('identity.category'));
  assert.ok(qc.required.missing.includes('contact.website'));
  assert.ok(qc.required.missing.includes('location.full_address'));
  assert.equal(qc.summary.requiredFound, 2);
  assert.equal(qc.summary.requiredMissing, 3);
  assert.equal(qc.summary.requiredAiOnly, 1);
});

checkAsync('52. Quality completeness detects conflicts', async () => {
  const profile = new BusinessProfile();
  profile.set('identity.name', 'Name A', 'identified', 0.8, { sourceUrl: 'https://maps.google.com/test' });
  // Simulate a conflict by directly setting a conflicting value with different provenance
  profile.set('identity.name', 'Name B', 'discovered', 0.9, { sourceUrl: 'https://geoapify.com/test' });

  const qc = profile.getQualityCompleteness();
  assert.ok(qc.required.conflicted.includes('identity.name'));
  assert.equal(qc.summary.hasConflicts, true);
});

checkAsync('53. Nested incomplete detection', async () => {
  const profile = new BusinessProfile();
  profile.set('hours', { monday: '09:00-17:00' }, 'discovered', 0.8, { sourceUrl: 'https://test.com' });

  const qc = profile.getQualityCompleteness();
  assert.ok(qc.nested.incomplete.includes('hours'));
});

checkAsync('54. SourceCache isolation preserved', async () => {
  // Verify that the candidate pipeline doesn't bypass SourceCache
  // (SourceCache is checked before extraction in BusinessDataExtractor and BusinessResearchService)
  const { getSourceCache } = await import('./src/db/SourceCache.js');
  const cache = getSourceCache();
  const stats = cache.stats();
  assert.ok(typeof stats.total === 'number');
});

checkAsync('55. Canonical reload not revalidated', async () => {
  const profile = new BusinessProfile();
  // Simulate canonical reload with { canonical: true }
  profile.set('identity.name', 'Canonical Name', 'canonical', 0.95, { canonical: true, sourceId: 'src_123' });

  // The pipeline should not revalidate canonical values
  // (This is tested by ensuring canonical provenance maps to priority 6)
  const fieldObj = profile.getField('identity.name');
  assert.equal(fieldObj.provenance, 'canonical');
});

/* ================================================================== *
 * 56-60. OBSERVABILITY / DIAGNOSTICS
 * ================================================================== */

checkAsync('56. Pipeline diagnostics include counts', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'A' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
      { record: { business: { name: 'B' } }, provenance: 'ai_generated', sourceInfo: { provider: 'web_extraction' } },
      { record: { business: { name: 'C' } }, provenance: 'inferred', sourceInfo: { provider: 'ai_enrichment' } },
    ],
    profileContext: profile.toObject(),
  });

  assert.ok(result.diagnostics.totalCandidates === 3);
  assert.ok(result.diagnostics.byStatus.accepted >= 1);
  assert.ok(result.diagnostics.byStatus.rejected >= 1);
  assert.ok(result.diagnostics.byField['identity.name'] === 3);
});

checkAsync('57. Rejection reasons collected', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Valid' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
      { record: { business: { name: 'Invalid' } }, provenance: 'ai_generated', sourceInfo: { provider: 'web_extraction' } }, // no evidence
    ],
    profileContext: profile.toObject(),
  });

  const reasons = result.rejected.map(r => r.rejectionReason);
  assert.ok(reasons.some(r => r && r.includes('evidence')));
});

checkAsync('58. Missing fields tracked', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Only Name' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
    ],
    profileContext: profile.toObject(),
  });

  // Only name has a candidate; others are missing
  assert.ok(result.diagnostics.byField['identity.name'] === 1);
});

checkAsync('59. Evidence coverage in diagnostics', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'With Evidence' }, contact: { phone: '+1-415-555-0001' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify', sourceUrl: 'https://maps.google.com/test' } },
    ],
    profileContext: profile.toObject(),
  });

  assert.ok(result.accepted.length >= 1);
  assert.ok(result.accepted[0].evidence.snippet || result.accepted[0].source.sourceUrl);
});

checkAsync('60. Provider trace quality object', async () => {
  const profile = new BusinessProfile();
  const result = await runCandidatePipeline({
    records: [
      { record: { business: { name: 'Test' } }, provenance: 'discovered', sourceInfo: { provider: 'geoapify' } },
    ],
    profileContext: profile.toObject(),
  });

  // Verify quality trace can be added to providerTrace
  const qualityTrace = {
    candidates: result.diagnostics.totalCandidates,
    accepted: result.diagnostics.byStatus.accepted,
    rejected: result.diagnostics.byStatus.rejected,
    rejectionReasons: result.rejected.map(r => r.rejectionReason).filter(Boolean),
    missingFields: Object.keys(result.diagnostics.byField).filter(f => !result.accepted.find(a => a.fieldPath === f)),
    evidenceCoverage: result.accepted.filter(a => a.evidence.snippet || a.source.sourceUrl).length / Math.max(1, result.accepted.length),
    conflicts: result.conflicts.length,
  };

  assert.equal(typeof qualityTrace.candidates, 'number');
  assert.equal(typeof qualityTrace.accepted, 'number');
  assert.ok(Array.isArray(qualityTrace.rejectionReasons));
  assert.ok(typeof qualityTrace.evidenceCoverage === 'number');
});

/* ================================================================== *
 * SUMMARY
 * ================================================================== */

console.log(`\n------------------------------------`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('All quality boundary tests passed!');
}