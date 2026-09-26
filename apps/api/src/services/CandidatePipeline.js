/**
 * CandidatePipeline — Quality Foundation Orchestrator
 *
 * Lifecycle:
 *   collect candidates → validate → group by field → select best →
 *   preserve rejected/conflicts → write accepted → return diagnostics
 *
 * Integrates with existing Webloom provenance priority (PROVENANCE_PRIORITY
 * from CanonicalizationService) and preserves all existing merge semantics
 * (onlyIfMissing, entity-resolution guards, AI acceptance threshold, etc.).
 */

import { PROVENANCE_PRIORITY, FIELD_CLASSIFICATION } from './CanonicalizationService.js';
import {
  createCandidatesFromRecord,
  createFieldCandidate,
  CANDIDATE_STATUS,
  acceptCandidate,
  rejectCandidate,
  markValid,
} from './FieldCandidate.js';
import {
  validateCandidates,
  validateCandidate,
} from './FieldValidation.js';

let _pipelineSeq = 0;

/**
 * Create a pipeline instance (stateless; seq for diagnostics).
 * @returns {Object}
 */
function createPipeline() {
  _pipelineSeq += 1;
  return {
    id: `pipe_${Date.now()}_${_pipelineSeq}`,
    candidates: [],           // all candidates created
    accepted: [],             // accepted candidates
    rejected: [],             // rejected candidates
    conflicts: [],            // conflicts detected
    diagnostics: {
      totalCandidates: 0,
      byStatus: {},
      byField: {},
    },
    startedAt: new Date().toISOString(),
  };
}

/**
 * Add a provider record's fields as candidates.
 * @param {Object} pipeline
 * @param {Object} record - flat provider record
 * @param {string} provenance - Webloom provenance
 * @param {Object} [sourceInfo]
 * @returns {Array<Object>} created candidates
 */
function collectFromRecord(pipeline, record, provenance, sourceInfo = null) {
  const cands = createCandidatesFromRecord(record, provenance, sourceInfo);
  for (const c of cands) {
    c._pipelineId = pipeline.id;
  }
  pipeline.candidates.push(...cands);
  return cands;
}

/**
 * Add a single candidate manually.
 */
function collectCandidate(pipeline, candidate) {
  candidate._pipelineId = pipeline.id;
  pipeline.candidates.push(candidate);
  return candidate;
}

/**
 * Validate all collected candidates against current profile context.
 * @param {Object} pipeline
 * @param {Object} profileContext - BusinessProfile or flat profile
 */
function validate(pipeline, profileContext = {}) {
  validateCandidates(pipeline.candidates, profileContext);
}

/**
 * Selection priority: map provenance to numeric tier (higher = stronger).
 * Uses CanonicalizationService.PROVENANCE_PRIORITY as the authoritative source.
 */
const SELECTION_PRIORITY = {
  verified: 5,
  discovered: 4,
  user_provided: 4,
  identified: 3,
  inferred: 2,
  ai_generated: 1,
  canonical: 6, // re-loaded from canonical_field is authoritative
};

/**
 * Get selection priority for a candidate.
 */
function getCandidatePriority(candidate) {
  const webloomProv = candidate.provenance?.webloom || 'discovered';
  return SELECTION_PRIORITY[webloomProv] ?? 0;
}

/**
 * Identity-sensitive fields (use existing FIELD_CLASSIFICATION).
 */
const IDENTITY_SENSITIVE = new Set(FIELD_CLASSIFICATION.IDENTITY_SENSITIVE || [
  'identity.name',
  'contact.phone',
  'contact.website',
  'location.full_address',
  'location.coordinates',
]);

/**
 * Check if a field is identity-sensitive.
 */
function isIdentitySensitive(fieldPath) {
  return IDENTITY_SENSITIVE.has(fieldPath);
}

/**
 * Group candidates by field path.
 */
function groupByField(candidates) {
  const groups = new Map();
  for (const c of candidates) {
    if (!groups.has(c.fieldPath)) groups.set(c.fieldPath, []);
    groups.get(c.fieldPath).push(c);
  }
  return groups;
}

/**
 * Check if two values are "equivalent" for the field (reuse canonical logic).
 * We import the canonical helpers at runtime to avoid circular deps.
 */
let _equivCache = null;

async function areValuesEquivalent(fieldPath, val1, val2) {
  // Lazy-load to avoid circular dependency
  if (!_equivCache) {
    const mod = await import('./CanonicalizationService.js');
    _equivCache = {
      normalizeFieldValue: mod.normalizeFieldValue,
      areValuesEquivalent: mod.areValuesEquivalent,
    };
  }
  return _equivCache.areValuesEquivalent(fieldPath, val1, val2);
}

