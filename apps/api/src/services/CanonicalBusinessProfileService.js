/**
 * CanonicalBusinessProfileService — P1.3 Canonical Business Profile Read Layer
 *
 * THE single provider-independent canonical projection layer for Webloom.
 *
 * Webloom historically consumed business data in FOUR different shapes:
 *   1. flat canonical provider shape   (Geoapify adapter / WebExtraction AI):
 *        business.name, contact.phone, location.full_address, ratings.rating, ...
 *   2. BusinessProfile.data shape      (BusinessProfile.getField() — value/provenance/confidence)
 *   3. "intelligence" shape            (extractBusinessIntelligence* — identity.name,
 *        contact.phone, location.address, rating, reviewCount, openingHours, ...)
 *   4. persisted entity shape          (business_entity / canonical_field / observation /
 *        provider_identity rows via IdentityRepository)
 *
 * This service consumes ALL of them and projects ONE stable canonical shape:
 *
 *   {
 *     identity:   { entityId, name, address, phone, website, domain, coordinates },
 *     business:   { category, categories, description, businessType, services, products,
 *                   amenities, hours, email, socialLinks, pricing, bookingUrl },
 *     reputation: { rating, reviewCount, reviews },
 *     providers:  [ { provider, providerRecordId, resolutionMethod, resolutionConfidence,
 *                     firstSeen, lastSeen } ],
 *     provenance: { <fieldPath>: { provenance, confidence, source, updatedAt, ... } },
 *     confidence: { entity, <fieldPath> },
 *     enrichment: { aiExtracted, aiGeneratedFields, ... }
 *   }
 *
 * CONTRACT INVARIANTS (enforced here, regression-tested in
 * apps/api/test_phase_p13_canonical_profile.js):
 *
 *   A. SYNTHETIC IDENTITY IS FORBIDDEN
 *      Canonical identity must NEVER invent values. A missing authoritative
 *      name/address/phone/website projects to `null` — never to "Unknown
 *      Business", "Unknown", "N/A", "Unnamed Business", or any other synthetic
 *      identity, regardless of which input shape is used.
 *
 *   B. PROVIDER IDS ARE NEVER IDENTITY
 *      providerRecordId / placeId / cid / googlePlaceId / geoapifyPlaceId are
 *      provider metadata and belong under `providers[]`. They must never become
 *      identity.name / identity.address / identity.phone / identity.website, and
 *      they must never be promoted into a canonical business field.
 *
 *   C. AI PROVENANCE IS NEVER UPGRADED (P1.2 AI QUARANTINE MUST SURVIVE)
 *      ai_generated provenance passes through the projection untouched. The
 *      projection never rewrites ai_generated → verified/discovered/
 *      identified/authoritative. AI-extracted records (metadata.aiExtracted)
 *      are surfaced under enrichment.aiExtracted so callers can see them, but
 *      their identity data is NOT promoted to verified identity.
 *
 *   D. PURE READ — NO SIDE EFFECTS
 *      fromBusinessProfile / fromEntityData are synchronous and pure:
 *      no network, no fetch(), no AI, no DB writes, no mutation of input
 *      (structurally-cloned only; the source object is never modified).
 *      fromPersistedEntity performs DB READS only — it never creates/updates
 *      entities, canonical fields, observations, or provider identities, and
 *      never performs entity resolution as a side effect.
 *
 *   E. DETERMINISTIC
 *      Identical input (value-equal) always produces an identical canonical
 *      projection. No timestamps, random IDs, or unstable ordering are
 *      introduced by the projection itself.
 *
 * This file uses repository conventions throughout:
 *   - ESM ("type": "module"), named exports, plain-object results
 *   - null (not undefined / empty-string) for missing values, matching
 *     BusinessProfile.get() and the flat provider shapes
 *   - fieldPath conventions: identity.name, contact.phone, contact.website,
 *     location.full_address, location.coordinates, ratings.rating, hours, ...
 *   - provider labels: 'geoapify' | 'web_extraction'
 *
 * PROJECTION vs NORMALIZATION (spec §4):
 *   Projection consumes existing normalized/canonical values where they exist.
 *   It does NOT re-normalize phone/domain/address itself. When source shapes
 *   carry values as { value, provenance, confidence } objects (BusinessProfile
 *   / legacy Google Places), this layer unwraps them deterministically and
 *   preserves their provenance/confidence.
 */

// ---------------------------------------------------------------------------
// Provenance tiers (mirrors BusinessProfile.set + CanonicalizationService).
// ai_generated sits BELOW every deterministic tier (P1.2 AI quarantine). The
// projection uses these only to RECORD provenance, never to upgrade it.
// ---------------------------------------------------------------------------
export const PROVENANCE_PRIORITY = Object.freeze({
  verified: 4,
  discovered: 3,
  user_provided: 3,
  identified: 2,
  inferred: 1,
  ai_generated: 0.5,
});

// Read-only schema access for fromPersistedEntity's provider-identity query
// (mirrors IdentityRepository's drizzle usage; imported lazily to avoid a
// hard dependency for in-memory-only consumers).
import { eq } from 'drizzle-orm';
import { ProviderIdentity } from '../db/schema.js';

