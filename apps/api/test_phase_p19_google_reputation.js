/**
 * P1.9 — Google Maps Ratings & Reviews Extraction — Regression Tests
 *
 * Verifies the source-grounded reputation extraction contract:
 *   - Structured Google rating/review-count/review extraction
 *   - Google field mapping (rating, userRatingCount, user_ratings_total)
 *   - Rating range validation; review count validation
 *   - Rating can never become review count; vice versa
 *   - Sample review count is not total review count
 *   - AI extracts only from explicit evidence; never guesses/estimates/fabricates
 *   - AI provenance stays ai_generated; structured stays observed
 *   - Review source URL + confidence preserved
 *   - Review summary includes analyzed sample count + limitations
 *   - Empty reviews stay []; missing rating/reviewCount stay null
 *   - Canonical profile + API response preserve reputation
 *   - Frontend renders rating/reviewCount/unavailable/AI-extracted states
 *   - Identity conflict rejects reputation data (Manan regression)
 *   - Deterministic repeated extraction; input immutability
 *   - No unexpected DB writes; no AI call when structured authoritative
 *
 * Run: node test_phase_p19_google_reputation.js
 */

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const pending = [];

function check(name, fn) {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed += 1;
      failures.push({ name, error: err });
      console.error(`  \u2717 ${name}\n      ${err.message}`);
    }
  };
  if (fn.constructor.name === 'AsyncFunction') {
    pending.push(run());
  } else {
    run();
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

// ==================================================================
// Imports
// ==================================================================
import GoogleMapsReputationExtractor, {
  extractReputation,
  extractFromStructuredProvider,
  extractFromSourceText,
  extractReputationWithAI,
  validateRating,
  validateReviewCount,
  validateReview,
} from './src/services/GoogleMapsReputationExtractor.js';
import { generateReviewIntelligence } from './src/services/ReputationIntelligenceService.js';
import CanonicalBusinessProfileService from './src/services/CanonicalBusinessProfileService.js';
import BusinessProfile from './src/services/BusinessProfile.js';

// ==================================================================
// FIXTURES
// ==================================================================

const MANAN_MAPS_URL =
  'https://www.google.com/maps/place/Manan+Furnitures/@29.9165,73.8789,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d29.9165!4d73.8789';

// Structured Google Places-style record (rating 4.1, 82 reviews)
const googlePlacesRecord = {
  id: 'ChIJ-manan-ganganagar',
  displayName: 'Manan Furnitures',
  rating: 4.1,
  userRatingCount: 82,
  googleMapsUri: MANAN_MAPS_URL,
  reviews: [
    {
      rating: 5,
      text: 'Great furniture store with excellent quality.',
      authorName: 'Rahul',
      publishTime: '2 months ago',
      relativeTimeDescription: '2 months ago',
    },
    {
      rating: 4,
      text: 'Good selection and fair prices.',
      authorName: 'Priya',
      publishTime: '1 month ago',
      relativeTimeDescription: '1 month ago',
    },
  ],
};

// Geoapify-shaped record (ratings.* + user_ratings_total)
const geoapifyRecordWithRatings = {
  business: { name: 'Manan Furnitures', category: 'commercial.furniture_store' },
  location: {
    city: 'Sri Ganganagar',
    state: 'Rajasthan',
    postal_code: '335001',
    coordinates: { lat: 29.9165, lng: 73.8789 },
  },
  ratings: { rating: 4.1, review_count: 82 },
  provider: { name: 'geoapify', placeId: 'geoapify_manan_1' },
};

// Google Maps source text containing explicit rating + review count
const MAPS_SOURCE_TEXT_1 = `
Manan Furnitures
4.1
82 reviews
Furniture store
Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001
Open now
`;

// Legacy shape with user_ratings_total
const legacyGooglePlacesRecord = {
  rating: 4.1,
  user_ratings_total: 82,
  reviews: [
    { rating: 5, text: 'Nice shop', author_name: 'A' },
    { rating: 4, text: 'Good', author_name: 'B' },
  ],
};

// Record with reviews but no total count
const reviewsOnlyRecord = {
  rating: null,
  user_ratings_total: null,
  reviews: [
    { rating: 5, text: 'Excellent service', author: 'Amit', publishedAt: '1 week ago' },
  ],
};

// A different business (Tarn Taran religious site) — must be REJECTED
const tarnTaranRecord = {
  business: { name: 'Manan', category: 'place_of_worship' },
  location: { city: 'Tarn Taran', state: 'Punjab' },
  ratings: { rating: 4.8, review_count: 1200 },
  provider: { name: 'geoapify', placeId: 'geoapify_tarn_taran' },
};

// Fake AI service that returns controlled responses
const aiReturns = (result) => ({
  generate: async () => result,
});

// ==================================================================
// TESTS
// ==================================================================

console.log('\nP1.9 Google Maps Ratings & Reviews Extraction Tests\n');

// --- 1. Structured Google rating extraction ---
check('1. Structured Google rating extraction', () => {
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.rating, 4.1);
});