/**
 * Is a profile value actually populated?
 *
 * BusinessProfile pre-initialises several fields with empty containers
 * (`hours: {}`, `social_links: []`, `identity.categories: []`). A plain
 * `!= null` check treats those as real values, so `onlyIfMissing` would skip
 * them forever and they could never be enriched.
 */
function isPopulated(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Decide whether an AI-origin candidate may replace a populated-but-weak value.
 *
 * The default posture is "no": a populated field is protected unless the caller
 * supplies an explicit `overwriteBelowConfidence` floor AND the existing value
 * actually sits below it AND the incoming candidate clears a confidence bar.
 * Identity-sensitive fields demand a higher bar than descriptive ones.
 *
 * @returns {boolean} true when the replacement is allowed
 */
function canReplaceWeakValue({ isIdentity, existingConfidence, incomingConfidence, overwriteBelowConfidence, minIncomingConfidence }) {
  if (overwriteBelowConfidence == null) return false;
  if (existingConfidence == null) return false;
  if (!(existingConfidence < overwriteBelowConfidence)) return false;

  const bar = isIdentity
    ? Math.max(minIncomingConfidence ?? 0, 0.8)
    : (minIncomingConfidence ?? 0.7);

  return (incomingConfidence ?? 0) >= bar;
}

/**
 * Select the best candidate for a field.
 * Returns { accepted, rejected[], conflicts[] }.
 */
async function selectBestForField(fieldPath, candidates, profileContext = {}, options = {}) {
  const {
    overwriteBelowConfidence = null,
    minIncomingConfidence = 0.7,
    existingConfidenceByField = null,
  } = options;

  const accepted = [];
  const rejected = [];
  const conflicts = [];

  // Separate valid and invalid
  const valid = candidates.filter(c => c.status === CANDIDATE_STATUS.VALID);
  const invalid = candidates.filter(c => c.status !== CANDIDATE_STATUS.VALID);

  // Invalid are all rejected
  for (const c of invalid) {
    if (c.status !== CANDIDATE_STATUS.REJECTED) {
      rejectCandidate(c, c.rejectionReason || 'validation_failed');
    }
    rejected.push(c);
  }

  if (valid.length === 0) {
    return { accepted, rejected, conflicts };
  }

  // Sort by priority (desc), then confidence (desc)
  valid.sort((a, b) => {
    const pa = getCandidatePriority(a);
    const pb = getCandidatePriority(b);
    if (pa !== pb) return pb - pa;
    const ca = a.confidence ?? 0;
    const cb = b.confidence ?? 0;
    return cb - ca;
  });

  const top = valid[0];
  const isIdentity = isIdentitySensitive(fieldPath);

  // For identity-sensitive fields, check for conflicts with existing profile value
  const existingValue = profileContext[fieldPath];
  if (isIdentity && existingValue != null && existingValue !== '') {
    // Check equivalence with existing
    const equiv = await areValuesEquivalent(fieldPath, existingValue, top.normalizedValue);
    if (!equiv) {
      // Conflict! Both are identity-sensitive and disagree. An AI candidate may
      // still take over when the existing value is demonstrably weak and the
      // incoming one is strong — otherwise the conflict is preserved for the
      // existing resolution logic and nothing is written.
      const allowed = canReplaceWeakValue({
        isIdentity,
        existingConfidence: existingConfidenceByField?.[fieldPath] ?? null,
        incomingConfidence: top.confidence ?? null,
        overwriteBelowConfidence,
        minIncomingConfidence,
      });

      if (!allowed) {
        const conflict = {
          fieldPath,
          existing: { value: existingValue },
          incoming: { value: top.normalizedValue, candidate: top },
          status: 'conflicted',
          detectedAt: new Date().toISOString(),
        };
        conflicts.push(conflict);
        top.status = CANDIDATE_STATUS.CONFLICT;
        // Do NOT accept — preserve the conflict for existing resolution logic
        return { accepted, rejected, conflicts };
      }
    }
    // Equivalent — accept top (may be same value with better provenance)
  }

  // Accept the top candidate
  acceptCandidate(top);
  accepted.push(top);

  // Reject the rest with reason
  for (let i = 1; i < valid.length; i++) {
    rejectCandidate(valid[i], 'lower_priority');
    rejected.push(valid[i]);
  }

  return { accepted, rejected, conflicts };
}

/**
 * Run the full pipeline for a set of records.
 *
 * @param {Object} opts
 * @param {Array} opts.records - array of { record, provenance, sourceInfo }
 * @param {Object} opts.profileContext - current BusinessProfile or flat profile
 * @param {Object} opts.options - { onlyIfMissing?, isConservativeMerge?, resolutionInfo?,
 *                                   overwriteBelowConfidence?, minIncomingConfidence?,
 *                                   existingConfidenceByField? }
 * @returns {Promise<Object>} pipeline result
 */
export async function runCandidatePipeline({
  records = [],
  profileContext = {},
  options = {},
} = {}) {
  const {
    onlyIfMissing = false,
    isConservativeMerge = false,
    resolutionInfo = null,
    overwriteBelowConfidence = null,
    minIncomingConfidence = 0.7,
    existingConfidenceByField = null,
  } = options;

  const pipeline = createPipeline();

  // 1. Collect candidates from all records
  for (const { record, provenance, sourceInfo } of records) {
    collectFromRecord(pipeline, record, provenance, sourceInfo);
  }

  // 2. Validate all candidates
  validate(pipeline, profileContext);

  // 3. Group by field
  const groups = groupByField(pipeline.candidates);

  // 4. Select best per field
  for (const [fieldPath, fieldCandidates] of groups) {
    // Skip fields already populated if onlyIfMissing — unless the caller supplied
    // a confidence floor, the existing value sits below it, AND the incoming
    // candidate is confident enough to earn the replacement. A populated field
    // with an unknown confidence is always treated as protected.
    if (onlyIfMissing && isPopulated(profileContext[fieldPath])) {
      const existingConfidence = existingConfidenceByField?.[fieldPath] ?? null;
      const isWeak = overwriteBelowConfidence != null
        && existingConfidence != null
        && existingConfidence < overwriteBelowConfidence;

      if (!isWeak) {
        // Mark existing as "skipped" - they don't become candidates
        for (const c of fieldCandidates) {
          rejectCandidate(c, 'onlyIfMissing: field already populated');
          pipeline.rejected.push(c);
        }
        continue;
      }

      // The field is weak enough to replace, so the incoming candidate still has
      // to clear the bar. Identity-sensitive fields demand the higher bar.
      const bar = isIdentitySensitive(fieldPath)
        ? Math.max(minIncomingConfidence, 0.8)
        : minIncomingConfidence;
      const qualified = fieldCandidates.filter((c) => (c.confidence ?? 0) >= bar);

      if (qualified.length === 0) {
        for (const c of fieldCandidates) {
          rejectCandidate(c, `weak_value_below_confidence_floor: ${bar}`);
          pipeline.rejected.push(c);
        }
        continue;
      }
    }

    // For conservative merge (different_entity), skip identity fields entirely
    if (isConservativeMerge && isIdentitySensitive(fieldPath)) {
      for (const c of fieldCandidates) {
        rejectCandidate(c, 'conservative_merge: identity field skipped');
        pipeline.rejected.push(c);
      }
      continue;
    }

    const { accepted, rejected, conflicts } = await selectBestForField(
      fieldPath,
      fieldCandidates,
      profileContext,
      { overwriteBelowConfidence, minIncomingConfidence, existingConfidenceByField }
    );

    pipeline.accepted.push(...accepted);
    pipeline.rejected.push(...rejected);
    pipeline.conflicts.push(...conflicts);
  }

  // 5. Update diagnostics
  pipeline.diagnostics = {
    totalCandidates: pipeline.candidates.length,
    byStatus: {
      accepted: pipeline.accepted.length,
      rejected: pipeline.rejected.length,
      conflicted: pipeline.conflicts.length,
    },
    byField: Object.fromEntries(
      Array.from(groups.entries()).map(([fp, arr]) => [fp, arr.length])
    ),
    completedAt: new Date().toISOString(),
  };

  // 6. Write accepted values to profile (deferred to caller via apply function)
  return {
    ...pipeline,
    // Helper to apply accepted candidates to a BusinessProfile
    applyToProfile: (profile, sourceInfoOverride = null) => {
      const applied = [];
      for (const c of pipeline.accepted) {
        // Preserve sourceInfo from candidate or override
        const sourceInfo = c._sourceInfo || sourceInfoOverride || {};
        // Use the original Webloom provenance string for profile.set()
        const provenance = c.provenance.webloom;
        const confidence = c.confidence ?? 0.6;

        // BusinessProfile.set enforces its own source-tier rule and will refuse
        // an AI write over provider data (the P1.2 quarantine). A candidate only
        // reaches `accepted` here via the weak-value path when a floor was
        // supplied, so carry that authorisation explicitly — the model layer
        // re-checks the floor itself rather than trusting this flag.
        let effectiveSourceInfo = sourceInfo;
        if (overwriteBelowConfidence != null && typeof profile?.getField === 'function') {
          const current = profile.getField(c.fieldPath);
          const currentConfidence = typeof current?.confidence === 'number' ? current.confidence : null;
          if (current?.value != null
              && currentConfidence != null
              && currentConfidence < overwriteBelowConfidence) {
            effectiveSourceInfo = {
              ...sourceInfo,
              overwriteAuthorized: true,
              overwriteBelowConfidence,
            };
          }
        }

        profile.set(c.fieldPath, c.normalizedValue, provenance, confidence, effectiveSourceInfo);
        applied.push({ fieldPath: c.fieldPath, value: c.normalizedValue, provenance });
      }
      return applied;
    },
  };
}

/**
 * Convenience: run pipeline for a single record merge (used by _mergeCanonical etc.)
 */
export async function mergeRecordThroughPipeline(profile, record, provenance, sourceInfo, options = {}) {
  const result = await runCandidatePipeline({
    records: [{ record, provenance, sourceInfo }],
    profileContext: profile?.toObject ? profile.toObject() : profile,
    options,
  });
  if (profile && typeof profile.set === 'function') {
    result.applyToProfile(profile, sourceInfo);
  }
  return result;
}

/**
 * Convenience: run pipeline for fallback extraction results
 * 
 * fallbackResult fields map to BusinessProfile field paths:
 *   address -> location.full_address
 *   phone -> contact.phone
 *   email -> contact.email
 *   website -> contact.website
 *   coordinates -> location.coordinates
 *   name -> identity.name
 *   category -> identity.category
 */
export async function runFallbackPipeline(profile, fallbackResult, sourceUrl, options = {}) {
  const records = [];
  if (fallbackResult.fields) {
    // Map fallback field names to BusinessProfile field paths
    const fieldMap = {
      address: 'location.full_address',
      phone: 'contact.phone',
      email: 'contact.email',
      website: 'contact.website',
      coordinates: 'location.coordinates',
      name: 'identity.name',
      category: 'identity.category',
    };

    const syntheticRecord = {};
    const syntheticEvidence = {};
    const syntheticConfidence = {};
    for (const [fallbackField, value] of Object.entries(fallbackResult.fields)) {
      const fieldPath = fieldMap[fallbackField];
      if (!fieldPath) continue;
      const parts = fieldPath.split('.');
      let target = syntheticRecord;
      for (let i = 0; i < parts.length - 1; i++) {
        target[parts[i]] = target[parts[i]] || {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;

      // Forward per-field evidence (snippet + confidence) so the
      // CandidatePipeline evidence gate can verify AI-generated
      // identity-critical fields. Without this, evidence-grounded AI
      // fallback (P1.8) rejects every recovered field.
      const fieldEvidence = fallbackResult.evidence?.[fallbackField];
      if (fieldEvidence) {
        syntheticEvidence[fieldPath] = {
          snippet: fieldEvidence.evidenceSnippet || fieldEvidence.evidence || fieldEvidence.sourceUrl || null,
          evidenceId: fieldEvidence.evidenceId || null,
          locator: fieldEvidence.locator || null,
        };
      }
      const fieldConfidence = fallbackResult.confidence?.[fallbackField];
      if (fieldConfidence != null) {
        syntheticConfidence[fallbackField] = fieldConfidence;
      }
    }

    const provenance = fallbackResult.aiExtracted ? 'ai_generated' : 'discovered';
    records.push({
      record: { ...syntheticRecord, evidence: syntheticEvidence, confidence: syntheticConfidence },
      provenance,
      sourceInfo: { sourceUrl, provider: 'google_maps_fallback' },
    });
  }
  const result = await runCandidatePipeline({
    records,
    profileContext: profile?.toObject ? profile.toObject() : profile,
    options,
  });
  if (profile && typeof profile.set === 'function') {
    result.applyToProfile(profile, { sourceUrl, provider: 'google_maps_fallback' });
  }
  return result;
}

/**
 * Convenience: run pipeline for reputation extraction
 */
export async function runReputationPipeline(profile, reputation, result, options = {}) {
  const record = {};
  if (reputation.rating != null) record.ratings = { rating: reputation.rating };
  if (reputation.reviewCount != null) record.ratings = { ...record.ratings, review_count: reputation.reviewCount };
  if (reputation.reviews?.length) record.ratings = { ...record.ratings, reviews: reputation.reviews };
  if (reputation.reviewSummary != null) record.ratings = { ...record.ratings, review_summary: reputation.reviewSummary };
  if (reputation.sentiment != null) record.ratings = { ...record.ratings, sentiment: reputation.sentiment };
  if (reputation.themes?.length) record.ratings = { ...record.ratings, themes: reputation.themes };

  if (Object.keys(record).length === 0) {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const provenance = result?.aiExtracted ? 'ai_generated' : 'discovered';
  const pipelineResult = await runCandidatePipeline({
    records: [{ record, provenance, sourceInfo: { sourceUrl: reputation.sourceUrl, provider: reputation.source } }],
    profileContext: profile?.toObject ? profile.toObject() : profile,
    options,
  });
  if (profile && typeof profile.set === 'function') {
    pipelineResult.applyToProfile(profile, {
      ...(reputation.sourceUrl ? { sourceUrl: reputation.sourceUrl } : {}),
      provider: reputation.source === 'provider_record' ? 'structured_provider' : 'google_maps',
    });
  }
  return pipelineResult;
}

// Fields AI enrichment is allowed to write. Kept as one list so the confidence
// sweep below and the record mapping above cannot drift apart.
const AI_ENRICHMENT_FIELD_PATHS = Object.freeze([
  'identity.category',
  'identity.categories',
  'identity.business_type',
  'identity.description',
  'identity.services',
  'identity.products',
  'identity.amenities',
  'contact.phone',
  'contact.email',
  'contact.website',
  'location.full_address',
  'location.city',
  'location.state',
  'location.postal_code',
  'hours',
  'social_links',
]);

/**
 * Read a flat { fieldPath: confidence } map from a BusinessProfile.
 * Used by AI enrichment to decide which populated values are weak enough to
 * replace. Falls back to an empty map for plain objects.
 */
function collectFieldConfidences(profile) {
  const out = {};
  if (!profile || typeof profile.getField !== 'function') return out;
  for (const path of AI_ENRICHMENT_FIELD_PATHS) {
    const field = profile.getField(path);
    if (field && typeof field.confidence === 'number') {
      out[path] = field.confidence;
    }
  }
  return out;
}

/**
 * Unwrap an AI field envelope.
 *
 * The enrichment prompt asks for `{ value, confidence, evidence }` per field
 * (same shape GoogleMapsFallbackExtractor uses) so a widened field set stays
 * auditable. A bare value is still accepted for backwards compatibility with
 * callers that pass plain strings/arrays.
 *
 * @returns {{value:*, confidence:?number, evidence:?string}|null}
 */
function unwrapAiField(raw) {
  if (raw == null) return null;

  const isEnvelope = typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw;
  const value = isEnvelope ? raw.value : raw;

  if (value == null || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;

  const confidence = isEnvelope && typeof raw.confidence === 'number'
    ? Math.min(Math.max(raw.confidence, 0), 1)
    : null;
  const evidence = isEnvelope && typeof raw.evidence === 'string' && raw.evidence.trim()
    ? raw.evidence.trim().slice(0, 400)
    : null;

  return { value, confidence, evidence };
}

/**
 * Convenience: run pipeline for AI enrichment.
 *
 * Factual fields (contact/location/hours/socials) are recorded as
 * `ai_generated` — the model produced them, and downstream consumers must be
 * able to see that. Descriptive fields (category/description/services/products/
 * amenities) are `inferred`, matching the existing semantic that they are
 * derived from the business type rather than observed.
 *
 * @param {BusinessProfile} profile
 * @param {Object} aiResult - widened AI payload, envelopes or bare values
 * @param {string} sourceUrl
 * @param {Object} [options] - { overwriteBelowConfidence, minIncomingConfidence }
 */
export async function runAIEnrichmentPipeline(profile, aiResult, sourceUrl, options = {}) {
  if (!aiResult || typeof aiResult !== 'object') {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const {
    // Existing values at or above this confidence are never replaced. Null
    // keeps the historical gap-fill-only behaviour.
    overwriteBelowConfidence = null,
    minIncomingConfidence = 0.7,
  } = options;

  const base = { business: {}, contact: {}, location: {}, identity: {}, confidence: {}, evidence: {} };
  const factual = { business: {}, contact: {}, location: {}, identity: {}, confidence: {}, evidence: {} };

  // put(record, fieldPath, raw, section, key) — section/key land under
  // record[section][key], which is what createCandidatesFromRecord reads.
  const put = (record, fieldPath, raw, section, key) => {
    const field = unwrapAiField(raw);
    if (!field) return;
    record[section][key] = field.value;
    if (field.confidence != null) record.confidence[fieldPath] = field.confidence;
    if (field.evidence) record.evidence[fieldPath] = field.evidence;
  };

  // putRoot(record, fieldPath, raw) — for fields createCandidatesFromRecord
  // reads off the record root (hours, social_links).
  const putRoot = (record, fieldPath, raw) => {
    const field = unwrapAiField(raw);
    if (!field) return;
    record[fieldPath] = field.value;
    if (field.confidence != null) record.confidence[fieldPath] = field.confidence;
    if (field.evidence) record.evidence[fieldPath] = field.evidence;
  };

  // Descriptive — inferred from the business type.
  //
  // All of these go under `business`, not `identity`: createCandidatesFromRecord
  // resolves a single shape-agnostic "business carrier" (preferring `business`
  // whenever it is non-empty) and reads name/category/description/business_type/
  // categories/services off it. Splitting them across both sections would make
  // whichever section lost the carrier election invisible. The canonical field
  // paths stay `identity.*` regardless — only the record layout differs.
  put(base, 'identity.category', aiResult.category, 'business', 'category');
  put(base, 'identity.categories', aiResult.categories, 'business', 'categories');
  put(base, 'identity.business_type', aiResult.business_type ?? aiResult.businessType, 'business', 'business_type');
  put(base, 'identity.description', aiResult.description, 'business', 'description');
  put(base, 'identity.services', aiResult.services, 'business', 'services');
  put(base, 'identity.products', aiResult.products, 'business', 'products');
  put(base, 'identity.amenities', aiResult.amenities, 'business', 'amenities');

  // Factual — the model asserts these, so they stay quarantined as ai_generated.
  put(factual, 'contact.phone', aiResult.phone, 'contact', 'phone');
  put(factual, 'contact.email', aiResult.email, 'contact', 'email');
  put(factual, 'contact.website', aiResult.website, 'contact', 'website');
  put(factual, 'location.full_address', aiResult.full_address ?? aiResult.address, 'location', 'full_address');
  put(factual, 'location.city', aiResult.city, 'location', 'city');
  put(factual, 'location.state', aiResult.state, 'location', 'state');
  put(factual, 'location.postal_code', aiResult.postal_code, 'location', 'postal_code');
  putRoot(factual, 'hours', aiResult.hours);
  putRoot(factual, 'social_links', aiResult.social_links ?? aiResult.socialLinks);

  const records = [];
  if (Object.keys(base.business).length || Object.keys(base.identity).length) {
    records.push({
      record: base,
      provenance: 'inferred',
      sourceInfo: { sourceUrl, provider: 'ai_enrichment', extractionMethod: 'ai' },
    });
  }
  if (Object.keys(factual.contact).length || Object.keys(factual.location).length
      || factual.hours || factual.social_links) {
    records.push({
      record: factual,
      provenance: 'ai_generated',
      sourceInfo: { sourceUrl, provider: 'ai_enrichment', extractionMethod: 'ai' },
    });
  }

  if (records.length === 0) {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const pipelineResult = await runCandidatePipeline({
    records,
    profileContext: profile?.toObject ? profile.toObject() : profile,
    options: {
      onlyIfMissing: true,
      overwriteBelowConfidence,
      minIncomingConfidence,
      existingConfidenceByField: collectFieldConfidences(profile),
    },
  });

  if (profile && typeof profile.set === 'function') {
    pipelineResult.applyToProfile(profile, { sourceUrl, provider: 'ai_enrichment' });
  }
  return pipelineResult;
}

export default {
  runCandidatePipeline,
  mergeRecordThroughPipeline,
  runFallbackPipeline,
  runReputationPipeline,
  runAIEnrichmentPipeline,
  createPipeline,
  collectFromRecord,
  collectCandidate,
  validate,
  selectBestForField,
  canReplaceWeakValue,
  collectFieldConfidences,
  unwrapAiField,
  AI_ENRICHMENT_FIELD_PATHS,
  CANDIDATE_STATUS,
  SELECTION_PRIORITY,
  IDENTITY_SENSITIVE,
};

export { IDENTITY_SENSITIVE, SELECTION_PRIORITY };