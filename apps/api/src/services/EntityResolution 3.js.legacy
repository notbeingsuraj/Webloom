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
});

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
});

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
  coordinates_near: 0.20,
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
  COORDINATE_EXACT_METERS: 10,
  COORDINATE_NEAR_METERS: 100,
  COORDINATE_SAME_BUILDING_METERS: 50,
});

/**
 * Normalize phone number for comparison
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
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
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
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
  const R = 6371000;
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
 * Fuzzy string similarity (simplified Jaro-Winkler)
 */
export function fuzzySimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  const prefixLen = Math.min(3, shorter.length);
  if (longer.startsWith(shorter.slice(0, prefixLen))) {
    return 0.8 + 0.2 * (shorter.length / longer.length);
  }
  
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Match Signal Weights (configurable)
 */
const MATCH_SIGNAL_WEIGHTS = {
  name_exact: 0.35,
  name_fuzzy: 0.25,
  phone_exact: 0.30,
  phone_normalized: 0.20,
  website_exact: 0.25,
  domain_exact: 0.20,
  coordinates_exact: 0.30,
  coordinates_near: 0.20,
  address_exact: 0.30,
  address_partial: 0.15,
  city_match: 0.10,
  state_match: 0.05,
  place_id_match: 0.40,
  cid_match: 0.35,
  place_id_near: 0.20,
  category_exact: 0.10,
  category_similar: 0.05,
  name_contradiction: -0.30,
  address_contradiction: -0.25,
  phone_contradiction: -0.25,
  category_contradiction: -0.15,
};

const DISTANCE_THRESHOLDS = {
  COORDINATE_EXACT_METERS: 10,
  COORDINATE_NEAR_METERS: 100,
  COORDINATE_SAME_BUILDING_METERS: 50,
};

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('1') && digits.length === 11) {
    return digits.slice(1);
  }
  return digits;
}

function normalizeWebsite(website) {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    hostname = hostname.replace(/\/$/, '');
    return hostname;
  } catch {
    return null;
  }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
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

function fuzzySimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  const prefixLen = Math.min(3, shorter.length);
  if (longer.startsWith(shorter.slice(0, prefixLen))) {
    return 0.8 + 0.2 * (shorter.length / longer.length);
  }
  
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

