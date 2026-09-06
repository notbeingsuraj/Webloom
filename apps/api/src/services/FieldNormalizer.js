/**
 * FieldNormalizer — Phase 20 data normalization hardening
 *
 * Systematic, reusable normalization for the values that cross the boundaries:
 *
 *   provider → observation → canonicalization → BusinessProfile → intelligence
 *   → strategy → website generation → API response
 *
 * Goals:
 *  - never allow literal "[object Object]" to be persisted or rendered
 *  - never allow an object/array to be accidentally stringified into "{...}" /
 *    "[...]" when a structured value is expected
 *  - normalize semantically-equivalent values (hours in different shapes,
 *    coordinates as strings vs numbers, categories as arrays vs JSON strings,
 *    phone formats, URL hostname casing) so equal data does not create fake
 *    conflicts in the canonicalization layer
 *  - always preserve raw observations; normalization is applied at merge /
 *    comparison boundaries
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export function stripObjectToString(value) {
  // Detect a literal "[object Object]" (or "[object Array]") string produced
  // by accidental template/interpolated coercion.
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '[object Object]' || t === '[object Array]') return null;
  }
  return value;
}

/**
 * If value is a JSON string that parses to an object/array, parse it.
 * If it is already an object/array, return it unchanged.
 * Otherwise return the original value.
 */
export function parseStringifiedStructure(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (!t) return value;
  if (t[0] === '{' || t[0] === '[') {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') return parsed;
      return value;
    } catch {
      return value;
    }
  }
  return value;
}

export function isNonEmptyObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

export function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/**
 * Normalize a coordinates value into { lat, lng } with numeric parts.
 * Accepts:
 *   - { lat, lng } / { latitude, longitude } (numbers or numeric strings)
 *   - [lng, lat] (GeoJSON order)
 *   - "37.7, -122.4" / "37.7 -122.4" string form
 * Returns null when not a valid coordinate pair.
 */
export function normalizeCoordinates(value) {
  if (!value) return null;
  let lat = null;
  let lng = null;

  if (Array.isArray(value)) {
    // GeoJSON [lng, lat]
    if (value.length >= 2) {
      lng = Number(value[0]);
      lat = Number(value[1]);
    }
  } else if (typeof value === 'object') {
    const latRaw = value.lat ?? value.latitude;
    const lngRaw = value.lng ?? value.longitude;
    // Explicit null checks: don't coerce null to 0
    if (latRaw == null || lngRaw == null) return null;
    lat = Number(latRaw);
    lng = Number(lngRaw);
  } else if (typeof value === 'string') {
    const nums = value
      .replace(/[\[\]()]/g, '')
      .split(/[,\s;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (nums.length >= 2) {
      lat = nums[0];
      lng = nums[1];
    }
  }

  if (
    lat == null || lng == null ||
    Number.isNaN(lat) || Number.isNaN(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180
  ) {
    return null;
  }

  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Categories / arrays / strings
// ---------------------------------------------------------------------------

/**
 * Normalize categories into a string[] of non-empty trimmed strings.
 * Accepts arrays, JSON-stringified arrays, semicolon/comma-separated strings.
 */
export function normalizeCategories(value) {
  if (value == null) return [];
  const parsed = parseStringifiedStructure(value);
  if (Array.isArray(parsed)) {
    return [...new Set(parsed.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()))];
  }
  if (typeof parsed === 'string') {
    return [...new Set(parsed.split(/[,;]/).map((c) => c.trim()).filter(Boolean))];
  }
  return [];
}

/**
 * Normalize services into a string[] (deduplicated).
 */
export function normalizeServices(value) {
  if (value == null) return [];
  const parsed = parseStringifiedStructure(value);
  if (Array.isArray(parsed)) {
    return [...new Set(parsed.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))];
  }
  if (typeof parsed === 'string') {
    return [...new Set(parsed.split(/[,;]/).map((s) => s.trim()).filter(Boolean))];
  }
  return [];
}

/**
 * Normalize social links into a string[] of valid http(s) URLs.
 */
export function normalizeSocialLinks(value) {
  if (value == null) return [];
  const parsed = parseStringifiedStructure(value);
  const list = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : [];
  return [...new Set(
    list
      .map((s) => {
        try {
          const u = new URL(String(s).trim());
          return /^https?:$/.test(u.protocol) ? u.href : null;
        } catch { return null; }
      })
      .filter(Boolean)
  )];
}

// ---------------------------------------------------------------------------
// Phone / URL
// ---------------------------------------------------------------------------

/**
 * Normalize phone to a canonical E.164-ish string (+1XXXXXXXXXX).
 * When the value is not parseable, return null (never persist junk).
 */
export function normalizePhone(value) {
  if (!value) return null;
  const parsed = parseStringifiedStructure(value);
  const raw = typeof parsed === 'string' ? parsed : String(value);
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    const d = digits.slice(1);
    if (d.length >= 9 && d.length <= 15) return '+' + d;
    return null;
  }
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length >= 9 && digits.length <= 15) return '+' + digits;
  return null;
}