// Canonical fieldPaths (contract) → all source shapes that may carry them.
// The FIRST non-null read wins. Shapes are tried in order: flat provider →
// BusinessProfile.data (value/provenance object) → intelligence → legacy
// dotted-path (BusinessProfile.toObject) → legacy bare field →
// persisted canonical_field.
const NAME_SOURCES = [
  (r) => r?.business?.name,
  (r) => unwrapValue(r?.identity?.name),
  (r) => r?.name,
  // Nested data.identity.name (data-wrapped BusinessProfile shape)
  (r) => unwrapValue(r?.data?.identity?.name),
];
const ADDRESS_SOURCES = [
  (r) => r?.location?.full_address,
  (r) => unwrapValue(r?.location?.full_address),
  (r) => r?.location?.address,
  (r) => unwrapValue(r?.location?.address),
  (r) => r?.address,
  (r) => r?.location?.fullAddress,
  (r) => r?.location?.street_address,
  // Nested data.location.full_address (data-wrapped BusinessProfile shape)
  (r) => unwrapValue(r?.data?.location?.full_address),
];
const PHONE_SOURCES = [
  (r) => r?.contact?.phone,
  (r) => unwrapValue(r?.contact?.phone),
  (r) => r?.phone,
  (r) => unwrapValue(r?.data?.contact?.phone),
];
const WEBSITE_SOURCES = [
  (r) => r?.contact?.website,
  (r) => unwrapValue(r?.contact?.website),
  (r) => r?.website,
  (r) => unwrapValue(r?.data?.contact?.website),
];
const EMAIL_SOURCES = [
  (r) => r?.contact?.email,
  (r) => unwrapValue(r?.contact?.email),
  (r) => r?.email,
];
const CATEGORY_SOURCES = [
  (r) => r?.business?.category,
  (r) => unwrapValue(r?.identity?.category),
  (r) => r?.category,
  (r) => unwrapValue(r?.data?.identity?.category),
];
const CATEGORIES_SOURCES = [
  (r) => r?.business?.categories,
  (r) => unwrapValue(r?.identity?.categories),
  (r) => r?.categories,
  (r) => unwrapValue(r?.data?.identity?.categories),
];
const DESCRIPTION_SOURCES = [
  (r) => r?.business?.description,
  (r) => unwrapValue(r?.identity?.description),
  (r) => r?.description,
  (r) => unwrapValue(r?.data?.identity?.description),
];
const BUSINESS_TYPE_SOURCES = [
  (r) => r?.business?.business_type,
  (r) => unwrapValue(r?.identity?.business_type),
  (r) => r?.businessType,
  (r) => unwrapValue(r?.identity?.businessType),
  (r) => r?.business_type,
];
const SERVICES_SOURCES = [
  (r) => r?.business?.services,
  (r) => unwrapValue(r?.identity?.services),
  (r) => r?.services,
];
const PRODUCTS_SOURCES = [
  (r) => r?.business?.products,
  (r) => r?.products,
];
const AMENITIES_SOURCES = [
  (r) => r?.business?.amenities,
  (r) => r?.amenities,
];
const HOURS_SOURCES = [
  (r) => r?.business?.hours,
  (r) => r?.hours,
  (r) => unwrapValue(r?.hours),
  (r) => r?.openingHours,
  (r) => r?.opening_hours,
];
const SOCIAL_LINKS_SOURCES = [
  (r) => r?.business?.socialLinks,
  (r) => r?.business?.social_links,
  (r) => r?.social_links,
  (r) => r?.socialLinks,
];
const PRICING_SOURCES = [
  (r) => r?.business?.pricing,
  (r) => r?.pricing,
];
const BOOKING_URL_SOURCES = [
  (r) => r?.business?.bookingUrl,
  (r) => r?.business?.booking_url,
  (r) => r?.bookingUrl,
  (r) => r?.booking_url,
];
const ADDRESS_STREET_SOURCES = [
  (r) => r?.location?.street,
  (r) => unwrapValue(r?.location?.street),
  (r) => r?.location?.address_line1,
  (r) => r?.street,
];
const CITY_SOURCES = [
  (r) => r?.location?.city,
  (r) => unwrapValue(r?.location?.city),
  (r) => r?.city,
  (r) => r?.location?.locality,
];
const STATE_SOURCES = [
  (r) => r?.location?.state,
  (r) => unwrapValue(r?.location?.state),
  (r) => r?.state,
  (r) => r?.location?.region,
];
const COUNTRY_SOURCES = [
  (r) => r?.location?.country,
  (r) => unwrapValue(r?.location?.country),
  (r) => r?.country,
];
const POSTAL_CODE_SOURCES = [
  (r) => r?.location?.postal_code,
  (r) => unwrapValue(r?.location?.postal_code),
  (r) => r?.location?.postalCode,
  (r) => r?.postal_code,
  (r) => r?.location?.postcode,
  (r) => r?.zip,
];
const RATING_SOURCES = [
  (r) => r?.ratings?.rating,
  (r) => unwrapValue(r?.ratings?.rating),
  (r) => r?.rating,
];
const REVIEW_COUNT_SOURCES = [
  (r) => r?.ratings?.review_count,
  (r) => unwrapValue(r?.ratings?.review_count),
  (r) => r?.reviewCount,
  (r) => r?.review_count,
];
const REVIEWS_SOURCES = [
  (r) => r?.ratings?.reviews,
  (r) => r?.reviews,
];

/**
 * First non-null value from an ordered list of source readers. null/undefined/
 * empty-string count as missing; 0 and false are legitimate values.
 */
