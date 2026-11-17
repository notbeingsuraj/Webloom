/**
 * Google Maps URL Parser — Extracts identifiers from Google Maps URLs.
 * 
 * Supports:
 * - Place URLs: https://www.google.com/maps/place/Business+Name/@lat,lng,zoom
 * - Search URLs: https://www.google.com/maps/search/query
 * - Short URLs: https://maps.app.goo.gl/abc123
 * - CID-based URLs: https://www.google.com/maps/place/?cid=123456789
 * - Direct coordinates: @lat,lng
 * 
 * This parser does NOT make network requests - only extracts encoded identifiers.
 */

const PLACE_URL_PATTERN = /maps\.google\.com\/maps\/place\/|maps\.google\.com\/place\/|google\.com\/maps\/place\//i;
const SEARCH_URL_PATTERN = /maps\.google\.com\/maps\/search\/|maps\.google\.com\/search\/|google\.com\/maps\/search\//i;
const SHORT_URL_PATTERN = /maps\.app\.goo\.gl\//i;
const COORD_PATTERN = /@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,(\d+\.?\d*))?/;
const CID_PATTERN = /[?&]cid=([^&]+)/i;
const PLACE_ID_PATTERN = /[?&]place_id=([^&]+)/i;
const QUERY_PATTERN = /[?&]q=([^&]+)/i;
const QUERY_PATH_PATTERN = /\/search\/([^/?#]+)/i;
const PLACE_NAME_PATTERN = /\/place\/([^/@?#]+)/i;

export class GoogleMapsUrlParser {
  /**
   * Validate if a URL is a Google Maps URL.
   * 
   * @param {string} url 
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
        'maps.app.goo.gl',
        'goo.gl',
      ];
      return validHostnames.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
    } catch {
      return false;
    }
  }

  /**
   * Parse a Google Maps URL and extract all available identifiers.
   * 
   * @param {string} url 
   * @returns {Object} Parsed components
   */
  static parse(url) {
    if (!this.validateGoogleMapsUrl(url)) {
      throw new Error('Invalid Google Maps URL');
    }
    
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathname = parsed.pathname;
    const search = parsed.search;
    const hash = parsed.hash;
    
    const result = {
      originalUrl: url,
      urlType: 'unknown',
      isPlaceUrl: false,
      isSearchUrl: false,
      isShortUrl: false,
      
      // Identifiers
      placeId: null,
      cid: null,
      dataId: null,
      
      // Coordinates
      latitude: null,
      longitude: null,
      zoom: null,
      
      // Query/Search
      query: null,
      searchQuery: null,
      
      // Business name (from URL path)
      name: null,
      nameFromPath: null,
      
      // Full components
      pathname,
      search,
      hash,
      hostname,
    };
    
    // Detect URL type
    if (SHORT_URL_PATTERN.test(url)) {
      result.urlType = 'short';
      result.isShortUrl = true;
      // Short URLs need to be resolved to get actual data
      // We can only return the short URL itself
    } else if (PLACE_URL_PATTERN.test(url)) {
      result.urlType = 'place';
      result.isPlaceUrl = true;
      
      // Extract business name from path
      const nameMatch = pathname.match(PLACE_NAME_PATTERN);
      if (nameMatch) {
        result.nameFromPath = decodeURIComponent(nameMatch[1])
          .replace(/\+/g, ' ')
          .replace(/_/g, ' ')
          .trim();
        result.name = result.nameFromPath;
      }
      
      // Extract place_id from query params
      const placeIdMatch = search.match(PLACE_ID_PATTERN) || hash.match(PLACE_ID_PATTERN);
      if (placeIdMatch) {
        result.placeId = placeIdMatch[1];
      }
      
      // Extract CID from query params
      const cidMatch = search.match(CID_PATTERN) || hash.match(CID_PATTERN);
      if (cidMatch) {
        result.cid = cidMatch[1];
      }
      
    } else if (SEARCH_URL_PATTERN.test(url)) {
      result.urlType = 'search';
      result.isSearchUrl = true;
      
      // Extract query from path
      const pathQueryMatch = pathname.match(QUERY_PATH_PATTERN);
      if (pathQueryMatch) {
        result.searchQuery = decodeURIComponent(pathQueryMatch[1])
          .replace(/\+/g, ' ')
          .trim();
      }
      
      // Extract query from search params
      const queryMatch = search.match(QUERY_PATTERN);
      if (queryMatch) {
        result.query = decodeURIComponent(queryMatch[1])
          .replace(/\+/g, ' ')
          .trim();
      }
      
      // Use search query as name hint
      result.name = result.searchQuery || result.query;
    }
    
    // Extract coordinates (present in both place and search URLs)
    const coordMatch = url.match(COORD_PATTERN);
    if (coordMatch) {
      result.latitude = parseFloat(coordMatch[1]);
      result.longitude = parseFloat(coordMatch[2]);
      if (coordMatch[3]) {
        result.zoom = parseFloat(coordMatch[3]);
      }
    }
    
    // Validate coordinates
    if (result.latitude !== null && result.longitude !== null) {
      if (result.latitude < -90 || result.latitude > 90 || 
          result.longitude < -180 || result.longitude > 180) {
        result.latitude = null;
        result.longitude = null;
        result.zoom = null;
      }
    }
    
    return result;
  }

  /**
   * Extract search query from a Google Maps search URL.
   * 
   * @param {string} url 
   * @returns {string|null}
   */
  static extractSearchQuery(url) {
    const parsed = this.parse(url);
    return parsed.searchQuery || parsed.query || parsed.name;
  }

  /**
   * Extract place ID from a Google Maps place URL.
   * 
   * @param {string} url 
   * @returns {string|null}
   */
  static extractPlaceId(url) {
    const parsed = this.parse(url);
    return parsed.placeId;
  }

  /**
   * Extract CID from a Google Maps URL.
   * 
   * @param {string} url 
   * @returns {string|null}
   */
  static extractCid(url) {
    const parsed = this.parse(url);
    return parsed.cid;
  }

  /**
   * Extract coordinates from a Google Maps URL.
   * 
   * @param {string} url 
   * @returns {{lat: number, lng: number}|null}
   */
  static extractCoordinates(url) {
    const parsed = this.parse(url);
    if (parsed.latitude !== null && parsed.longitude !== null) {
      return { lat: parsed.latitude, lng: parsed.longitude };
    }
    return null;
  }

  /**
   * Extract business name hint from URL.
   * 
   * @param {string} url 
   * @returns {string|null}
   */
  static extractNameHint(url) {
    const parsed = this.parse(url);
    return parsed.nameFromPath || parsed.name;
  }

  /**
   * Check if URL has authoritative coordinates (place URL with @lat,lng).
   * 
   * @param {string} url 
   * @returns {boolean}
   */
  static hasAuthoritativeCoordinates(url) {
    const parsed = this.parse(url);
    return parsed.isPlaceUrl && parsed.latitude !== null && parsed.longitude !== null;
  }

  /**
   * Normalize a Google Maps URL to a standard format.
   * 
   * @param {string} url 
   * @returns {string} Normalized URL
   */
  static normalize(url) {
    if (!this.validateGoogleMapsUrl(url)) {
      return url;
    }
    
    try {
      const parsed = new URL(url);
      // Remove tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'hl', 'authuser'];
      for (const param of trackingParams) {
        parsed.searchParams.delete(param);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Determine the scraping mode for a URL.
   * 
   * @param {string} url 
   * @returns {'single'|'multi'|'unknown'}
   */
  static getScrapingMode(url) {
    const parsed = this.parse(url);
    if (parsed.isPlaceUrl) return 'single';
    if (parsed.isSearchUrl) return 'multi';
    if (parsed.isShortUrl) return 'unknown'; // Need to resolve first
    return 'unknown';
  }
}

export default GoogleMapsUrlParser;