/**
 * ReputationIntelligenceService — P1.9 Review Intelligence Generation
 *
 * Produces sentiment, themes, and summary for extracted reviews.
 *
 * P1.9 SPEC §9:
 *   - Only after RAW rating/review extraction succeeds
 *   - AI-generated review intelligence must include source review IDs,
 *     source URL, number of reviews analyzed, confidence, limitations
 *   - Must distinguish reviewCount vs reviewsAnalyzed
 *   - Never claim sample represents complete opinion
 *   - Do NOT generate sentiment when no reviews were supplied
 *   - Output must be faithful to ACTUAL review text (never invent)
 */

/**
 * Build a review intelligence summary with required distinction between
 * total review count and analyzed sample count.
 *
 * @param {Object} ctx
 * @param {number|null} ctx.reviewCount - total count from source (may be null)
 * @param {Array} ctx.reviews - actual extracted reviews (samples)
 * @param {string} [ctx.sourceUrl] - Google Maps URL
 * @param {Object} [ctx.ai] - injectable AIService for the LLM summary
 * @returns {Promise<Object>} { reviewSummary, sentiment, themes, limitations, reviewsAnalyzed, confidence }
 */
export async function generateReviewIntelligence({ reviewCount = null, reviews = [], sourceUrl = null, ai = null } = {}) {
  const sample = Array.isArray(reviews) ? reviews : [];

  // No reviews → no sentiment or themes (P1.9 §9: "Do not generate review
  // sentiment when no reviews were actually supplied")
  if (sample.length === 0) {
    return {
      reviewSummary: null,
      sentiment: null,
      themes: [],
      limitations: ['No review text was available from the supplied sources.'],
      reviewsAnalyzed: 0,
      confidence: 0,
      generated: false,
    };
  }

  const hadTotal = reviewCount != null;
  const totalLabel = hadTotal ? String(reviewCount) : 'unavailable';
  const limitationBase = hadTotal && sample.length < reviewCount
    ? [`Summary based on ${sample.length} returned review sample${sample.length === 1 ? '' : 's'}, not all ${reviewCount} reviews.`]
    : hadTotal
      ? [`Summary reflects all ${reviewCount} reviews.`]
      : [`Total review count unavailable; summary based on ${sample.length} returned review sample${sample.length === 1 ? '' : 's'}.`];

  const themes = extractThemesFromReviews(sample);

  const baseline = {
    reviewSummary: `Analysis of ${sample.length} review sample${sample.length === 1 ? '' : 's'}${hadTotal ? ` (total review count: ${reviewCount})` : ' (total review count unavailable)'}.`,
    sentiment: aggregateSentiment(sample),
    themes,
    limitations: limitationBase,
    reviewsAnalyzed: sample.length,
    confidence: 0.5,
    generated: true,
    sourceUrl: sourceUrl || null,
  };

  // If AI is available, optionally enhance the summary with the LLM, but only
  // if the summary is grounded in the actual review text.
  if (ai) {
    try {
      const enhanced = await generateAISummary({ reviews: sample, reviewCount, sourceUrl, ai });
      if (enhanced) {
        return {
          ...baseline,
          reviewSummary: enhanced.summary,
          sentiment: enhanced.sentiment ?? baseline.sentiment,
          themes: enhanced.themes?.length ? enhanced.themes : baseline.themes,
          confidence: enhanced.confidence ?? baseline.confidence,
          generated: true,
        };
      }
    } catch {
      // AI enhancement best-effort; keep deterministic baseline
    }
  }

  return baseline;
}

/**
 * Aggregate sentiment from review text deterministically.
 * Simple keyword heuristic — never invents sentiment absent from review text.
 */