/**
 * Normalize a website URL to a canonical absolute https URL (or null).
 */
export function normalizeWebsite(value) {
  if (!value) return null;
  const parsed = parseStringifiedStructure(value);
  const raw = typeof parsed === 'string' ? parsed.trim() : String(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = ''; // strip fragment
    return url.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hours — deterministic normalization
// ---------------------------------------------------------------------------

// Canonical day order.
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Common day aliases → canonical key.
const DAY_ALIASES = {
  mon: 'monday', monday: 'monday', mo: 'monday',
  tue: 'tuesday', tues: 'tuesday', tuesday: 'tuesday', tu: 'tuesday',
  wed: 'wednesday', wednesday: 'wednesday', we: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', thursday: 'thursday', th: 'thursday',
  fri: 'friday', friday: 'friday', fr: 'friday',
  sat: 'saturday', saturday: 'saturday', sa: 'saturday',
  sun: 'sunday', sunday: 'sunday', su: 'sunday',
};

const DAY_NUM_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Normalize a single day's hours value into a canonical string or null.
 *   "09:00-17:00"            → "09:00-17:00"
 *   ["09:00-12:00","13:00-17:00"] → "09:00-12:00, 13:00-17:00"
 *   {open:"09:00", close:"17:00"} → "09:00-17:00"
 *   {from:"09:00", to:"17:00"}    → "09:00-17:00"
 *   "closed" / null / ""          → null (absent)
 */
export function normalizeHoursValue(value) {
  if (value == null) return null;
  const stripped = stripObjectToString(value);
  if (stripped == null) return null;

  // Already a plain string.
  if (typeof stripped === 'string') {
    const t = stripped.trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    if (lower === 'closed' || lower === 'off' || lower === 'off day' || lower === 'day off') return 'closed';
    return t;
  }

  // Array of ranges or interval objects.
  if (Array.isArray(stripped)) {
    const parts = stripped
      .map((entry) => {
        if (typeof entry === 'string') {
          const s = entry.trim();
          return s || null;
        }
        if (entry && typeof entry === 'object') {
          const open = entry.open ?? entry.from ?? entry.start ?? entry.start_time ?? entry.opens ?? null;
          const close = entry.close ?? entry.to ?? entry.end ?? entry.end_time ?? entry.closes ?? null;
          if (open && close) return `${String(open).trim()}-${String(close).trim()}`;
          if (open) return String(open).trim();
        }
        return null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }

  // Interval object.
  if (typeof stripped === 'object') {
    const open = stripped.open ?? stripped.from ?? stripped.start ?? stripped.start_time ?? null;
    const close = stripped.close ?? stripped.to ?? stripped.end ?? stripped.end_time ?? null;
    if (open && close) return `${String(open).trim()}-${String(close).trim()}`;
    if (open) return String(open).trim();
    return null;
  }

  return null;
}

/**
 * Normalize an hours value (any supported shape) into the canonical
 * { monday: "09:00-17:00", ... } map. Deterministic.
 *
 * Supported inputs:
 *   - { monday: ..., tuesday: ... }               (map; values may be string,
 *     array, or interval object)
 *   - [{ day_of_week: 0|1.., start_time, end_time }] (array form)
 *   - [{ day: "Monday", open, close }]             (array form with names)
 *   - "Mo-Su 07:30-18:00"                          (compact string form)
 *   - "Monday: 09:00-17:00, Tuesday: closed"       (label string form)
 *   - JSON string containing any of the above
 */
export function normalizeHours(value) {
  const input = parseStringifiedStructure(value);
  const out = {};
  if (input == null) return out;

  // Compact range string: "Mo-Su 07:30-18:00", "Mo-Fr 08:00-17:00, Sa 09:00-14:00"
  if (typeof input === 'string') {
    return normalizeHoursString(input);
  }

  // Array form.
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      let dayKey = null;
      // numeric day_of_week (0=Sunday..6=Saturday, or 1=Monday..7=Sunday)
      const dow = entry.day_of_week ?? entry.dayOfWeek ?? null;
      if (typeof dow === 'number' && dow >= 0 && dow <= 7) {
        dayKey = DAY_NUM_NAMES[dow % 7];
      } else if (typeof dow === 'string') {
        const lower = dow.toLowerCase().trim();
        dayKey = DAY_ALIASES[lower] || null;
        if (!dayKey && lower.startsWith('day')) dayKey = DAY_ALIASES[lower.slice(3)] || null;
      }
      // name-based entries: { day: "monday" }
      if (!dayKey && (entry.day || entry.name)) {
        dayKey = DAY_ALIASES[String(entry.day || entry.name).toLowerCase().trim()] || null;
      }
      if (!dayKey) continue;
      const range = normalizeHoursValue(entry);
      if (range != null) {
        // Multiple intervals per day → append comma-separated.
        if (out[dayKey]) out[dayKey] = `${out[dayKey]}, ${range}`;
        else out[dayKey] = range;
      }
    }
    return out;
  }

  // Map form: { monday: "09:00-17:00" } or { monday: {open, close} }
  if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      const lower = key.toLowerCase().trim();
      let dayKey = DAY_ALIASES[lower] || null;
      if (!dayKey && lower.startsWith('day')) dayKey = DAY_ALIASES[lower.slice(3)] || null;
      if (!dayKey) continue;
      const range = normalizeHoursValue(value);
      if (range != null) out[dayKey] = range;
    }
    return out;
  }

  return out;
}

