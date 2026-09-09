/**
 * Canonicalization Service — Phase 4: Canonical Business Intelligence
 * 
 * Determines canonical business field values from multi-provider observations.
 * Handles evidence evaluation, conflict detection, and provenance tracking.
 * 
 * This service is the canonicalization layer that sits between provider observations
 * and the canonical business profile. It uses the persistent identity from Phase 3
 * and the evidence system from Phase 2.
 */

import { Source, Evidence, Claim, Conflict, SourceIndependenceAnalyzer } from './EvidenceModels.js';
import { normalizePhone, normalizeWebsite } from './EntityResolution.js';
import { IdentityRepository } from '../db/IdentityRepository.js';

/**
 * Field classification for conflict resolution
 */
const FIELD_CLASSIFICATION = {
  // Identity-sensitive fields: require stronger evidence before replacement
  IDENTITY_SENSITIVE: [
    'identity.name',
    'contact.phone',
    'contact.website',
    'location.full_address',
    'location.coordinates'
  ],
  
  // Descriptive/volatile fields: can tolerate provider disagreement
  DESCRIPTIVE: [
    'identity.category',
    'identity.categories',
    'identity.description',
    'identity.business_type',
    'contact.email',
    'location.street',
    'location.city',
    'location.state',
    'location.country',
    'location.postal_code',
    'ratings.rating',
    'ratings.review_count',
    'hours',
    'identity.services',
    'identity.categories'
  ]
};

/**
 * Provenance priority (higher = more reliable)
 */
const PROVENANCE_PRIORITY = {
  verified: 4,
  discovered: 3,
  user_provided: 3,
  identified: 2,
  inferred: 1,
  ai_generated: 0.5
};

/**
 * Provider authority defaults
 */
const PROVIDER_AUTHORITY = {
  geoapify: 0.85,
  web_extraction: 0.75,
  google_maps: 0.8,
  official_website: 0.95,
  user_provided: 0.9
};

/**
 * Normalize field value for comparison
 */
function normalizeFieldValue(fieldPath, value) {
  if (value == null || value === '') return null;
  
  switch (fieldPath) {
    case 'contact.phone':
      return normalizePhone(value);
    case 'contact.website':
      return normalizeWebsite(value);
    case 'identity.name':
      return value.trim().toLowerCase();
    case 'location.full_address':
      return value.trim().toLowerCase();
    case 'identity.category':
      return value.trim().toLowerCase();
    default:
      if (typeof value === 'string') {
        return value.trim();
      }
      return value;
  }
}

/**
 * Check if two normalized values are equivalent
 */
function areValuesEquivalent(fieldPath, value1, value2) {
  if (value1 === value2) return true;
  if (value1 == null || value2 == null) return false;
  
  const norm1 = normalizeFieldValue(fieldPath, value1);
  const norm2 = normalizeFieldValue(fieldPath, value2);
  return norm1 === norm2;
}

/**
 * Calculate evidence strength for a claim
 */
function calculateEvidenceStrength(observation) {
  const provenancePriority = PROVENANCE_PRIORITY[observation.provenance] || 1;
  const providerAuthority = PROVIDER_AUTHORITY[observation.provider] || 0.5;
  const confidence = observation.confidence || 0.5;
  
  // Weighted combination
  return (provenancePriority * 0.4) + (providerAuthority * 0.3) + (confidence * 0.3);
}

/**
 * Determine if an observation should update canonical field
 */
function shouldUpdateCanonical(existingCanonical, newObservation, isIdentitySensitive) {
  if (!existingCanonical) return true;
  
  const existingPriority = PROVENANCE_PRIORITY[existingCanonical.provenance] || 0;
  const newPriority = PROVENANCE_PRIORITY[newObservation.provenance] || 0;
  const existingStrength = calculateEvidenceStrength(existingCanonical);
  const newStrength = calculateEvidenceStrength(newObservation);
  
  // For identity-sensitive fields, be more conservative
  if (isIdentitySensitive) {
    // Require significantly stronger evidence to replace identity fields
    return newPriority > existingPriority || 
           (newPriority === existingPriority && newStrength > existingStrength + 0.15);
  }
  
  // For descriptive fields, normal precedence
  return newPriority > existingPriority || 
         (newPriority === existingPriority && newStrength > existingStrength);
}

/**
 * Canonicalization Service
 */
export class CanonicalizationService {
  /**
   * Create a new CanonicalizationService instance.
   * @param {Object} repoOrDb - IdentityRepository or Drizzle database instance
   */
  constructor(repoOrDb) {
    if (!repoOrDb) {
      throw new Error('IdentityRepository or database instance is required');
    }
    this.repo = typeof repoOrDb.createObservation === 'function'
      ? repoOrDb
      : new IdentityRepository(repoOrDb);
  }

