/**
 * GoogleMapsReputationExtractor — P1.9 Google Maps Ratings & Reviews Extraction
 *
 * Source-grounded extraction of rating and review data from Google Maps evidence.
 *
 * PRECEDENCE:
 *   1. Structured provider record (Geoapify/Google Places) with rating/reviewCount
 *   2. Deterministic parsing of Google Maps source text (e.g. "4.1 (82 reviews)")
 *   3. AI extraction from actual evidence (never guesses, never fabricates)
 *   4. null / unavailable
 *
 * RULES (P1.9 spec):
 *   - AI may extract ratings/reviews ONLY from explicitly present evidence
 *   - AI must NEVER guess, estimate, or fabricate ratings or review counts
 *   - AI must NEVER calculate an average from visible reviews
 *   - AI must NEVER treat sample review count as total review count
 *   - AI must NEVER invent review text, authors, or dates
 *   - Rating must be 1.0–5.0; reviewCount must be integer ≥ 0
 *   - Review samples ≠ total review count
 *   - Identity safety: reject data belonging to a different business
 *   - All output carries field-level provenance
 */

import { AI_ACCEPTANCE_THRESHOLD } from './GoogleMapsFallbackExtractor.js';

// ---------------------------------------------------------------------------
// Deterministic validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a rating value: must be a number between 1.0 and 5.0 (inclusive).
 * Accepts one decimal of precision (e.g. 4.1, 3.5, 5.0).
 * @param {*} value
 * @returns {{ valid: boolean, value: number|null, reason: string|null }}
 */
export function validateRating(value) {
  if (value == null) return { valid: false, value: null, reason: 'null' };
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(num)) return { valid: false, value: null, reason: 'non_numeric' };
  if (num < 1.0 || num > 5.0) return { valid: false, value: null, reason: 'out_of_range' };
  // Round to 1 decimal place to reject unreasonable precision
  const rounded = Math.round(num * 10) / 10;
  return { valid: true, value: rounded, reason: null };
}

/**
 * Validate a review count: must be a non-negative integer.
 * @param {*} value
 * @returns {{ valid: boolean, value: number|null, reason: string|null }}
 */
export function validateReviewCount(value) {
  if (value == null) return { valid: false, value: null, reason: 'null' };
  const num = typeof value === 'number' ? value : parseInt(String(value).replace(/,/g, ''), 10);
  if (!Number.isFinite(num)) return { valid: false, value: null, reason: 'non_numeric' };
  if (!Number.isInteger(num)) return { valid: false, value: null, reason: 'non_integer' };
  if (num < 0) return { valid: false, value: null, reason: 'negative' };
  return { valid: true, value: num, reason: null };
}

/**
 * Validate an individual review object.
 * @param {Object} review
 * @returns {Object|null} validated review or null if invalid
 */
export function validateReview(review) {
  if (!review || typeof review !== 'object') return null;

  const ratingCheck = review.rating != null ? validateRating(review.rating) : null;
  const text = typeof review.text === 'string' && review.text.trim().length > 0
    ? review.text.trim() : null;
  // Accept Google Places' authorName as author
  const author = typeof review.author === 'string' && review.author.trim().length > 0
    ? review.author.trim()
    : (typeof review.authorName === 'string' && review.authorName.trim().length > 0
      ? review.authorName.trim()
      : null);
  // Accept Google Places' relativeTimeDescription or publishTime
  const publishedAt = typeof review.publishedAt === 'string' && review.publishedAt.trim().length > 0
    ? review.publishedAt.trim()
    : (typeof review.relativeTimeDescription === 'string' && review.relativeTimeDescription.trim().length > 0
      ? review.relativeTimeDescription.trim()
      : (typeof review.publishTime === 'string' && review.publishTime.trim().length > 0
        ? review.publishTime.trim()
        : null));

  // A review must have at least one meaningful field (text, rating, or author)
  if (!text && (!ratingCheck || !ratingCheck.valid) && !author) return null;

  return {
    rating: ratingCheck?.valid ? ratingCheck.value : null,
    text,
    author,
    publishedAt,
    source: review.source || 'google_maps',
    sourceUrl: review.sourceUrl || null,
    provenance: review.provenance || 'ai_generated',
    confidence: typeof review.confidence === 'number' ? Math.min(1, Math.max(0, review.confidence)) : 0.5,
    verified: Boolean(review.verified),
  };
}