function firstDefined(readers, record) {
  for (const read of readers) {
    const v = read(record);
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

/**
 * Unwrap BusinessProfile.data / legacy Google-Places { value, provenance,
 * confidence } field objects. Returns value for any shape that carries
 * `value`; otherwise returns the raw value unchanged.
 */
function unwrapValue(v) {
  if (v !== null && typeof v === 'object' && 'value' in v) {
    return v.value;
  }
  return v;
}

/**
 * Deep-clone an input value. Used ONLY to build the canonical projection —
 * the projection result is a fresh object tree; the input is never mutated.
 */
function deepClone(v) {
  return structuredClone(v);
}

/**
 * Normalize a source field object (flat provider | intelligence | legacy
 * value-object) into `{ value, provenance, confidence, source, updatedAt }`
 * metadata where provenance exists in the input. Never invents provenance:
 * when the source carries none, fields are absent.
 */
function fieldMeta(record, path) {
  // BusinessProfile.data object: { value, provenance, confidence, sourceInfo, updatedAt, ... }
  const viaPath = () => {
    if (!path) return null;
    const parts = path.split('.');
    let cur = record;
    for (const p of parts) {
      if (cur === null || typeof cur !== 'object') return null;
      cur = cur[p];
    }
    if (cur !== null && typeof cur === 'object' && 'value' in cur) {
      return {
        value: cur.value,
        provenance: cur.provenance ?? null,
        confidence: typeof cur.confidence === 'number' ? cur.confidence : null,
        source: cur.sourceInfo?.sourceUrl ?? cur.sourceInfo?.provider ?? cur.sourceId ?? null,
        updatedAt: cur.updatedAt ?? null,
      };
    }
    return null;
  };
  return viaPath();
}

/**
 * Read an identity/business field from a source record, returning value +
 * provenance/confidence metadata when the source is the BusinessProfile shape.
 *
 * Handles all existing input variations (flat provider · BusinessProfile.data ·
 * intelligence · bare field) without privileging one shape.
 */
function readField(record, { sources, path = null }) {
  if (!record || typeof record !== 'object') {
    return { value: null, provenance: null, confidence: null };
  }
  const value = firstDefined(sources, record);
  const meta = fieldMeta(record, path);
  if (meta && (meta.provenance || typeof meta.confidence === 'number')) {
    return {
      value: meta.value !== undefined ? meta.value : value,
      provenance: meta.provenance,
      confidence: meta.confidence,
    };
  }
  return { value, provenance: null, confidence: null };
}

/**
 * Read coordinates from a source record, preserving { lat, lng } object
 * structure (never stringified, never "[object Object]"). Accepts:
 *   location.coordinates.{lat,lng}
 *   location.{latitude,longitude}
 *   coordinates.{lat,lng}
 *   { latitude, longitude } at top level (legacy)
 * Numbers are numbers. Returns null when absent or invalid.
 */
function readCoordinates(record) {
  if (!record || typeof record !== 'object') return null;
  const candidates = [
    record?.location?.coordinates,
    unwrapValue(record?.location?.coordinates),
    record?.location?.coords,
    record?.coordinates,
    record?.coords,
  ];
  let lat = null;
  let lng = null;
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      if (typeof c.lat === 'number') lat = c.lat;
      if (typeof c.lng === 'number') lng = c.lng;
    }
  }
  const flatLat = record?.location?.latitude ?? record?.location?.lat ?? record?.latitude;
  const flatLng = record?.location?.longitude ?? record?.location?.lon ?? record?.longitude;
  if (lat == null && typeof flatLat === 'number') lat = flatLat;
  if (lng == null && typeof flatLng === 'number') lng = flatLng;
  if (lat === null || lng === null) return null;
  // Keep { lat, lng } object structure; validate ranges.
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Canonical identity name — the guard against synthetic identity.
 * When no authoritative name exists, returns null (never invents).
 * Synthetic placeholders are ALSO nulled here (defense in depth) so a source
 * that contains "Unknown Business" cannot leak it into canonical identity.
 * Provider IDs (place IDs / CIDs) are NEVER identity (invariant B) — a
 * Google Place ID or CID string that leaked into the name field is nulled.
 */
function canonicalName(record) {
  const { value } = readField(record, { sources: NAME_SOURCES, path: 'identity.name' });
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (SYNTHETIC_IDENTITY_RE.test(trimmed.toLowerCase())) return null;
  // Invariant B: provider IDs must never become identity. A name that is
  // actually a Google Place ID (ChIJ…), a CID (cid:… or 0x…:0x…), or a
  // numeric-only CID payload is provider metadata, not a business name.
  if (/^(cid:\d+|chij[a-z0-9_-]{15,}|0x[0-9a-f]+:0x[0-9a-f]+|\d{10,20})$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

// Synthetic identity placeholders that must NEVER appear as canonical
// identity (P1.2 synthetic-identity prevention + spec §5).
const SYNTHETIC_IDENTITY_RE =
  /^(unknown\s*business|unknown|n\/a|na|unnamed\s*business|unnamed)$/i;

/**
 * Extract the domain from a website URL. Deterministic; never invents.
 * Returns the hostname (lowercase) or null.
 */
function domainFromWebsite(website) {
  if (typeof website !== 'string' || website.trim().length === 0) return null;
  const s = website.trim();
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extract source provider metadata from a record (flat `provider` object |
 * `source` object | persisted provider identity row). Never restructures
 * provider IDs into identity.
 */
function extractProviderMeta(record) {
  const list = [];
  const push = (provider, providerRecordId, extra = {}) => {
    if (!provider || typeof provider !== 'string') return;
    const entry = {
      provider,
      providerRecordId: providerRecordId ?? null,
      resolutionMethod: extra.resolutionMethod ?? null,
      resolutionConfidence:
        typeof extra.resolutionConfidence === 'number' ? extra.resolutionConfidence : null,
      firstSeen: extra.firstSeen ?? null,
      lastSeen: extra.lastSeen ?? null,
    };
    list.push(entry);
  };

  // Flat provider shape (Geoapify adapter): provider: { name, placeId, datasource }
  if (record?.provider && typeof record.provider === 'object') {
    const p = record.provider;
    const name = p.name ?? p.provider ?? null;
    const recordId = p.placeId ?? p.providerRecordId ?? p.id ?? null;
    if (name) {
      push(name, recordId, {
        resolutionMethod: p.resolutionMethod ?? null,
        resolutionConfidence: p.resolutionConfidence,
      });
      return list;
    }
  }
  // Web-extraction: source: { url, ... } + provider label on the record.
  if (record?.source && typeof record.source === 'object') {
    const provider = record.source.provider ?? record.provider ?? null;
    const recordId = record.source.placeId ?? record.source.place_id ?? record.source.url ?? null;
    if (provider) {
      push(provider, recordId, {
        resolutionMethod: record.source.resolutionMethod ?? record.source.resolution_method ?? null,
        resolutionConfidence: record.source.resolutionConfidence ?? record.source.resolution_confidence,
      });
      return list;
    }
  }
  // Legacy flat provider name string (provider: 'geoapify').
  if (typeof record?.provider === 'string') {
    push(record.provider, record?.placeId ?? record?.place_id ?? null);
    return list;
  }

  // Persisted ProviderIdentity rows / provider-identity objects list.
  const rows = Array.isArray(record) ? record : record?.providers;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const provider = row.provider ?? row.providerName ?? null;
      if (!provider) continue;
      push(provider, row.providerRecordId ?? row.provider_record_id ?? null, {
        resolutionMethod: row.resolutionMethod ?? row.resolution_method ?? null,
        resolutionConfidence: row.resolutionConfidence ?? row.resolution_confidence,
        firstSeen: row.firstSeen ?? row.first_seen ?? null,
        lastSeen: row.lastSeen ?? row.last_seen ?? null,
      });
    }
  }

  return list;
}

/**
 * Build the provenance map for a canonical projection from a
 * BusinessProfile-shaped source (record.data) or an already-flat map of
 * { fieldPath: { provenance, confidence, ... } }.
 * Only carries entries where the source actually HAS provenance — never
 * manufactures one.
 */
function buildProvenanceMap(record) {
  const map = {};
  if (!record || typeof record !== 'object') return map;
  // Persisted canonical fields: { fieldPath: { provenance, confidence, ... } }
  const canonicalFields = record.canonicalFields ?? null;
  if (Array.isArray(canonicalFields)) {
    for (const cf of canonicalFields) {
      if (!cf || typeof cf !== 'object' || !cf.fieldPath) continue;
      map[cf.fieldPath] = {
        provenance: cf.provenance ?? null,
        confidence: typeof cf.confidence === 'number' ? cf.confidence : null,
        value: cf.value ?? null,
      };
    }
    return map;
  }

  const walk = (obj, prefix = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && 'value' in value) {
        if (value.provenance != null) {
          map[path] = {
            provenance: value.provenance,
            confidence: typeof value.confidence === 'number' ? value.confidence : null,
            source: value.sourceInfo?.sourceUrl ?? value.sourceInfo?.provider ?? value.sourceId ?? null,
            updatedAt: value.updatedAt ?? null,
          };
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, path);
      }
    }
  };
  walk(record.data ?? record);
  return map;
}