  /**
   * Process a provider observation and update canonical state
   * @param {Object} params
   * @param {string} params.entityId
   * @param {string} params.provider
   * @param {string} params.providerRecordId
   * @param {Object} params.record - canonical flat record from provider
   * @param {Object} params.sourceInfo - { sourceUrl, extractionMethod, etc }
   * @param {number} params.confidence - overall record confidence
   * @returns {Promise<Object>} canonicalization results
   */
  async processObservation({ entityId, provider, providerRecordId, record, sourceInfo = {}, confidence = 0.8 }) {
    const results = {
      canonicalizedFields: [],
      conflictsDetected: [],
      provenanceUpgrades: [],
      observationsStored: 0
    };

    // Extract field values from the provider record
    const fieldObservations = this._extractFieldObservations(record, provider, providerRecordId, confidence);
    
    for (const observation of fieldObservations) {
      if (!observation.value) continue;
      
      const fieldPath = observation.fieldPath;
      const isIdentitySensitive = FIELD_CLASSIFICATION.IDENTITY_SENSITIVE.includes(fieldPath);
      
      // Store the observation
      await this._storeObservation({
        entityId,
        provider,
        providerRecordId,
        fieldPath,
        value: observation.value,
        normalizedValue: normalizeFieldValue(fieldPath, observation.value),
        provenance: observation.provenance || 'discovered',
        confidence: observation.confidence,
        sourceInfo
      });
      results.observationsStored++;

      // Get current canonical value
      const existingCanonical = await this._getCanonicalField(entityId, fieldPath);
      
      // Check for equivalence with existing canonical
      if (existingCanonical && areValuesEquivalent(fieldPath, existingCanonical.value, observation.value)) {
        // Values are equivalent - just update provenance if this is stronger
        if (shouldUpdateCanonical(existingCanonical, { ...observation, provenance: observation.provenance }, isIdentitySensitive)) {
          await this._upgradeCanonicalProvenance(entityId, fieldPath, observation);
          results.provenanceUpgrades.push({ fieldPath, from: existingCanonical.provenance, to: observation.provenance });
        }
        continue;
      }

      // Check for conflict with existing canonical
      if (existingCanonical && existingCanonical.value !== null && !areValuesEquivalent(fieldPath, existingCanonical.value, observation.value)) {
        const conflict = await this._handleConflict(entityId, fieldPath, existingCanonical, observation, isIdentitySensitive);
        results.conflictsDetected.push(conflict);
        continue;
      }

      // No conflict, no existing canonical - set as canonical
      await this._setCanonicalField(entityId, fieldPath, observation);
      results.canonicalizedFields.push({ fieldPath, value: observation.value });
    }

    return results;
  }