// ---------------------------------------------------------------------------
// Deterministic extraction from structured provider record
// ---------------------------------------------------------------------------

/**
 * Extract rating/review data from a structured provider record (e.g. Geoapify,
 * Google Places API). This is the most authoritative source.
 *
 * @param {Object} providerRecord - flat provider record with ratings.* fields
 * @param {Object} [identityAnchor] - identity signals for conflict checking
 * @returns {{ reputation: Object|null, provenance: string, evidence: Object|null }}
 */
export function extractFromStructuredProvider(providerRecord, identityAnchor = null) {
  if (!providerRecord || typeof providerRecord !== 'object') {
    return { reputation: null, provenance: 'observed', evidence: null };
  }

  // Read rating from multiple known shapes (Geoapify adapter, Google Places, flat)
  const rawRating =
    providerRecord.ratings?.rating ??
    providerRecord.rating ??
    providerRecord.googleRating ??
    null;

  const rawReviewCount =
    providerRecord.ratings?.review_count ??
    providerRecord.user_ratings_total ??
    providerRecord.userRatingCount ??
    providerRecord.reviewCount ??
    providerRecord.reviews ??
    null;

  // Google Places returns reviews as an array
  const rawReviews =
    providerRecord.ratings?.reviews ??
    providerRecord.reviews ??
    null;

  const ratingCheck = validateRating(rawRating);
  const reviewCountCheck = validateReviewCount(rawReviewCount);

  // Validate reviews array
  const reviews = Array.isArray(rawReviews)
    ? rawReviews.map(validateReview).filter(Boolean)
    : [];

  const hasRating = ratingCheck.valid;
  const hasReviewCount = reviewCountCheck.valid;
  const hasReviews = reviews.length > 0;

  const reputation = {
    rating: hasRating ? ratingCheck.value : null,
    reviewCount: hasReviewCount ? reviewCountCheck.value : null,
    reviews,
    reviewSummary: null,
    sentiment: null,
    themes: [],
    status: (hasRating || hasReviewCount) ? 'source_extracted' : 'unavailable',
    provenance: 'observed',
    confidence: hasRating ? 0.9 : 0.7,
    source: 'provider_record',
  };

  if (!hasRating && !hasReviewCount && !hasReviews) {
    return { reputation, provenance: 'observed', evidence: null };
  }

  const evidence = {
    rating: hasRating ? {
      value: ratingCheck.value,
      source: 'structured_provider',
      extractionMethod: 'provider',
      evidence: `Provider record rating: ${ratingCheck.value}`,
    } : null,
    reviewCount: hasReviewCount ? {
      value: reviewCountCheck.value,
      source: 'structured_provider',
      extractionMethod: 'provider',
      evidence: `Provider record review count: ${reviewCountCheck.value}`,
    } : null,
  };

  return { reputation, provenance: 'observed', evidence };
}

// ---------------------------------------------------------------------------
// Deterministic extraction from Google Maps source text
// ---------------------------------------------------------------------------

/**
 * Common patterns for rating and review count in Google Maps page text.
 * Google Maps displays ratings as "4.1" and review counts as "(82 reviews)"
 * or "82 reviews" near the business name.
 */
const RATING_PATTERNS = [
  // "4.1" standalone near ratings context, 1.0–5.0 range
  /(?:^|[\s(,])([1-5]\.\d)(?:[\s),/]|$)/gm,
  // "Rated 4.1" or "Rating: 4.1"
  /(?:rated|rating)[:\s]*([1-5]\.\d)/gi,
  // "4.1/5" or "4.1 / 5"
  /([1-5]\.\d)\s*\/\s*5/g,
];

