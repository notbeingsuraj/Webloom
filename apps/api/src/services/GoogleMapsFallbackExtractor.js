/**
 * GoogleMapsFallbackExtractor — P1.8 Source-Grounded Fallback Extraction
 *
 * Deterministic, field-level fallback recovery for business data when the
 * primary structured provider (Geoapify) omits fields that the supplied
 * Google Maps source actually contains.
 *
 * PRECEDENCE (one deterministic policy for every field):
 *
 *   Identity-critical fields (name, address, coordinates):
 *     1. exact Google Maps place details / exact source identity
 *     2. exact provider record with matching stable provider ID
 *     3. strong provider result with matching coordinates + address
 *     4. retrieved official business website
 *     5. AI extraction from verified source evidence   ← NEVER outranks 1-4
 *     6. null
 *
 *   Non-identity fields (phone, email, website, category-enrichment):
 *     1. exact Google Maps / provider data
 *     2. official business website
 *     3. other attributable provider source
 *     4. AI extraction from retrieved evidence
 *     5. null
 *
 * AI SAFETY (P1.2/P1.7 quarantine must survive):
 *   - AI may ONLY extract values explicitly present in the supplied evidence.
 *   - AI can NEVER invent city/state/phone/email from general knowledge.
 *   - AI can NEVER replace an authoritative field (name/address/coordinates/
 *     provider IDs) — only fill missing ones.
 *   - AI output passes deterministic validation BEFORE merging.
 *   - AI provenance stays `ai_generated` — never upgraded to verified.
 *
 * CONTRACT:
 *   extract({ sourceUrl, sourceType, sourceText, parsedSource,
 *             providerRecords, existingCanonicalProfile })
 *     → { fields, evidence, unresolvedFields, confidence, aiExtracted }
 *
 * Every recovered field retains:
 *   { value, source, sourceType, extractionMethod, confidence, verified,
 *     provenance }
 */

import { normalizePhone, normalizeWebsite, normalizeCoordinates } from './FieldNormalizer.js';
import GoogleMapsUrlParserProvider from './GoogleMapsUrlParserProvider.js';

// Minimum confidence an AI-extracted value must carry before it may be merged.
// Values below this are rejected outright (contract §6).
export const AI_ACCEPTANCE_THRESHOLD = 0.6;

const VALID_PROVENANCES = new Set(['observed', 'derived', 'ai_generated']);

/**
 * Validate a coordinates object strictly: numeric, lat ∈ [-90,90], lng ∈ [-180,180].
 * @param {*} value
 * @returns {{lat:number, lng:number}|null}
 */
export function validateCoordinates(value) {
  const coords = normalizeCoordinates(value);
  if (!coords) return null;
  if (
    !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) ||
    coords.lat < -90 || coords.lat > 90 ||
    coords.lng < -180 || coords.lng > 180
  ) {
    return null;
  }
  return coords;
}

/**
 * Reject obvious non-phone signals: postal codes, review counts, plus codes,
 * bare coordinates, or random short numeric strings. Returns true when the
 * string is NOT a plausible phone.
 * @param {string} raw
 * @returns {boolean}
 */
export function isNonPhoneSignal(raw) {
  if (!raw || typeof raw !== 'string') return true;
  const t = raw.trim();
  if (!t) return true;
  // Bare coordinate pair (e.g. "37.7614,-122.4239")
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(t)) return true;
  // "Plus code" (e.g. "849VVC4X+8G" or "849V VC4X+8G")
  if (/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}$/i.test(t)) return true;
  // US ZIP (5 digits or ZIP+4)
  if (/^\d{5}(-\d{4})?$/.test(t)) return true;
  // Postal code with letters that isn't a phone (e.g. "M5V 2T6" — but keep
  // short alphanumeric only when < 6 chars; real phone numbers have ≥ 7 digits)
  const digits = t.replace(/\D/g, '');
  // Review counts / random numeric strings — a real phone carries ≥ 7 digits.
  if (digits.length < 7) return true;
  // All-same-digit strings (e.g. "1111111111") are never real phone numbers.
  if (/^(\d)\1+$/.test(digits)) return true;
  return false;
}