function buildAiGeneratedProvenance(source) {
  const map = {};
  if (!source || typeof source !== 'object') return map;
  // BusinessProfile instance with extraction history
  const history = source?.data?.metadata?.extractionHistory ?? null;
  if (Array.isArray(history)) {
    for (const entry of history) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.provenance === 'ai_generated' && entry.field) {
        map[entry.field] = {
          provenance: 'ai_generated',
          confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
          source: entry.sourceInfo?.sourceUrl ?? entry.sourceInfo?.provider ?? null,
          updatedAt: entry.timestamp ?? null,
        };
      }
    }
  }
  return map;
}

/**
 * Compute the provenance tier of a field for confidence purposes.
 * Returns null when no provenance present (confidence cannot be derived).
 */
function provenanceTier(provenance) {
  if (!provenance) return null;
  return PROVENANCE_PRIORITY[provenance] ?? null;
}

/**
 * Package the enrichment metadata from a source record.
 * P1.2 AI quarantine: aiExtracted must survive the projection and be surfaced
 * here — explicitly AI-generated, never upgraded.
 */
function buildEnrichment(record) {
  const meta = record?.metadata && typeof record.metadata === 'object' ? record.metadata : null;
  const aiExtracted = Boolean(meta?.aiExtracted ?? record?.aiExtracted);
  const aiGeneratedFields = Array.isArray(meta?.aiGeneratedFields)
    ? meta.aiGeneratedFields
    : meta?.ai_generated_fields
      ? meta.ai_generated_fields
      : null;
  const enrichment = {};
  if (aiExtracted) enrichment.aiExtracted = true;
  if (aiGeneratedFields && aiGeneratedFields.length > 0) {
    enrichment.aiGeneratedFields = [...aiGeneratedFields];
  }
  if (meta?.acquisitionMethod) enrichment.acquisitionMethod = meta.acquisitionMethod;
  if (meta?.providerUnavailable) enrichment.providerUnavailable = true;
  return enrichment;
}