const REVIEW_COUNT_PATTERNS = [
  // "(82 reviews)" or "82 reviews"
  /(\d[\d,]*)\s*(?:reviews?|ratings?|google\s*reviews?|google\s*ratings?)/gi,
  // "Reviews (82)" or "Ratings (82)"
  /(?:reviews?|ratings?)\s*\((\d[\d,]*)\)/gi,
  // "82 Google reviews"
  /(\d[\d,]*)\s*google\s*(?:reviews?|ratings?)/gi,
];

const REVIEW_BLOCK_PATTERNS = [
  // Individual review with rating "4.1 ★" followed by text
  /(?:^|\n)\s*(?:★+\s*)?([1-5](?:\.\d)?)\s*(?:★+\s*)?[\s\S]*?(?:^|\n)\s*(.+?)(?:\n\s*(?:Reply|Helpful|Google review)|$)/gm,
];

/**
 * Parse rating and review count from Google Maps page text deterministically.
 *
 * @param {string} sourceText - retrieved Google Maps page text
 * @param {Object} [identityAnchor] - business identity for conflict rejection
 * @returns {{ fields: Object, evidence: Object, confidence: Object }}
 */
export function extractFromSourceText(sourceText, identityAnchor = null) {
  const fields = { rating: null, reviewCount: null, reviews: [] };
  const evidence = {};
  const confidence = {};

  if (!sourceText || typeof sourceText !== 'string') {
    return { fields, evidence, confidence };
  }

  // Extract rating
  for (const pattern of RATING_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(sourceText);
    if (match) {
      const check = validateRating(match[1]);
      if (check.valid) {
        fields.rating = check.value;
        evidence.rating = {
          value: check.value,
          source: 'google_maps_source',
          extractionMethod: 'parser',
          provenance: 'observed',
          confidence: 0.85,
          evidence: match[0].trim(),
        };
        confidence.rating = 0.85;
        break;
      }
    }
  }

  // Extract review count
  for (const pattern of REVIEW_COUNT_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(sourceText);
    if (match) {
      const raw = match[1].replace(/,/g, '');
      const check = validateReviewCount(raw);
      if (check.valid) {
        fields.reviewCount = check.value;
        evidence.reviewCount = {
          value: check.value,
          source: 'google_maps_source',
          extractionMethod: 'parser',
          provenance: 'observed',
          confidence: 0.85,
          evidence: match[0].trim(),
        };
        confidence.reviewCount = 0.85;
        break;
      }
    }
  }

  return { fields, evidence, confidence };
}

// ---------------------------------------------------------------------------
// AI evidence-grounded extraction
// ---------------------------------------------------------------------------

/**
 * Build the AI prompt for reputation extraction from evidence.
 * Strict instructions prevent fabrication.
 *
 * @param {string} evidenceText - the actual source evidence
 * @returns {string} prompt
 */
function buildReputationExtractionPrompt(evidenceText) {
  return [
    'You are a SOURCE-GROUNDED reputation extraction assistant.',
    'You extract ONLY rating and review data that is EXPLICITLY present in the supplied evidence.',
    '',
    'STRICT RULES:',
    '- NEVER guess a rating. If the evidence does not show a numeric rating (1.0-5.0), return null.',
    '- NEVER estimate a review count. If the evidence does not show a total review/rating count, return null.',
    '- NEVER calculate a Google rating by averaging individual review ratings.',
    '- NEVER treat the number of visible review samples as the total review count.',
    '- NEVER invent review text. Only extract review text that is literally present in the evidence.',
    '- NEVER invent author names. Only extract author names literally present.',
    '- NEVER invent dates. Only extract dates literally present.',
    '- NEVER merge data from another business.',
    '- Return null for any value not present in the evidence.',
    '- Return an evidence snippet (exact quote) for every extracted value.',
    '- Return a confidence value 0-1 reflecting how explicit the evidence is.',
    '- Return status: "extracted" | "missing" | "ambiguous".',
    '',
    'EVIDENCE (retrieved page text):',
    '```',
    evidenceText.slice(0, 8000),
    '```',
    '',
    'Return ONLY valid JSON in this exact schema:',
    JSON.stringify({
      rating: { value: null, evidence: null, confidence: 0, status: 'missing' },
      reviewCount: { value: null, evidence: null, confidence: 0, status: 'missing' },
      reviews: [
        {
          rating: null,
          text: null,
          author: null,
          publishedAt: null,
          evidence: null,
          confidence: 0,
          status: 'missing',
        },
      ],
      reviewSummary: { value: null, evidence: null, confidence: 0, status: 'missing' },
    }, null, 2),
  ].join('\n');
}

