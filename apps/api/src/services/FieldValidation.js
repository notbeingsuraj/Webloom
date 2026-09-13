/**
 * FieldValidation — Reusable Schema-Aware Validation
 *
 * Centralized validation for FieldCandidate values. Reuses existing
 * Webloom validators (GoogleMapsFallbackExtractor, BusinessProfileValidator)
 * and adds the new candidate-stage type/semantic/evidence/cross-field checks.
 *
 * This module does NOT persist anything — it produces validation results
 * attached to FieldCandidate objects.
 */

import {
  validatePhone,
  isNonPhoneSignal,
  isValidEmail,
  validateWebsite,
  validateCoordinates,
} from './GoogleMapsFallbackExtractor.js';
import { looksLikeStreetAddress } from '../utils/streetAddressDetector.js';
import { CANDIDATE_STATUS } from './FieldCandidate.js';

// ---------------------------------------------------------------------------
// Type validation
// ---------------------------------------------------------------------------

/**
 * Validate a value against an expected type.
 * @param {*} value
 * @param {string} expectedType - one of: 'string', 'number', 'boolean', 'date', 'url', 'array', 'object', 'enum', 'nested'
 * @returns {{ passed: boolean, error?: string }}
 */
export function validateType(value, expectedType) {
  if (value === null || value === undefined) {
    return { passed: false, error: 'Value is null or undefined' };
  }

  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
        ? { passed: true }
        : { passed: false, error: `Expected string, got ${typeof value}` };
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
        ? { passed: true }
        : { passed: false, error: `Expected number, got ${typeof value}` };
    case 'boolean':
      return typeof value === 'boolean'
        ? { passed: true }
        : { passed: false, error: `Expected boolean, got ${typeof value}` };
    case 'date': {
      const d = new Date(value);
      return (!Number.isNaN(d.getTime()))
        ? { passed: true }
        : { passed: false, error: `Invalid date: ${String(value)}` };
    }
    case 'url': {
      try {
        const u = new URL(value);
        return (u.protocol === 'http:' || u.protocol === 'https:')
          ? { passed: true }
          : { passed: false, error: `URL must be http/https: ${value}` };
      } catch {
        return { passed: false, error: `Invalid URL: ${value}` };
      }
    }
    case 'array':
      return Array.isArray(value)
        ? { passed: true }
        : { passed: false, error: `Expected array, got ${typeof value}` };
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? { passed: true }
        : { passed: false, error: `Expected object, got ${typeof value}` };
    case 'nested':
      // Any non-primitive structure (object or array) is acceptable
      return (value !== null && typeof value === 'object')
        ? { passed: true }
        : { passed: false, error: `Expected nested structure, got ${typeof value}` };
    default:
      return { passed: false, error: `Unknown type: ${expectedType}` };
  }
}

/**
 * Map a dotted field path to its expected type for the Webloom profile schema.
 * Conservative mapping — only covers fields that exist in the current profile.
 * @param {string} fieldPath
 * @returns {string|null}
 */
export function getExpectedType(fieldPath) {
  // Identity fields
  if (fieldPath === 'identity.name' || fieldPath === 'identity.category' ||
      fieldPath === 'identity.description' || fieldPath === 'identity.business_type') {
    return 'string';
  }
  if (fieldPath === 'identity.categories' || fieldPath === 'identity.services') {
    return 'array';
  }
  // Contact
  if (fieldPath === 'contact.phone' || fieldPath === 'contact.email' || fieldPath === 'contact.website') {
    return 'string';
  }
  // Location
  if (fieldPath === 'location.full_address' || fieldPath === 'location.street' ||
      fieldPath === 'location.city' || fieldPath === 'location.state' ||
      fieldPath === 'location.country' || fieldPath === 'location.postal_code') {
    return 'string';
  }
  if (fieldPath === 'location.coordinates') {
    return 'nested'; // { lat, lng }
  }
  // Ratings
  if (fieldPath === 'ratings.rating') return 'number';
  if (fieldPath === 'ratings.review_count') return 'number';
  if (fieldPath === 'ratings.reviews') return 'array';
  if (fieldPath === 'ratings.review_summary') return 'string';
  if (fieldPath === 'ratings.sentiment') return 'string';
  if (fieldPath === 'ratings.themes') return 'array';
  // Hours
  if (fieldPath === 'hours') return 'object';
  // Social
  if (fieldPath === 'social_links') return 'array';
  return null; // unknown field — skip type validation
}

