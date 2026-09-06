/**
 * Entity Resolution Engine
 *
 * Resolves business entity identity across multiple provider records.
 * Determines which real-world entity the available evidence refers to,
 * quantifies uncertainty, preserves competing candidates, and prevents
 * research about the wrong business.
 */

import { SourceIndependenceAnalyzer } from './EvidenceModels.js';

// Exported constants
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

// Internal constants
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

// Classification tuning.
//
// NAME_STRONG_SIMILARITY: the fuzzy-name threshold above which two names are
//   treated as the *same brand identity* (used for chain / relocation detection).
// SAME_ENTITY_MIN_SCORE: minimum coverage-adjusted score to declare same_entity.
// LOCATION_SAME_MIN_SIM / LOCATION_STREET_NUMBER_MIN_SIM: address-token
//   thresholds used by compareLocations() to decide "same place" vs "moved".
// COVERAGE_FLOOR: floor of the evidence-coverage multiplier applied to the
//   positive score, so that records missing core identity fields cannot reach
//   the same confidence as fully-corroborated records (Step 4C — evidence
//   coverage, not a flat per-null penalty).
const CLASSIFICATION = {
  NAME_STRONG_SIMILARITY: 0.9,
  SAME_ENTITY_MIN_SCORE: 0.85,
  UNCERTAIN_MIN_SCORE: 0.50,
  LOCATION_SAME_MIN_SIM: 0.9,
  LOCATION_STREET_NUMBER_MIN_SIM: 0.5,
  COVERAGE_FLOOR: 0.8,
};

// Core identity fields whose *comparability* (present on both records) drives
// the evidence-coverage confidence multiplier.
const CORE_IDENTITY_FIELDS = ['name', 'phone', 'website', 'address'];

// Common US street-type abbreviations, expanded before address comparison so
// that "600 Guerrero St" and "600 Guerrero Street" are recognised as the same
// place. This is normalization for the *location comparison only* — it does not
// change the address scoring signal.
const STREET_TYPE_EXPANSIONS = {
  st: 'street', str: 'street',
  ave: 'avenue', av: 'avenue',
  blvd: 'boulevard',
  rd: 'road',
  dr: 'drive',
  ln: 'lane',
  ct: 'court',
  pl: 'place',
  sq: 'square',
  ste: 'suite',
  fl: 'floor',
  hwy: 'highway',
  pkwy: 'parkway',
  ter: 'terrace',
  cir: 'circle',
};

