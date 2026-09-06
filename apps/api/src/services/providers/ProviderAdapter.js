/**
 * ProviderAdapter
 *
 * Boundary between provider-specific response structures and Webloom's
 * canonical business-data format.
 *
 * The rest of the application must NOT see Geoapify-specific fields
 * (properties.place_id, geometry.coordinates, categories[], etc.). This
 * adapter converts a provider response into the flat canonical profile shape
 * that BusinessResearchService already consumes:
 *
 * {
 *   business:  { name, category, categories, description, business_type },
 *   contact:   { phone, email, website },
 *   location:  { full_address, street, city, state, country, postal_code,
 *                latitude, longitude, coordinates },
 *   ratings:   { rating, review_count },
 *   hours:     { monday..sunday },
 *   services:  [],
 *   source_urls: [],
 *   provider:  { name, placeId },
 *   confidence: {...}  // field-level
 * }
 *
 * Field-level confidence and provenance ("geoapify") are attached here so
 * downstream code can trust high-confidence structured data over AI guesses.
 *
 * PHASE 20: hours normalization is delegated to the ONE canonical
 * implementation in FieldNormalizer (normalizeHours). This eliminates the
 * duplicate adapter-level hours parser and ITS inconsistent weekday indexing
 * (the adapter used 0=Monday while FieldNormalizer uses 0=Sunday). Numeric
 * provider weekday values are converted ONCE here via the canonical
 * normalizeHours (0=Sunday..6=Saturday; 7 is also accepted and mapped to
 * Sunday for 1=Monday..7=Sunday provider conventions).
 */

import { normalizeHours as normalizeHoursCanonical } from '../FieldNormalizer.js';

/**

/**
 * Map a single Geoapify Places feature into the canonical flat profile shape.
 * Returns null if the feature carries no usable identity.
 *
 * @param {Object} feature - GeoJSON feature from Geoapify /v2/places
 * @returns {Object|null} canonical flat profile (merge-able by BusinessProfile/ResearchService)
 */
export function mapGeoapifyFeatureToProfile(feature) {
  if (!feature || !feature.properties) return null;

  const p = feature.properties;

  // Coordinates come in two shapes:
  //  - place-details: properties.lat / properties.lon
  //  - places / geocode-feature: geometry.coordinates = [lng, lat]
  const geomCoords = feature.geometry?.coordinates; // Geoapify returns [lng, lat]
  const latitude =
    typeof p.lat === 'number' ? p.lat :
    Array.isArray(geomCoords) && typeof geomCoords[1] === 'number' ? geomCoords[1] : null;
  const longitude =
    typeof p.lon === 'number' ? p.lon :
    Array.isArray(geomCoords) && typeof geomCoords[0] === 'number' ? geomCoords[0] : null;

  const name = p.name || p.address_line1 || null;
  if (!name) return null; // no usable identity

  // Category: place-details / places return categories as a hierarchical
  // array like ["commercial", "commercial.food_and_drink", "commercial.food_and_drink.bakery"].
  // Prefer the most specific commercial.* entry as the primary category.
  const categories = Array.isArray(p.categories) ? p.categories : [];
  const commercialCats = categories.filter((c) => typeof c === 'string' && c.startsWith('commercial.'));
  const primaryCategory = commercialCats[commercialCats.length - 1] || commercialCats[0] || categories[0] || p.commercial?.type || null;

  // Phone: place-details nests it under contact.phone;
  // other endpoints may return international_phone / phone / contact_phone.
  const phone =
    p.contact?.phone ||
    p.international_phone ||
    p.phone ||
    p.contact_phone ||
    null;

  const website = p.website || p.url || null;

  const fullAddress =
    p.formatted ||
    [p.address_line1, p.address_line2].filter(Boolean).join(', ') ||
    null;

  const hours = normalizeHours(p.opening_hours);

  // NOTE: Geoapify does NOT reliably return rating / review counts for these
  // data sources. Capture only if present; leave null otherwise — do NOT fabricate.
  const rating =
    typeof p.rating === 'number' ? p.rating :
    typeof p.rating?.value === 'number' ? p.rating.value : null;
  const reviewCount =
    typeof p.review_count === 'number' ? p.review_count :
    typeof p.reviews === 'number' ? p.reviews :
    typeof p.rating?.number_of_reviews === 'number' ? p.rating.number_of_reviews : null;

  const confidence = {
    overall: 0.9,
    name: name ? 0.98 : 0,
    category: primaryCategory ? 0.9 : 0,
    phone: phone ? 0.95 : 0,
    website: website ? 0.9 : 0,
    address: fullAddress ? 0.95 : 0,
    rating: rating != null ? 0.9 : 0,
  };

  return {
    business: {
      name,
      category: primaryCategory,
      categories,
      description: p.description || null,
      business_type: primaryCategory || null,
    },
    contact: {
      phone,
      email: p.email || p.contact?.email || null,
      website,
    },
    location: {
      full_address: fullAddress,
      street: p.street || p.address_line1 || null,
      city: p.city || p.district || null,
      state: p.state || p.county || null,
      country: p.country || null,
      postal_code: p.postcode || null,
      latitude,
      longitude,
      coordinates: latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
    },
    ratings: {
      rating,
      review_count: reviewCount,
    },
    hours,
    services: categories,
    social_links: Array.isArray(p.social_links) ? p.social_links : [],
    source_urls: [],
    provider: {
      name: 'geoapify',
      placeId: p.place_id || null,
      datasource: p.datasource || null,
    },
    confidence,
  };
}