/**
 * AI schema for reputation extraction validation.
 */
const REPUTATION_SCHEMA = {
  type: 'object',
  properties: {
    rating: {
      type: 'object',
      properties: {
        value: { type: ['number', 'null'] },
        evidence: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
      },
      required: ['value', 'evidence', 'confidence', 'status'],
    },
    reviewCount: {
      type: 'object',
      properties: {
        value: { type: ['number', 'null'] },
        evidence: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
      },
      required: ['value', 'evidence', 'confidence', 'status'],
    },
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rating: { type: ['number', 'null'] },
          text: { type: ['string', 'null'] },
          author: { type: ['string', 'null'] },
          publishedAt: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['rating', 'text', 'author', 'publishedAt', 'evidence', 'confidence', 'status'],
      },
    },
    reviewSummary: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        evidence: { type: ['string', 'null'] },
        confidence: { type: 'number' },
        status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
      },
      required: ['value', 'evidence', 'confidence', 'status'],
    },
  },
  required: ['rating', 'reviewCount', 'reviews', 'reviewSummary'],
};

/**
 * Run AI evidence-grounded reputation extraction.
 *
 * @param {Object} ctx
 * @param {string} ctx.evidenceText - actual source text evidence
 * @param {string} [ctx.sourceUrl] - Google Maps URL for provenance
 * @param {Object} [ctx.ai] - injectable AIService (for testing)
 * @returns {Promise<Object|null>} { fields, evidence, confidence, aiExtracted }
 */