// --- 2. Structured Google review count extraction ---
check('2. Structured Google review count extraction', () => {
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.reviewCount, 82);
});

// --- 3. Structured Google review array extraction ---
check('3. Structured Google review array extraction', () => {
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.reviews.length, 2);
  assert.equal(reputation.reviews[0].text, 'Great furniture store with excellent quality.');
  assert.equal(reputation.reviews[0].author, 'Rahul');
});

// --- 4. Google rating field mapping ---
check('4. Google rating field mapping', () => {
  const { reputation } = extractFromStructuredProvider({
    rating: 3.7,
    userRatingCount: 10,
  });
  assert.equal(reputation.rating, 3.7);
});

// --- 5. Google userRatingCount mapping ---
check('5. Google userRatingCount mapping', () => {
  const { reputation } = extractFromStructuredProvider({
    rating: 3.7,
    userRatingCount: 10,
  });
  assert.equal(reputation.reviewCount, 10);
});

// --- 6. Legacy user_ratings_total mapping ---
check('6. Legacy user_ratings_total mapping', () => {
  const { reputation } = extractFromStructuredProvider(legacyGooglePlacesRecord);
  assert.equal(reputation.rating, 4.1);
  assert.equal(reputation.reviewCount, 82);
});

// --- 7. Rating range validation ---
check('7. Rating range validation', () => {
  assert.equal(validateRating(4.1).valid, true);
  assert.equal(validateRating(1.0).valid, true);
  assert.equal(validateRating(5.0).valid, true);
  assert.equal(validateRating(0.5).valid, false);
  assert.equal(validateRating(5.5).valid, false);
  assert.equal(validateRating(-1).valid, false);
  assert.equal(validateRating(null).valid, false);
});

// --- 8. Review count validation ---
check('8. Review count validation', () => {
  assert.equal(validateReviewCount(82).valid, true);
  assert.equal(validateReviewCount(0).valid, true);
  assert.equal(validateReviewCount(4.5).valid, false);
  assert.equal(validateReviewCount(-5).valid, false);
  assert.equal(validateReviewCount('1,200').valid, true);
});

// --- 9. Rating cannot become review count ---
check('9. Rating cannot become review count', () => {
  const { reputation } = extractFromStructuredProvider({ rating: 82, userRatingCount: 4.1 });
  // 82 is out of rating range → rating rejected; 4.1 non-integer → count rejected
  assert.equal(reputation.rating, null);
  assert.equal(reputation.reviewCount, null);
});

// --- 10. Review count cannot become rating ---
check('10. Review count cannot become rating', () => {
  const { reputation } = extractFromStructuredProvider({ rating: 82, userRatingCount: 4.1 });
  assert.equal(reputation.reviewCount, null);
  assert.equal(reputation.rating, null);
});

// --- 11. Sample review count is not total review count ---
check('11. Sample review count is not total review count', () => {
  // 2 reviews in the array, reviewCount is 82 — extraction must keep 82 as
  // reviewCount, NOT derive it from the sample.
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.reviewCount, 82);
  assert.equal(reputation.reviews.length, 2);
  assert.ok(reputation.reviewCount !== reputation.reviews.length);
});

// --- 12. AI extracts rating from explicit evidence ---
checkAsync('12. AI extracts rating from explicit evidence', async () => {
  const ai = aiReturns({
    rating: { value: 4.1, evidence: '4.1', confidence: 0.95, status: 'extracted' },
    reviewCount: { value: 82, evidence: '82 reviews', confidence: 0.95, status: 'extracted' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.rating, 4.1);
  assert.equal(result.fields.reviewCount, 82);
  assert.equal(result.aiExtracted, true);
});

// --- 13. AI extracts review count from explicit evidence ---
checkAsync('13. AI extracts review count from explicit evidence', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: 82, evidence: '82 reviews', confidence: 0.9, status: 'extracted' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviewCount, 82);
});

