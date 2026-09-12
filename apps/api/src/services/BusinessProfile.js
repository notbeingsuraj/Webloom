/**
 * BusinessProfile
 * 
 * Central data structure for business information with strict provenance tracking.
 * 
 * Provenance categories (from most to least reliable):
 * - VERIFIED: Information supported by an authoritative source (official website, government registry)
 * - DISCOVERED: Information found from public web sources (official website extraction, public pages)
 * - IDENTIFIED: Business name / coordinates / URL hints extracted from input identifiers (Google Maps URL)
 * - INFERRED: AI-derived assumptions (NEVER enters factual BusinessProfile)
 * 
 * CRITICAL: Only IDENTIFIED/DISCOVERED/VERIFIED factual information may enter the factual BusinessProfile.
 * INFERRED information must never be presented as verified business data.
 * 
 * EVIDENCE SYSTEM (Phase 2+):
 * Each field can now track multiple competing values with full provenance,
 * conflict detection, temporal metadata, and source independence.
 */

import { Evidence, Source, Claim, Conflict, SourceIndependenceAnalyzer } from './EvidenceModels.js';

class BusinessProfile {
  constructor() {
    this.data = {
      identity: {
        name: { value: null, provenance: null, confidence: 0 },
        category: { value: null, provenance: null, confidence: 0 },
        business_type: { value: null, provenance: null, confidence: 0 },
        description: { value: null, provenance: null, confidence: 0 },
        categories: { value: [], provenance: null, confidence: 0 },
      },
      contact: {
        phone: { value: null, provenance: null, confidence: 0 },
        email: { value: null, provenance: null, confidence: 0 },
        website: { value: null, provenance: null, confidence: 0 },
      },
      location: {
        full_address: { value: null, provenance: null, confidence: 0 },
        street: { value: null, provenance: null, confidence: 0 },
        city: { value: null, provenance: null, confidence: 0 },
        state: { value: null, provenance: null, confidence: 0 },
        country: { value: null, provenance: null, confidence: 0 },
        postal_code: { value: null, provenance: null, confidence: 0 },
        coordinates: { value: null, provenance: null, confidence: 0 },
      },
      ratings: {
        rating: { value: null, provenance: null, confidence: 0 },
        review_count: { value: null, provenance: null, confidence: 0 },
        reviews: { value: [], provenance: null, confidence: 0 },
        review_summary: { value: null, provenance: null, confidence: 0 },
        sentiment: { value: null, provenance: null, confidence: 0 },
        themes: { value: [], provenance: null, confidence: 0 },
      },
      hours: { value: {}, provenance: null, confidence: 0 },
      social_links: { value: [], provenance: null, confidence: 0 },
      metadata: {
        sources: [],
        extractionHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    // Evidence system (Phase 2+)
    this.evidenceStore = new Map(); // evidenceId -> Evidence
    this.sourceRegistry = new Map(); // sourceId -> Source
    this.claimStore = new Map(); // claimId -> Claim
    this.conflictStore = new Map(); // conflictId -> Conflict
    this.entityId = null; // Will be set during profile creation
  }

  /**
   * Set the entity ID for this profile
   */
  setEntityId(entityId) {
    this.entityId = entityId;
  }

  /**
   * Get the entity ID for this profile
   */
  getEntityId() {
    return this.entityId || `ent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  set(path, value, provenance, confidence, sourceInfo = {}) {
    const validProvenances = ['identified', 'discovered', 'verified', 'user_provided', 'inferred', 'ai_generated'];
    if (!validProvenances.includes(provenance)) {
      throw new Error(`Invalid provenance: ${provenance}. Must be one of: ${validProvenances.join(', ')}`);
    }
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    const parts = path.split('.');
    let target = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
      if (!target) throw new Error(`Invalid path: ${path}`);
    }
    
    const field = parts[parts.length - 1];
    const current = target[field];
    
    // ai_generated sits BELOW every deterministic/observed tier: it can fill an
    // empty slot (0.5 > 0) but can NEVER overwrite identified/discovered/
    // verified/user_provided identity (P1.2 AI quarantine).
    const provenancePriority = { verified: 4, discovered: 3, user_provided: 3, identified: 2, inferred: 1, ai_generated: 0.5 };
    const currentPriority = current?.provenance ? provenancePriority[current.provenance] : 0;
    const newPriority = provenancePriority[provenance] ?? 0;
    
    // Check for conflict before potentially overwriting
    const isNewValue = value !== current?.value;
    const hasExistingValue = current?.value != null;
    
    // Create source if sourceInfo provided
    let sourceId = null;
    if (sourceInfo.sourceUrl || sourceInfo.provider) {
      const source = new Source({
        url: sourceInfo.sourceUrl,
        provider: sourceInfo.provider,
        sourceType: this._inferSourceType(sourceInfo.provider),
        authority: this._inferAuthority(sourceInfo.provider),
        isPrimary: sourceInfo.isPrimary || false,
        retrievedAt: new Date().toISOString(),
        metadata: sourceInfo.metadata || {}
      });
      this.sourceRegistry.set(source.id, source);
      sourceId = source.id;
    }

    // Create evidence if we have a source
    let evidenceId = null;
    if (sourceId && value != null && value !== '') {
      const evidence = new Evidence({
        sourceId,
        fieldPath: path,
        value,
        excerpt: sourceInfo.excerpt || null,
        extractedAt: new Date().toISOString(),
        extractionMethod: sourceInfo.extractionMethod || 'apiResponse',
        metadata: sourceInfo.metadata || {}
      });
      this.evidenceStore.set(evidence.id, evidence);
      evidenceId = evidence.id;
    }

    // Check for conflict before updating
    if (isNewValue && hasExistingValue && current?.value !== value) {
      this._detectAndStoreConflict(path, {
        oldValue: current.value,
        newValue: value,
        oldProvenance: current.provenance,
        newProvenance: provenance,
        oldConfidence: current.confidence,
        newConfidence: confidence,
        oldSourceInfo: current.sourceInfo,
        newSourceInfo: sourceInfo,
        oldEvidenceId: current.evidenceId,
        newEvidenceId: evidenceId,
        sourceId
      });
    }
    
    const shouldUpdate = sourceInfo.canonical === true
      || newPriority > currentPriority
      || (newPriority === currentPriority && confidence > (current?.confidence || 0));

    if (shouldUpdate) {
      target[field] = {
        value,
        provenance,
        confidence,
        sourceInfo,
        updatedAt: new Date().toISOString(),
        evidenceId: evidenceId,
        sourceId: sourceId,
        retrievedAt: new Date().toISOString()
      };
      
      if (sourceInfo.sourceUrl && !this.data.metadata.sources.includes(sourceInfo.sourceUrl)) {
        this.data.metadata.sources.push(sourceInfo.sourceUrl);
      }
      
      this.data.metadata.extractionHistory.push({
        field: path,
        value,
        provenance,
        confidence,
        sourceInfo,
        timestamp: new Date().toISOString(),
      });
      
      this.data.metadata.updatedAt = new Date().toISOString();
    }

    // Create/update claim
    this._createOrUpdateClaim(path, value, provenance, confidence, sourceId, evidenceId);
  }

  /**
   * Detect and store a conflict when a new value differs from existing
   */
  _detectAndStoreConflict(path, conflictData) {
    const { oldValue, newValue, oldProvenance, newProvenance, oldConfidence, newConfidence, oldSourceInfo, newSourceInfo, oldEvidenceId, newEvidenceId, sourceId } = conflictData;
    
    // Create claims for both values if they don't exist
    const oldClaimId = this._findClaimByValue(path, oldValue);
    const newClaimId = this._findClaimByValue(path, newValue);
    
    // Create conflict object
    const conflict = {
      fieldPath: path,
      values: [
        {
          value: oldValue,
          provenance: oldProvenance,
          confidence: oldConfidence,
          sourceInfo: oldSourceInfo,
          evidenceId: oldEvidenceId,
          retrievedAt: new Date().toISOString()
        },
        {
          value: newValue,
          provenance: newProvenance,
          confidence: newConfidence,
          sourceInfo: newSourceInfo,
          evidenceId: newEvidenceId,
          retrievedAt: new Date().toISOString()
        }
      ],
      status: 'conflicted',
      detectedAt: new Date().toISOString()
    };
    
    const conflictId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.conflictStore.set(conflictId, conflict);
    
    // Log conflict for observability
    console.warn(`[BusinessProfile] Conflict detected on ${path}: "${oldValue}" vs "${newValue}"`);
  }

  /**
   * Create or update a claim for a field value
   */
  _createOrUpdateClaim(path, value, provenance, confidence, sourceId, evidenceId) {
    if (value == null || value === '') return;
    
    const normalizedValue = this._normalizeValueForClaim(path, value);
    let claim = this._findClaimByNormalizedValue(path, normalizedValue);
    
    if (!claim) {
      claim = {
        id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        entityId: this.getEntityId(),
        fieldPath: path,
        value,
        normalizedValue,
        claimType: this._inferClaimType(path, provenance),
        sources: [],
        evidence: [],
        confidence: 0.5,
        verificationStatus: 'unverified',
        temporalMetadata: {
          retrievedAt: new Date().toISOString(),
          publishedAt: null,
          observedAt: null,
          lastVerifiedAt: null
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.claimStore.set(claim.id, claim);
    }
    
    // Update claim with new source/evidence
    if (sourceId && !claim.sources.some(s => s.sourceId === sourceId)) {
      claim.sources.push({
        sourceId,
        provenance,
        confidence,
        isPrimary: false
      });
    }
    
    if (evidenceId && !claim.evidence.includes(evidenceId)) {
      claim.evidence.push(evidenceId);
    }
    
    // Update confidence based on provenance priority
    const provenancePriority = { verified: 4, discovered: 3, user_provided: 3, identified: 2, inferred: 1, ai_generated: 0.5 };
    const newPriority = provenancePriority[provenance] || 0;
    const currentPriority = provenancePriority[claim.provenance] || 0;
    if (newPriority > currentPriority || (newPriority === currentPriority && confidence > claim.confidence)) {
      claim.confidence = confidence;
      claim.provenance = provenance;
    }
    
    claim.updatedAt = new Date().toISOString();
  }

  /**
   * Find claim by exact value match
   */
  _findClaimByValue(path, value) {
    for (const claim of this.claimStore.values()) {
      if (claim.fieldPath === path && claim.value === value) {
        return claim.id;
      }
    }
    return null;
  }

  /**
   * Find claim by normalized value
   */
  _findClaimByNormalizedValue(path, normalizedValue) {
    for (const claim of this.claimStore.values()) {
      if (claim.fieldPath === path && claim.normalizedValue === normalizedValue) {
        return claim;
      }
    }
    return null;
  }

  /**
   * Infer claim type from provenance and field
   */
  _inferClaimType(path, provenance) {
    if (provenance === 'inferred' || provenance === 'ai_generated') return 'inference';
    if (path.startsWith('identity.description') || path.startsWith('identity.category')) {
      return 'observation';
    }
    return 'fact';
  }

  /**
   * Normalize value for claim comparison
   */
  _normalizeValueForClaim(path, value) {
    if (value == null) return null;
    if (typeof value === 'string') return value.trim().toLowerCase();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Infer source type from provider
   */
  _inferSourceType(provider) {
    const typeMap = {
      'geoapify': 'structured_provider',
      'web_extraction': 'official_website',
      'official_website': 'official_website',
      'google_maps': 'structured_provider',
      'user': 'user_provided',
      'ai': 'ai_inference'
    };
    return typeMap[provider] || 'other';
  }

  /**
   * Infer authority from provider
   */
  _inferAuthority(provider) {
    const authorityMap = {
      'official_website': 0.95,
      'geoapify': 0.85,
      'web_extraction': 0.8,
      'google_maps': 0.75,
      'user': 0.9,
      'ai': 0.3
    };
    return authorityMap[provider] || 0.5;
  }

  get(path) {
    const parts = path.split('.');
    let target = this.data;
    for (const part of parts) {
      target = target?.[part];
      if (!target) return null;
    }
    return target.value;
  }

  getField(path) {
    const parts = path.split('.');
    let target = this.data;
    for (const part of parts) {
      target = target?.[part];
      if (!target) return null;
    }
    return target;
  }

  merge(sourceData, provenance, defaultConfidence = 0.7) {
    if (!sourceData || typeof sourceData !== 'object') return;

    if (sourceData.business) {
      if (sourceData.business.name) this.set('identity.name', sourceData.business.name, provenance, sourceData.business.nameConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.business.category) this.set('identity.category', sourceData.business.category, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.business.business_type) this.set('identity.business_type', sourceData.business.business_type, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.business.description) this.set('identity.description', sourceData.business.description, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.business.categories) this.set('identity.categories', sourceData.business.categories, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }

    if (sourceData.contact) {
      if (sourceData.contact.phone) this.set('contact.phone', sourceData.contact.phone, provenance, sourceData.contact.phoneConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.contact.email) this.set('contact.email', sourceData.contact.email, provenance, sourceData.contact.emailConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.contact.website) this.set('contact.website', sourceData.contact.website, provenance, sourceData.contact.websiteConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }

    if (sourceData.location) {
      if (sourceData.location.full_address) this.set('location.full_address', sourceData.location.full_address, provenance, sourceData.location.addressConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.street) this.set('location.street', sourceData.location.street, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.city) this.set('location.city', sourceData.location.city, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.state) this.set('location.state', sourceData.location.state, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.country) this.set('location.country', sourceData.location.country, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.postal_code) this.set('location.postal_code', sourceData.location.postal_code, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.location.coordinates) this.set('location.coordinates', sourceData.location.coordinates, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }

    if (sourceData.ratings) {
      if (sourceData.ratings.rating) this.set('ratings.rating', sourceData.ratings.rating, provenance, sourceData.ratings.ratingConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
      if (sourceData.ratings.review_count) this.set('ratings.review_count', sourceData.ratings.review_count, provenance, sourceData.ratings.reviewCountConfidence || defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }

    if (sourceData.hours) {
      this.set('hours', sourceData.hours, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }

    if (sourceData.social_links) {
      this.set('social_links', sourceData.social_links, provenance, defaultConfidence, { sourceUrl: sourceData.metadata?.sourceUrl });
    }
  }

  toObject() {
    const result = {};
    
    const extractValues = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && 'value' in value) {
          result[path] = value.value;
        } else if (typeof value === 'object' && value !== null) {
          extractValues(value, path);
        }
      }
    };
    
    extractValues(this.data);
    return result;
  }

  toFullObject() {
    return { ...this.data };
  }

  getCompleteness() {
    const fields = [
      'identity.name', 'identity.category', 'identity.description',
      'contact.phone', 'contact.email', 'contact.website',
      'location.full_address', 'location.city', 'location.country',
    ];
    
    let filled = 0;
    for (const field of fields) {
      if (this.get(field)) filled++;
    }
    
    return filled / fields.length;
  }

  getProvenanceBreakdown() {
    const breakdown = { verified: 0, discovered: 0, identified: 0, user_provided: 0, inferred: 0, ai_generated: 0 };
    
    const countProvenance = (obj) => {
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object' && 'provenance' in value) {
          if (value.provenance) breakdown[value.provenance]++;
        } else if (typeof value === 'object' && value !== null) {
          countProvenance(value);
        }
      }
    };
    
    countProvenance(this.data);
    return breakdown;
  }

  // =========================================================================
  // EVIDENCE SYSTEM - PHASE 2+ METHODS
  // =========================================================================

  /**
   * Get all conflicts for a specific field path
   * @param {string} path - Field path (e.g., 'contact.phone')
   * @returns {Array} Array of conflict objects
   */
  getConflicts(path = null) {
    const conflicts = [];
    for (const conflict of this.conflictStore.values()) {
      if (!path || conflict.fieldPath === path) {
        conflicts.push(conflict);
      }
    }
    return conflicts;
  }

  /**
   * Get all conflicts across the profile
   * @returns {Array} Array of all conflict objects
   */
  getAllConflicts() {
    return Array.from(this.conflictStore.values());
  }

  /**
   * Resolve a conflict using a specific strategy
   * @param {string} conflictId - The conflict ID to resolve
   * @param {string} strategy - Resolution strategy: 'authority_wins', 'most_recent', 'highest_confidence', 'manual_review', 'preserve_all'
   * @param {string} reason - Reason for resolution
   * @param {string} resolvedBy - Who/what resolved it
   * @returns {boolean} True if resolved
   */
  resolveConflict(conflictId, strategy, reason = null, resolvedBy = 'system') {
    const conflict = this.conflictStore.get(conflictId);
    if (!conflict) return false;

    if (conflict.status === 'resolved') return true;

    const canonicalValue = this._resolveConflictByStrategy(conflict, strategy);
    
    if (canonicalValue !== null) {
      // Update the canonical value in the profile
      const field = conflict.fieldPath;
      const parts = field.split('.');
      let target = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
      }
      const fieldName = parts[parts.length - 1];
      
      // Find the winning value object
      const winningValue = conflict.values.find(v => v.value === canonicalValue);
      
      if (winningValue) {
        target[field] = {
          value: canonicalValue,
          provenance: winningValue.provenance,
          confidence: winningValue.confidence,
          sourceInfo: winningValue.sourceInfo,
          updatedAt: new Date().toISOString(),
          evidenceId: winningValue.evidenceId,
          sourceId: winningValue.sourceId,
          retrievedAt: new Date().toISOString(),
          conflictResolved: true,
          conflictResolutionStrategy: conflict.resolutionStrategy
        };
      }
    }

    conflict.status = 'resolved';
    conflict.resolutionStrategy = strategy;
    conflict.resolutionReason = reason;
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolvedBy = resolvedBy;

    return true;
  }

  /**
   * Resolve conflict using specified strategy
   */
  _resolveConflictByStrategy(conflict, strategy) {
    if (!conflict.values || conflict.values.length === 0) return null;

    switch (strategy) {
      case 'authority_wins':
        return conflict.values.reduce((best, curr) => 
          (curr.authority || 0) > (best.authority || 0) ? curr : best
        ).value;
      case 'most_recent':
        return conflict.values.reduce((best, curr) => 
          new Date(curr.retrievedAt || 0) > new Date(best.retrievedAt || 0) ? curr : best
        ).value;
      case 'highest_confidence':
        return conflict.values.reduce((best, curr) => 
          (curr.confidence || 0) > (best.confidence || 0) ? curr : best
        ).value;
      case 'preserve_all':
      case 'manual_review':
      default:
        // Return the first value (current canonical)
        return conflict.values[0]?.value || null;
    }
  }

  /**
   * Get all evidence for a specific field path
   * @param {string} path - Field path
   * @returns {Array} Array of evidence objects
   */
  getEvidenceForField(path) {
    const result = [];
    for (const ev of this.evidenceStore.values()) {
      if (ev.fieldPath === path) {
        result.push(ev.toObject());
      }
    }
    return result;
  }

  /**
   * Get all sources for a specific field path
   * @param {string} path - Field path
   * @returns {Array} Array of source objects
   */
  getSourcesForField(path) {
    const sources = [];
    // Find claim for this field
    for (const claim of this.claimStore.values()) {
      if (claim.fieldPath === path) {
        for (const sourceRef of claim.sources) {
          const source = this.sourceRegistry.get(sourceRef.sourceId);
          if (source) {
            sources.push({
              ...source.toObject(),
              provenance: sourceRef.provenance,
              confidence: sourceRef.confidence,
              isPrimary: sourceRef.isPrimary
            });
          }
        }
      }
    }
    return sources;
  }

  /**
   * Get all claims for a specific field path
   * @param {string} path - Field path
   * @returns {Array} Array of claim objects
   */
  getClaimsForField(path) {
    const claims = [];
    for (const claim of this.claimStore.values()) {
      if (claim.fieldPath === path) {
        claims.push(claim.toObject ? claim.toObject() : claim);
      }
    }
    return claims;
  }

  /**
   * Get all evidence across the profile
   * @returns {Array} Array of all evidence objects
   */
  getAllEvidence() {
    return Array.from(this.evidenceStore.values()).map(e => e.toObject());
  }

  /**
   * Get all sources across the profile
   * @returns {Array} Array of all source objects
   */
  getAllSources() {
    return Array.from(this.sourceRegistry.values()).map(s => s.toObject());
  }

  /**
   * Get all claims across the profile
   * @returns {Array} Array of all claim objects
   */
  getAllClaims() {
    return Array.from(this.claimStore.values()).map(c => c.toObject ? c.toObject() : c);
  }

  /**
   * Get source independence analysis for a field
   * @param {string} path - Field path
   * @returns {Object} Independence analysis
   */
  getSourceIndependence(path) {
    const sources = this.getSourcesForField(path);
    return SourceIndependenceAnalyzer.analyze(sources);
  }

  /**
   * Detect potential copy relationships between sources for a field
   * @param {string} path - Field path
   * @returns {Array} Array of copy pairs
   */
  detectCopyPairs(path) {
    const sources = this.getSourcesForField(path);
    return SourceIndependenceAnalyzer.detectCopyPairs(sources);
  }

  /**
   * Get temporal metadata for a field
   * @param {string} path - Field path
   * @returns {Object} Temporal metadata
   */
  getTemporalMetadata(path) {
    const claim = this._findClaimByNormalizedValue(path, this._normalizeValueForClaim(path, this.get(path)));
    if (claim) {
      return claim.temporalMetadata;
    }
    return null;
  }

  /**
   * Update temporal metadata for a field
   * @param {string} path - Field path
   * @param {Object} temporalData - Temporal metadata to update
   */
  updateTemporalMetadata(path, temporalData) {
    const value = this.get(path);
    if (value == null) return false;
    
    const normalizedValue = this._normalizeValueForClaim(path, value);
    const claim = this._findClaimByNormalizedValue(path, normalizedValue);
    
    if (claim) {
      claim.temporalMetadata = {
        ...claim.temporalMetadata,
        ...temporalData
      };
      claim.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Get claim type for a field
   * @param {string} path - Field path
   * @returns {string} Claim type: 'fact', 'observation', 'inference'
   */
  getClaimType(path) {
    const claim = this._findClaimByNormalizedValue(path, this._normalizeValueForClaim(path, this.get(path)));
    return claim?.claimType || 'fact';
  }

  /**
   * Get verification status for a field
   * @param {string} path - Field path
   * @returns {string} Verification status
   */
  getVerificationStatus(path) {
    const claim = this._findClaimByNormalizedValue(path, this._normalizeValueForClaim(path, this.get(path)));
    return claim?.verificationStatus || 'unverified';
  }

  /**
   * Set verification status for a field
   * @param {string} path - Field path
   * @param {string} status - Verification status
   */
  setVerificationStatus(path, status) {
    const value = this.get(path);
    if (value == null) return false;
    
    const normalizedValue = this._normalizeValueForClaim(path, value);
    const claim = this._findClaimByNormalizedValue(path, normalizedValue);
    
    if (claim) {
      claim.verificationStatus = status;
      claim.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Get confidence for a field (enhanced with evidence)
   * @param {string} path - Field path
   * @returns {number} Confidence score
   */
  getConfidenceWithEvidence(path) {
    const baseConfidence = this.getField(path)?.confidence || 0;
    const claim = this._findClaimByNormalizedValue(path, this._normalizeValueForClaim(path, this.get(path)));
    
    if (!claim) return baseConfidence;

    // Adjust confidence based on evidence
    const evidenceCount = claim.evidence?.length || 0;
    const sourceCount = claim.sources?.length || 0;
    const primarySourceCount = claim.sources?.filter(s => s.isPrimary).length || 0;
    
    let adjustedConfidence = claim.confidence || 0;
    
    // Boost for multiple independent sources
    if (sourceCount > 1) {
      adjustedConfidence = Math.min(1, adjustedConfidence + 0.1 * Math.min(sourceCount, 3));
    }
    
    // Boost for primary sources
    if (primarySourceCount > 0) {
      adjustedConfidence = Math.min(1, adjustedConfidence + 0.05 * primarySourceCount);
    }
    
    // Boost for multiple pieces of evidence
    if (evidenceCount > 1) {
      adjustedConfidence = Math.min(1, adjustedConfidence + 0.05 * Math.min(evidenceCount, 3));
    }
    
    // Penalize if there are unresolved conflicts
    const conflicts = this.getConflicts(this._getPathForClaim(this._findClaimByNormalizedValue(null, this._normalizeValueForClaim(null, this.get(path)))));
    if (conflicts.length > 0) {
      adjustedConfidence = Math.max(0, adjustedConfidence - 0.15);
    }
    
    return Math.max(0, Math.min(1, adjustedConfidence));
  }

  /**
   * Get enhanced field info with evidence, conflicts, and provenance
   * @param {string} path - Field path
   * @returns {Object} Enhanced field info
   */
  getFieldWithEvidence(path) {
    const baseField = this.getField(path);
    if (!baseField) return null;
    
    const value = this.get(path);
    const conflicts = this.getConflicts(path);
    const evidence = this.getEvidenceForField(path);
    const sources = this.getSourcesForField(path);
    const claims = this.getClaimsForField(path);
    const independence = this.getSourceIndependence(path);
    const temporal = this.getTemporalMetadata(path);
    const claimType = this.getClaimType(path);
    const verificationStatus = this.getVerificationStatus(path);
    const confidenceWithEvidence = this.getConfidenceWithEvidence(path);
    
    return {
      ...baseField,
      value: baseField.value,
      conflicts: conflicts.length > 0 ? conflicts : null,
      conflictCount: conflicts.length,
      evidenceCount: evidence.length,
      sourceCount: sources.length,
      claimCount: claims.length,
      independence: independence,
      temporal: temporal,
      claimType: claimType,
      verificationStatus: verificationStatus,
      enhancedConfidence: confidenceWithEvidence,
      hasConflict: conflicts.length > 0
    };
  }

  /**
   * Get enhanced profile object with all evidence/conflict information
   * @returns {Object} Full profile with evidence metadata
   */
  toEvidenceObject() {
    const base = this.toFullObject();
    const conflicts = this.getAllConflicts();
    const evidence = this.getAllEvidence();
    const sources = this.getAllSources();
    const claims = this.getAllClaims();
    
    return {
      ...base,
      entityId: this.getEntityId(),
      evidence: evidence,
      sources: sources,
      claims: claims,
      conflicts: conflicts,
      conflictCount: conflicts.length,
      evidenceCount: evidence.length,
      sourceCount: sources.length,
      claimCount: claims.length,
      _evidenceSystem: true
    };
  }

  /**
   * Get field path from claim object (helper)
   */
  _getPathForClaim(claim) {
    return claim?.fieldPath || null;
  }

  /**
   * Enhanced toObject that includes conflict flags
   */
  toObjectWithConflicts() {
    const result = {};
    const conflicts = this.getAllConflicts();
    const conflictPaths = new Set(conflicts.map(c => c.fieldPath));
    
    const extractValues = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && 'value' in value) {
          result[path] = {
            value: value.value,
            provenance: value.provenance,
            confidence: value.confidence,
            hasConflict: conflictPaths.has(path),
            conflictCount: conflicts.filter(c => c.fieldPath === path).length
          };
        } else if (typeof value === 'object' && value !== null) {
          extractValues(value, path);
        }
      }
    };
    
    extractValues(this.data);
    return result;
  }

  /**
   * Get field with enhanced provenance info (backwards compatible with getField)
   * @param {string} path - Field path
   * @returns {Object} Field with enhanced provenance
   */
  getFieldEnhanced(path) {
    const baseField = this.getField(path);
    if (!baseField) return null;
    
    return {
      ...baseField,
      evidenceId: baseField.evidenceId,
      sourceId: baseField.sourceId,
      retrievedAt: baseField.retrievedAt,
      conflictId: this.getConflicts(path)[0]?.id,
      hasConflict: this.getConflicts(path).length > 0
    };
  }

  /**
   * Load canonical fields from persistent storage into this profile
   * This hydrates the profile with persisted canonical field values
   * @param {IdentityRepository} repo - IdentityRepository instance
   * @param {string} entityId - Entity ID to load canonical fields for
   */
  loadCanonicalFields(repo, entityId) {
    if (!repo || !entityId) return;
    
    const canonicalFields = repo.getCanonicalFields(entityId);
    for (const field of canonicalFields) {
      // Set the field value in the profile with the canonical provenance
      const current = this.getField(field.fieldPath);
      // Only overwrite if we have a stronger canonical value
      if (current === null || current.value === null) {
        // No existing value, set the canonical value
        this.data[field.fieldPath.split('.')[0]][field.fieldPath.split('.')[1]] = {
          value: field.value,
          provenance: field.provenance,
          confidence: field.confidence,
          sourceInfo: { sourceId: field.sourceId },
          updatedAt: field.updatedAt,
          evidenceId: null,
          sourceId: field.sourceId,
          retrievedAt: field.updatedAt
        };
      }
    }
  }

  getFieldEnhanced(path) {
    const baseField = this.getField(path);
    if (!baseField) return null;
    
    return {
      ...baseField,
      evidenceId: baseField.evidenceId,
      sourceId: baseField.sourceId,
      retrievedAt: baseField.retrievedAt,
      conflictId: this.getConflicts(path)[0]?.id,
      hasConflict: this.getConflicts(path).length > 0
    };
  }
}

export default BusinessProfile;