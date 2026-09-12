/**
 * urlNormalizer — single canonical source-URL normalization path (Phase 20)
 *
 * ONE authoritative URL normalizer shared by SourceCache (cache-key computation)
 * and GoogleMapsUrlParserProvider.normalizeUrl(). This is what guarantees that
 * a URL stored under one spelling is found under its canonical equivalent.
 *
 * Guarantees:
 *   - deterministic: the same logical source always yields the same string
 *   - idempotent:    normalize(normalize(url)) === normalize(url)
 *   - tracking-only differences never change the key (utm_*, ref, fbclid, gclid…)
 *   - legitimate query parameters are PRESERVED (they can materially identify
 *     the source) but are re-ordered deterministically
 *   - URL fragments never affect the key
 *   - www. host prefix is normalized
 *   - Google Maps paths served from a www.google.com/google.com host normalize
 *     to maps.google.com (the canonical Maps host)
 *   - trailing slashes are normalized (except the bare origin)
 *
 * Tracking parameters are removed because they identify the *traffic*, not the
 * *source*; two otherwise-identical URLs that differ only in a utm_* value are
 * the same logical source and MUST map to the same cache key.
 */

import { URL } from 'node:url';

// Analytics / tracking-only query parameters that never identify the source.
// utm_* is matched by prefix; the rest are exact matches.
const TRACKING_PARAM_EXACT = new Set([
  'ref',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'yclid',
  'igshid',
  '_openstat',
  'vero_id',
  'wickedid',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  's_cid',
  'ml_subscriber',
  'ml_subscriber_hash',
  // Google Maps session/tracking parameters. `entry` and `g_ep` carry Google
  // Maps share/session state (e.g. which entry point opened the map) — they
  // identify the traffic, not the source, and must never affect cache keys.
  'entry',
  'g_ep',
]);

function isTrackingParam(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith('utm_')) return true;
  return TRACKING_PARAM_EXACT.has(lower);
}

// Hosts that serve Google Maps and should be treated as the canonical Maps host.
const GOOGLE_MAPS_HOSTS = new Set(['maps.google.com', 'www.google.com', 'google.com']);
// Paths that indicate a Google Maps page.
const GOOGLE_MAPS_PATH = /^\/(maps|place|search)(\/|$)/i;

/**
 * Canonicalize a source URL to its deterministic cache-key form.
 *
 * @param {string} input
 * @returns {string} normalized URL string (unchanged input on parse failure)
 */
export function normalizeUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') return input;

  const trimmed = input.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not a parseable URL — return deterministically as-is so callers never crash.
    return trimmed;
  }

  // 1. Drop URL fragment (never identifies the source).
  parsed.hash = '';

  // 2. Canonicalize host.
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('www.')) {
    host = host.slice(4);
  }
  // Google Maps README: www.google.com/google.com serving /maps, /place, /search
  // are the same Maps pages hosted on maps.google.com.
  if (GOOGLE_MAPS_HOSTS.has(host) && GOOGLE_MAPS_PATH.test(parsed.pathname)) {
    host = 'maps.google.com';
  }
  if (parsed.hostname !== host) {
    parsed.hostname = host;
  }

  // 3. Remove tracking-only params, then re-sort the rest deterministically.
  const keep = new Map();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (isTrackingParam(key)) continue;
    const k = key.toLowerCase();
    const stored = keep.get(k);
    if (stored === undefined) {
      keep.set(k, [value]);
    } else {
      stored.push(value);
    }
  }
  const sortedKeys = [...keep.keys()].sort();
  parsed.search = '';
  for (const key of sortedKeys) {
    const values = keep.get(key).sort();
    for (const value of values) {
      parsed.searchParams.append(key, value);
    }
  }

  // 4. Normalize trailing slash (keep the bare origin's "/").
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

export default normalizeUrl;