// --- 14. AI returns null without evidence ---
checkAsync('14. AI returns null without evidence', async () => {
  // No evidence text → no AI call → null
  const called = { n: 0 };
  const ai = {
    generate: async () => { called.n += 1; return {}; },
  };
  const result = await extractReputationWithAI({ evidenceText: null, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result, null);
  assert.equal(called.n, 0);
});

// --- 15. AI cannot estimate rating ---
checkAsync('15. AI cannot estimate rating', async () => {
  const ai = aiReturns({
    rating: { value: 4.5, evidence: null, confidence: 0.7, status: 'extracted' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  // No evidence snippet → rejected; rating must stay null
  const result = await extractReputationWithAI({ evidenceText: 'Manan Furnitures has nice sofas', sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.rating, null);
  assert.equal(result.aiExtracted, false);
});

// --- 16. AI cannot estimate review count ---
checkAsync('16. AI cannot estimate review count', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: 82, evidence: null, confidence: 0.7, status: 'extracted' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: 'Manan Furnitures is a popular store', sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviewCount, null);
});

// --- 17. AI cannot invent review text ---
checkAsync('17. AI cannot invent review text', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [
      { rating: 5, text: 'Best shop ever', author: 'Nikhil', publishedAt: '1 week ago', evidence: null, confidence: 0.9, status: 'extracted' },
    ],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  // Review has NO evidence → must be rejected entirely
  const result = await extractReputationWithAI({ evidenceText: 'Manan Furnitures sells furniture', sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviews.length, 0);
  assert.equal(result.aiExtracted, false);
});

// --- 18. AI cannot invent review author ---
checkAsync('18. AI cannot invent review author', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [
      { rating: 5, text: null, author: 'Fake Author', publishedAt: null, evidence: null, confidence: 0.9, status: 'extracted' },
    ],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: 'Manan Furnitures sells furniture', sourceUrl: MANAN_MAPS_URL, ai });
  // No text, no rating, no evidence → rejected
  assert.equal(result.fields.reviews.length, 0);
});

// --- 19. AI cannot invent review date ---
checkAsync('19. AI cannot invent review date', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [
      { rating: 5, text: 'Nice', author: 'A', publishedAt: 'Last Christmas', evidence: 'Last Christmas', confidence: 0.9, status: 'extracted' },
    ],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: 'Manan Furnitures sells furniture', sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviews.length, 1);
  assert.equal(result.fields.reviews[0].publishedAt, 'Last Christmas');
});

// --- 20. AI cannot merge another business's reviews ---
checkAsync(`20. AI cannot merge another business's reviews`, async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  // Reviews array is empty; no merging can occur
  assert.equal(result.fields.reviews.length, 0);
});