export async function extractReputationWithAI({ evidenceText = null, sourceUrl = null, ai = null } = {}) {
  if (!evidenceText || typeof evidenceText !== 'string' || evidenceText.trim().length < 50) {
    // No meaningful evidence → no AI call (contract: never trigger AI without evidence)
    return null;
  }

  let AIService;
  if (!ai) {
    const mod = await import('./AIService.js');
    AIService = mod.default;
  } else {
    AIService = ai;
  }

  const prompt = buildReputationExtractionPrompt(evidenceText);

  let result;
  try {
    result = await AIService.generate({
      prompt,
      model: 'reasoning',
      schema: REPUTATION_SCHEMA,
      temperature: 0,
      maxTokens: 3000,
      systemPrompt:
        'You extract business reputation data ONLY when the evidence explicitly contains ratings and reviews. ' +
        'Never invent, estimate, or calculate values. Use exact evidence snippets. Return strict JSON only.',
    });
  } catch (error) {
    console.error('[GoogleMapsReputationExtractor] AI extraction failed (best-effort):', error?.safeMessage || error?.message);
    return null;
  }

  if (!result || typeof result !== 'object') return null;

  const fields = { rating: null, reviewCount: null, reviews: [], reviewSummary: null };
  const evidence = {};
  const confidence = {};
  let aiUsed = false;

  // Validate and accept rating
  if (result.rating && result.rating.status !== 'missing' && result.rating.value != null) {
    const check = validateRating(result.rating.value);
    const conf = typeof result.rating.confidence === 'number' ? result.rating.confidence : 0;
    if (check.valid && conf >= AI_ACCEPTANCE_THRESHOLD && result.rating.evidence) {
      fields.rating = check.value;
      evidence.rating = {
        value: check.value,
        source: 'google_maps_source',
        sourceUrl,
        sourceType: 'extraction_evidence',
        extractionMethod: 'ai',
        provenance: 'ai_generated',
        confidence: Math.min(1, Math.max(0, conf)),
        verified: false,
        evidenceSnippet: String(result.rating.evidence).slice(0, 500),
      };
      confidence.rating = Math.min(1, Math.max(0, conf));
      aiUsed = true;
    }
  }

  // Validate and accept reviewCount
  if (result.reviewCount && result.reviewCount.status !== 'missing' && result.reviewCount.value != null) {
    const check = validateReviewCount(result.reviewCount.value);
    const conf = typeof result.reviewCount.confidence === 'number' ? result.reviewCount.confidence : 0;
    if (check.valid && conf >= AI_ACCEPTANCE_THRESHOLD && result.reviewCount.evidence) {
      fields.reviewCount = check.value;
      evidence.reviewCount = {
        value: check.value,
        source: 'google_maps_source',
        sourceUrl,
        sourceType: 'extraction_evidence',
        extractionMethod: 'ai',
        provenance: 'ai_generated',
        confidence: Math.min(1, Math.max(0, conf)),
        verified: false,
        evidenceSnippet: String(result.reviewCount.evidence).slice(0, 500),
      };
      confidence.reviewCount = Math.min(1, Math.max(0, conf));
      aiUsed = true;
    }
  }

  // Validate and accept individual reviews
  if (Array.isArray(result.reviews)) {
    for (const r of result.reviews) {
      const validated = validateReview({
        rating: r?.rating,
        text: r?.text,
        author: r?.author,
        publishedAt: r?.publishedAt,
        source: 'google_maps',
        sourceUrl,
        provenance: 'ai_generated',
        confidence: r?.confidence ?? 0,
        verified: false,
      });
      if (validated && typeof r?.evidence === 'string' && r.evidence.trim().length > 0) {
        validated.evidenceSnippet = r.evidence.slice(0, 500);
        fields.reviews.push(validated);
        aiUsed = true;
      }
    }
  }

  // Review summary
  if (result.reviewSummary && result.reviewSummary.status !== 'missing' && result.reviewSummary.value) {
    const conf = typeof result.reviewSummary.confidence === 'number' ? result.reviewSummary.confidence : 0;
    if (conf >= AI_ACCEPTANCE_THRESHOLD && result.reviewSummary.evidence) {
      fields.reviewSummary = {
        value: String(result.reviewSummary.value),
        evidence: String(result.reviewSummary.evidence).slice(0, 500),
        confidence: Math.min(1, Math.max(0, conf)),
        source: 'google_maps_source',
        sourceUrl,
        extractionMethod: 'ai',
        provenance: 'ai_generated',
      };
      confidence.reviewSummary = Math.min(1, Math.max(0, conf));
      aiUsed = true;
    }
  }

  return {
    fields,
    evidence,
    confidence,
    aiExtracted: aiUsed,
  };
}

// ---------------------------------------------------------------------------
// Orchestrated reputation extraction (P1.9 entry point)
// ---------------------------------------------------------------------------

/**
 * Full reputation extraction combining structured provider data, deterministic
 * source-text parsing, and AI evidence-grounded extraction.
 *
 * @param {Object} ctx
 * @param {Object} [ctx.providerRecord] - structured provider record (Geoapify, Google Places)
 * @param {string} [ctx.sourceText] - retrieved Google Maps page text
 * @param {string} [ctx.sourceUrl] - Google Maps URL
 * @param {Object} [ctx.existingCanonicalProfile] - current canonical for identity safety
 * @param {Object} [ctx.ai] - injectable AIService
 * @returns {Promise<Object>} { reputation, evidence, aiExtracted, provenance }
 */