/**
 * Deterministic validation of a raw phone candidate.
 * Returns { value: normalized E.164|null, raw, status, reason }.
 */
export function validatePhone(raw, countryHint = null) {
  if (!raw || typeof raw !== 'string') {
    return { value: null, raw: raw ?? null, status: 'missing', reason: 'no_value' };
  }
  if (isNonPhoneSignal(raw)) {
    return { value: null, raw, status: 'rejected', reason: 'non_phone_signal' };
  }
  const normalized = normalizePhone(raw, countryHint);
  if (!normalized) {
    // Preserve the unresolved-but-present signal (P1.2) when it has ≥7 digits.
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 7) {
      return { value: null, raw, status: 'unresolved', reason: 'cannot_normalize' };
    }
    return { value: null, raw, status: 'rejected', reason: 'too_short' };
  }
  return { value: normalized, raw, status: 'valid', reason: null };
}

/**
 * Deterministic validation of an email candidate. Rejects placeholders and
 * generated-looking addresses; only accepts basic syntax present in evidence.
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidEmail(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const t = raw.trim();
  if (!t) return false;
  // Reject placeholders / obviously generated addresses.
  if (/^(test|example|user|info|contact|hello|email|mail|name|your|someone)@/i.test(t)) {
    return false;
  }
  if (/@(example|test|localhost|invalid)\./i.test(t)) return false;
  if (t.includes('..') || t.includes('@.') || t.endsWith('.') || t.startsWith('.')) return false;
  // Basic syntax.
  const match = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.exec(t);
  if (!match) return false;
  return true;
}

/**
 * Validate a website candidate.
 * Returns { value: normalized URL|null, raw, status, isDirectory }.
 * A directory/listing URL is never labeled the official website.
 */
export function validateWebsite(raw, knownOfficialDomains = []) {
  if (!raw || typeof raw !== 'string') {
    return { value: null, raw: raw ?? null, status: 'missing', isDirectory: false };
  }
  const t = raw.trim();
  if (!t) return { value: null, raw, status: 'missing', isDirectory: false };
  let normalized = null;
  try {
    normalized = normalizeWebsite(t);
  } catch {
    normalized = null;
  }
  if (!normalized) {
    return { value: null, raw, status: 'rejected', isDirectory: false, reason: 'invalid_url' };
  }

  let hostname = null;
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    return { value: null, raw, status: 'rejected', isDirectory: false, reason: 'invalid_url' };
  }

  // Directory / listing hosts that must NEVER be labeled the official website.
  const DIRECTORY_SUFFIXES = [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
    'yelp.com', 'yelp.ca', 'tripadvisor.com', 'tripadvisor.in',
    'google.com', 'google.co.in', 'googlemaps.com', 'maps.google.com',
    'justdial.com', 'sulekha.com', 'india-mart.com', 'indiamart.com',
    'yellowpages.com', 'yellowpages.in', 'manta.com', 'fourquare.com',
    'foursquare.com', 'angieslist.com', 'angislist.com',
  ];
  const isDirectory = DIRECTORY_SUFFIXES.some(
    (s) => hostname === s || hostname.endsWith('.' + s) || hostname.includes(s)
  );

  // When the candidate matches a known official domain, it is NOT a directory.
  const knownDomainMatch =
    Array.isArray(knownOfficialDomains) &&
    knownOfficialDomains.some((d) => d && hostname === d.toLowerCase());

  return {
    value: normalized,
    raw,
    status: isDirectory && !knownDomainMatch ? 'rejected_directory' : 'valid',
    isDirectory: isDirectory && !knownDomainMatch,
  };
}

/**
 * Extract exact Google Maps source identity from a /place/ URL using the
 * existing parser. PURE — no network calls.
 * @param {string} url
 * @returns {Object|null} { placeId, cid, placeName, coordinates, urlType }
 */