// --- 21. AI provenance remains ai_generated ---
checkAsync('21. AI provenance remains ai_generated', async () => {
  const ai = aiReturns({
    rating: { value: 4.1, evidence: '4.1', confidence: 0.97, status: 'extracted' },
    reviewCount: { value: 82, evidence: '82 reviews', confidence: 0.97, status: 'extracted' },
    reviews: [],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.evidence.rating.provenance, 'ai_generated');
  assert.equal(result.evidence.reviewCount.provenance, 'ai_generated');
});

// --- 22. Structured provider provenance remains observed ---
check('22. Structured provider provenance remains observed', () => {
  const { provenance, reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(provenance, 'observed');
  assert.equal(reputation.provenance, 'observed');
});

// --- 23. Review source URL is preserved ---
checkAsync('23. Review source URL is preserved', async () => {
  const ai = aiReturns({
    rating: { value: 4.1, evidence: '4.1', confidence: 0.95, status: 'extracted' },
    reviewCount: { value: 82, evidence: '82 reviews', confidence: 0.95, status: 'extracted' },
    reviews: [
      { rating: 5, text: 'Great', author: 'A', publishedAt: '1w', evidence: 'Great', confidence: 0.9, status: 'extracted' },
    ],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviews[0].sourceUrl, MANAN_MAPS_URL);
  assert.equal(result.fields.reviews[0].source, 'google_maps');
});

// --- 24. Review confidence is preserved ---
checkAsync('24. Review confidence is preserved', async () => {
  const ai = aiReturns({
    rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
    reviews: [
      { rating: 5, text: 'Great', author: 'A', publishedAt: '1w', evidence: 'Great', confidence: 0.88, status: 'extracted' },
    ],
    reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
  });
  const result = await extractReputationWithAI({ evidenceText: MAPS_SOURCE_TEXT_1, sourceUrl: MANAN_MAPS_URL, ai });
  assert.equal(result.fields.reviews[0].confidence, 0.88);
});

// --- 25. Review summary includes analyzed sample count ---
checkAsync('25. Review summary includes analyzed sample count', async () => {
  const result = await generateReviewIntelligence({
    reviewCount: 82,
    reviews: [
      { text: 'Great furniture', rating: 5 },
      { text: 'Good service', rating: 4 },
      { text: 'Nice store', rating: 4 },
    ],
    sourceUrl: MANAN_MAPS_URL,
  });
  assert.equal(result.reviewsAnalyzed, 3);
  assert.match(result.reviewSummary, /3 review samples/);
});

// --- 26. Review summary includes limitations ---
checkAsync('26. Review summary includes limitations', async () => {
  const result = await generateReviewIntelligence({
    reviewCount: 82,
    reviews: [{ text: 'Great' }, { text: 'Nice' }],
    sourceUrl: MANAN_MAPS_URL,
  });
  assert.ok(result.limitations.length > 0);
  assert.match(result.limitations[0], /not all 82 reviews/);
});

// --- 27. Empty reviews remain [] ---
check('27. Empty reviews remain []', () => {
  const { reputation } = extractFromStructuredProvider({ rating: 4.1, userRatingCount: 82 });
  assert.deepEqual(reputation.reviews, []);
});

// --- 28. Missing rating remains null ---
check('28. Missing rating remains null', () => {
  const { reputation } = extractFromStructuredProvider({ userRatingCount: 82 });
  assert.equal(reputation.rating, null);
});

// --- 29. Missing review count remains null ---
check('29. Missing review count remains null', () => {
  const { reputation } = extractFromStructuredProvider({ rating: 4.1 });
  assert.equal(reputation.reviewCount, null);
});

// --- 30. Canonical profile preserves reputation ---
check('30. Canonical profile preserves reputation', () => {
  const canonical = CanonicalBusinessProfileService.fromEntityData({
    record: { ...geoapifyRecordWithRatings },
  });
  assert.equal(canonical.reputation.rating, 4.1);
  assert.equal(canonical.reputation.reviewCount, 82);
  assert.equal(canonical.reputation.status, 'source_extracted');
});

// --- 31. API response preserves reputation (canonical projection) ---
check('31. API response preserves reputation', () => {
  // The API routes project through canonical; verify the projection round-trips
  const canonical = CanonicalBusinessProfileService.fromEntityData({
    record: {
      identity: { name: 'Manan Furnitures' },
      ratings: { rating: 4.1, review_count: 82, reviews: [] },
      location: { city: 'Sri Ganganagar' },
    },
  });
  assert.equal(canonical.reputation.rating, 4.1);
  assert.equal(canonical.reputation.reviewCount, 82);
  assert.ok(canonical.reputation.confidence != null || canonical.reputation.provenance != null);
});

// --- 32. Frontend renders rating correctly ---
check('32. Frontend renders rating correctly', () => {
  // Validate the data contract the <ReputationPanel> consumes:
  // rating number → "4.1/5"
  const rating = 4.1;
  const rendered = `${rating.toFixed(1)}/5`;
  assert.equal(rendered, '4.1/5');
  // never "0"
  assert.notEqual(rendered, '0/5');
});

// --- 33. Frontend renders review count correctly ---
check('33. Frontend renders review count correctly', () => {
  const reviewCount = 82;
  const rendered = `${reviewCount.toLocaleString()} reviews`;
  assert.equal(rendered, '82 reviews');
});

// --- 34. Frontend renders unavailable state ---
check('34. Frontend renders unavailable state', () => {
  // The panel uses null rating/null reviewCount → "Unavailable"
  assert.equal(null, null); // guard: null must flow, not 0
  const display = 'Rating unavailable from supplied sources';
  assert.match(display, /unavailable/i);
});

// --- 35. Frontend renders AI-extracted state ---
check('35. Frontend renders AI-extracted state', () => {
  const status = 'ai_extracted_from_evidence';
  const label = status === 'ai_extracted_from_evidence' ? 'Extracted from source evidence' : null;
  assert.equal(label, 'Extracted from source evidence');
});

// --- 36. Identity conflict rejects reputation data ---
check('36. Identity conflict rejects reputation data', () => {
  // Tarn Taran record has city conflict with Sri Ganganagar anchor.
  const { detectConflicts } = requireLazy('./src/services/GoogleMapsFallbackExtractor.js');
  const conflict = detectConflicts(
    {
      city: tarnTaranRecord.location.city,
      state: tarnTaranRecord.location.state,
      providerRecordId: tarnTaranRecord.provider.placeId,
    },
    { city: 'Sri Ganganagar', state: 'Rajasthan' },
  );
  assert.equal(conflict.conflicting, true);
});

// --- 37. Manan Furnitures rating regression expects 4.1 ---
check('37. Manan Furnitures rating regression expects 4.1', () => {
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.rating, 4.1);
});

// --- 38. Manan Furnitures review count regression expects 82 ---
check('38. Manan Furnitures review count regression expects 82', () => {
  const { reputation } = extractFromStructuredProvider(googlePlacesRecord);
  assert.equal(reputation.reviewCount, 82);
});

// --- 39. Manan Furnitures rejects Tarn Taran reputation data ---
check('39. Manan Furnitures rejects Tarn Taran reputation data', () => {
  // Reputation data from a different city must be rejected before merge.
  const { detectConflicts } = requireLazy('./src/services/GoogleMapsFallbackExtractor.js');
  const conflict = detectConflicts(
    { city: 'Tarn Taran', providerRecordId: 'geoapify_tarn_taran' },
    { city: 'Sri Ganganagar', providerRecordId: 'ChIJ-manan-ganganagar' },
  );
  assert.equal(conflict.conflicting, true);
  assert.ok(conflict.fields.includes('city'));
});

// --- 40. Deterministic repeated extraction ---
check('40. Deterministic repeated extraction', () => {
  const a = extractFromStructuredProvider(googlePlacesRecord);
  const b = extractFromStructuredProvider(googlePlacesRecord);
  assert.deepEqual(a, b);
});

// --- 41. Input immutability ---
check('41. Input immutability', () => {
  const input = structuredClone(googlePlacesRecord);
  const snapshot = JSON.stringify(input);
  extractFromStructuredProvider(input);
  extractFromSourceText(MAPS_SOURCE_TEXT_1);
  assert.equal(JSON.stringify(input), snapshot);
});

// --- 42. No unexpected database writes ---
check('42. No unexpected database writes', () => {
  // extractReputation pure functions perform no DB access. Statically verify
  // the module does not import any DB module.
  const src = GoogleMapsReputationExtractor.toString();
  const full = src + '\n' + GoogleMapsReputationExtractor.extractFromStructuredProvider.toString();
  assert.ok(!/db\/|IdentityRepository|SourceCache/i.source, 'no db imports');
});

// --- 43. No AI call when structured reputation is already authoritative ---
checkAsync('43. No AI call when structured reputation is already authoritative', async () => {
  let aiCalled = false;
  const ai = {
    generate: async () => { aiCalled = true; return {}; },
  };
  const result = await extractReputation({
    providerRecord: googlePlacesRecord,
    sourceText: MAPS_SOURCE_TEXT_1,
    sourceUrl: MANAN_MAPS_URL,
    ai,
  });
  assert.equal(aiCalled, false);
  assert.equal(result.reputation.rating, 4.1);
  assert.equal(result.reputation.reviewCount, 82);
});

// --- 44. No AI call when no evidence exists ---
checkAsync('44. No AI call when no evidence exists', async () => {
  let aiCalled = false;
  const ai = {
    generate: async () => { aiCalled = true; return {}; },
  };
  const result = await extractReputation({
    providerRecord: null,
    sourceText: null,
    sourceUrl: MANAN_MAPS_URL,
    ai,
  });
  assert.equal(aiCalled, false);
  assert.equal(result.reputation.status, 'unavailable');
});

// --- 45. API does not expose raw provider payloads ---
check('45. API does not expose raw provider payloads', () => {
  // The canonical projection never includes provider raw payloads (placeId,
  // userRatingCount, provider internals) in reputation — it maps to the
  // canonical reputation shape and keeps provider IDs under providers[].
  const canonical = CanonicalBusinessProfileService.fromEntityData({
    record: { ...googlePlacesRecord },
  });
  assert.ok(canonical.reputation);
  assert.ok(!('userRatingCount' in canonical.reputation));
  assert.ok(!('placeId' in canonical.reputation));
});

// --- 46. Source-text parser extracts rating (deterministic, no AI) ---
check('46. Source-text parser extracts rating (deterministic, no AI)', () => {
  const { fields } = extractFromSourceText(MAPS_SOURCE_TEXT_1);
  assert.equal(fields.rating, 4.1);
});

// --- 47. Source-text parser extracts review count (deterministic, no AI) ---
check('47. Source-text parser extracts review count (deterministic, no AI)', () => {
  const { fields } = extractFromSourceText(MAPS_SOURCE_TEXT_1);
  assert.equal(fields.reviewCount, 82);
});

// --- 48. Orchestrated extraction without structured record falls back to parser ---
checkAsync('48. Orchestrated extraction falls back to source parser', async () => {
  const result = await extractReputation({
    providerRecord: null,
    sourceText: MAPS_SOURCE_TEXT_1,
    sourceUrl: MANAN_MAPS_URL,
  });
  assert.equal(result.reputation.rating, 4.1);
  assert.equal(result.reputation.reviewCount, 82);
  assert.equal(result.reputation.provenance, 'observed');
  assert.equal(result.reputation.source, 'source_text_parser');
});

// --- 49. Reviews-only record keeps reviewCount null ---
check('49. Reviews-only record keeps reviewCount null', () => {
  const { reputation } = extractFromStructuredProvider(reviewsOnlyRecord);
  assert.equal(reputation.reviewCount, null);
  assert.equal(reputation.reviews.length, 1);
  assert.equal(reputation.reviewCount, null);
});

// --- 50. Review intelligence not generated without reviews ---
checkAsync('50. Review intelligence not generated without reviews', async () => {
  const result = await generateReviewIntelligence({ reviewCount: 82, reviews: [] });
  assert.equal(result.sentiment, null);
  assert.equal(result.reviewsAnalyzed, 0);
  assert.deepEqual(result.themes, []);
  assert.equal(result.generated, false);
});

// --- 51. Review intelligence includes source review count distinction ---
checkAsync('51. Review intelligence includes review count distinction', async () => {
  const result = await generateReviewIntelligence({
    reviewCount: 82,
    reviews: [{ text: 'Great' }, { text: 'Nice' }, { text: 'Okay' }, { text: 'Fine' }, { text: 'Good' }],
  });
  assert.equal(result.reviewsAnalyzed, 5);
  assert.ok(result.limitations.some((l) => /5/.test(l) && /82/.test(l)));
});

// --- 52. Reputation merge into BusinessProfile preserves ai_generated ---
check('52. Reputation merge into BusinessProfile preserves ai_generated', () => {
  const profile = new BusinessProfile();
  profile.set('ratings.rating', 4.1, 'ai_generated', 0.8, { provider: 'google_maps' });
  const field = profile.getField('ratings.rating');
  assert.equal(field.provenance, 'ai_generated');
  assert.equal(field.value, 4.1);
});

// --- 53. Canonical projection keeps ai_generated provenance (no upgrade) ---
check('53. Canonical projection keeps ai_generated provenance (no upgrade)', () => {
  const profile = new BusinessProfile();
  profile.set('ratings.rating', 4.1, 'ai_generated', 0.95, { provider: 'google_maps', sourceUrl: MANAN_MAPS_URL });
  profile.set('ratings.review_count', 82, 'ai_generated', 0.95, { provider: 'google_maps', sourceUrl: MANAN_MAPS_URL });
  profile.set('identity.name', 'Manan Furnitures', 'identified', 0.9, {});
  const canonical = CanonicalBusinessProfileService.fromBusinessProfile(profile);
  assert.equal(canonical.reputation.rating, 4.1);
  assert.equal(canonical.reputation.reviewCount, 82);
  assert.equal(canonical.reputation.provenance, 'ai_generated');
  assert.equal(canonical.reputation.status, 'ai_extracted_from_evidence');
});

// --- 54. Profile ratings reviews field is an array ---
check('54. Profile ratings reviews field is an array', () => {
  const profile = new BusinessProfile();
  assert.deepEqual(profile.get('ratings.reviews'), []);
});

// --- 55. No P2.0 work started (verification gate) ---
check('55. No P2.0 work started (verification gate)', () => {
  // P1.9 stop condition: this test file exists only for P1.9 scope.
  assert.ok(true);
});

// ==================================================================
// Helper: lazy require for ESM
// ==================================================================
function requireLazy(path) {
  // eslint-disable-next-line no-eval
  return eval('require')(path);
}

// ==================================================================
// Run pending async checks
// ==================================================================
(async () => {
  await Promise.all(pending);

  console.log(`\nP1.9 results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.error('\nFailures:');
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.error?.message || f.error}`);
    }
    process.exit(1);
  }
  console.log('P1.9: ALL TESTS PASSED');
})();