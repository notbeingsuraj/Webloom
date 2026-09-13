/**
 * FieldCandidate — Quality Foundation Layer
 *
 * A plain-object representation of a single candidate value for a business
 * profile field. Every provider/AI extraction produces FieldCandidate instances;
 * the CandidatePipeline validates, selects, and writes only accepted candidates
 * to BusinessProfile.set().
 *
 * This module does NOT duplicate the existing Source/Evidence persistence
 * models — it references them by ID when they exist and carries lightweight
 * inline metadata otherwise. The existing CanonicalizationService remains
 * responsible for durable persistence.
 *
 * Statuses:
 *   candidate  — created, not yet validated
 *   valid      — passed all applicable validation
 *   accepted   — selected as the canonical value for this field
 *   rejected   — failed validation or lost selection
 *   conflict   — competes with another candidate on an identity-sensitive field
 */

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

export const CANDIDATE_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  VALID: 'valid',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CONFLICT: 'conflict',
});

// ---------------------------------------------------------------------------
// Provenance kind
// ---------------------------------------------------------------------------

export const PROVENANCE_KIND = Object.freeze({
  DETERMINISTIC: 'deterministic', // URL parser, structured provider, DOM extraction
  AI_GENERATED: 'ai_generated',   // AI model produced the value
  INFERRED: 'inferred',           // AI enrichment for gap-filling (category/description)
  IDENTIFIED: 'identified',       // Parsed from the input URL itself
  VERIFIED: 'verified',           // Confirmed from authoritative source (official website)
  USER_PROVIDED: 'user_provided', // Operator supplied the value
  CANONICAL: 'canonical',         // Re-loaded from persisted canonical_field (skip validation)
});

// Map Webloom provenance strings to kinds
const WEBLOOM_PROVENANCE_TO_KIND = {
  verified: PROVENANCE_KIND.VERIFIED,
  discovered: PROVENANCE_KIND.DETERMINISTIC,
  user_provided: PROVENANCE_KIND.USER_PROVIDED,
  identified: PROVENANCE_KIND.IDENTIFIED,
  inferred: PROVENANCE_KIND.INFERRED,
  ai_generated: PROVENANCE_KIND.AI_GENERATED,
};

/**
 * Map a Webloom provenance string to a PROVENANCE_KIND.
 * @param {string} webloomProvenance
 * @returns {string}
 */
