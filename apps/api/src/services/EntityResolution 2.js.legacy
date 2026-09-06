/**
 * Entity Resolution Engine
 * 
 * Resolves business entity identity across multiple provider records.
 * Determines which real-world entity the available evidence refers to,
 * quantifies uncertainty, preserves competing candidates, and prevents
 * research about the wrong business.
 */

import { SourceIndependenceAnalyzer } from './EvidenceModels.js';

/**
 * Entity Resolution Status
 */
export const ENTITY_RESOLUTION_STATUS = Object.freeze({
  UNRESOLVED: 'unresolved',
  RESOLVED: 'resolved',
  AMBIGUOUS: 'ambiguous',
  CONFLICTED: 'conflicted',
  CLOSED: 'closed',
  RELOCATED: 'relocated',
  RENAMED: 'renamed',
  DUPLICATE: 'duplicate',
};

/**
 * Entity Match Type Classification
 */
export const ENTITY_MATCH_TYPE = Object.freeze({
  SAME_ENTITY: 'same_entity',
  SAME_BRAND_DIFFERENT_LOCATION: 'same_brand_different_location',
  PARENT_SUBSIDIARY: 'parent_subsidiary',
  FRANCHISE: 'franchise',
  DIFFERENT_ENTITY: 'different_entity',
  CLOSED_ENTITY: 'closed_entity',
  RELOCATED_ENTITY: 'relocated_entity',
  RENAMED_ENTITY: 'renamed_entity',
  UNCERTAIN: 'uncertain',
};

/**
 * Match Signal Weights (configurable)
 */
export const MATCH_SIGNAL_WEIGHTS = Object.freeze({
  // Identity signals
  name_exact: 0.35,
  name_fuzzy: 0.25,
  phone_exact: 0.30,
  phone_normalized: 0.20,
  website_exact: 0.25,
  domain_exact: 0.20,
  
  // Location signals
  coordinates_exact: 0.30,
  coordinates_near: 0.20,        // within 100m
  address_exact: 0.30,
  address_partial: 0.15,
  city_match: 0.10,
  state_match: 0.05,
  
  // Identity signals
  place_id_match: 0.40,
  cid_match: 0.35,
  place_id_near: 0.20,
  
  // Category signals
  category_exact: 0.10,
  category_similar: 0.05,
  
  // Negative signals
  name_contradiction: -0.30,
  address_contradiction: -0.25,
  phone_contradiction: -0.25,
  category_contradiction: -0.15,
});

/**
 * Distance thresholds
 */
export const DISTANCE_THRESHOLDS = Object.freeze({
  COORDINATE_EXACT_METERS: 10,      // < 10m = exact
  COORDINATE_NEAR_METERS: 100,      // < 100m = near
  COORDINATE_SAME_BUILDING_METERS: 50, // < 50m = likely same building
});

/**
 * Normalize phone number for comparison
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  // Remove country code if US/Canada (+1)
  if (digits.startsWith('1') && digits.length === 11) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Normalize website/domain for comparison
 */
export function normalizeWebsite(website) {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    let hostname = url.hostname.toLowerCase();
    // Remove www prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    // Remove trailing slash
    hostname = hostname.replace(/\/$/, '');
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Calculate coordinate distance in meters (Haversine formula)
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Fuzzy string similarity (Jaro-Winkler simplified)
 */
export function fuzzySimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  // Simple Levenshtein-based similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  // Quick prefix check
  const prefixLen = Math.min(3, shorter.length);
  if (longer.startsWith(shorter.slice(0, prefixLen))) {
    return 0.8 + 0.2 * (shorter.length / longer.length);
  }
  
  // Basic character overlap
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Calculate match score between two entity records
 * @param {Object} record1 - First entity record
 * @param {Object} record2 - Second entity record
 * @returns {Object} { score, signals, contradictions }
 */
export function calculateMatchScore(record1, record2) {
  let score = 0;
  const signals = {};
  const contradictions = [];
  
  // --- Phone matching ---
  const phone1 = normalizePhone(record1?.contact?.phone || record1?.phone);
  const phone2 = normalizePhone(record2?.contact?.phone || record2?.phone);
  if (phone1 && phone2) {
    if (phone1 === phone2) {
      score += MATCH_SIGNAL_WEIGHTS.phone_exact;
      signals.phone_exact = true;
    } else {
      contradictions.push({ field: 'phone', v1: phone1, v2: phone2 });
      score += MATCH_SIGNAL_WEIGHTS.phone_contradiction;
    }
  }
  
  // --- Website matching ---
  const website1 = normalizeWebsite(record1?.contact?.website || record1?.website);
  const website2 = normalizeWebsite(record2?.contact?.website || record2?.website);
  if (website1 && website2) {
    if (website1 === website2) {
      score += MATCH_SIGNAL_WEIGHTS.website_exact;
      signals.website_exact = true;
    } else {
      contradictions.push({ field: 'website', v1: website1, v2: website2 });
    }
  }
  
  // --- Domain matching ---
  const domain1 = website1;
  const domain2 = website2;
  if (domain1 && domain2) {
    if (domain1 === domain2) {
      score += MATCH_SIGNAL_WEIGHTS.domain_exact;
      signals.domain_exact = true;
    }
  }
  
  // --- Coordinate matching ---
  const coords1 = record1?.location?.coordinates || record1?.coordinates;
  const coords2 = record2?.location?.coordinates || record2?.coordinates;
  if (coords1?.lat && coords1?.lng && coords2?.lat && coords2?.lng) {
    const dist = calculateDistance(coords1.lat, coords1.lng, coords2.lat, coords2.lng);
    if (dist <= DISTANCE_THRESHOLDS.COORDINATE_EXACT_METERS) {
      score += MATCH_SIGNAL_WEIGHTS.coordinates_exact;
      signals.coordinates_exact = true;
    } else if (dist <= DISTANCE_THRESHOLDS.COORDINATE_NEAR_METERS) {
      score += MATCH_SIGNAL_WEIGHTS.coordinates_near;
      signals.coordinates_near = true;
    } else if (dist <= DISTANCE_THRESHOLDS.COORDINATE_SAME_BUILDING_METERS) {
      score += MATCH_SIGNAL_WEIGHTS.coordinates_near * 0.8;
      signals.coordinates_same_building = true;
    }
    signals.coordinate_distance_meters = Math.round(dist);
  }
  
  // --- Address matching ---
  const addr1 = record1?.location?.full_address || record1?.address;
  const addr2 = record2?.location?.full_address || record2?.address;
  if (addr1 && addr2) {
    const addrSim = fuzzySimilarity(addr1, addr2);
    if (addrSim >= 0.9) {
      score += MATCH_SIGNAL_WEIGHTS.address_exact;
      signals.address_exact = true;
    } else if (addrSim >= 0.7) {
      score += MATCH_SIGNAL_WEIGHTS.address_partial;
      signals.address_partial = true;
    } else if (addrSim < 0.3) {
      contradictions.push({ field: 'address', v1: addr1, v2: addr2 });
      score += MATCH_SIGNAL_WEIGHTS.address_contradiction;
    }
  }
  
  // --- City/State matching ---
  const city1 = record1?.location?.city;
  const city2 = record2?.location?.city;
  const state1 = record1?.location?.state;
  const state2 = record2?.location?.state;
  if (city1 && city2 && city1.toLowerCase() === city2.toLowerCase()) {
    score += MATCH_SIGNAL_WEIGHTS.city_match;
    signals.city_match = true;
  }
  if (state1 && state2 && state1.toLowerCase() === state2.toLowerCase()) {
    score += MATCH_SIGNAL_WEIGHTS.state_match;
    signals.state_match = true;
  }
  
  // --- Name matching ---
  const name1 = record1?.identity?.name || record1?.name;
  const name2 = record2?.identity?.name || record2?.name;
  if (name1 && name2) {
    const nameSim = fuzzySimilarity(name1, name2);
    if (name1.toLowerCase() === name2.toLowerCase()) {
      score += MATCH_SIGNAL_WEIGHTS.name_exact;
      signals.name_exact = true;
    } else if (nameSim >= 0.8) {
      score += MATCH_SIGNAL_WEIGHTS.name_fuzzy;
      signals.name_fuzzy = true;
    } else if (nameSim < 0.3) {
      contradictions.push({ field: 'name', v1: name1, v2: name2 });
      score += MATCH_SIGNAL_WEIGHTS.name_contradiction;
    }
  }
  
  // --- Place ID matching ---
  const placeId1 = record1?.source?.placeId || record1?.provider?.placeId;
  const placeId2 = record2?.source?.placeId || record2?.provider?.placeId;
  if (placeId1 && placeId2) {
    if (placeId1 === placeId2) {
      score += MATCH_SIGNAL_WEIGHTS.place_id_match;
      signals.place_id_match = true;
    }
  }
  
  // --- CID matching ---
  const cid1 = record1?.source?.placeId?.startsWith('cid:') ? record1.source.placeId : null;
  const cid2 = record2?.source?.placeId?.startsWith('cid:') ? record2.source.placeId : null;
  if (cid1 && cid2 && cid1 === cid2) {
    score += MATCH_SIGNAL_WEIGHTS.cid_match;
    signals.cid_match = true;
  }
  
  // --- Category matching ---
  const cat1 = record1?.identity?.category || record1?.category;
  const cat2 = record2?.identity?.category || record2?.category;
  if (cat1 && cat2) {
    if (cat1.toLowerCase() === cat2.toLowerCase()) {
      score += MATCH_SIGNAL_WEIGHTS.category_exact;
      signals.category_exact = true;
    } else if (fuzzySimilarity(cat1, cat2) >= 0.7) {
      score += MATCH_SIGNAL_WEIGHTS.category_similar;
      signals.category_similar = true;
    } else {
      contradictions.push({ field: 'category', v1: cat1, v2: cat2 });
      score += MATCH_SIGNAL_WEIGHTS.category_contradiction;
    }
  }
  
  // Clamp score
  const finalScore = Math.max(-1, Math.min(1, score));
  
  return {
    score: finalScore,
    signals,
    contradictions,
    matchType: classifyMatchType(finalScore, contradictions)
  };
}

/**
 * Classify match type based on score and contradictions
 */
function classifyMatchType(score, contradictions) {
  if (contradictions.length > 0) {
    // Has contradictions - check if they're critical
    const criticalFields = ['name', 'address', 'phone'];
    const hasCriticalContradiction = contradictions.some(c => criticalFields.includes(c.field));
    if (hasCriticalContradiction) return ENTITY_MATCH_TYPE.DIFFERENT_ENTITY;
  }
  
  if (score >= 0.85) return ENTITY_MATCH_TYPE.SAME_ENTITY;
  if (score >= 0.70) return ENTITY_MATCH_TYPE.SAME_BRAND_DIFFERENT_LOCATION;
  if (score >= 0.50) return ENTITY_MATCH_TYPE.UNCERTAIN;
  if (score >= 0.30) return ENTITY_MATCH_TYPE.DIFFERENT_ENTITY;
  return ENTITY_MATCH_TYPE.DIFFERENT_ENTITY;
}

/**
 * Entity Candidate Class
 * Represents a potential real-world entity with all evidence
 */
export class EntityCandidate {
  constructor({
    id,
    canonicalName = null,
    address = null,
    coordinates = null,
    phone = null,
    website = null,
    domain = null,
    category = null,
    providerIds = [],
    sourceReferences = [],
    matchSignals = {},
    contradictions = [],
    confidence = 0,
    resolutionStatus = 'unresolved',
    providerRecords = [],
    evidence = [],
    metadata = {}
  } = {}) {
    this.id = id || `ent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.canonicalName = canonicalName;
    this.address = address;
    this.coordinates = coordinates;
    this.phone = phone;
    this.website = website;
    this.domain = domain;
    this.category = category;
    this.providerIds = providerIds || []; // [{ provider, id, confidence }]
    this.sourceReferences = sourceReferences || [];
    this.matchSignals = matchSignals || {};
    this.contradictions = contradictions || [];
    this.confidence = Math.max(0, Math.min(1, confidence));
    this.resolutionStatus = resolutionStatus; // 'unresolved', 'resolved', 'ambiguous', 'conflicted'
    this.providerRecords = providerRecords || []; // Full provider records
    this.evidence = evidence || []; // Supporting evidence
    this.metadata = metadata || {};
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Add a provider record to this entity candidate
   */
  addProviderRecord(record, provenance, confidence) {
    this.providerRecords.push({
      record,
      provenance,
      confidence,
      addedAt: new Date().toISOString()
    });
    
    // Update canonical fields if this record has higher confidence
    this._updateCanonicalFields(record, confidence);
    
    // Track provider ID
    if (record.provider?.placeId) {
      this.providerIds.push({
        provider: record.provider?.name || 'unknown',
        id: record.provider.placeId,
        confidence
      });
    }
    
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Update canonical fields from a provider record
   */
  _updateCanonicalFields(record, confidence) {
    if (record.identity?.name && (!this.canonicalName || confidence > 0.8)) {
      this.canonicalName = record.identity.name;
    }
    if (record.location?.full_address && (!this.address || confidence > 0.8)) {
      this.address = record.location.full_address;
    }
    if (record.location?.coordinates && (!this.coordinates || confidence > 0.8)) {
      this.coordinates = record.location.coordinates;
    }
    if (record.contact?.phone && (!this.phone || confidence > 0.8)) {
      this.phone = record.contact.phone;
    }
    if (record.contact?.website && (!this.website || confidence > 0.8)) {
      this.website = record.contact.website;
    }
    if (record.identity?.category && (!this.category || confidence > 0.8)) {
      this.category = record.identity.category;
    }
    if (this.website) {
      this.domain = normalizeWebsite(this.website);
    }
  }

  /**
   * Get the canonical (best) value for a field
   */
  getCanonical(field) {
    switch (field) {
      case 'name': return this.canonicalName;
      case 'address': return this.address;
      case 'coordinates': return this.coordinates;
      case 'phone': return this.phone;
      case 'website': return this.website;
      case 'domain': return this.domain;
      case 'category': return this.category;
      default: return null;
    }
  }

  toObject() {
    return {
      id: this.id,
      canonicalName: this.canonicalName,
      address: this.address,
      coordinates: this.coordinates,
      phone: this.phone,
      website: this.website,
      domain: this.domain,
      category: this.category,
      providerIds: this.providerIds,
      sourceReferences: this.sourceReferences,
      matchSignals: this.matchSignals,
      contradictions: this.contradictions,
      confidence: this.confidence,
      resolutionStatus: this.resolutionStatus,
      providerRecordsCount: this.providerRecords.length,
      evidenceCount: this.evidence.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Entity Resolution Engine
 * Main class for resolving entities across provider records
 */
export class EntityResolver {
  constructor(options = {}) {
    this.matchThreshold = options.matchThreshold || 0.70;
    this.ambiguityThreshold = options.ambiguityThreshold || 0.50;
    this.conflictThreshold = options.conflictThreshold || 0.30;
    this.minConfidence = options.minConfidence || 0.30;
  }

  /**
   * Resolve entities from multiple provider records
   * @param {Array} providerRecords - Array of { record, provenance, providerLabel, confidence }
   * @returns {Array} Array of EntityCandidate objects
   */
  async resolve(providerRecords) {
    // Step 1: Filter and normalize records
    const normalizedRecords = providerRecords
      .filter(r => r.record && r.confidence >= this.minConfidence)
      .map(r => ({
        record: r.record,
        provenance: r.provenance,
        providerLabel: r.providerLabel,
        confidence: r.confidence,
        sourceUrl: r.sourceUrl
      }));

    if (normalizedRecords.length === 0) {
      return [];
    }

    // Step 2: Cluster records by similarity
    const clusters = this._clusterRecords(normalizedRecords);

    // Step 3: Create entity candidates from clusters
    const candidates = clusters.map(cluster => this._createCandidate(cluster));

    // Step 4: Detect cross-cluster relationships (franchise, parent-subsidiary)
    this._detectRelationships(candidates);

    // Step 4: Resolve ambiguities and assign statuses
    const resolved = this._resolveStatuses(candidates);

    // Step 5: Sort by confidence
    return resolved.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Cluster records using hierarchical clustering
   */
  _clusterRecords(records) {
    const clusters = [];
    const used = new Set();

    for (let i = 0; i < records.length; i++) {
      if (used.has(i)) continue;
      
      const cluster = [records[i]];
      used.add(i);

      // Find all records that match this one
      for (let j = i + 1; j < records.length; j++) {
        if (used.has(j)) continue;
        
        const match = calculateMatchScore(records[i].record, records[j].record);
        if (match.score >= this.matchThreshold) {
          cluster.push(records[j]);
          used.add(j);
        }
      }

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Create entity candidate from cluster
   */
  _createCandidate(cluster) {
    // Calculate aggregate confidence
    const avgConfidence = cluster.reduce((sum, r) => sum + r.confidence, 0) / cluster.length;
    
    // Aggregate match signals
    const allSignals = {};
    const allContradictions = [];
    let totalScore = 0;
    
    for (const r of cluster) {
      // We'd need pairwise comparisons within cluster for full signals
      // For now, use the first record as base
    }

    // Use first record as base for canonical info
    const baseRecord = cluster[0].record;
    
    const candidate = new EntityCandidate({
      canonicalName: baseRecord.identity?.name || baseRecord.name,
      address: baseRecord.location?.full_address || baseRecord.address,
      coordinates: baseRecord.location?.coordinates || baseRecord.coordinates,
      phone: baseRecord.contact?.phone || baseRecord.phone,
      website: baseRecord.contact?.website || baseRecord.website,
      category: baseRecord.identity?.category || baseRecord.category,
      providerRecords: cluster.map(r => ({
        record: r.record,
        provenance: r.provenance,
        providerLabel: r.providerLabel,
        confidence: r.confidence,
        sourceUrl: r.sourceUrl
      })),
      providerIds: cluster.flatMap(r => {
        const pid = r.record.provider?.placeId;
        return pid ? [{ provider: r.providerLabel, id: pid, confidence: r.confidence }] : [];
      }),
      confidence: avgConfidence,
      resolutionStatus: 'unresolved'
    });

    // Calculate entity-level confidence
    candidate.confidence = this._calculateEntityConfidence(candidate, cluster);
    
    return candidate;
  }

  /**
   * Calculate entity-level confidence
   */
  _calculateEntityConfidence(candidate, cluster) {
    let confidence = 0;
    
    // Base from average record confidence
    const avgRecordConf = cluster.reduce((sum, r) => sum + r.confidence, 0) / cluster.length;
    confidence += avgRecordConf * 0.4;
    
    // Boost for multiple providers
    const providers = new Set(cluster.map(r => r.providerLabel));
    if (providers.size > 1) {
      confidence += 0.15 * Math.min(providers.size - 1, 3);
    }
    
    // Boost for multiple sources
    if (cluster.length > 1) {
      confidence += 0.1 * Math.min(cluster.length - 1, 4);
    }
    
    // Penalty for contradictions
    // (would need to check candidate.contradictions)
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Detect relationships between entity candidates
   */
  _detectRelationships(candidates) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const match = calculateMatchScore(
          candidates[i].providerRecords[0]?.record || {},
          candidates[j].providerRecords[0]?.record || {}
        );
        
        if (match.score >= 0.50 && match.score < 0.70) {
          // Likely same brand, different location
          candidates[i].matchSignals.relatedEntity = candidates[j].id;
          candidates[j].matchSignals.relatedEntity = candidates[i].id;
          candidates[i].matchSignals.relationship = ENTITY_MATCH_TYPE.SAME_BRAND_DIFFERENT_LOCATION;
          candidates[j].matchSignals.relationship = ENTITY_MATCH_TYPE.SAME_BRAND_DIFFERENT_LOCATION;
        }
      }
    }
  }

  /**
   * Resolve candidate statuses
   */
  _resolveStatuses(candidates) {
    return candidates.map(candidate => {
      // Check for internal contradictions
      const hasContradictions = candidate.contradictions && candidate.contradictions.length > 0;
      const criticalContradictions = candidate.contradictions?.some(c => 
        ['name', 'address', 'phone', 'website'].includes(c.field)
      ) || false;

      if (criticalContradictions) {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.CONFLICTED;
      } else if (hasContradictions) {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.AMBIGUOUS;
      } else if (candidate.confidence >= 0.85) {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.RESOLVED;
      } else if (candidate.confidence >= 0.70) {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.RESOLVED;
      } else if (candidate.confidence >= 0.50) {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.AMBIGUOUS;
      } else {
        candidate.resolutionStatus = ENTITY_RESOLUTION_STATUS.UNRESOLVED;
      }

      return candidate;
    });
  }

  /**
   * Get entity resolution summary
   */
  getResolutionSummary(candidates) {
    const stats = {
      total: candidates.length,
      resolved: 0,
      ambiguous: 0,
      conflicted: 0,
      unresolved: 0,
      avgConfidence: 0
    };

    let totalConf = 0;
    for (const c of candidates) {
      stats[c.resolutionStatus] = (stats[c.resolutionStatus] || 0) + 1;
      totalConf += c.confidence;
    }
    stats.avgConfidence = candidates.length > 0 ? totalConf / candidates.length : 0;

    return stats;
  }
}

// Export constants
export const ENTITY_RESOLUTION_STATUS = {
  UNRESOLVED: 'unresolved',
  RESOLVED: 'resolved',
  AMBIGUOUS: 'ambiguous',
  CONFLICTED: 'conflicted',
  CLOSED: 'closed',
  RELOCATED: 'relocated',
  RENAMED: 'renamed',
  DUPLICATE: 'duplicate',
};

export const ENTITY_MATCH_TYPE = {
  SAME_ENTITY: 'same_entity',
  SAME_BRAND_DIFFERENT_LOCATION: 'same_brand_different_location',
  PARENT_SUBSIDIARY: 'parent_subsidiary',
  FRANCHISE: 'franchise',
  DIFFERENT_ENTITY: 'different_entity',
  CLOSED_ENTITY: 'closed_entity',
  RELOCATED_ENTITY: 'relocated_entity',
  RENAMED_ENTITY: 'renamed_entity',
  UNCERTAIN: 'uncertain',
};

export default {
  EntityCandidate,
  EntityResolver,
  calculateMatchScore,
  normalizePhone,
  normalizeWebsite,
  calculateDistance,
  fuzzySimilarity,
  ENTITY_RESOLUTION_STATUS,
  ENTITY_MATCH_TYPE,
  MATCH_SIGNAL_WEIGHTS,
  DISTANCE_THRESHOLDS
};