  /**
   * Extract field observations from a provider record
   */
  _extractFieldObservations(record, provider, providerRecordId, baseConfidence) {
    const observations = [];
    
    if (record.business) {
      if (record.business.name) {
        observations.push({ fieldPath: 'identity.name', value: record.business.name, provenance: 'discovered', confidence: baseConfidence * 0.95 });
      }
      if (record.business.category) {
        observations.push({ fieldPath: 'identity.category', value: record.business.category, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (record.business.description) {
        observations.push({ fieldPath: 'identity.description', value: record.business.description, provenance: 'discovered', confidence: baseConfidence * 0.7 });
      }
      if (record.business.categories) {
        observations.push({ fieldPath: 'identity.categories', value: record.business.categories, provenance: 'discovered', confidence: baseConfidence * 0.8 });
      }
      if (record.business.business_type) {
        observations.push({ fieldPath: 'identity.business_type', value: record.business.business_type, provenance: 'discovered', confidence: baseConfidence * 0.8 });
      }
    }

    if (record.contact) {
      if (record.contact.phone) {
        observations.push({ fieldPath: 'contact.phone', value: record.contact.phone, provenance: 'discovered', confidence: baseConfidence * 0.95 });
      }
      if (record.contact.email) {
        observations.push({ fieldPath: 'contact.email', value: record.contact.email, provenance: 'discovered', confidence: baseConfidence * 0.8 });
      }
      if (record.contact.website) {
        observations.push({ fieldPath: 'contact.website', value: record.contact.website, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
    }

    if (record.location) {
      if (record.location.full_address) {
        observations.push({ fieldPath: 'location.full_address', value: record.location.full_address, provenance: 'discovered', confidence: baseConfidence * 0.9 });
      }
      if (record.location.street) {
        observations.push({ fieldPath: 'location.street', value: record.location.street, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (record.location.city) {
        observations.push({ fieldPath: 'location.city', value: record.location.city, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (record.location.state) {
        observations.push({ fieldPath: 'location.state', value: record.location.state, provenance: 'discovered', confidence: baseConfidence * 0.8 });
      }
      if (record.location.country) {
        observations.push({ fieldPath: 'location.country', value: record.location.country, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (record.location.postal_code) {
        observations.push({ fieldPath: 'location.postal_code', value: record.location.postal_code, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (record.location.coordinates) {
        observations.push({ fieldPath: 'location.coordinates', value: JSON.stringify(record.location.coordinates), provenance: 'discovered', confidence: baseConfidence * 0.95 });
      }
    }

    if (record.ratings) {
      if (typeof record.ratings.rating === 'number') {
        observations.push({ fieldPath: 'ratings.rating', value: record.ratings.rating, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
      if (typeof record.ratings.review_count === 'number') {
        observations.push({ fieldPath: 'ratings.review_count', value: record.ratings.review_count, provenance: 'discovered', confidence: baseConfidence * 0.85 });
      }
    }

    if (record.hours) {
      observations.push({ fieldPath: 'hours', value: JSON.stringify(record.hours), provenance: 'discovered', confidence: baseConfidence * 0.8 });
    }

    if (record.services) {
      observations.push({ fieldPath: 'identity.services', value: JSON.stringify(record.services), provenance: 'discovered', confidence: baseConfidence * 0.7 });
    }

    return observations;
  }

  /**
   * Store observation in database
   */
  async _storeObservation({ entityId, provider, providerRecordId, fieldPath, value, normalizedValue, provenance, confidence, sourceInfo }) {
    return this.repo.createObservation({
      entityId,
      provider,
      providerRecordId,
      fieldPath,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      normalizedValue: typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue),
      provenance,
      confidence,
      sourceId: sourceInfo?.sourceId || null,
    });
  }

  /**
   * Get current canonical field value
   */
  async _getCanonicalField(entityId, fieldPath) {
    return this.repo.getCanonicalField(entityId, fieldPath);
  }

  /**
   * Set canonical field value
   */
  async _setCanonicalField(entityId, fieldPath, observation) {
    return this.repo.upsertCanonicalField({
      entityId,
      fieldPath,
      value: typeof observation.value === 'string' ? observation.value : JSON.stringify(observation.value),
      provenance: observation.provenance,
      confidence: observation.confidence,
    });
  }

  /**
   * Upgrade canonical field provenance
   */
  async _upgradeCanonicalProvenance(entityId, fieldPath, observation) {
    return this.repo.upsertCanonicalField({
      entityId,
      fieldPath,
      value: typeof observation.value === 'string' ? observation.value : JSON.stringify(observation.value),
      provenance: observation.provenance,
      confidence: observation.confidence,
    });
  }

  /**
   * Handle conflict between canonical and new observation
   */
  async _handleConflict(entityId, fieldPath, existingCanonical, newObservation, isIdentitySensitive) {
    console.log(`[Canonicalization] Conflict on ${fieldPath}: "${existingCanonical.value}" vs "${newObservation.value}"`);
    
    // For identity-sensitive fields, be more conservative
    if (isIdentitySensitive) {
      // Check if new evidence is significantly stronger
      const existingStrength = calculateEvidenceStrength({ 
        provenance: existingCanonical.provenance, 
        provider: existingCanonical.provider, 
        confidence: existingCanonical.confidence 
      });
      const newStrength = calculateEvidenceStrength(newObservation);
      
      if (newStrength > existingStrength + 0.2) {
        // New evidence is significantly stronger - replace
        return await this._resolveConflict(entityId, fieldPath, newObservation, existingCanonical, 'highest_confidence');
      }
      // Keep existing, record conflict
      return await this._recordConflict(entityId, fieldPath, existingCanonical, newObservation, 'preserve_existing');
    }
    
    // For descriptive fields, use standard precedence
    return await this._resolveConflict(entityId, fieldPath, newObservation, existingCanonical, 'provenance_priority');
  }

  /**
   * Resolve conflict by choosing one value
   */
  async _resolveConflict(entityId, fieldPath, chosen, rejected, strategy) {
    console.log(`[Canonicalization] Resolved conflict on ${fieldPath} using ${strategy}: "${rejected.value}" -> "${chosen.value}"`);
    await this.repo.createConflict({
      entityId,
      fieldPath,
      values: [
        { value: rejected.value, provenance: rejected.provenance, confidence: rejected.confidence },
        { value: chosen.value, provenance: chosen.provenance, confidence: chosen.confidence },
      ],
      status: 'resolved',
      resolutionStrategy: strategy,
      resolutionReason: 'Canonicalization selected the stronger observation.',
      resolvedAt: new Date().toISOString(),
    });
    return { fieldPath, strategy, chosen: chosen.value, rejected: rejected.value };
  }

  /**
   * Record conflict without resolving
   */
  async _recordConflict(entityId, fieldPath, existing, newObs, strategy) {
    console.log(`[Canonicalization] Recorded conflict on ${fieldPath} with strategy ${strategy}`);
    await this.repo.createConflict({
      entityId,
      fieldPath,
      values: [
        { value: existing.value, provenance: existing.provenance, confidence: existing.confidence },
        { value: newObs.value, provenance: newObs.provenance, confidence: newObs.confidence },
      ],
      status: 'conflicted',
      resolutionStrategy: strategy,
      resolutionReason: 'Identity-sensitive conflict preserved for review.',
    });
    return { fieldPath, status: 'conflicted', existing: existing.value, new: newObs.value };
  }
}

// Export helper functions for testing
export { normalizeFieldValue, areValuesEquivalent, calculateEvidenceStrength, shouldUpdateCanonical, FIELD_CLASSIFICATION, PROVENANCE_PRIORITY, PROVIDER_AUTHORITY };

export default CanonicalizationService;