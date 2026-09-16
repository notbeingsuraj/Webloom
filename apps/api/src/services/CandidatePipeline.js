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
 * Select the best candidate for a field.
 * Returns { accepted, rejected[], conflicts[] }.
 */
async function selectBestForField(fieldPath, candidates, profileContext = {}) {
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
      // Conflict! Both are identity-sensitive and disagree.
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
 * @param {Object} opts.options - { onlyIfMissing?, isConservativeMerge?, resolutionInfo? }
 * @returns {Promise<Object>} pipeline result
 */
export async function runCandidatePipeline({
  records = [],
  profileContext = {},
  options = {},
} = {}) {
  const { onlyIfMissing = false, isConservativeMerge = false, resolutionInfo = null } = options;

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
    // Skip fields already present if onlyIfMissing
    if (onlyIfMissing && profileContext[fieldPath] != null && profileContext[fieldPath] !== '') {
      // Mark existing as "skipped" - they don't become candidates
      for (const c of fieldCandidates) {
        rejectCandidate(c, 'onlyIfMissing: field already populated');
        pipeline.rejected.push(c);
      }
      continue;
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
      profileContext
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
        profile.set(c.fieldPath, c.normalizedValue, provenance, confidence, sourceInfo);
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
  return runCandidatePipeline({
    records: [{ record, provenance, sourceInfo }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options,
  });
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
      phone: 'contact.phone'
      email: 'contact.email',
      website: 'contact.website',
      coordinates: 'location.coordinates',
      name: 'identity.name',
      category: 'identity.category',
    };

    const syntheticRecord = {};
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
    }

    const provenance = fallbackResult.aiExtracted ? 'ai_generated' : 'discovered';
    records.push({
      record: syntheticRecord,
      provenance,
      sourceInfo: { sourceUrl, provider: 'google_maps_fallback' },
    });
  }
  return runCandidatePipeline({
    records,
    profileContext: profile.toObject ? profile.toObject() : profile,
    options,
  });
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
  return runCandidatePipeline({
    records: [{ record, provenance, sourceInfo: { sourceUrl: reputation.sourceUrl, provider: reputation.source } }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options,
  });
}

/**
 * Convenience: run pipeline for AI enrichment
 */
export async function runAIEnrichmentPipeline(profile, aiResult, sourceUrl, options = {}) {
  if (!aiResult || typeof aiResult !== 'object') {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }
  // Map AI result fields to BusinessProfile field paths
  const record = { business: {}, contact: {}, location: {}, identity: {} };
  if (aiResult.category) record.identity.category = aiResult.category;
  if (aiResult.description) record.identity.description = aiResult.description;
  if (Array.isArray(aiResult.services) && aiResult.services.length) record.identity.services = aiResult.services;

  return runCandidatePipeline({
    records: [{ record, provenance: 'inferred', sourceInfo: { sourceUrl, provider: 'ai_enrichment' } }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options: { onlyIfMissing: true }, // AI enrichment always only fills gaps
  });
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
  CANDIDATE_STATUS,
  SELECTION_PRIORITY,
  IDENTITY_SENSITIVE,
};

export { IDENTITY_SENSITIVE, SELECTION_PRIORITY };