// ---------------------------------------------------------------------------
// Semantic validation
// ---------------------------------------------------------------------------

/**
 * Semantic validation rules per field path.
 * @param {string} fieldPath
 * @param {*} value
 * @param {Object} [context] - profile or record context for cross-field checks
 * @returns {{ passed: boolean, error?: string }}
 */
export function validateSemantic(fieldPath, value, context = {}) {
  if (value === null || value === undefined || value === '') {
    return { passed: true }; // missing values are handled by completeness, not semantic
  }

  // Rating range
  if (fieldPath === 'ratings.rating') {
    const r = Number(value);
    if (Number.isNaN(r) || r < 0 || r > 5) {
      return { passed: false, error: `Rating must be in [0, 5], got ${value}` };
    }
    return { passed: true };
  }

  // Review count non-negative integer
  if (fieldPath === 'ratings.review_count') {
    const rc = Number(value);
    if (Number.isNaN(rc) || rc < 0 || !Number.isInteger(rc)) {
      return { passed: false, error: `Review count must be non-negative integer, got ${value}` };
    }
    return { passed: true };
  }

  // Phone format (reuse existing validator)
  if (fieldPath === 'contact.phone') {
    const v = validatePhone(value);
    if (v.status === 'rejected') {
      return { passed: false, error: `Phone rejected: ${v.reason}` };
    }
    if (v.status === 'unresolved') {
      // Ambiguous but present — pass semantic, flag for evidence check
      return { passed: true, warning: 'Phone normalization unresolved' };
    }
    return { passed: true };
  }

  // Email format
  if (fieldPath === 'contact.email') {
    return isValidEmail(value)
      ? { passed: true }
      : { passed: false, error: `Invalid email format: ${value}` };
  }

  // Website format (reuse validator)
  if (fieldPath === 'contact.website') {
    const v = validateWebsite(value);
    if (v.status === 'rejected' || v.status === 'rejected_directory') {
      return { passed: false, error: `Website rejected: ${v.reason || v.status}` };
    }
    return { passed: true };
  }

  // Name must not be an address (reuse detector)
  if (fieldPath === 'identity.name') {
    if (looksLikeStreetAddress(value)) {
      return { passed: false, error: 'Business name appears to be a street address' };
    }
    return { passed: true };
  }

  // Coordinates validation
  if (fieldPath === 'location.coordinates') {
    const coords = validateCoordinates(value);
    return coords ? { passed: true } : { passed: false, error: 'Invalid coordinates' };
  }

  // Categories/services: must be array of strings
  if (fieldPath === 'identity.categories' || fieldPath === 'identity.services') {
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
      return { passed: false, error: 'Must be array of strings' };
    }
    return { passed: true };
  }

  // Hours: object with day keys
  if (fieldPath === 'hours') {
    if (value !== null && typeof value !== 'object') {
      return { passed: false, error: 'Hours must be an object' };
    }
    return { passed: true };
  }

  // No specific semantic rule — pass
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Evidence validation
// ---------------------------------------------------------------------------

/**
 * Evidence validation — checks that AI-generated candidates have evidence.
 * Deterministic candidates are NOT rejected for missing evidence (backward compatible).
 * @param {Object} candidate - FieldCandidate
 * @returns {{ passed: boolean, error?: string }}
 */