/**
 * Normalize Geoapify opening_hours into the canonical { monday..sunday } map.
 *
 * PHASE 20: THIS IS A DELEGATION to the ONE authoritative implementation in
 * FieldNormalizer (normalizeHours). The previous adapter-local implementation
 * used 0=Monday indexing for array-form day_of_week while FieldNormalizer
 * used 0=Sunday — an inconsistent weekday convention that could shift every
 * day of the week. All provider hours now flow through the single canonical
 * normalizer so weekday semantics are identical everywhere.
 *
 * Numeric day_of_week semantics (documented, canonical):
 *   0 = Sunday, 1 = Monday, ..., 6 = Saturday, 7 = Sunday (1=Monday..7=Sunday)
 *
 * @param {*} openingHours - Geoapify opening_hours (string / map / array / JSON)
 * @returns {Object} { monday..sunday } canonical map
 */
export function normalizeHours(openingHours) {
  // Geoapify numeric day_of_week convention: 0 = Monday .. 6 = Sunday.
  // The canonical FieldNormalizer uses 0 = Sunday. Per Phase 20 requirement #9
  // ("If numeric provider values are accepted, conversion must happen ONCE at
  // the provider boundary"), convert Geoapify's numeric array form to named
  // days HERE, then delegate the remaining shapes to the canonical normalizer.
  if (Array.isArray(openingHours)) {
    const can = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };
    const GEOPIFY_0_MONDAY = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const entry of openingHours) {
      const idx = entry?.day_of_week;
      if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;
      const day = GEOPIFY_0_MONDAY[idx]; // 0 = Monday (Geoapify)
      const start = entry?.start_time ?? entry?.open ?? entry?.from ?? null;
      const end = entry?.end_time ?? entry?.close ?? entry?.to ?? null;
      if (start && end) {
        const range = `${String(start).trim()}-${String(end).trim()}`;
        can[day] = can[day] ? `${can[day]}, ${range}` : range;
      } else if (start) {
        can[day] = String(start).trim();
      }
    }
    const named = {};
    for (const [day, value] of Object.entries(can)) {
      if (value != null) named[day] = value;
    }
    return named;
  }

  // All other shapes (map / compact string / JSON) → canonical normalizer.
  return normalizeHoursCanonical(openingHours);
}

/**
 * Parse a compact opening-hours string ("Mo-Su 07:30-18:00") into the
 * canonical day map. Delegates to the canonical parser (backward-compatible
 * alias).
 */
export function parseHoursString(str) {
  return normalizeHoursCanonical(str);
}

/**
 * Expand a day token ("Mo-Su", "Mo", "Sa-Su") into canonical day names.
 * (Kept for backward compatibility; rarely needed now that FieldNormalizer
 * handles compact strings directly.)
 */
export function expandDayToken(token) {
  const DAY_ABBR_LOCAL = {
    Mo: 'monday', Tu: 'tuesday', We: 'wednesday', Th: 'thursday',
    Fr: 'friday', Sa: 'saturday', Su: 'sunday',
  };
  const DAY_ORDER_LOCAL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dash = token.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
  let days = [];
  if (dash) {
    const start = DAY_ABBR_LOCAL[dash[1]];
    const end = DAY_ABBR_LOCAL[dash[2]];
    if (start && end) {
      const si = DAY_ORDER_LOCAL.indexOf(start);
      const ei = DAY_ORDER_LOCAL.indexOf(end);
      const step = si <= ei ? 1 : -1;
      for (let i = si; step > 0 ? i <= ei : i >= ei; i += step) days.push(DAY_ORDER_LOCAL[i]);
    }
  } else if (DAY_ABBR_LOCAL[token]) {
    days = [DAY_ABBR_LOCAL[token]];
  }
  return days;
}

/**
 * Extract deterministic (LEVEL 1) hints from raw input — business name,
 * city/locality, and coordinates that Webloom already has from a
 * Google Maps URL or user input. These are used to seed Geoapify search.
 *
 * @param {Object} input - { googleMapsUrl?, name?, city?, state?, country?, latitude?, longitude? }
 * @returns {Object} normalized hints { name, city, state, country, latitude, longitude, query }
 */
export function extractDeterministicHints(input = {}) {
  const hints = {
    name: null,
    city: null,
    state: null,
    country: null,
    latitude: null,
    longitude: null,
    query: null,
  };

  const name = input.name || input.businessName || null;
  const city = input.city || input.locality || null;
  const latitude = typeof input.latitude === 'number' ? input.latitude : null;
  const longitude = typeof input.longitude === 'number' ? input.longitude : null;

  // If location object bundled
  if (!latitude && input.location?.coordinates?.lat != null) {
    hints.latitude = input.location.coordinates.lat;
  }
  if (!longitude && input.location?.coordinates?.lng != null) {
    hints.longitude = input.location.coordinates.lng;
  }
  if (!city && input.location?.city) hints.city = input.location.city;
  if (!hints.state && input.location?.state) hints.state = input.location.state;
  if (!hints.country && input.location?.country) hints.country = input.location.country;

  hints.name = name;
  hints.city = city;
  hints.latitude = hints.latitude ?? latitude;
  hints.longitude = hints.longitude ?? longitude;

  const parts = [name, city].filter(Boolean);
  hints.query = parts.join(' ') || null;

  return hints;
}

export default {
  mapGeoapifyFeatureToProfile,
  extractDeterministicHints,
  normalizeHours,
  parseHoursString,
  expandDayToken,
};
