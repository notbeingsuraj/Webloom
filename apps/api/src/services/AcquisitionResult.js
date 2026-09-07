/**
 * AcquisitionResult — Phase 20 Authoritative Contract
 *
 * Explicit single-authority internal result contract for business-data acquisition.
 *
 * Every acquisition attempt reports WHAT happened — provider, source URL,
 * status, records, error, diagnostics, source, extracted fields, completeness,
 * identity strength, confidence, errors, warnings, timing, and whether data is
 * structured or inferred.
 *
 * Statuses honestly distinguish:
 *   - success                  (usable business evidence acquired)
 *   - partial                  (some evidence, insufficient for complete identity)
 *   - empty_result             (source responded, but no business evidence was present)
 *   - insufficient_evidence    (too little to associate with an identity)
 *   - invalid_url              (malformed URL format)
 *   - unsupported_url          (URL not supported by this provider)
 *   - provider_unavailable     (the provider service could not be reached)
 *   - extraction_failed        (the source responded but could not be parsed)
 *   - authentication_failed    (401/403 or invalid API key)
 *   - rate_limited             (429 rate limit exceeded)
 *   - quota_exhausted          (provider quota/billing limit reached)
 *   - timeout                  (request exceeded timeout deadline)
 *   - ai_enrichment_failed     (optional AI enrichment failed)
 *   - persistence_failure      (identity repository write failed)
 *   - internal_failure         (unexpected exception)
 *
 * Error objects strictly preserve:
 *   - category
 *   - safeMessage (sanitized, zero secrets)
 *   - httpStatus (when available)
 *   - retryable (boolean)
 *   - provider
 *   - model (when relevant)
 *   - retryCount
 *   - latencyMs
 */

export const ACQUISITION_STATUS = Object.freeze({
  SUCCESS: 'success',                             // usable business evidence acquired
  PARTIAL: 'partial',                             // some evidence, insufficient for complete identity
  EMPTY_RESULT: 'empty_result',                   // nothing usable extracted
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence', // too little to identify business
  INVALID_URL: 'invalid_url',                     // URL is malformed or invalid
  UNSUPPORTED_URL: 'unsupported_url',             // URL format not supported by provider
  PROVIDER_UNAVAILABLE: 'provider_unavailable',   // provider service is offline/unreachable
  EXTRACTION_FAILED: 'extraction_failed',         // parsing / extraction could not proceed
  AUTHENTICATION_FAILED: 'authentication_failed', // credentials rejected
  RATE_LIMITED: 'rate_limited',                   // 429 too many requests
  QUOTA_EXHAUSTED: 'quota_exhausted',             // provider quota reached
  TIMEOUT: 'timeout',                             // request exceeded timeout
  AI_ENRICHMENT_FAILED: 'ai_enrichment_failed',
  PERSISTENCE_FAILURE: 'persistence_failure',
  INTERNAL_FAILURE: 'internal_failure',
});

export const IDENTITY_EVIDENCE_STRENGTH = Object.freeze({
  INSUFFICIENT: 'insufficient', // nothing identifiable or contradictory
  WEAK: 'weak',                 // e.g. name only, or generic directory name
  MODERATE: 'moderate',         // e.g. name + city/address or phone only
  STRONG: 'strong',             // e.g. name + phone or name + website
  VERY_STRONG: 'very_strong',   // e.g. name + address + phone, or stable provider ID + corroborating fields
});

// Fields that count toward "meaningful business evidence" (identity-critical).
const IDENTITY_EVIDENCE_FIELDS = [
  'identity.name',
  'contact.phone',
  'contact.website',
  'location.full_address',
  'location.coordinates',
];

/**
 * Sanitize any secret tokens, keys, cookies, or auth headers from text.
 * @param {string} value
 * @returns {string}
 */