/**
 * Normalize a compact/day-range string into { monday: ... }.
 *
 * Examples:
 *   "Mo-Su 07:30-18:00"
 *   "Mo-Fr 08:00-17:00, Sa 09:00-14:00"
 *   "Monday: 09:00-17:00, Tuesday: closed"
 */
export function normalizeHoursString(str) {
  const out = {};
  if (!str || typeof str !== 'string') return out;
  const trimmed = str.trim();
  if (!trimmed) return out;

  const DAY_ABBR = { Mo: 'monday', Tu: 'tuesday', We: 'wednesday', Th: 'thursday', Fr: 'friday', Sa: 'saturday', Su: 'sunday' };
  const DAY_NAME = { Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday', Thursday: 'thursday', Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday' };

  // Label form: "Monday: 09:00-17:00, Tuesday: closed"
  const labelRe = /([A-Za-z]+):\s*([^,]+)/g;
  let labelMatch;
  let matchedLabel = false;
  while ((labelMatch = labelRe.exec(trimmed)) !== null) {
    matchedLabel = true;
    const day = DAY_NAME[labelMatch[1].trim()];
    if (!day) continue;
    const v = labelMatch[2].trim();
    out[day] = /closed|off/i.test(v) ? 'closed' : v;
  }
  if (matchedLabel) return out;

  // Compact range form: "Mo-Su 07:30-18:00", "Mo-Fr 08:00-17:00, Sa 09:00-14:00"
  const segments = trimmed.split(/,(?![^()]*\))/);
  for (const seg of segments) {
    const segTrim = seg.trim();
    const rangeMatch = segTrim.match(/([0-9]{1,2}:[0-9]{2})\s*-\s*([0-9]{1,2}:[0-9]{2})/);
    if (!rangeMatch) continue;
    const range = `${rangeMatch[1]}-${rangeMatch[2]}`;
    const dayPart = segTrim.replace(rangeMatch[0], '').trim();
    const dayMatches = dayPart.match(/(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?/g) || [];
    for (const dm of dayMatches) {
      const [d1, , d2] = dm.replace(/\s+/g, '').match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-([A-Za-z]{2}))?$/);
      const startIdx = DAY_ORDER.indexOf(DAY_ABBR[d1]);
      const endIdx = d2 ? DAY_ORDER.indexOf(DAY_ABBR[d2]) : startIdx;
      if (startIdx < 0 || endIdx < 0) continue;
      if (startIdx <= endIdx) {
        for (let i = startIdx; i <= endIdx; i++) {
          const day = DAY_ORDER[i];
          out[day] = out[day] ? `${out[day]}, ${range}` : range;
        }
      } else {
        // Wraps around (e.g. Su-Th)
        for (let i = startIdx; i < DAY_ORDER.length; i++) {
          const day = DAY_ORDER[i];
          out[day] = out[day] ? `${out[day]}, ${range}` : range;
        }
        for (let i = 0; i <= endIdx; i++) {
          const day = DAY_ORDER[i];
          out[day] = out[day] ? `${out[day]}, ${range}` : range;
        }
      }
    }
  }

  return out;
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Render hours map to a compact human-readable text for display.
 */