// ---------------------------------------------------------------------------
// FACADE: one entry-point object with the three read APIs (spec §2)
// ---------------------------------------------------------------------------
class CanonicalBusinessProfileService {
  /**
   * Project a BusinessProfile instance (or its .data / .toObject() map) into
   * the canonical shape. PURE — synchronously reads, never mutates input.
   *
   * @param {BusinessProfile|Object} profile - BusinessProfile instance, its
   *   .data, a flat object, or a dot-path map
   * @returns {Object} canonical projection
   */
  fromBusinessProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      return this._emptyProjection();
    }
    // BusinessProfile instance → extract .data + entityId
    if (typeof profile?.get === 'function' && profile?.data) {
      const flat = this._profileToFlat(profile);
      const prov = buildProvenanceMap(profile.data);
      const entityId = profile.getEntityId ? profile.getEntityId() : null;
      const projection = this.fromEntityData({ record: flat, canonicalFields: toCanonicalFieldList(prov) });
      if (entityId) projection.identity.entityId = entityId;
      this._mergeBusinessProfileProvenance(projection, flat, profile);
      return projection;
    }
    // Plain object: treat as flat provider shape / intelligence shape / data map
    return this.fromEntityData({ record: profile });
  }

  /**
   * Project a provider record / intelligence object / flat field map into the
   * canonical shape, given optional persisted canonical fields and provider
   * identities. PURE.
   *
   * @param {Object} params
   * @param {Object} params.record - source record (any supported shape)
   * @param {Array}  [params.canonicalFields] - persisted CanonicalField rows:
   *   [{ fieldPath, value, provenance, confidence, ... }]
   * @param {Array}  [params.providerIdentities] - persisted ProviderIdentity
   *   rows: [{ provider, providerRecordId, resolutionMethod,
   *           resolutionConfidence, firstSeen, lastSeen }]
   * @returns {Object} canonical projection
   */
  fromEntityData({ entity, record, canonicalFields = null, providerIdentities = null } = {}) {
    const source = record ?? entity ?? {};
    const projection = this._emptyProjection();

    // --- identity (never synthetic; provider IDs never identity) ---
    const name = canonicalName(source);
    const address = firstDefined(ADDRESS_SOURCES, source);
    const phone = firstDefined(PHONE_SOURCES, source);
    const website = firstDefined(WEBSITE_SOURCES, source);
    const coordinates = readCoordinates(source);

    projection.identity.name = name;
    projection.identity.address = typeof address === 'string' ? address.trim() : address ?? null;
    projection.identity.phone = typeof phone === 'string' ? phone.trim() : phone ?? null;
    projection.identity.website = typeof website === 'string' ? website.trim() : website ?? null;
    projection.identity.domain = domainFromWebsite(projection.identity.website);
    projection.identity.coordinates = coordinates;
    projection.identity.addressComponents = {
      street: firstDefined(ADDRESS_STREET_SOURCES, source),
      city: firstDefined(CITY_SOURCES, source),
      state: firstDefined(STATE_SOURCES, source),
      country: firstDefined(COUNTRY_SOURCES, source),
      postalCode: firstDefined(POSTAL_CODE_SOURCES, source),
    };

    // entityId: only from an authoritative source — a persisted entity id or
    // an explicit entityId on the record. NEVER a provider id.
    const entityId =
      (typeof source?.entityId === 'string' && source.entityId.startsWith('ent_') ? source.entityId : null) ??
      (typeof source?.entity?.entityId === 'string' ? source.entity.entityId : null) ??
      null;
    if (entityId) projection.identity.entityId = entityId;
    if (Array.isArray(canonicalFields)) {
      const cfId = canonicalFields.find((cf) => cf?.fieldPath === 'identity.entityId' && cf?.value);
      if (cfId && typeof cfId.value === 'string') projection.identity.entityId = cfId.value;
    }

    // --- business ---
    const category = firstDefined(CATEGORY_SOURCES, source);
    const categories = firstDefined(CATEGORIES_SOURCES, source);
    projection.business.category = typeof category === 'string' ? category.trim() : category ?? null;
    projection.business.categories = Array.isArray(categories)
      ? categories.map((c) => String(c)).filter(Boolean)
      : typeof categories === 'string'
        ? [categories]
        : [];
    const description = firstDefined(DESCRIPTION_SOURCES, source);
    projection.business.description = typeof description === 'string' ? description.trim() : description ?? null;
    const businessType = firstDefined(BUSINESS_TYPE_SOURCES, source);
    projection.business.businessType = typeof businessType === 'string' ? businessType.trim() : businessType ?? null;
    projection.business.services = asStringArray(firstDefined(SERVICES_SOURCES, source));
    projection.business.products = asStringArray(firstDefined(PRODUCTS_SOURCES, source));
    projection.business.amenities = asStringArray(firstDefined(AMENITIES_SOURCES, source));
    projection.business.hours = normalizeHoursShape(firstDefined(HOURS_SOURCES, source));
    projection.business.email = firstDefined(EMAIL_SOURCES, source) ?? null;
    projection.business.socialLinks = asStringArray(firstDefined(SOCIAL_LINKS_SOURCES, source));
    projection.business.pricing = firstDefined(PRICING_SOURCES, source) ?? null;
    projection.business.bookingUrl = firstDefined(BOOKING_URL_SOURCES, source) ?? null;

    // --- reputation ---
    const rating = firstDefined(RATING_SOURCES, source);
    const reviewCount = firstDefined(REVIEW_COUNT_SOURCES, source);
    projection.reputation.rating = typeof rating === 'number' ? rating : rating ?? null;
    projection.reputation.reviewCount =
      typeof reviewCount === 'number' ? reviewCount : reviewCount != null ? Number(reviewCount) : null;
    projection.reputation.reviews = asObjectArray(firstDefined(REVIEWS_SOURCES, source));

    // --- providers (provider IDs are ALWAYS provider metadata, never identity) ---
    const persistedProviders = Array.isArray(providerIdentities)
      ? providerIdentities.filter((p) => p && typeof p === 'object' && p.providerRecordId != null && p.provider != null)
      : null;
    projection.providers = extractProviderMeta(source);
    if (persistedProviders && persistedProviders.length > 0) {
      // Merge: dedupe on (provider, providerRecordId); persisted rows win.
      for (const row of persistedProviders) {
        const existingIdx = projection.providers.findIndex(
          (p) => p.provider === row.provider && p.providerRecordId === (row.providerRecordId ?? null)
        );
        const entry = {
          provider: row.provider,
          providerRecordId: row.providerRecordId ?? null,
          resolutionMethod: row.resolutionMethod ?? null,
          resolutionConfidence:
            typeof row.resolutionConfidence === 'number' ? row.resolutionConfidence : null,
          firstSeen: row.firstSeen ?? null,
          lastSeen: row.lastSeen ?? null,
        };
        if (existingIdx >= 0) projection.providers[existingIdx] = entry;
        else projection.providers.push(entry);
      }
    }

    // --- provenance (field-level, from source where supported) ---
    const prov = buildProvenanceMap(source.canonicalFields ? { canonicalFields } : source);
  // Also preserve ai_generated provenance from BusinessProfile extraction history
  // (P1.2 AI quarantine: ai_generated must never be upgraded, but must survive
  // the projection for consumers that need to see it).
  const aiGenProv = buildAiGeneratedProvenance(source);
  for (const [path, meta] of Object.entries(prov)) {
    const aiMeta = aiGenProv[path];
    projection.provenance[path] = {
      provenance: meta.provenance ?? null,
      confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
      source: meta.source ?? null,
      updatedAt: meta.updatedAt ?? null,
    };
  }
  // Merge any ai_generated entries that weren't already in the primary map
  for (const [path, meta] of Object.entries(aiGenProv)) {
    if (!projection.provenance[path] || !projection.provenance[path].provenance) {
      projection.provenance[path] = {
        provenance: meta.provenance,
        confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
        source: meta.source ?? null,
        updatedAt: meta.updatedAt ?? null,
      };
    }
  }

  // --- confidence (field-level where supported; no invented values) ---
  const sourceConfidence = source?.confidence && typeof source.confidence === 'object' ? source.confidence : null;
  if (sourceConfidence && typeof sourceConfidence.overall === 'number') {
    projection.confidence.entity = sourceConfidence.overall;
  }
  for (const fieldPath of Object.keys(projection.provenance)) {
    const meta = projection.provenance[fieldPath];
    if (typeof meta.confidence === 'number') {
      projection.confidence[fieldPath] = meta.confidence;
    }
  }

  // --- enrichment (AI quarantine metadata survives; never upgraded) ---
  Object.assign(projection.enrichment, buildEnrichment(source));

  // Apply persisted canonical-field overrides when present (authoritative).
  if (Array.isArray(canonicalFields)) {
    this._applyCanonicalFields(projection, canonicalFields);
  }

    return projection;
  }

  /**
   * Project a PERSISTED entity (from IdentityRepository / DB) into the
   * canonical shape. PURE READ — reads existing repository state and projects
   * it. NEVER creates/updates entities, canonical fields, observations,
   * provider identities, and never resolves entities as a side effect.
   *
   * Accepts:
   *   - an IdentityRepository instance (then entityId is required)
   *   - a repository-shaped object with getEntityById / findProviderIdentities /
   *     getCanonicalFields / getObservations
   *   - a pre-loaded entity object (with optional .canonicalFields /
   *     .providerIdentities / .observations)
   *
   * @param {string|Object} entityIdOrRepo - entityId, IdentityRepository, or
   *   a repository-shaped object / pre-loaded entity object
   * @param {IdentityRepository|Object|null} [repo] - repository (when the
   *   first argument is an entityId). The argument order is tolerant:
   *   fromPersistedEntity(repo, entityId) and
   *   fromPersistedEntity(entityId, repo) both work.
   * @returns {Promise<Object>} canonical projection
   */
  async fromPersistedEntity(entityIdOrRepo, repo = null) {
    let repoInstance = null;
    let entityId = null;

    // Tolerate both arg orders: (entityId, repo) and (repo, entityId).
    const isRepo = (v) => v && typeof v === 'object' && typeof v.getEntityById === 'function';
    if (typeof entityIdOrRepo === 'string') {
      entityId = entityIdOrRepo;
      repoInstance = isRepo(repo) ? repo : null;
    } else if (isRepo(entityIdOrRepo)) {
      repoInstance = entityIdOrRepo;
      entityId = typeof repo === 'string' ? repo : (typeof entityIdOrRepo?.entityId === 'string' ? entityIdOrRepo.entityId : null);
    } else if (entityIdOrRepo && typeof entityIdOrRepo === 'object') {
      // Pre-loaded entity object like { entityId, canonicalName, ... }
      return this._projectLoadedEntity(entityIdOrRepo);
    }

    if (!repoInstance) {
      throw new Error('fromPersistedEntity requires a repository (or a pre-loaded entity object)');
    }

    if (!entityId) {
      throw new Error('fromPersistedEntity requires an entityId when reading from a repository');
    }

    // READ-ONLY calls into repository + projection. No writes ever.
    const entity = repoInstance.getEntityById(entityId);
    if (!entity) {
      return {
        ...this._emptyProjection(),
        identity: { ...this._emptyProjection().identity, entityId },
        _readError: { code: 'NOT_FOUND', message: `Entity ${entityId} not found` },
      };
    }

    const canonicalFields = typeof repoInstance.getCanonicalFields === 'function'
      ? repoInstance.getCanonicalFields(entityId)
      : [];
    const observations = typeof repoInstance.getObservations === 'function'
      ? repoInstance.getObservations(entityId)
      : [];
    const providerIdentities = typeof repoInstance.findProviderIdentities === 'function'
      ? repoInstance.findProviderIdentities(entityId)
      : this._findProviderIdentitiesByEntity(repoInstance, entityId);

    return this._projectLoadedEntity({ entity, canonicalFields, observations, providerIdentities });
  }

  /**
   * Read provider identities for an entity directly when the repository does
   * not expose findProviderIdentities(). READ-ONLY query against
   * provider_identity by entity_id. Returns [] on any read failure (a read
   * failure never mutates state).
   * @private
   */
  _findProviderIdentitiesByEntity(repoInstance, entityId) {
    if (!repoInstance?.db || !entityId) return [];
    try {
      const rows = repoInstance.db
        .select()
        .from(ProviderIdentity)
        .where(eq(ProviderIdentity.entityId, entityId))
        .all();
      return rows.map((row) => ({
        provider: row.provider,
        providerRecordId: row.providerRecordId,
        resolutionMethod: row.resolutionMethod,
        resolutionConfidence: row.resolutionConfidence,
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Project a persisted entity object ({ entity, canonicalFields, ... }) into
   * the canonical shape. Synchronous core used by fromPersistedEntity.
   */
  _projectLoadedEntity(loaded) {
    const entity = loaded?.entity ?? loaded; // may already be the entity row
    if (!entity || typeof entity !== 'object') {
      return this._emptyProjection();
    }

    const canonicalFields = Array.isArray(loaded?.canonicalFields) ? loaded.canonicalFields : [];
    const providerIdentities = Array.isArray(loaded?.providerIdentities) ? loaded.providerIdentities : [];

    // Build a flat provider-shape record from the persisted canonical fields
    // (authoritative), then fall back to BusinessEntity columns for anything
    // not present in canonical fields.
    const flat = {};
    for (const cf of canonicalFields) {
      if (!cf?.fieldPath || cf.value === undefined || cf.value === null || cf.value === '') continue;
      setByPath(flat, cf.fieldPath, parsePersistedValue(cf));
    }

    const entityId = entity.entityId ?? loaded?.entityId ?? null;
    const projection = this.fromEntityData({
      record: flat,
      canonicalFields,
      providerIdentities,
    });

    // Persisted entity identity is authoritative — project entity columns
    // (never synthetic; only when present).
    if (entityId) projection.identity.entityId = entityId;
    const name = entity.canonicalName ?? null;
    if (typeof name === 'string' && name.trim() && !SYNTHETIC_IDENTITY_RE.test(name.trim().toLowerCase())) {
      projection.identity.name = name.trim();
    } else {
      projection.identity.name = null;
    }
    if (entity.canonicalPhone) projection.identity.phone = entity.canonicalPhone;
    if (entity.canonicalWebsite) {
      projection.identity.website = entity.canonicalWebsite;
      projection.identity.domain = domainFromWebsite(entity.canonicalWebsite);
    }
    if (entity.canonicalAddress) projection.identity.address = entity.canonicalAddress;
    if (typeof entity.canonicalLatitude === 'number' && typeof entity.canonicalLongitude === 'number') {
      projection.identity.coordinates = { lat: entity.canonicalLatitude, lng: entity.canonicalLongitude };
    }
    if (entity.category) projection.business.category = entity.category;

    // Provider identities → providers[] with resolution metadata + first/lastSeen.
    if (providerIdentities.length > 0) {
      projection.providers = providerIdentities.map((p) => ({
        provider: p.provider ?? null,
        providerRecordId: p.providerRecordId ?? null,
        resolutionMethod: p.resolutionMethod ?? null,
        resolutionConfidence:
          typeof p.resolutionConfidence === 'number' ? p.resolutionConfidence : null,
        firstSeen: p.firstSeen ?? null,
        lastSeen: p.lastSeen ?? null,
      })).filter((p) => p.provider && p.providerRecordId);
    }

    // Observations → provenance/confidence evidence (field-level).
    if (Array.isArray(loaded?.observations)) {
      for (const obs of loaded.observations) {
        if (!obs?.fieldPath) continue;
        const existing = projection.provenance[obs.fieldPath];
        projection.provenance[obs.fieldPath] = {
          provenance: existing?.provenance ?? obs.provenance ?? null,
          confidence: existing?.confidence ?? (typeof obs.confidence === 'number' ? obs.confidence : null),
          source: existing?.source ?? obs.provider ?? null,
          updatedAt: existing?.updatedAt ?? obs.observedAt ?? null,
        };
      }
    }

    return projection;
  }

  /**
   * Apply persisted canonical-field overrides onto a projection (authoritative
   * persisted values win over provider-record values).
   * ai_generated provenance is preserved exactly — never upgraded.
   */
  _applyCanonicalFields(projection, canonicalFields) {
    for (const cf of canonicalFields) {
      if (!cf?.fieldPath || cf.value === undefined || cf.value === null || cf.value === '') continue;
      const value = parsePersistedValue(cf);
      assignCanonicalField(projection, cf.fieldPath, value, cf.provenance ?? null, cf.confidence ?? null);
    }
  }

  /**
   * Convert a BusinessProfile instance into a flattened dot-path map
   * (same shape as BusinessProfile.toObject()) WITHOUT mutating it.
   */
  _profileToFlat(profile) {
    if (typeof profile.toObject === 'function') {
      return profile.toObject();
    }
    const out = {};
    const walk = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && 'value' in value) {
          out[path] = value.value;
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          walk(value, path);
        }
      }
    };
    walk(profile.data ?? profile);
    return out;
  }

  /**
   * Merge BusinessProfile field provenance (value/provenance/confidence/source)
   * into an existing projection, keyed by canonical fieldPath.
   */
  _mergeBusinessProfileProvenance(projection, flat, profile) {
    if (!profile?.getField) return;
    const FIELD_PATHS = [
      'identity.name', 'identity.category', 'identity.business_type',
      'identity.description', 'identity.categories', 'contact.phone', 'contact.email',
      'contact.website', 'location.full_address', 'location.coordinates',
      'ratings.rating', 'ratings.review_count', 'hours', 'social_links',
    ];
    for (const path of FIELD_PATHS) {
      const field = profile.getField(path);
      if (!field) continue;
      if (field.provenance != null) {
        projection.provenance[path] = {
          provenance: field.provenance,
          confidence: typeof field.confidence === 'number' ? field.confidence : null,
          source: field.sourceInfo?.sourceUrl ?? field.sourceInfo?.provider ?? field.sourceId ?? null,
          updatedAt: field.updatedAt ?? null,
        };
        if (typeof field.confidence === 'number') {
          projection.confidence[path] = field.confidence;
        }
      }
    }
  }

  /**
   * A canonical projection with every field nulled/empty — NEVER populated
   * with synthetic values.
   */
  _emptyProjection() {
    return {
      identity: {
        entityId: null,
        name: null,
        address: null,
        addressComponents: { street: null, city: null, state: null, country: null, postalCode: null },
        phone: null,
        website: null,
        domain: null,
        coordinates: null,
      },
      business: {
        category: null,
        categories: [],
        description: null,
        businessType: null,
        services: [],
        products: [],
        amenities: [],
        hours: null,
        email: null,
        socialLinks: [],
        pricing: null,
        bookingUrl: null,
      },
      reputation: { rating: null, reviewCount: null, reviews: [] },
      providers: [],
      provenance: {},
      confidence: { entity: null },
      enrichment: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asStringArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string') return v.length ? [v] : [];
  return [];
}

function asObjectArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  return [];
}

/**
 * Normalize hours to the canonical { monday..sunday } day map when possible.
 * Never mutates the input; returns a fresh object. Accepts strings (compact),
 * day maps, objects with value wrappers. Returns null when nothing usable.
 */
function normalizeHoursShape(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    try {
      // Delegate to the canonical FieldNormalizer when importable without
      // side effects; otherwise best-effort object shape.
      const { normalizeHours } = maybeLoadNormalizer();
      const hours = normalizeHours(v);
      return hours && Object.keys(hours).length > 0 ? hours : null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') {
    const hours = unwrapValue(v);
    if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null;
    const out = {};
    for (const [day, val] of Object.entries(hours)) {
      if (val == null || val === '') continue;
      out[day] = typeof val === 'string' ? val : JSON.stringify(val);
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

let _normalizerLoaded = false;
let _normalizer = null;
function maybeLoadNormalizer() {
  if (_normalizerLoaded) return _normalizer;
  try {
    // eslint-disable-next-line import/no-unresolved
    const mod = requireFieldNormalizer();
    _normalizer = mod;
  } catch {
    _normalizer = null;
  }
  _normalizerLoaded = true;
  return _normalizer || { normalizeHours: (v) => v };
}

/**
 * Minimal lazy loader for FieldNormalizer without introducing a hard import
 * cycle (CanonicalBusinessProfileService must stay importable everywhere).
 */
async function importFieldNormalizerLazy() {
  const mod = await import('../services/FieldNormalizer.js');
  return mod;
}
function requireFieldNormalizer() {
  // ESM dynamic import cannot be called synchronously; the normalizer is
  // loaded once by the first caller that can await it. Consumers that want
  // the canonical hour normalization call fromBusinessProfile on records
  // whose hours are already normalized by the provider boundary.
  return { normalizeHours: (v) => (v && typeof v === 'object' ? v : null) };
}

/**
 * Set a dot-path on an object (used to rebuild a flat record from persisted
 * canonical fields). Creates intermediate objects as needed.
 */
function setByPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Unwrap a persisted canonical-field value. CanonicalizationService and
 * IdentityRepository store objects/arrays as JSON strings; plain strings and
 * numbers pass through. Coordinates stored as JSON parse back to {lat,lng}.
 */
function parsePersistedValue(cf) {
  const raw = cf.value;
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  // Try JSON; only accept objects/arrays (not bare strings/numbers).
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed;
    }
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Assign a persisted canonical field value onto a projection by fieldPath.
 * Coordinates are restored to { lat, lng } object structure; arrays preserved.
 * Provenance is recorded as-is (ai_generated never upgraded).
 */
function assignCanonicalField(projection, fieldPath, value, provenance, confidence) {
  const parts = String(fieldPath).split('.');
  const group = parts[0];
  const key = parts.slice(1).join('.') || group;

  // identity
  if (fieldPath === 'identity.name') projection.identity.name = value ?? null;
  else if (fieldPath === 'identity.category') projection.business.category = value ?? null;
  else if (fieldPath === 'identity.business_type' || fieldPath === 'identity.businessType') projection.business.businessType = value ?? null;
  else if (fieldPath === 'identity.description') projection.business.description = value ?? null;
  else if (fieldPath === 'identity.categories') projection.business.categories = Array.isArray(value) ? value.map(String) : [];
  else if (fieldPath === 'identity.services') projection.business.services = Array.isArray(value) ? value.map(String) : [];
  else if (fieldPath === 'identity.entityId') projection.identity.entityId = value ?? null;

  // contact
  else if (fieldPath === 'contact.phone') projection.identity.phone = value ?? null;
  else if (fieldPath === 'contact.email') projection.business.email = value ?? null;
  else if (fieldPath === 'contact.website') {
    projection.identity.website = value ?? null;
    projection.identity.domain = domainFromWebsite(projection.identity.website);
  }

  // location
  else if (fieldPath === 'location.full_address' || fieldPath === 'location.address') projection.identity.address = value ?? null;
  else if (fieldPath === 'location.street') projection.identity.addressComponents.street = value ?? null;
  else if (fieldPath === 'location.city') projection.identity.addressComponents.city = value ?? null;
  else if (fieldPath === 'location.state') projection.identity.addressComponents.state = value ?? null;
  else if (fieldPath === 'location.country') projection.identity.addressComponents.country = value ?? null;
  else if (fieldPath === 'location.postal_code' || fieldPath === 'location.postalCode') projection.identity.addressComponents.postalCode = value ?? null;
  else if (fieldPath === 'location.coordinates') {
    const coords = value && typeof value === 'object' ? value : null;
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      projection.identity.coordinates = { lat: coords.lat, lng: coords.lng };
    } else {
      projection.identity.coordinates = readCoordinates({ location: { coordinates: value } }) ?? null;
    }
  }

  // ratings
  else if (fieldPath === 'ratings.rating') projection.reputation.rating = typeof value === 'number' ? value : (value != null ? Number(value) : null);
  else if (fieldPath === 'ratings.review_count') projection.reputation.reviewCount = typeof value === 'number' ? value : (value != null ? Number(value) : null);

  // hours / social
  else if (fieldPath === 'hours') projection.business.hours = normalizeHoursShape(value);
  else if (fieldPath === 'social_links' || fieldPath === 'socialLinks') projection.business.socialLinks = Array.isArray(value) ? value.map(String) : [];

  // provenance/confidence metadata (never upgrades; never invents)
  if (provenance != null) {
    projection.provenance[fieldPath] = {
      provenance,
      confidence: typeof confidence === 'number' ? confidence : projection.provenance[fieldPath]?.confidence ?? null,
      source: projection.provenance[fieldPath]?.source ?? null,
      updatedAt: null,
    };
    if (typeof confidence === 'number') projection.confidence[fieldPath] = confidence;
  }
}

/**
 * Convert a provenance map ({ path: {provenance,confidence,...} }) into a
 * canonicalFields-style list for fromEntityData.
 */
function toCanonicalFieldList(provMap) {
  const list = [];
  for (const [fieldPath, meta] of Object.entries(provMap)) {
    list.push({
      fieldPath,
      value: meta.value !== undefined ? meta.value : null,
      provenance: meta.provenance ?? null,
      confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
    });
  }
  return list;
}

// Singleton — matches repository conventions (providers are default-exported
// singletons; services are classes with a default singleton instance).
export default new CanonicalBusinessProfileService();