export function sanitizeSecretText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization\s*:\s*Bearer\s*[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
    .replace(/x-api-key\s*[:=]\s*['"]?[A-Za-z0-9._-]+/gi, 'x-api-key=[REDACTED]')
    .replace(/sk-[A-Za-z0-9]{8,}/gi, '[REDACTED]')
    .replace(/cookie\s*[:=]\s*[^;\n]+/gi, 'cookie=[REDACTED]')
    .replace(/set-cookie\s*[:=]\s*[^;\n]+/gi, 'set-cookie=[REDACTED]');
}

/**
 * Determine if an error category / status is transient / retryable.
 */
export function isRetryableCategory(category, httpStatus = null) {
  if (httpStatus === 429 || httpStatus === 408 || httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    return true;
  }
  return category === ACQUISITION_STATUS.RATE_LIMITED ||
    category === ACQUISITION_STATUS.TIMEOUT ||
    category === ACQUISITION_STATUS.PROVIDER_UNAVAILABLE ||
    category === 'RATE_LIMITED' ||
    category === 'TIMEOUT' ||
    category === 'NETWORK_ERROR';
}

/**
 * Construct a standardized, sanitized provider error object.
 */
export function createProviderError({
  category = ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  safeMessage = 'Provider error occurred.',
  httpStatus = null,
  retryable = null,
  provider = null,
  model = null,
  retryCount = 0,
  latencyMs = null,
} = {}) {
  const sanitizedMsg = sanitizeSecretText(safeMessage || 'Provider error occurred.');
  return Object.freeze({
    category,
    safeMessage: sanitizedMsg,
    httpStatus: httpStatus != null ? Number(httpStatus) : null,
    retryable: retryable != null ? Boolean(retryable) : isRetryableCategory(category, httpStatus),
    provider: provider || null,
    model: model || null,
    retryCount: Number(retryCount) || 0,
    latencyMs: latencyMs != null ? Math.round(latencyMs) : null,
  });
}

/**
 * Calculate the identity evidence strength tier from a flat fields map or record.
 * Replaces boolean-only evidence checks with a tiered strength model (#5).
 *
 * @param {Object} fieldsOrRecord - flat dot-path fields map or structured record
 * @returns {{ strength: string, score: number, details: string[], hasName: boolean, hasHardIdentifier: boolean }}
 */
export function calculateIdentityStrength(fieldsOrRecord) {
  if (!fieldsOrRecord || typeof fieldsOrRecord !== 'object') {
    return { strength: IDENTITY_EVIDENCE_STRENGTH.INSUFFICIENT, score: 0, details: [], hasName: false, hasHardIdentifier: false };
  }

  const name = fieldsOrRecord['identity.name'] ?? fieldsOrRecord.identity?.name ?? fieldsOrRecord.business?.name ?? fieldsOrRecord.name ?? null;
  const phone = fieldsOrRecord['contact.phone'] ?? fieldsOrRecord.contact?.phone ?? fieldsOrRecord.phone ?? null;
  const website = fieldsOrRecord['contact.website'] ?? fieldsOrRecord.contact?.website ?? fieldsOrRecord.website ?? null;
  const address = fieldsOrRecord['location.full_address'] ?? fieldsOrRecord.location?.full_address ?? fieldsOrRecord.location?.address ?? fieldsOrRecord.address ?? null;
  const city = fieldsOrRecord['location.city'] ?? fieldsOrRecord.location?.city ?? fieldsOrRecord.city ?? null;
  const coords = fieldsOrRecord['location.coordinates'] ?? fieldsOrRecord.location?.coordinates ?? fieldsOrRecord.coordinates ?? null;
  const placeId = fieldsOrRecord['provider.placeId'] ?? fieldsOrRecord.provider?.placeId ?? fieldsOrRecord.placeId ?? null;

  const hasName = typeof name === 'string' && name.trim().length > 0;
  const hasPhone = typeof phone === 'string' && phone.trim().length >= 7;
  const hasWebsite = typeof website === 'string' && website.trim().length > 0;
  const hasAddress = typeof address === 'string' && address.trim().length > 0;
  const hasCity = typeof city === 'string' && city.trim().length > 0;
  const hasCoords = coords && typeof coords === 'object' && typeof coords.lat === 'number' && typeof coords.lng === 'number';
  const hasPlaceId = typeof placeId === 'string' && placeId.trim().length > 0;

  // Generic/noise names that don't constitute strong identity on their own
  const isGenericName = hasName && /^(unknown|business|store|restaurant|shop|coffee shop|cafe|unnamed business|n\/a)$/i.test(name.trim());

  let score = 0;
  const details = [];

  if (hasName) {
    if (isGenericName) {
      score += 0.1;
      details.push('generic_name');
    } else {
      score += 0.35;
      details.push('name');
    }
  }

  if (hasPhone) {
    score += 0.30;
    details.push('phone');
  }

  if (hasWebsite) {
    score += 0.25;
    details.push('website');
  }

  if (hasAddress) {
    score += 0.25;
    details.push('address');
  } else if (hasCity) {
    score += 0.10;
    details.push('city');
  }

  if (hasCoords) {
    score += 0.20;
    details.push('coordinates');
  }

  if (hasPlaceId) {
    score += 0.30;
    details.push('place_id');
  }

  // Semantic-first evidence strength (#5):
  //
  //   name + address + phone                      -> very_strong
  //   stable place id + name + corroborating      -> very_strong
  //   name + phone OR name + website              -> strong
  //   name + address OR name + city OR phone-only -> moderate
  //   name-only / website-only / coords-only      -> weak
  //   generic name-only / nothing                 -> insufficient
  //
  // Semantic combinations are checked BEFORE raw score bands because a
  // score alone cannot distinguish e.g. name+address (0.60) from
  // name+phone (0.65) — the combination determines the tier, not the sum.
  const semanticVeryStrong =
    (hasName && hasAddress && hasPhone) ||
    (hasPlaceId && hasName && (hasPhone || hasAddress || hasWebsite));
  const semanticStrong = hasName && (hasPhone || hasWebsite);
  const semanticModerate = (hasName && (hasAddress || hasCity)) || hasPhone;
  const semanticWeak = (hasName && !isGenericName) || hasWebsite || hasCoords;

  let strength;
  if (semanticVeryStrong) {
    strength = IDENTITY_EVIDENCE_STRENGTH.VERY_STRONG;
  } else if (semanticStrong) {
    strength = IDENTITY_EVIDENCE_STRENGTH.STRONG;
  } else if (semanticModerate) {
    strength = IDENTITY_EVIDENCE_STRENGTH.MODERATE;
  } else if (semanticWeak) {
    strength = IDENTITY_EVIDENCE_STRENGTH.WEAK;
  } else {
    strength = IDENTITY_EVIDENCE_STRENGTH.INSUFFICIENT;
  }

  return {
    strength,
    score: Math.min(1.0, parseFloat(score.toFixed(2))),
    details,
    hasName: hasName && !isGenericName,
    hasHardIdentifier: Boolean(hasPhone || hasWebsite || hasCoords || hasPlaceId),
  };
}

/**
 * Backward-compatible identity check. Returns true when identity evidence
 * meets at least WEAK threshold (not INSUFFICIENT).
 */
export function hasIdentityEvidence(fields) {
  if (!fields || typeof fields !== 'object') return false;
  const { strength } = calculateIdentityStrength(fields);
  return strength !== IDENTITY_EVIDENCE_STRENGTH.INSUFFICIENT;
}

/**
 * Single authoritative factory for AcquisitionResult across all providers.
 *
 * Enforces the canonical envelope:
 * {
 *   provider: string,
 *   status: ACQUISITION_STATUS,
 *   records: Array<Object>,
 *   error: Object|null,
 *   diagnostics: { httpStatus, errorCode, retryCount, latencyMs, gateway, model, success },
 *   source: { url, retrieval }
 * }
 *
 * @param {Object}  init
 * @param {string}  init.provider           - provider label (e.g. 'geoapify', 'web_extraction')
 * @param {string}  [init.sourceUrl]        - URL or resource queried
 * @param {string}  init.status             - one of ACQUISITION_STATUS
 * @param {Array}   [init.records]          - canonical profile records
 * @param {Object}  [init.fields]           - flat dot-path extracted field values
 * @param {Object}  [init.error]            - primary structured error object
 * @param {Array}   [init.errors]           - list of error objects
 * @param {Array}   [init.warnings]         - non-fatal warning descriptors
 * @param {Object}  [init.diagnostics]      - diagnostic performance / gateway metadata
 * @param {Object}  [init.source]           - { url, retrieval }
 * @param {number}  [init.completeness]     - 0..1 completeness
 * @param {number}  [init.confidence]       - 0..1 confidence
 * @param {string}  [init.dataKind]         - 'structured' | 'inferred' | 'identified' | 'mixed'
 * @param {number}  [init.latencyMs]        - latency in milliseconds
 * @param {Object}  [init.metadata]         - provider-specific metadata
 * @param {string}  [init.errorCode]        - machine-readable error code
 * @param {string}  [init.message]          - human-readable message
 * @returns {Object} frozen canonical AcquisitionResult
 */
export function createAcquisitionResult({
  provider,
  sourceUrl = null,
  status = ACQUISITION_STATUS.SUCCESS,
  records = [],
  fields = {},
  error = null,
  errors = [],
  warnings = [],
  diagnostics = {},
  source = null,
  completeness = 0,
  confidence = 0,
  dataKind = 'structured',
  latencyMs = null,
  metadata = {},
  errorCode = null,
  message = null,
} = {}) {
  const normErrors = Array.isArray(errors)
    ? (error && !errors.includes(error) ? [error, ...errors] : errors)
    : (error ? [error] : []);

  const primaryError = error || normErrors[0] || null;
  const primaryErrorObj = primaryError
    ? (typeof primaryError === 'string'
        ? createProviderError({ category: status, safeMessage: primaryError, provider, latencyMs })
        : createProviderError({ ...primaryError, provider: primaryError.provider || provider, latencyMs: primaryError.latencyMs ?? latencyMs }))
    : null;

  const url = sourceUrl || source?.url || null;
  const retrieval = source?.retrieval || new Date().toISOString();
  const dur = latencyMs != null ? Math.round(latencyMs) : (diagnostics?.latencyMs != null ? Math.round(diagnostics.latencyMs) : null);

  const diag = {
    httpStatus: diagnostics?.httpStatus ?? primaryErrorObj?.httpStatus ?? null,
    errorCode: errorCode || diagnostics?.errorCode || primaryErrorObj?.category || (status === ACQUISITION_STATUS.SUCCESS ? null : status),
    retryCount: diagnostics?.retryCount ?? primaryErrorObj?.retryCount ?? 0,
    latencyMs: dur,
    gateway: diagnostics?.gateway || null,
    model: diagnostics?.model || primaryErrorObj?.model || null,
    success: status === ACQUISITION_STATUS.SUCCESS || status === ACQUISITION_STATUS.PARTIAL,
  };

  const identityInfo = calculateIdentityStrength(fields || (records[0] ?? {}));

  const result = {
    provider,
    status,
    records: Array.isArray(records) ? records : (records ? [records] : []),
    error: primaryErrorObj,
    diagnostics: diag,
    source: { url, retrieval },
    // Extended canonical fields for pipeline consumers:
    sourceUrl: url,
    fields: { ...fields },
    completeness: clamp01(completeness),
    confidence: clamp01(confidence),
    dataKind,
    identityStrength: identityInfo.strength,
    identityScore: identityInfo.score,
    errors: normErrors.map((e) => typeof e === 'string' ? createProviderError({ category: status, safeMessage: e, provider }) : e),
    warnings: Array.isArray(warnings) ? warnings : [warnings],
    latencyMs: dur,
    metadata: { ...metadata },
    errorCode: diag.errorCode,
    message: message || primaryErrorObj?.safeMessage || (status === ACQUISITION_STATUS.SUCCESS ? 'Acquisition succeeded.' : 'Acquisition returned no usable data.'),
  };

  return Object.freeze(result);
}

/**
 * Build an empty-result AcquisitionResult and decide whether the outcome is a
 * plain empty result or a provider failure, based on what the provider did.
 */
export function classifyEmptyAcquisition({
  provider,
  sourceUrl,
  record = {},
  providerError = null,
  httpStatus = null,
  latencyMs = null,
} = {}) {
  const warnings = [];

  // If the provider explicitly reported a failure, classify appropriately
  if (providerError) {
    const rawCat = providerError.category || 'PROVIDER_UNAVAILABLE';
    let status = ACQUISITION_STATUS.PROVIDER_UNAVAILABLE;
    if (rawCat === 'AUTHENTICATION' || rawCat === 'AUTH_FAILED' || httpStatus === 401 || httpStatus === 403) {
      status = ACQUISITION_STATUS.AUTHENTICATION_FAILED;
    } else if (rawCat === 'RATE_LIMITED' || httpStatus === 429) {
      status = ACQUISITION_STATUS.RATE_LIMITED;
    } else if (rawCat === 'QUOTA_EXHAUSTED') {
      status = ACQUISITION_STATUS.QUOTA_EXHAUSTED;
    } else if (rawCat === 'TIMEOUT' || httpStatus === 408) {
      status = ACQUISITION_STATUS.TIMEOUT;
    } else if (rawCat === 'INVALID_RESPONSE' || rawCat === 'HTTP_ERROR') {
      status = ACQUISITION_STATUS.EXTRACTION_FAILED;
    }

    const err = createProviderError({
      category: status,
      safeMessage: providerError.safeMessage || 'Provider returned an error.',
      httpStatus: httpStatus || providerError.httpStatus || null,
      provider,
      latencyMs,
    });

    return createAcquisitionResult({
      provider,
      sourceUrl,
      status,
      records: [],
      fields: {},
      error: err,
      latencyMs,
    });
  }

  // HTTP-level failure (non-2xx) is an extraction/provider failure, not empty.
  if (httpStatus != null && (httpStatus < 200 || httpStatus >= 400)) {
    let status = ACQUISITION_STATUS.EXTRACTION_FAILED;
    if (httpStatus === 401 || httpStatus === 403) status = ACQUISITION_STATUS.AUTHENTICATION_FAILED;
    if (httpStatus === 429) status = ACQUISITION_STATUS.RATE_LIMITED;
    if (httpStatus === 408 || httpStatus === 504) status = ACQUISITION_STATUS.TIMEOUT;
    if (httpStatus === 502 || httpStatus === 503) status = ACQUISITION_STATUS.PROVIDER_UNAVAILABLE;

    const err = createProviderError({
      category: status,
      safeMessage: `Source returned HTTP ${httpStatus}.`,
      httpStatus,
      provider,
      latencyMs,
    });

    return createAcquisitionResult({
      provider,
      sourceUrl,
      status,
      records: [],
      fields: {},
      error: err,
      latencyMs,
    });
  }

  const hint = detectNoiseContent(record);
  if (hint) {
    warnings.push({ code: 'NO_BUSINESS_CONTENT', message: hint });
  }

  // Otherwise: the provider responded but produced no usable evidence.
  return createAcquisitionResult({
    provider,
    sourceUrl,
    status: ACQUISITION_STATUS.EMPTY_RESULT,
    records: [],
    fields: {},
    warnings,
    message: warnings[0]?.message || 'No business evidence extracted from the source.',
    latencyMs,
  });
}

/**
 * Detect pages that contain no business content but might look "successful"
 * (Google Maps server errors, consent walls, map-tile noise, etc.).
 *
 * @param {Object} record - extracted profile record (flat dot-path or nested)
 * @returns {string|null} a human-readable hint, or null if not noise
 */
export function detectNoiseContent(record = {}) {
  const text =
    typeof record?.metadata?.visibleText === 'string'
      ? record.metadata.visibleText
      : record?.visibleText ||
        (typeof record?.metadata?.rawText === 'string' ? record.metadata.rawText : '');

  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('server error') && lower.includes('try again later')) {
    return 'Source returned a server-error page (no business content).';
  }
  if (lower.includes('enable javascript') && lower.includes('browser') && lower.includes('google')) {
    return 'Source requires JavaScript rendering; no business content was available.';
  }
  return null;
}

/**
 * Summarize the field evidence (keys with non-empty values).
 * @param {Object} fields
 * @returns {string[]}
 */
export function summarizeFields(fields) {
  return Object.entries(fields || {})
    .filter(([, v]) => v != null && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0))
    .map(([k]) => k);
}