export function validateEvidence(candidate) {
  const kind = candidate.provenance?.kind;

  // AI-generated values MUST carry evidence when the field is identity-critical
  // or when the schema requires evidence.
  if (kind === 'ai_generated') {
    const identityCritical = [
      'identity.name',
      'contact.phone',
      'contact.website',
      'location.full_address',
      'location.coordinates',
      'ratings.rating',
      'ratings.review_count',
    ];

    if (identityCritical.includes(candidate.fieldPath)) {
      const snippet = candidate.evidence?.snippet;
      const evidenceId = candidate.evidence?.evidenceId;

      if (!snippet && !evidenceId) {
        return { passed: false, error: 'AI-generated identity-critical field lacks evidence' };
      }
    }
  }

  // Deterministic/inferred/identified/verified — no evidence requirement
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Cross-field validation
// ---------------------------------------------------------------------------

/**
 * Cross-field consistency checks.
 * @param {string} fieldPath
 * @param {*} value
 * @param {Object} profile - current BusinessProfile or flat profile object
 * @returns {{ passed: boolean, error?: string, warning?: string }}
 */
export function validateCrossField(fieldPath, value, profile) {
  if (value === null || value === undefined) {
    return { passed: true };
  }

  // Rating vs review count confusion
  if (fieldPath === 'ratings.rating' && typeof value === 'number') {
    const rc = profile?.ratings?.review_count ?? profile?.['ratings.review_count'];
    if (rc != null && value === rc) {
      return { passed: false, error: 'Rating value equals review count (likely swapped)' };
    }
  }
  if (fieldPath === 'ratings.review_count' && typeof value === 'number') {
    const r = profile?.ratings?.rating ?? profile?.['ratings.rating'];
    if (r != null && value === r) {
      return { passed: false, error: 'Review count equals rating (likely swapped)' };
    }
  }

  // Discounted vs original price — not in current schema, placeholder
  if (fieldPath.startsWith('pricing') || fieldPath.includes('discounted') || fieldPath.includes('original')) {
    // Future extension point
  }

  // Date ordering — not currently in profile but framework exists
  if (fieldPath.includes('date') || fieldPath.includes('published') || fieldPath.includes('updated')) {
    // Future extension point
  }

  return { passed: true };
}

// ---------------------------------------------------------------------------
// Field-specific schema validation
// ---------------------------------------------------------------------------

/**
 * Validate a FieldCandidate against its field's type, semantic, evidence, and cross-field rules.
 * Mutates candidate.validation and returns the updated candidate.
 * @param {Object} candidate - FieldCandidate
 * @param {Object} [profileContext] - current profile for cross-field checks
 * @returns {Object} the candidate (mutated)
 */
export function validateCandidate(candidate, profileContext = {}) {
  // Type
  const expectedType = getExpectedType(candidate.fieldPath);
  if (expectedType) {
    const typeResult = validateType(candidate.normalizedValue, expectedType);
    candidate.validation.type = typeResult.passed ? 'passed' : 'failed';
    if (!typeResult.passed) candidate.validation.errors.push(`type: ${typeResult.error}`);
  } else {
    candidate.validation.type = 'skipped';
  }

  // Semantic
  const semanticResult = validateSemantic(candidate.fieldPath, candidate.normalizedValue, profileContext);
  candidate.validation.semantic = semanticResult.passed ? 'passed' : 'failed';
  if (!semanticResult.passed) candidate.validation.errors.push(`semantic: ${semanticResult.error}`);
  if (semanticResult.warning) candidate.validation.errors.push(`semantic:warn: ${semanticResult.warning}`);

  // Evidence
  const evidenceResult = validateEvidence(candidate);
  candidate.validation.evidence = evidenceResult.passed ? 'passed' : 'failed';
  if (!evidenceResult.passed) candidate.validation.errors.push(`evidence: ${evidenceResult.error}`);

  // Cross-field
  const crossResult = validateCrossField(candidate.fieldPath, candidate.normalizedValue, profileContext);
  candidate.validation.crossField = crossResult.passed ? 'passed' : 'failed';
  if (!crossResult.passed) candidate.validation.errors.push(`cross-field: ${crossResult.error}`);
  if (crossResult.warning) candidate.validation.errors.push(`cross-field:warn: ${crossResult.warning}`);

  // Overall status
  if (candidate.validation.errors.length > 0) {
    candidate.status = CANDIDATE_STATUS.REJECTED;
    candidate.rejectionReason = candidate.validation.errors.join('; ');
  } else {
    candidate.status = CANDIDATE_STATUS.VALID;
  }

  return candidate;
}

/**
 * Validate multiple candidates (e.g., all candidates for a given field).
 * @param {Array<Object>} candidates
 * @param {Object} [profileContext]
 * @returns {Array<Object>} the same array (mutated)
 */
export function validateCandidates(candidates, profileContext = {}) {
  for (const c of candidates) {
    validateCandidate(c, profileContext);
  }
  return candidates;
}

export default {
  validateType,
  validateSemantic,
  validateEvidence,
  validateCrossField,
  validateCandidate,
  validateCandidates,
  getExpectedType,
};