export function hoursToText(hours) {
  if (!hours || typeof hours !== 'object') return null;
  const lines = [];
  for (const day of DAY_ORDER) {
    const v = hours[day];
    if (v != null && v !== '') {
      lines.push(`${day[0].toUpperCase()}${day.slice(1, 3)}: ${v}`);
    }
  }
  return lines.length ? lines.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Generic field normalization dispatcher
// ---------------------------------------------------------------------------

const FIELD_NORMALIZERS = {
  'identity.categories': normalizeCategories,
  'identity.services': normalizeServices,
  'location.coordinates': normalizeCoordinates,
  'contact.phone': normalizePhone,
  'contact.website': normalizeWebsite,
  hours: normalizeHours,
  social_links: normalizeSocialLinks,
};

/**
 * Normalize a single profile field value by its dot-path.
 * Falls back to structured-preservation (un-stringify) for unknown fields.
 *
 * @param {string} path - e.g. 'identity.categories' | 'hours' | 'contact.phone'
 * @param {*} value - raw value from a provider record
 * @returns {*} normalized value (or null/[] for empty equivalents)
 */
export function normalizeField(path, value) {
  if (value == null) return value;
  // Never allow literal "[object Object]" anywhere.
  if (typeof value === 'string' && (value.trim() === '[object Object]' || value.trim() === '[object Array]')) {
    return null;
  }
  const normalizer = FIELD_NORMALIZERS[path];
  if (normalizer) return normalizer(value);
  // Default: un-stringify JSON structures to keep arrays/objects structured.
  return parseStringifiedStructure(value);
}

export default {
  normalizeField,
  normalizeHours,
  normalizeHoursValue,
  normalizeHoursString,
  normalizeCategories,
  normalizeServices,
  normalizeCoordinates,
  normalizePhone,
  normalizeWebsite,
  normalizeSocialLinks,
  parseStringifiedStructure,
  stripObjectToString,
  hoursToText,
  DAYS,
};