export function extractGoogleMapsSourceIdentity(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = GoogleMapsUrlParserProvider.parse(url);
    if (!parsed?.identified) return null;
    const id = parsed.identified;
    return {
      placeId: id.placeId ?? null,
      cid: id.placeId?.startsWith('cid:') ? id.placeId : null,
      placeName: id.placeName ?? null,
      coordinates: id.coordinates && !id.coordinates.viewport ? validateCoordinates(id.coordinates) : null,
      urlType: id.urlType ?? 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Classify a provider record's provenance label for a fallback field.
 * Exact Google Maps / provider records are `observed`; AI is `ai_generated`.
 * @param {string} extractionMethod
 * @returns {string}
 */
function provenanceForMethod(extractionMethod) {
  if (extractionMethod === 'ai') return 'ai_generated';
  return 'observed';
}

/**
 * Deterministic field-level conflict check against the existing canonical
 * profile / authoritative records.
 *
 * Rejects a candidate when any hard identity signal conflicts:
 *   - city conflicts
 *   - state conflicts
 *   - postal code conflicts
 *   - coordinates conflict
 *   - provider ID conflicts
 *   - phone strongly conflicts
 *   - source identity conflicts
 *
 * @param {Object} candidate - { city, state, postalCode, coordinates, providerRecordId, phone }
 * @param {Object} authoritative - existing canonical profile / authoritative record
 * @returns {{ conflicting: boolean, fields: string[], reason: string|null }}
 */
export function detectConflicts(candidate, authoritative) {
  if (!candidate || !authoritative) {
    return { conflicting: false, fields: [], reason: null };
  }
  const fields = [];
  const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

  // City conflict
  const candCity = norm(candidate.city);
  const authCity = norm(authoritative.city);
  if (candCity && authCity && candCity !== authCity) {
    fields.push('city');
  }

  // State conflict
  const candState = norm(candidate.state);
  const authState = norm(authoritative.state);
  if (candState && authState && candState !== authState) {
    fields.push('state');
  }

  // Postal code conflict
  const candZip = norm(candidate.postalCode);
  const authZip = norm(authoritative.postalCode);
  if (candZip && authZip && candZip !== authZip) {
    fields.push('postalCode');
  }

  // Coordinates conflict (>0.35° ≈ ~39 km rejects a different city).
  const candCoords = candidate.coordinates ? validateCoordinates(candidate.coordinates) : null;
  const authCoords = authoritative.coordinates ? validateCoordinates(authoritative.coordinates) : null;
  if (candCoords && authCoords) {
    const dist = Math.hypot(candCoords.lat - authCoords.lat, candCoords.lng - authCoords.lng);
    if (dist > 0.35) {
      fields.push('coordinates');
    }
  }

  // Provider ID conflict
  const candPid = candidate.providerRecordId ? String(candidate.providerRecordId).trim() : '';
  const authPid = authoritative.providerRecordId ? String(authoritative.providerRecordId).trim() : '';
  if (candPid && authPid && candPid !== authPid) {
    fields.push('providerId');
  }

  // Strong phone conflict (compare digit keys).
  const candPhoneKey = candidate.phone ? String(candidate.phone).replace(/\D/g, '') : '';
  const authPhoneKey = authoritative.phone ? String(authoritative.phone).replace(/\D/g, '') : '';
  if (candPhoneKey && authPhoneKey && candPhoneKey.length >= 7 && authPhoneKey.length >= 7 && candPhoneKey !== authPhoneKey) {
    fields.push('phone');
  }

  if (fields.length > 0) {
    return {
      conflicting: true,
      fields: [...new Set(fields)],
      reason: `Conflict on: ${[...new Set(fields)].join(', ')}`,
    };
  }
  return { conflicting: false, fields: [], reason: null };
}

/**
 * Extract deterministic field-level evidence from a Google Maps URL +
 * provider records (no network calls, no AI).
 *
 * @param {Object} ctx - evidence context
 * @param {string} [ctx.sourceUrl]
 * @param {Object} [ctx.parsedSource] - GoogleMapsUrlParserProvider output
 * @param {Object} [ctx.providerRecord] - best Geoapify / provider flat record
 * @param {Object} [ctx.existingCanonicalProfile] - current canonical shape
 * @returns {Object} { fields, evidence, unresolvedFields, confidence, aiExtracted }
 */
export function extractDeterministicFallback({
  sourceUrl = null,
  parsedSource = null,
  providerRecord = null,
  existingCanonicalProfile = null,
} = {}) {
  const fields = {};
  const evidence = {};
  const unresolvedFields = [];
  const confidence = {};

  const existing = existingCanonicalProfile || null;
  const authoritative = {
    name: existing?.identity?.name ?? existing?.business?.name ?? null,
    address: existing?.location?.full_address ?? existing?.identity?.address ?? existing?.location?.address ?? null,
    city: existing?.location?.city ?? existing?.location?.addressComponents?.city ?? null,
    state: existing?.location?.state ?? existing?.location?.addressComponents?.state ?? null,
    postalCode: existing?.location?.postal_code ?? existing?.location?.postalCode ?? existing?.location?.addressComponents?.postalCode ?? null,
    coordinates: existing?.location?.coordinates ?? existing?.identity?.coordinates ?? null,
    providerRecordId: existing?.providers?.[0]?.providerRecordId ?? null,
    phone: existing?.contact?.phone ?? existing?.identity?.phone ?? null,
    email: existing?.contact?.email ?? existing?.business?.email ?? null,
    website: existing?.contact?.website ?? existing?.identity?.website ?? null,
    category: existing?.identity?.category ?? existing?.business?.category ?? null,
  };

  // --- Exact Google Maps source identity (URL parser) ---
  const sourceIdentity =
    parsedSource && parsedSource.identified
      ? {
          placeId: parsedSource.identified.placeId ?? null,
          placeName: parsedSource.identified.placeName ?? null,
          coordinates:
            parsedSource.identified.coordinates && !parsedSource.identified.coordinates.viewport
              ? validateCoordinates(parsedSource.identified.coordinates)
              : null,
          urlType: parsedSource.identified.urlType ?? 'unknown',
        }
      : extractGoogleMapsSourceIdentity(sourceUrl);

  const sourceEvidence = {
    source: 'google_maps',
    sourceUrl,
    sourceType: 'google_maps_url',
    extractionMethod: 'parser',
    provenance: 'observed',
    confidence: 0.95,
    verified: false,
  };

  // Name: exact source/provider identity only.
  if (sourceIdentity?.placeName && authoritative.name == null) {
    fields.name = sourceIdentity.placeName;
    evidence.name = { value: sourceIdentity.placeName, ...sourceEvidence, extractionMethod: 'parser' };
    confidence.name = 0.9;
  }

  // Coordinates: exact source/provider only.
  if (sourceIdentity?.coordinates) {
    const conflict = detectConflicts({ coordinates: sourceIdentity.coordinates }, authoritative);
    if (!conflict.conflicting) {
      fields.coordinates = sourceIdentity.coordinates;
      evidence.coordinates = {
        value: sourceIdentity.coordinates,
        ...sourceEvidence,
        extractionMethod: 'parser',
      };
      confidence.coordinates = 0.95;
    }
  }

  // --- Provider record (Geoapify) ---
  if (providerRecord) {
    const rec = providerRecord;

    // Address (full + components)
    const providerAddress = rec.location?.full_address || rec.location?.address || null;
    if (providerAddress && authoritative.address == null) {
      const conflict = detectConflicts(
        {
          city: rec.location?.city,
          state: rec.location?.state,
          postalCode: rec.location?.postal_code,
          coordinates: rec.location?.coordinates,
          providerRecordId: rec.provider?.placeId,
        },
        authoritative,
      );
      if (!conflict.conflicting) {
        fields.address = providerAddress;
        evidence.address = {
          value: providerAddress,
          source: 'geoapify',
          sourceUrl,
          sourceType: 'provider_record',
          extractionMethod: 'provider',
          provenance: 'observed',
          confidence: rec.confidence?.address ?? 0.85,
          verified: false,
        };
        confidence.address = rec.confidence?.address ?? 0.85;
        if (rec.location?.street) {
          fields.addressComponents = fields.addressComponents || {};
          fields.addressComponents.street = rec.location.street;
        }
        if (rec.location?.city) {
          fields.addressComponents = fields.addressComponents || {};
          fields.addressComponents.city = rec.location.city;
        }
        if (rec.location?.state) {
          fields.addressComponents = fields.addressComponents || {};
          fields.addressComponents.state = rec.location.state;
        }
        if (rec.location?.postal_code) {
          fields.addressComponents = fields.addressComponents || {};
          fields.addressComponents.postalCode = rec.location.postal_code;
        }
        if (rec.location?.country) {
          fields.addressComponents = fields.addressComponents || {};
          fields.addressComponents.country = rec.location.country;
        }
      } else {
        unresolvedFields.push('address');
      }
    }

    // Coordinates from provider record (validated).
    const recCoords = rec.location?.coordinates ||
      (rec.location?.latitude != null && rec.location?.longitude != null
        ? { lat: rec.location.latitude, lng: rec.location.longitude }
        : null);
    if (recCoords) {
      const validated = validateCoordinates(recCoords);
      if (validated) {
        const conflict = detectConflicts({ coordinates: validated }, authoritative);
        if (!conflict.conflicting && fields.coordinates == null) {
          fields.coordinates = validated;
          evidence.coordinates = {
            value: validated,
            source: 'geoapify',
            sourceUrl,
            sourceType: 'provider_record',
            extractionMethod: 'provider',
            provenance: 'observed',
            confidence: rec.confidence?.coordinates ?? 0.9,
            verified: false,
          };
          confidence.coordinates = rec.confidence?.coordinates ?? 0.9;
        }
      }
    }

    // Phone (exact provider record).
    const recPhone = rec.contact?.phone || null;
    if (recPhone && authoritative.phone == null) {
      const phoneCheck = validatePhone(recPhone, rec.location?.country);
      if (phoneCheck.status === 'valid') {
        const conflict = detectConflicts({ phone: phoneCheck.value }, authoritative);
        if (!conflict.conflicting) {
          fields.phone = phoneCheck.value;
          evidence.phone = {
            value: phoneCheck.value,
            raw: recPhone,
            source: 'geoapify',
            sourceUrl,
            sourceType: 'provider_record',
            extractionMethod: 'provider',
            provenance: 'observed',
            confidence: rec.confidence?.phone ?? 0.9,
            verified: false,
          };
          confidence.phone = rec.confidence?.phone ?? 0.9;
        }
      }
    }

    // Email (exact provider record).
    const recEmail = rec.contact?.email || null;
    if (recEmail && authoritative.email == null && isValidEmail(recEmail)) {
      fields.email = recEmail.trim();
      evidence.email = {
        value: recEmail.trim(),
        source: 'geoapify',
        sourceUrl,
        sourceType: 'provider_record',
        extractionMethod: 'provider',
        provenance: 'observed',
        confidence: 0.8,
        verified: false,
      };
      confidence.email = 0.8;
    }

    // Website (exact provider record, official-website-aware).
    const recWebsite = rec.contact?.website || null;
    if (recWebsite && authoritative.website == null) {
      const siteCheck = validateWebsite(recWebsite);
      if (siteCheck.status === 'valid') {
        fields.website = siteCheck.value;
        evidence.website = {
          value: siteCheck.value,
          source: 'geoapify',
          sourceUrl,
          sourceType: 'provider_record',
          extractionMethod: 'provider',
          provenance: 'observed',
          confidence: rec.confidence?.website ?? 0.85,
          verified: false,
        };
        confidence.website = rec.confidence?.website ?? 0.85;
      }
    }

    // Category: provider category first.
    const recCategory = rec.business?.category || null;
    if (recCategory && authoritative.category == null) {
      fields.category = recCategory;
      evidence.category = {
        value: recCategory,
        source: 'geoapify',
        sourceUrl,
        sourceType: 'provider_record',
        extractionMethod: 'provider',
        provenance: 'observed',
        confidence: rec.confidence?.category ?? 0.8,
        verified: false,
      };
      confidence.category = rec.confidence?.category ?? 0.8;
    }
  }

  // Unresolved = fields missing (in authoritative + fallback) AND no evidence supplied.
  const trackUnresolved = (fieldName, has) => {
    if (!has) unresolvedFields.push(fieldName);
  };
  trackUnresolved('name', fields.name != null || authoritative.name != null);
  trackUnresolved('address', fields.address != null || authoritative.address != null);
  trackUnresolved('phone', fields.phone != null || authoritative.phone != null);
  trackUnresolved('email', fields.email != null || authoritative.email != null);
  trackUnresolved('website', fields.website != null || authoritative.website != null);
  trackUnresolved('coordinates', fields.coordinates != null || authoritative.coordinates != null);

  return {
    fields,
    evidence,
    unresolvedFields: [...new Set(unresolvedFields)],
    confidence,
    aiExtracted: false,
  };
}

/**
 * Run the source-grounded AI extraction contract.
 *
 * AI may only extract values explicitly present in `evidenceText`. It returns
 * a strict schema; every value is validated deterministically before merge.
 *
 * @param {Object} ctx - { evidenceText, sourceUrl, countryHint }
 * @param {Object} [ai] - injectable AI service (defaults to dynamic AIService)
 * @returns {Promise<Object|null>} { fields, evidence, unresolvedFields, confidence, aiExtracted }
 */
export async function extractWithAIFallback({ evidenceText = null, sourceUrl = null, countryHint = null, ai = null } = {}) {
  if (!evidenceText || typeof evidenceText !== 'string' || evidenceText.trim().length === 0) {
    // No evidence → no AI call (contract: do not trigger AI merely because a
    // field is null if no source evidence is available).
    return null;
  }

  let AIService;
  if (!ai) {
    const mod = await import('./AIService.js');
    AIService = mod.default;
  } else {
    AIService = ai;
  }

  const prompt = [
    'You are a SOURCE-GROUNDED business-data extraction assistant.',
    'You extract ONLY facts that are EXPLICITLY present in the supplied evidence.',
    '',
    'STRICT RULES:',
    '- Extract only facts explicitly present in the evidence. Never guess.',
    '- Never complete partial addresses from general knowledge.',
    '- Never infer city/state from the user location or general knowledge.',
    '- Never infer phone numbers.',
    '- Never generate an email because a website exists.',
    '- Never treat a business name as an address.',
    '- Never replace an authoritative field with an AI value.',
    '- Return null for any field not present in the evidence.',
    '- Return an evidence snippet (exact quote from the evidence) for every extracted field.',
    '- Return a confidence value 0-1 reflecting how explicit the evidence is.',
    '- Return status: "extracted" | "missing" | "ambiguous".',
    '',
    'EVIDENCE (retrieved page text):',
    '```',
    evidenceText,
    '```',
    '',
    'Return ONLY valid JSON in this exact schema:',
    `{
      "address": { "value": null, "evidence": null, "confidence": 0, "status": "missing|extracted|ambiguous" },
      "phone": { "value": null, "evidence": null, "confidence": 0, "status": "missing|extracted|ambiguous" },
      "email": { "value": null, "evidence": null, "confidence": 0, "status": "missing|extracted|ambiguous" },
      "website": { "value": null, "evidence": null, "confidence": 0, "status": "missing|extracted|ambiguous" },
      "coordinates": { "lat": null, "lng": null, "evidence": null, "confidence": 0, "status": "missing|extracted|ambiguous" }
    }`,
  ].join('\n');

  const schema = {
    type: 'object',
    properties: {
      address: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['value', 'evidence', 'confidence', 'status'],
      },
      phone: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['value', 'evidence', 'confidence', 'status'],
      },
      email: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['value', 'evidence', 'confidence', 'status'],
      },
      website: {
        type: 'object',
        properties: {
          value: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['value', 'evidence', 'confidence', 'status'],
      },
      coordinates: {
        type: 'object',
        properties: {
          lat: { type: ['number', 'null'] },
          lng: { type: ['number', 'null'] },
          evidence: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['missing', 'extracted', 'ambiguous'] },
        },
        required: ['lat', 'lng', 'evidence', 'confidence', 'status'],
      },
    },
    required: ['address', 'phone', 'email', 'website', 'coordinates'],
  };

  let result;
  try {
    result = await AIService.generate({
      prompt,
      model: 'reasoning',
      schema,
      temperature: 0,
      maxTokens: 2000,
      systemPrompt:
        'You extract business fields ONLY when the evidence explicitly contains them. ' +
        'Never invent, infer, or complete values. Use exact evidence snippets. Return strict JSON only.',
    });
  } catch (error) {
    console.error('[GoogleMapsFallbackExtractor] AI fallback extraction failed (best-effort):', error?.safeMessage || error?.message);
    return null;
  }

  if (!result || typeof result !== 'object') return null;

  // --- Deterministic validation of AI output before merging ---
  const fields = {};
  const evidence = {};
  const unresolvedFields = [];
  const confidence = {};
  let aiUsed = false;

  const acceptField = ({ field, value, rawEvidence, conf, status, validate }) => {
    if (!field || status === 'missing') {
      unresolvedFields.push(field);
      return;
    }
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      unresolvedFields.push(field);
      return;
    }
    if (typeof conf !== 'number' || conf < AI_ACCEPTANCE_THRESHOLD) {
      unresolvedFields.push(field);
      return;
    }
    if (!rawEvidence || typeof rawEvidence !== 'string' || rawEvidence.trim().length === 0) {
      unresolvedFields.push(field);
      return;
    }
    const validated = validate ? validate(value) : { ok: true, value };
    if (!validated.ok) {
      unresolvedFields.push(field);
      return;
    }
    fields[field] = validated.value;
    evidence[field] = {
      value: validated.value,
      source: 'google_maps_source',
      sourceUrl,
      sourceType: 'extraction_evidence',
      extractionMethod: 'ai',
      provenance: 'ai_generated',
      confidence: Math.min(1, Math.max(0, conf)),
      verified: false,
      evidenceSnippet: typeof rawEvidence === 'string' ? rawEvidence.slice(0, 500) : null,
    };
    confidence[field] = Math.min(1, Math.max(0, conf));
    aiUsed = true;
  };

  // Address
  acceptField({
    field: 'address',
    value: result.address?.value ?? null,
    rawEvidence: result.address?.evidence ?? null,
    conf: result.address?.confidence ?? 0,
    status: result.address?.status ?? 'missing',
    validate: (v) => (typeof v === 'string' && v.trim().length > 5 ? { ok: true, value: v.trim() } : { ok: false }),
  });

  // Phone
  acceptField({
    field: 'phone',
    value: result.phone?.value ?? null,
    rawEvidence: result.phone?.evidence ?? null,
    conf: result.phone?.confidence ?? 0,
    status: result.phone?.status ?? 'missing',
    validate: (v) => {
      const check = validatePhone(String(v), countryHint);
      if (check.status === 'valid') return { ok: true, value: check.value };
      // unresolved-but-present signal preserved in evidence
      if (check.status === 'unresolved') {
        fields._unresolvedPhone = fields._unresolvedPhone || [];
        fields._unresolvedPhone.push({ raw: check.raw, reason: check.reason });
      }
      return { ok: false };
    },
  });

  // Email
  acceptField({
    field: 'email',
    value: result.email?.value ?? null,
    rawEvidence: result.email?.evidence ?? null,
    conf: result.email?.confidence ?? 0,
    status: result.email?.status ?? 'missing',
    validate: (v) => (isValidEmail(String(v)) ? { ok: true, value: String(v).trim() } : { ok: false }),
  });

  // Website
  acceptField({
    field: 'website',
    value: result.website?.value ?? null,
    rawEvidence: result.website?.evidence ?? null,
    conf: result.website?.confidence ?? 0,
    status: result.website?.status ?? 'missing',
    validate: (v) => {
      const check = validateWebsite(String(v));
      if (check.status === 'valid') return { ok: true, value: check.value };
      return { ok: false };
    },
  });

  // Coordinates
  if (
    result.coordinates &&
    result.coordinates.status !== 'missing' &&
    typeof result.coordinates.lat === 'number' &&
    typeof result.coordinates.lng === 'number'
  ) {
    const coords = validateCoordinates({ lat: result.coordinates.lat, lng: result.coordinates.lng });
    const conf = typeof result.coordinates.confidence === 'number' ? result.coordinates.confidence : 0;
    const rawEvidence = result.coordinates.evidence || null;
    if (coords && conf >= AI_ACCEPTANCE_THRESHOLD && rawEvidence && typeof rawEvidence === 'string' && rawEvidence.trim()) {
      fields.coordinates = coords;
      evidence.coordinates = {
        value: coords,
        source: 'google_maps_source',
        sourceUrl,
        sourceType: 'extraction_evidence',
        extractionMethod: 'ai',
        provenance: 'ai_generated',
        confidence: Math.min(1, Math.max(0, conf)),
        verified: false,
        evidenceSnippet: rawEvidence.slice(0, 500),
      };
      confidence.coordinates = Math.min(1, Math.max(0, conf));
      aiUsed = true;
    } else {
      unresolvedFields.push('coordinates');
    }
  } else {
    unresolvedFields.push('coordinates');
  }

  const finalUnresolved = [...new Set(unresolvedFields)];
  const finalFields = { ...fields };
  delete finalFields._unresolvedPhone;

  return {
    fields: finalFields,
    evidence,
    unresolvedFields: finalUnresolved,
    confidence,
    aiExtracted: aiUsed,
  };
}