function classifyMatchType(score, contradictions) {
  if (contradictions.length > 0) {
    const criticalFields = ['name', 'address', 'phone'];
    const hasCriticalContradiction = contradictions.some(c => 
      ['name', 'address', 'phone'].includes(c.field)
    );
    if (hasCriticalContradiction) return 'different_entity';
  }
  
  if (score >= 0.85) return 'same_entity';
  if (score >= 0.70) return 'same_brand_different_location';
  if (score >= 0.50) return 'uncertain';
  if (score >= 0.30) return 'different_entity';
  return 'different_entity';
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
  
  // Phone matching
  const phone1 = normalizePhone(record1?.contact?.phone || record1?.phone);
  const phone2 = normalizePhone(record2?.contact?.phone || record2?.phone);
  if (phone1 && phone2) {
    if (phone1 === phone2) {
      score += 0.30;
      signals.phone_exact = true;
    } else {
      contradictions.push({ field: 'phone', v1: phone1, v2: phone2 });
      score -= 0.25;
    }
  }
  
  // Website matching
  function normalizeWebsite(website) {
    if (!website) return null;
    try {
      const url = new URL(website.startsWith('http') ? website : `https://${website}`);
      let hostname = url.hostname.toLowerCase();
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      hostname = hostname.replace(/\/$/, '');
      return hostname;
    } catch {
      return null;
    }
  }
  
  const website1 = normalizeWebsite(record1?.contact?.website || record1?.website);
  const website2 = normalizeWebsite(record2?.contact?.website || record2?.website);
  if (website1 && website2) {
    if (website1 === website2) {
      score += 0.25;
      signals.website_exact = true;
    } else {
      contradictions.push({ field: 'website', v1: website1, v2: website2 });
    }
  }
  
  // Domain matching
  const domain1 = website1;
  const domain2 = website2;
  if (domain1 && domain2) {
    if (domain1 === domain2) {
      score += 0.20;
      signals.domain_exact = true;
    }
  }
  
  // Coordinate matching
  const coords1 = record1?.location?.coordinates || record1?.coordinates;
  const coords2 = record2?.location?.coordinates || record2?.coordinates;
  if (coords1?.lat && coords1?.lng && coords2?.lat && coords2?.lng) {
    const R = 6371000;
    const φ1 = coords1.lat * Math.PI / 180;
    const φ2 = coords2.lat * Math.PI / 180;
    const Δφ = (coords2.lat - coords1.lat) * Math.PI / 180;
    const Δλ = (coords2.lng - coords1.lng) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = 6371000 * c;
    
    if (dist <= 10) {
      score += 0.30;
      signals.coordinates_exact = true;
    } else if (dist <= 100) {
      score += 0.20;
      signals.coordinates_near = true;
    } else if (dist <= 50) {
      score += 0.16;
      signals.coordinates_same_building = true;
    }
    signals.coordinate_distance_meters = Math.round(6371000 * c);
  }
  
  // Address matching
  const addr1 = record1?.location?.full_address || record1?.address;
  const addr2 = record2?.location?.full_address || record2?.address;
  if (addr1 && addr2) {
    const set1 = new Set(addr1.toLowerCase().split(' '));
    const set2 = new Set(addr2.toLowerCase().split(' '));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    const addrSim = intersection.size / union.size;
    
    if (addrSim >= 0.9) {
      score += 0.30;
      signals.address_exact = true;
    } else if (addrSim >= 0.7) {
      score += 0.15;
      signals.address_partial = true;
    } else if (addrSim < 0.3) {
      contradictions.push({ field: 'address', v1: addr1, v2: addr2 });
      score -= 0.25;
    }
  }
  
  // City/State matching
  const city1 = record1?.location?.city;
  const city2 = record2?.location?.city;
  const state1 = record1?.location?.state;
  const state2 = record2?.location?.state;
  if (city1 && city2 && city1.toLowerCase() === city2.toLowerCase()) {
    score += 0.10;
    signals.city_match = true;
  }
  if (state1 && state2 && state1.toLowerCase() === state2.toLowerCase()) {
    score += 0.05;
    signals.state_match = true;
  }
  
  // Name matching
  const name1 = record1?.identity?.name || record1?.name;
  const name2 = record2?.identity?.name || record2?.name;
  if (name1 && name2) {
    const nameSim = fuzzySimilarity(name1, name2);
    if (name1.toLowerCase() === name2.toLowerCase()) {
      score += 0.35;
      signals.name_exact = true;
    } else if (nameSim >= 0.8) {
      score += 0.25;
      signals.name_fuzzy = true;
    } else if (nameSim < 0.3) {
      contradictions.push({ field: 'name', v1: name1, v2: name2 });
      score -= 0.30;
    }
  }
  
  // Place ID matching
  const placeId1 = record1?.source?.placeId || record1?.provider?.placeId;
  const placeId2 = record2?.source?.placeId || record2?.provider?.placeId;
  if (placeId1 && placeId2) {
    if (placeId1 === placeId2) {
      score += 0.40;
      signals.place_id_match = true;
    }
  }
  
  // CID matching
  const cid1 = record1?.source?.placeId?.startsWith('cid:') ? record1.source.placeId : null;
  const cid2 = record2?.source?.placeId?.startsWith('cid:') ? record2.source.placeId : null;
  if (cid1 && cid2 && cid1 === cid2) {
    score += 0.35;
    signals.cid_match = true;
  }
  
  // Category matching
  const cat1 = record1?.identity?.category || record1?.category;
  const cat2 = record2?.identity?.category || record2?.category;
  if (cat1 && cat2) {
    if (cat1.toLowerCase() === cat2.toLowerCase()) {
      score += 0.10;
      signals.category_exact = true;
    } else if (fuzzySimilarity(cat1, cat2) >= 0.7) {
      score += 0.05;
      signals.category_similar = true;
    } else {
      contradictions.push({ field: 'category', v1: cat1, v2: cat2 });
      score -= 0.15;
    }
  }
  
  const finalScore = Math.max(-1, Math.min(1, score));
  
  function classifyMatchType(score, contradictions) {
    if (contradictions.length > 0) {
      const criticalFields = ['name', 'address', 'phone'];
      const hasCriticalContradiction = contradictions.some(c => 
        ['name', 'address', 'phone'].includes(c.field)
      );
      if (hasCriticalContradiction) return 'different_entity';
    }
    
    if (score >= 0.85) return 'same_entity';
    if (score >= 0.70) return 'same_brand_different_location';
    if (score >= 0.50) return 'uncertain';
    if (score >= 0.30) return 'different_entity';
    return 'different_entity';
  }
  
  return {
    score: Math.max(-1, Math.min(1, score)),
    signals,
    contradictions,
    matchType: classifyMatchType(score, contradictions)
  };
}

/**
 * Fuzzy string similarity (simplified)
 */
export function fuzzySimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  const prefixLen = Math.min(3, shorter.length);
  if (longer.startsWith(shorter.slice(0, prefixLen))) {
    return 0.8 + 0.2 * (shorter.length / longer.length);
  }
  
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('1') && digits.length === 11) {
    return digits.slice(1);
  }
  return digits;
}

function fuzzySimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  
  const prefixLen = Math.min(3, shorter.length);
  if (longer.startsWith(shorter.slice(0, prefixLen))) {
    return 0.8 + 0.2 * (shorter.length / longer.length);
  }
  
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

export { fuzzySimilarity };

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

export default {};