// Helper functions (defined once, exported)
export function normalizePhone(phone) {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizeWebsite(website) {
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
 * Tokenize an address, lower-casing, stripping punctuation and expanding common
 * street-type abbreviations. Used only for location comparison (not scoring).
 */
function normalizeAddressTokens(addr) {
  return addr
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => STREET_TYPE_EXPANSIONS[t] || t);
}

/**
 * Decide whether two records describe the SAME physical location, a DIFFERENT
 * one, or whether location is UNKNOWN (not comparable).
 *
 * Coordinates are authoritative when both records have them. Otherwise we fall
 * back to the address: identical (post-normalization) token similarity means
 * same place; a matching leading street number with moderate similarity also
 * means same place (tolerates abbreviated city/suffix); anything else with both
 * addresses present is treated as a different location.
 *
 * This is what separates a genuine relocation ("600 Guerrero" -> "123 New St")
 * from a same-entity record with an abbreviated address ("600 Guerrero Street"
 * vs "600 Guerrero St, SF") — the latter shares the street number and most
 * tokens, the former does not.
 *
 * @returns {'same'|'different'|'unknown'}
 */
function compareLocations(addr1, addr2, coords1, coords2) {
  // FIXED: Explicit coordinate validation instead of truthiness check
  // "if (coords1?.lat && coords1?.lng)" fails for lat=0 or lng=0
  const lat1 = coords1?.lat;
  const lng1 = coords1?.lng;
  const lat2 = coords2?.lat;
  const lng2 = coords2?.lng;
  
  const validCoord1 = (
    typeof lat1 === 'number' && !Number.isNaN(lat1) &&
    typeof lng1 === 'number' && !Number.isNaN(lng1) &&
    Math.abs(lat1) <= 90 && Math.abs(lng1) <= 180
  );
  const validCoord2 = (
    typeof lat2 === 'number' && !Number.isNaN(lat2) &&
    typeof lng2 === 'number' && !Number.isNaN(lng2) &&
    Math.abs(lat2) <= 90 && Math.abs(lng2) <= 180
  );

  if (validCoord1 && validCoord2) {
    const dist = calculateDistance(lat1, lng1, lat2, lng2);
    return dist <= DISTANCE_THRESHOLDS.COORDINATE_NEAR_METERS ? 'same' : 'different';
  }

  if (addr1 && addr2) {
    const t1 = normalizeAddressTokens(addr1);
    const t2 = normalizeAddressTokens(addr2);
    const s1 = new Set(t1);
    const s2 = new Set(t2);
    const inter = [...s1].filter((x) => s2.has(x)).length;
    const uni = new Set([...t1, ...t2]).size;
    const sim = uni > 0 ? inter / uni : 0;

    if (sim >= CLASSIFICATION.LOCATION_SAME_MIN_SIM) return 'same';

    const num1 = t1.find((t) => /^\d+$/.test(t));
    const num2 = t2.find((t) => /^\d+$/.test(t));
    if (num1 && num2 && num1 === num2 && sim >= CLASSIFICATION.LOCATION_STREET_NUMBER_MIN_SIM) {
      return 'same';
    }
    return 'different';
  }

  return 'unknown';
}

/**
 * Calculate match score between two entity records
 * @param {Object} record1 - First entity record
 * @param {Object} record2 - Second entity record
 * @returns {Object} { score, signals, contradictions, matchType }
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

  // Website/Domain matching
  // CRITICAL FIX: normalizeWebsite() returns hostname, so website_exact and
  // domain_exact are THE SAME evidence. Do NOT double-count.
  // We use website_exact as the authoritative signal.
  const website1 = normalizeWebsite(record1?.contact?.website || record1?.website);
  const website2 = normalizeWebsite(record2?.contact?.website || record2?.website);
  if (website1 && website2) {
    if (website1 === website2) {
      // Single score for domain match (not double-counted)
      score += MATCH_SIGNAL_WEIGHTS.website_exact;
      signals.website_exact = true;
      signals.domain_exact = true; // These are equivalent, but only score once
    } else {
      contradictions.push({ field: 'website', v1: website1, v2: website2 });
    }
  }

  // Coordinate matching - with explicit validation (not truthiness)
  const coords1 = record1?.location?.coordinates || record1?.coordinates;
  const coords2 = record2?.location?.coordinates || record2?.coordinates;
  
  // Explicit validation: must be numbers in valid ranges, not just truthy
  const lat1 = coords1?.lat;
  const lng1 = coords1?.lng;
  const lat2 = coords2?.lat;
  const lng2 = coords2?.lng;
  
  const validCoord1 = (
    typeof lat1 === 'number' && !Number.isNaN(lat1) &&
    typeof lng1 === 'number' && !Number.isNaN(lng1) &&
    Math.abs(lat1) <= 90 && Math.abs(lng1) <= 180
  );
  const validCoord2 = (
    typeof lat2 === 'number' && !Number.isNaN(lat2) &&
    typeof lng2 === 'number' && !Number.isNaN(lng2) &&
    Math.abs(lat2) <= 90 && Math.abs(lng2) <= 180
  );
  
  if (validCoord1 && validCoord2) {
    const dist = calculateDistance(lat1, lng1, lat2, lng2);

    // FIXED: Removed unreachable branch (dist <= 50 inside dist <= 100)
    // Order matters: check smallest thresholds first
    if (dist <= DISTANCE_THRESHOLDS.COORDINATE_EXACT_METERS) {
      score += MATCH_SIGNAL_WEIGHTS.coordinates_exact;
      signals.coordinates_exact = true;
    } else if (dist <= DISTANCE_THRESHOLDS.COORDINATE_SAME_BUILDING_METERS) {
      score += 0.16; // same building, not near enough for exact
      signals.coordinates_same_building = true;
    } else if (dist <= DISTANCE_THRESHOLDS.COORDINATE_NEAR_METERS) {
      score += MATCH_SIGNAL_WEIGHTS.coordinates_near;
      signals.coordinates_near = true;
    }
    signals.coordinate_distance_meters = Math.round(dist);
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

  // Name matching - FIXED: properly detect name contradictions
  const name1 = record1?.identity?.name || record1?.name;
  const name2 = record2?.identity?.name || record2?.name;
  let nameSim = 0;
  if (name1 && name2) {
    nameSim = fuzzySimilarity(name1, name2);
    if (name1.toLowerCase() === name2.toLowerCase()) {
      score += MATCH_SIGNAL_WEIGHTS.name_exact;
      signals.name_exact = true;
    } else if (nameSim >= 0.8) {
      score += MATCH_SIGNAL_WEIGHTS.name_fuzzy;
      signals.name_fuzzy = true;
    } else if (nameSim < 0.3) {
      // Names are quite different - this is a contradiction
      contradictions.push({ field: 'name', v1: name1, v2: name2 });
      score += MATCH_SIGNAL_WEIGHTS.name_contradiction;
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

  // ===== Evidence coverage (Step 4C) =====
  // Confidence must reflect how much of the core identity we could actually
  // compare. A record missing a core field is NOT contradicted (missing != wrong),
  // so we never add a contradiction for it; instead we scale the *positive* score
  // by an evidence-coverage multiplier. This prevents a couple of matching fields
  // with nothing to contradict them from reaching the same confidence as a fully
  // corroborated match — without any arbitrary per-null penalty.
  const corePresent = {
    name: !!(name1 && name2),
    phone: !!(phone1 && phone2),
    website: !!(website1 && website2),
    address: !!(addr1 && addr2),
  };
  const comparableCore = CORE_IDENTITY_FIELDS.filter((f) => corePresent[f]).length;
  const coverage = comparableCore / CORE_IDENTITY_FIELDS.length;
  const coverageFactor =
    CLASSIFICATION.COVERAGE_FLOOR + (1 - CLASSIFICATION.COVERAGE_FLOOR) * coverage;

  let adjustedScore = Math.max(-1, Math.min(1, score));
  if (adjustedScore > 0 && coverage < 1) {
    adjustedScore = adjustedScore * coverageFactor;
  }
  const finalScore = Math.max(-1, Math.min(1, adjustedScore));
  signals.evidence_coverage = parseFloat(coverage.toFixed(2));

  // ===== Classification context =====
  const nameExact = !!signals.name_exact;
  const nameStrong = nameExact || nameSim >= CLASSIFICATION.NAME_STRONG_SIMILARITY;
  // Whether the name could be compared at all. When a name is absent/unreadable
  // on either side we must not *require* a strong name to declare same_entity —
  // otherwise records that legitimately match on every other hard identifier
  // (phone/domain/coordinates) at the same location would be split apart. We
  // still require nameStrong when the name IS comparable on both sides.
  const nameComparable = corePresent.name;
  const phoneExact = !!signals.phone_exact;
  const phoneConflict = !!(phone1 && phone2 && phone1 !== phone2);
  // normalizeWebsite() returns the host, so website_exact and domain_exact are
  // the same corroboration here; treat either as a shared web domain.
  const domainSame = !!(signals.domain_exact || signals.website_exact);
  const location = compareLocations(addr1, addr2, coords1, coords2);
  const hasHardIdentifier = !!(
    signals.phone_exact ||
    signals.domain_exact ||
    signals.website_exact ||
    signals.place_id_match ||
    signals.cid_match ||
    signals.coordinates_exact ||
    signals.coordinates_near
  );

  const matchType = classifyMatchType(finalScore, contradictions, {
    nameStrong,
    nameComparable,
    phoneExact,
    phoneConflict,
    domainSame,
    location,
    hasHardIdentifier,
  });

  return {
    score: finalScore,
    finalScore,
    signals,
    contradictions,
    matchType,
  };
}

/**
 * Classify the relationship between two records from the accumulated evidence.
 *
 * Order matters: the two "same brand" / "relocation" patterns are checked
 * before the generic critical-contradiction rule, because both patterns
 * legitimately contain a signal (a differing local phone, a changed address)
 * that the generic rule would otherwise treat as proof of a different entity.
 *
 * @param {number} score - coverage-adjusted, clamped score
 * @param {Array}  contradictions
 * @param {Object} ctx - { nameStrong, phoneExact, phoneConflict, domainSame,
 *                          location, hasHardIdentifier }
 * @returns {string} one of ENTITY_MATCH_TYPE values
 */
function classifyMatchType(score, contradictions, ctx) {
  const {
    nameStrong,
    nameComparable,
    phoneExact,
    phoneConflict,
    domainSame,
    location,
    hasHardIdentifier,
  } = ctx;

  const hasCriticalContradiction = contradictions.some((c) =>
    ['name', 'address', 'phone'].includes(c.field)
  );

  // (1) SAME BRAND, DIFFERENT LOCATION.
  //   Same brand identity (strong name + shared web domain) at a DIFFERENT
  //   location, with a DIFFERENT local phone. The differing local phone is the
  //   discriminator from a relocation (which keeps the same phone). Requires an
  //   affirmatively different location, so it can never fire on a same-address
  //   record.
  if (nameStrong && domainSame && location === 'different' && phoneConflict) {
    return 'same_brand_different_location';
  }

  // (2) RELOCATED ENTITY.
  //   Stable identity preserved — strong name + SAME phone + shared web domain —
  //   but a DIFFERENT location. Relocation is inferred only from strong stable
  //   identifiers plus a location change, never from name + address alone.
  if (nameStrong && phoneExact && domainSame && location === 'different') {
    return 'relocated_entity';
  }

  // (3) CRITICAL CONTRADICTION with no brand/relocation explanation.
  if (hasCriticalContradiction) {
    return 'different_entity';
  }

  // (4) SAME ENTITY.
  //   Requires corroboration on BOTH a matching physical location AND a hard
  //   identifier (phone / domain / coordinates / place id), and an adequate
  //   coverage-adjusted score. When the name is comparable on both sides it must
  //   also be strong; when the name is absent/unreadable we do not manufacture a
  //   name requirement and instead rely on the location + hard identifier. A
  //   record that cannot confirm the location (missing on one side) or lacks a
  //   hard identifier cannot reach same_entity — it falls through to uncertain.
  if (
    score >= CLASSIFICATION.SAME_ENTITY_MIN_SCORE &&
    (nameStrong || !nameComparable) &&
    location === 'same' &&
    hasHardIdentifier
  ) {
    return 'same_entity';
  }

  // (5) Positive-but-incomplete evidence is uncertain; weak evidence (below the
  //   uncertain floor) is a different entity. This band boundary is unchanged
  //   from the original classifier, so contradictory/weak cases are not
  //   reclassified.
  if (score >= CLASSIFICATION.UNCERTAIN_MIN_SCORE) return 'uncertain';
  return 'different_entity';
}

export default {};