/**
 * Orchestrated fallback extraction entry point.
 *
 * Combines deterministic extraction (URL parser + provider record) with
 * evidence-grounded AI extraction, applying the single precedence policy.
 *
 * @param {Object} ctx
 * @param {string}  [ctx.sourceUrl]              - Google Maps URL
 * @param {string}  [ctx.sourceType]             - 'google_maps_url' | ...
 * @param {string}  [ctx.sourceText]             - retrieved page text (evidence)
 * @param {Object}  [ctx.parsedSource]           - parser output
 * @param {Object}  [ctx.providerRecord]         - best provider (Geoapify) record
 * @param {Object}  [ctx.existingCanonicalProfile] - current canonical fields
 * @param {Object}  [ctx.ai]                     - injectable AI service (tests)
 * @returns {Promise<Object>} merged result
 */
export async function extractFallbackFields({
  sourceUrl = null,
  sourceType = 'google_maps_url',
  sourceText = null,
  parsedSource = null,
  providerRecord = null,
  existingCanonicalProfile = null,
  ai = null,
} = {}) {
  // 1. Deterministic path (parser + provider record) — NEVER AI-outranks.
  const deterministic = extractDeterministicFallback({
    sourceUrl,
    parsedSource,
    providerRecord,
    existingCanonicalProfile,
  });

  const fields = { ...(deterministic.fields || {}) };
  const evidence = { ...(deterministic.evidence || {}) };
  const unresolvedFields = [...(deterministic.unresolvedFields || [])];
  const confidence = { ...(deterministic.confidence || {}) };

  // 2. AI extraction ONLY for fields still missing AND when evidence exists.
  const stillMissing = unresolvedFields.filter(
    (f) => fields[f] == null && f !== 'name' && f !== 'coordinates'
  );
  if (stillMissing.length > 0 && sourceText) {
    const aiResult = await extractWithAIFallback({
      evidenceText: sourceText,
      sourceUrl,
      countryHint:
        existingCanonicalProfile?.location?.country ??
        existingCanonicalProfile?.location?.addressComponents?.country ??
        null,
      ai,
    });
    if (aiResult && aiResult.fields) {
      for (const [field, value] of Object.entries(aiResult.fields)) {
        // AI fills ONLY gaps; authoritative/provider values always win.
        if (fields[field] == null && value != null) {
          fields[field] = value;
          evidence[field] = aiResult.evidence[field];
          confidence[field] = aiResult.confidence[field];
        }
      }
    }
    return {
      fields,
      evidence,
      unresolvedFields: [...new Set(unresolvedFields)],
      confidence,
      aiExtracted: Boolean(aiResult?.aiExtracted),
      deterministic,
    };
  }

  return {
    fields,
    evidence,
    unresolvedFields: [...new Set(unresolvedFields)],
    confidence,
    aiExtracted: false,
    deterministic,
  };
}

export default {
  extractFallbackFields,
  extractDeterministicFallback,
  extractWithAIFallback,
  extractGoogleMapsSourceIdentity,
  validateCoordinates,
  validatePhone,
  isValidEmail,
  validateWebsite,
  isNonPhoneSignal,
  detectConflicts,
  AI_ACCEPTANCE_THRESHOLD,
};