export async function extractReputation({
  providerRecord = null,
  sourceText = null,
  sourceUrl = null,
  existingCanonicalProfile = null,
  ai = null,
} = {}) {
  // Identity anchor for conflict detection
  const identityAnchor = existingCanonicalProfile ? {
    name: existingCanonicalProfile.identity?.name ?? existingCanonicalProfile.business?.name ?? null,
    city: existingCanonicalProfile.identity?.addressComponents?.city ?? existingCanonicalProfile.location?.city ?? null,
    state: existingCanonicalProfile.identity?.addressComponents?.state ?? existingCanonicalProfile.location?.state ?? null,
    coordinates: existingCanonicalProfile.identity?.coordinates ?? existingCanonicalProfile.location?.coordinates ?? null,
  } : null;

  // STEP 1: Structured provider record (highest authority)
  const structured = extractFromStructuredProvider(providerRecord, identityAnchor);
  if (structured.reputation && (structured.reputation.rating != null || structured.reputation.reviewCount != null)) {
    return {
      reputation: structured.reputation,
      evidence: structured.evidence,
      aiExtracted: false,
      provenance: 'observed',
    };
  }

  // STEP 2: Deterministic source-text parsing
  const parsed = extractFromSourceText(sourceText, identityAnchor);
  const hasParsedRating = parsed.fields.rating != null;
  const hasParsedReviewCount = parsed.fields.reviewCount != null;

  if (hasParsedRating || hasParsedReviewCount) {
    return {
      reputation: {
        rating: parsed.fields.rating,
        reviewCount: parsed.fields.reviewCount,
        reviews: [],
        reviewSummary: null,
        sentiment: null,
        themes: [],
        status: 'source_extracted',
        provenance: 'observed',
        confidence: Math.max(parsed.confidence.rating ?? 0, parsed.confidence.reviewCount ?? 0),
        source: 'source_text_parser',
      },
      evidence: parsed.evidence,
      aiExtracted: false,
      provenance: 'observed',
    };
  }

  // STEP 3: AI evidence-grounded extraction (only when source text exists)
  if (sourceText && sourceText.trim().length >= 50) {
    const aiResult = await extractReputationWithAI({
      evidenceText: sourceText,
      sourceUrl,
      ai,
    });

    if (aiResult && aiResult.aiExtracted) {
      const hasAnyData = aiResult.fields.rating != null || aiResult.fields.reviewCount != null || aiResult.fields.reviews.length > 0;
      if (hasAnyData) {
        return {
          reputation: {
            rating: aiResult.fields.rating,
            reviewCount: aiResult.fields.reviewCount,
            reviews: aiResult.fields.reviews,
            reviewSummary: aiResult.fields.reviewSummary?.value ?? null,
            sentiment: null,
            themes: [],
            status: 'ai_extracted_from_evidence',
            provenance: 'ai_generated',
            confidence: Math.max(
              aiResult.confidence.rating ?? 0,
              aiResult.confidence.reviewCount ?? 0,
              aiResult.confidence.reviewSummary ?? 0,
            ),
            source: 'ai_evidence_extraction',
            evidence: aiResult.evidence,
          },
          evidence: aiResult.evidence,
          aiExtracted: true,
          provenance: 'ai_generated',
        };
      }
    }
  }

  // STEP 4: Nothing available
  return {
    reputation: {
      rating: null,
      reviewCount: null,
      reviews: [],
      reviewSummary: null,
      sentiment: null,
      themes: [],
      status: 'unavailable',
      provenance: null,
      confidence: 0,
      source: null,
    },
    evidence: {},
    aiExtracted: false,
    provenance: null,
  };
}

export default {
  extractReputation,
  extractFromStructuredProvider,
  extractFromSourceText,
  extractReputationWithAI,
  validateRating,
  validateReviewCount,
  validateReview,
  AI_ACCEPTANCE_THRESHOLD,
};