export function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const ERROR_CODE_MAP = {
  AUTHENTICATION: ACQUISITION_STATUS.AUTHENTICATION_FAILED,
  AUTH_FAILED: ACQUISITION_STATUS.AUTHENTICATION_FAILED,
  QUOTA_EXHAUSTED: ACQUISITION_STATUS.QUOTA_EXHAUSTED,
  RATE_LIMITED: ACQUISITION_STATUS.RATE_LIMITED,
  PROVIDER_UNAVAILABLE: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  TIMEOUT: ACQUISITION_STATUS.TIMEOUT,
  INVALID_RESPONSE: ACQUISITION_STATUS.EXTRACTION_FAILED,
  HTTP_ERROR: ACQUISITION_STATUS.EXTRACTION_FAILED,
  EMPTY_RESULT: ACQUISITION_STATUS.EMPTY_RESULT,
};

export function normalizeErrorCode(category) {
  return ERROR_CODE_MAP[category] || ACQUISITION_STATUS.INTERNAL_FAILURE;
}

export default {
  ACQUISITION_STATUS,
  IDENTITY_EVIDENCE_STRENGTH,
  createAcquisitionResult,
  createProviderError,
  classifyEmptyAcquisition,
  calculateIdentityStrength,
  hasIdentityEvidence,
  sanitizeSecretText,
  summarizeFields,
};