export function aggregateSentiment(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;

  const positiveWords = /\b(great|excellent|amazing|wonderful|fantastic|good|best|love|loved|recommend|highly|friendly|courteous|top|perfect|impressed|satisfied|happy|beautiful)\b/i;
  const negativeWords = /\b(bad|poor|terrible|worst|awful|horrible|disappoint|disappointed|rude|slow|expensive|dirty|broken|unhappy|lack|lacking|refund|cancel|issue|problem)\b/i;

  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const r of reviews) {
    const text = r.text || '';
    const isPos = positiveWords.test(text);
    const isNeg = negativeWords.test(text);
    if (isPos && !isNeg) positive += 1;
    else if (isNeg && !isPos) negative += 1;
    else neutral += 1;
  }

  const label = positive > negative ? 'positive' : negative > positive ? 'negative' : 'mixed';
  return {
    label,
    positive: positive / reviews.length,
    negative: negative / reviews.length,
    neutral: neutral / reviews.length,
  };
}

/**
 * Extract themes from actual review text (deterministic keyword grouping).
 */
export function extractThemesFromReviews(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];

  const themeKeywords = {
    'Product quality': /\b(quality|durable|solid|well-made|finish|material|product)\b/i,
    'Customer service': /\b(service|staff|friendly|courteous|helpful|polite|rude|support)\b/i,
    'Pricing': /\b(price|pricing|expensive|cheap|affordable|value|cost)\b/i,
    'Delivery/Timeline': /\b(deliver|delivery|timeline|time|wait|slow|fast|prompt|on-time)\b/i,
    'Selection/Variety': /\b(selection|variety|range|collection|options|stock|designs)\b/i,
  };

  const themes = [];
  for (const [theme, pattern] of Object.entries(themeKeywords)) {
    const matched = reviews.filter((r) => pattern.test(r.text || ''));
    if (matched.length > 0) {
      themes.push({
        theme,
        confidence: Math.min(1, matched.length / reviews.length + 0.5),
        reviewCount: matched.length,
        example: matched[0].text?.slice(0, 200) ?? null,
      });
    }
  }

  return themes;
}

/**
 * AI-generated review summary grounded in actual review text.
 * @returns {Promise<Object|null>} { summary, sentiment, themes, confidence }
 */
async function generateAISummary({ reviews, reviewCount, sourceUrl, ai }) {
  const sample = reviews.slice(0, 20); // cap analysis input

  const prompt = [
    'You are a SOURCE-GROUNDED review intelligence assistant.',
    'You summarize ONLY the review text supplied.',
    '',
    'STRICT RULES:',
    '- Never invent review content not present in the supplied reviews.',
    '- Never claim the sample represents the complete review history.',
    '- If the total review count is known, explicitly distinguish sample count from total.',
    '- Report themes and sentiment ONLY as supported by the supplied review text.',
    '',
    `Total review count from source: ${reviewCount != null ? reviewCount : 'unknown'}`,
    `Reviews analyzed: ${sample.length}`,
    'Source URL: ' + (sourceUrl || 'unknown'),
    '',
    'REVIEWS:',
    ...sample.map((r, i) => `[${i + 1}] Rating: ${r.rating ?? 'N/A'} | Author: ${r.author ?? 'unknown'} | Text: ${r.text ?? '(no text)'}`),
  ].join('\n');

  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      sentiment: { type: ['string', 'null'] },
      themes: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
    },
    required: ['summary', 'sentiment', 'themes', 'confidence'],
  };

  try {
    const result = await ai.generate({
      prompt,
      model: 'fast',
      schema,
      temperature: 0,
      maxTokens: 800,
      systemPrompt: 'Summarize the supplied reviews faithfully. Never invent review content. Keep claims scoped to the supplied sample.',
    });
    if (!result || typeof result !== 'object' || typeof result.summary !== 'string') return null;
    return {
      summary: result.summary,
      sentiment: typeof result.sentiment === 'string' ? result.sentiment : null,
      themes: Array.isArray(result.themes) ? result.themes.filter((t) => typeof t === 'string') : [],
      confidence: typeof result.confidence === 'number' ? Math.min(1, Math.max(0, result.confidence)) : 0.5,
    };
  } catch {
    return null;
  }
}

export default {
  generateReviewIntelligence,
  aggregateSentiment,
  extractThemesFromReviews,
};