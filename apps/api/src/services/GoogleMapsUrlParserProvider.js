/**
 * GoogleMapsUrlParserProvider
 * 
 * Parses Google Maps URLs ONLY.
 * - Never makes network requests to Google.
 * - Never calls a Google API.
 * - Never discovers business metadata.
 * 
 * Only extracts identifiers explicitly encoded in the URL:
 * - business name (from path)
 * - coordinates (from URL params)
 * - CID/place identifier (from URL params or path)
 * - query string (for search URLs)
 */

import { normalizeUrl as canonicalNormalizeUrl } from '../utils/urlNormalizer.js';

class GoogleMapsUrlParserProvider {
  /**
   * Validate if URL is a Google Maps URL
   * @param {string} url - URL to validate
   * @returns {boolean}
   */
  static validateGoogleMapsUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
    try {
      const parsed = new URL(trimmed);
      const validHostnames = [
        'maps.google.com',
        'www.google.com',
        'google.com',
        'goo.gl',
        'maps.app.goo.gl',
        'maps.googleapis.com',
        'www.google.co.uk',
        'www.google.de',
        'www.google.fr',
        'www.google.ca',
        'www.google.com.au',
        'google.co.uk',
        'google.de',
        'google.fr',
        'google.ca',
        'google.com.au',
      ];
      return validHostnames.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    } catch {
      return false;
    }
  }

  /**
   * Extract place ID from Google Maps URL
   * Supports:
   * - place_id query parameter (standard Place ID: ChIJ...)
   * - CID in query parameter (cid:...)
   * - Place ID in /data/ path (ChIJ... or 0x...:0x... format)
   * - query parameter (for search URLs - returns null, not synthetic ID)
   * @param {string} url - Google Maps URL
   * @returns {string|null} Place ID or CID, or null if not extractable
   */
  static extractPlaceId(url) {
    try {
      const parsed = new URL(url);
      
      // 1. Check for explicit place_id parameter (ChIJ... format)
      let placeId = parsed.searchParams.get('place_id') || parsed.searchParams.get('query_place_id');
      if (placeId) return placeId;
      
      // 2. Check for CID in query parameter
      const cid = parsed.searchParams.get('cid');
      if (cid) return `cid:${cid}`;
      
      // 3. Extract from /data/ path - supports both ChIJ... and 0x...:0x... formats
      // Pattern: !1s<place_id> where place_id can be ChIJ... or 0x...:0x...
      // Find ALL !1s occurrences and validate each
      const allMatches = url.matchAll(/!1s([^!&]+)/g);
      for (const match of allMatches) {
        const candidate = match[1];
        // Validate it's a legitimate place ID format (ChIJ... or 0x...:0x...)
        if (this.isValidPlaceIdFormat(candidate)) {
          return candidate;
        }
      }
      
      // 4. For search URLs with query parameter - DO NOT create synthetic placeId
      // Return null to indicate no extractable place ID
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate if a string is a legitimate Google Place ID format
   * - ChIJ... format (standard Place ID)
   * - 0x...:0x... format (CID/Place ID in data path)
   * @param {string} candidate - String to validate
   * @returns {boolean}
   */
  static isValidPlaceIdFormat(candidate) {
    if (!candidate || typeof candidate !== 'string') return false;
    
    // Standard Google Place ID format: ChIJ followed by base64-like chars
    if (candidate.startsWith('ChIJ') && candidate.length >= 27) {
      return true;
    }
    
    // CID format: 0x<hex>:0x<hex> (e.g., 0x390feb5b7b7b7b7b:0x1234567890abcdef)
    const cidRegex = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;
    if (cidRegex.test(candidate)) {
      return true;
    }
    
    return false;
  }

  /**
   * Extract place name from URL path
   * @param {string} url - Google Maps URL
   * @returns {string|null} Place name or null
   */
  static extractPlaceName(url) {
    try {
      const parsed = new URL(url);
      const placeMatch = parsed.pathname.match(/\/(?:place|search)\/([^/]+)/i);
      return placeMatch ? decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ') : null;
    } catch {
      return null;
    }
  }

  /**
   * Extract coordinates from URL
   * @param {string} url - Google Maps URL
   * @returns {Object|null} { lat, lng } or null
   */
  static extractCoordinates(url) {
    try {
      const parsed = new URL(url);
      
      // Check @lat,lng,zoom format in path
      const coordMatch = parsed.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        return {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2]),
        };
      }
      
      // Check query params
      const lat = parsed.searchParams.get('lat') || parsed.searchParams.get('ll')?.split(',')[0];
      const lng = parsed.searchParams.get('lng') || parsed.searchParams.get('ll')?.split(',')[1];
      
      if (lat && lng) {
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract query string from search URLs
   * @param {string} url - Google Maps URL
   * @returns {string|null} Query string or null
   */
  static extractQuery(url) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.includes('/search/')) {
        return parsed.searchParams.get('query') || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Normalize Google Maps URL for consistent caching.
   *
   * Uses the SINGLE canonical URL normalizer (urlNormalizer) shared with
   * SourceCache so the cache key and the provider-derived normalized URL always
   * agree. Tracking parameters (utm_*, ref, fbclid, gclid…) are stripped,
   * fragments dropped, www./google.com maps hosts folded to maps.google.com,
   * and legitimate query parameters (place_id, query, cid, hl, q…) are
   * preserved and deterministically ordered. Idempotent.
   * @param {string} url - Google Maps URL
   * @returns {string} Normalized URL
   */
  static normalizeUrl(url) {
    try {
      return canonicalNormalizeUrl(url);
    } catch {
      return url;
    }
  }

  /**
   * Parse a Google Maps URL and return all identifiable hints
   * These are ONLY discovery hints - NOT verified business data
   * @param {string} url - Google Maps URL
   * @returns {Object} Parsed identifiers with provenance
   */
  static parse(url) {
    if (!this.validateGoogleMapsUrl(url)) {
      throw new Error('Invalid Google Maps URL');
    }

    const placeId = this.extractPlaceId(url);
    const placeName = this.extractPlaceName(url);
    const coordinates = this.extractCoordinates(url);
    const query = this.extractQuery(url);
    const normalizedUrl = this.normalizeUrl(url);

    // Determine URL type
    let urlType = 'unknown';
    if (url.includes('/place/')) urlType = 'place';
    else if (url.includes('/search/')) urlType = 'search';
    else if (url.includes('/maps/')) urlType = 'maps';

    return {
      // IDENTIFIED: These are hints extracted directly from the URL
      identified: {
        placeId,
        placeName,
        coordinates,
        query,
        urlType,
      },
      // Provenance tracking
      provenance: {
        source: 'google_maps_url',
        sourceUrl: url,
        normalizedUrl,
        parsedAt: new Date().toISOString(),
      },
    };
  }
}

export default GoogleMapsUrlParserProvider;