export function provenanceToKind(webloomProvenance) {
  return WEBLOOM_PROVENANCE_TO_KIND[webloomProvenance] || PROVENANCE_KIND.DETERMINISTIC;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _candidateSeq = 0;

/**
 * Create a new FieldCandidate.
 *
 * @param {Object} opts
 * @param {string} opts.fieldPath       - Dotted field path (e.g. 'contact.phone')
 * @param {*}      opts.rawValue        - Value as extracted (before normalization)
 * @param {*}      [opts.normalizedValue] - Value after normalization (defaults to rawValue)
 * @param {Object} [opts.source]        - { sourceId?, sourceUrl?, provider?, extractionMethod? }
 * @param {Object} [opts.evidence]      - { evidenceId?, snippet?, locator? }
 * @param {string} [opts.provenance]    - Webloom provenance string ('discovered', 'ai_generated', …)
 * @param {number} [opts.confidence]    - Existing Webloom confidence (0–1), preserved not invented
 * @param {Object} [opts.sourceInfo]    - Full sourceInfo object to forward to profile.set()
 * @returns {Object} FieldCandidate
 */
export function createFieldCandidate({
  fieldPath,
  rawValue,
  normalizedValue,
  source = {},
  evidence = {},
  provenance = 'discovered',
  confidence = null,
  sourceInfo = null,
} = {}) {
  _candidateSeq += 1;
  return {
    id: `fc_${Date.now()}_${_candidateSeq}`,
    fieldPath,
    rawValue,
    normalizedValue: normalizedValue !== undefined ? normalizedValue : rawValue,
    source: {
      sourceId: source.sourceId || null,
      sourceUrl: source.sourceUrl || sourceInfo?.sourceUrl || null,
      provider: source.provider || sourceInfo?.provider || null,
      extractionMethod: source.extractionMethod || sourceInfo?.extractionMethod || null,
    },
    evidence: {
      evidenceId: evidence.evidenceId || null,
      snippet: evidence.snippet || null,
      locator: evidence.locator || null,
    },
    provenance: {
      webloom: provenance,
      kind: provenanceToKind(provenance),
    },
    confidence,
    validation: {
      type: null,       // 'passed' | 'failed' | null
      semantic: null,
      evidence: null,
      crossField: null,
      errors: [],
    },
    status: CANDIDATE_STATUS.CANDIDATE,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    // Preserved for forwarding to profile.set()
    _sourceInfo: sourceInfo,
  };
}

/**
 * Mark a candidate as rejected.
 * @param {Object} candidate
 * @param {string} reason
 * @returns {Object} the same candidate (mutated)
 */
export function rejectCandidate(candidate, reason) {
  candidate.status = CANDIDATE_STATUS.REJECTED;
  candidate.rejectionReason = reason;
  return candidate;
}

/**
 * Mark a candidate as accepted.
 * @param {Object} candidate
 * @returns {Object}
 */
export function acceptCandidate(candidate) {
  candidate.status = CANDIDATE_STATUS.ACCEPTED;
  return candidate;
}

/**
 * Mark a candidate as valid (passed validation, awaiting selection).
 * @param {Object} candidate
 * @returns {Object}
 */
export function markValid(candidate) {
  candidate.status = CANDIDATE_STATUS.VALID;
  return candidate;
}

/**
 * Bulk-create candidates from a Webloom flat provider record.
 *
 * Mirrors CanonicalizationService._extractFieldObservations but produces
 * FieldCandidate objects instead of raw observations.
 *
 * @param {Object} record       - canonical flat provider record
 * @param {string} provenance   - Webloom provenance ('discovered', 'ai_generated', …)
 * @param {Object} [sourceInfo] - forwarded to each candidate
 * @returns {Array<Object>}     - array of FieldCandidate
 */
export function createCandidatesFromRecord(record, provenance = 'discovered', sourceInfo = null) {
  const candidates = [];
  const confidence = record?.confidence || {};

  // Shape-agnostic business carrier: the canonical flat provider shape puts
  // name/category/description under `business`, while AI enrichment and some
  // legacy shapes carry them under `identity`. Read both, preferring
  // `business` (matches CanonicalBusinessProfileService.NAME_SOURCES).
  const biz = record?.business && typeof record?.business === 'object' && Object.keys(record.business).length
    ? record.business
    : (record?.identity && typeof record?.identity === 'object' ? record.identity : {});

  const add = (fieldPath, rawValue, conf) => {
    if (rawValue == null || rawValue === '') return;
    // Support evidence at record level (for AI candidates)
    const recordEvidence = record?.evidence?.[fieldPath] || record?.evidence?.[fieldPath.split('.').pop()];
    candidates.push(createFieldCandidate({
      fieldPath,
      rawValue,
      provenance,
      confidence: conf ?? null,
      sourceInfo,
      source: {
        provider: sourceInfo?.provider || record?.provider?.name || null,
        sourceUrl: sourceInfo?.sourceUrl || null,
        extractionMethod: sourceInfo?.extractionMethod || null,
      },
      evidence: recordEvidence ? { snippet: recordEvidence.snippet || recordEvidence } : undefined,
    }));
  };

  add('identity.name', biz.name, confidence.name);
  add('identity.category', biz.category, confidence.category);
  add('identity.description', biz.description, confidence.description);
  add('identity.business_type', biz.business_type ?? biz.businessType, confidence.business_type);
  if (Array.isArray(biz.categories) && biz.categories.length) {
    add('identity.categories', biz.categories, confidence.categories);
  }
  if (record?.contact) {
    add('contact.phone', record.contact.phone, confidence.phone);
    add('contact.email', record.contact.email, confidence.email);
    add('contact.website', record.contact.website, confidence.website);
  }
  if (record?.location) {
    add('location.full_address', record.location.full_address, confidence.address);
    add('location.street', record.location.street);
    add('location.city', record.location.city);
    add('location.state', record.location.state);
    add('location.country', record.location.country);
    add('location.postal_code', record.location.postal_code);
    const coords = record.location.coordinates ||
      (record.location.latitude != null && record.location.longitude != null
        ? { lat: record.location.latitude, lng: record.location.longitude }
        : null);
    if (coords) add('location.coordinates', coords);
  }
  if (record?.ratings) {
    if (typeof record.ratings.rating === 'number') add('ratings.rating', record.ratings.rating, confidence.rating);
    if (typeof record.ratings.review_count === 'number') add('ratings.review_count', record.ratings.review_count, confidence.review_count);
  }
  if (record?.hours && typeof record.hours === 'object') {
    add('hours', record.hours);
  }
  const services = record?.services ?? biz.services;
  if (Array.isArray(services) && services.length) {
    add('identity.services', services);
  }
  const socialLinks = record?.social_links ?? record?.socialLinks;
  if (Array.isArray(socialLinks) && socialLinks.length) {
    add('social_links', socialLinks);
  }

  return candidates;
}

export default {
  createFieldCandidate,
  createCandidatesFromRecord,
  rejectCandidate,
  acceptCandidate,
  markValid,
  CANDIDATE_STATUS,
  PROVENANCE_KIND,
  provenanceToKind,
};
