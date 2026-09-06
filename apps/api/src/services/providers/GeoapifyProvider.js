/**
 * GeoapifyProvider
 *
 * Concrete BusinessDataProvider backed by the Geoapify Places API.
 * Handles:
 *  - searching for businesses (text + coordinates)
 *  - retrieving useful place information
 *  - mapping Geoapify responses into Webloom's canonical profile (via ProviderAdapter)
 *  - API errors, empty results, rate limits, timeouts, malformed responses
 *  - normalization and safe logging (never exposes the API key)
 *
 * The Geoapify-specific response structure is fully contained in this
 * provider + ProviderAdapter. Nothing Geoapify-specific leaks to
 * BusinessResearchService or the routes.
 *
 * Uses the backend-only GEOAPIFY_API_KEY from config/env.js. Never exposed to
 * the frontend. Any non-2xx / credential failure makes the provider report
 * unavailable so the calling pipeline can fall back safely.
 *
 * LOSSLESS ERROR CONTRACT (Phase 20):
 * Every search() result is a structured object describing WHAT happened:
 *   { provider, status, records, error?, diagnostics, source, retrieval }
 * Provider failures must NEVER silently destroy error information.
 * The provider category, safe message, HTTP status, timing are preserved.
 */

import axios from 'axios';
import { config } from '../../config/env.js';
import BusinessDataProvider from './BusinessDataProvider.js';
import { mapGeoapifyFeatureToProfile } from './ProviderAdapter.js';
import {
  createAcquisitionResult,
  ACQUISITION_STATUS,
} from '../AcquisitionResult.js';

// Provider-status sentinels so callers can reason about WHY no result returned
export const GEOAPIFY_STATUS = Object.freeze({
  OK: 'ok',
  NOT_CONFIGURED: 'not_configured', // no API key
  AUTH_FAILED: 'auth_failed', // 401/403
  RATE_LIMITED: 'rate_limited', // 429
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error',
  NO_RESULT: 'no_result',
  INVALID_RESPONSE: 'invalid_response',
});

// Map provider-specific statuses to canonical ACQUISITION_STATUS
const STATUS_TO_ACQUISITION = {
  [GEOAPIFY_STATUS.OK]: ACQUISITION_STATUS.SUCCESS,
  [GEOAPIFY_STATUS.NO_RESULT]: ACQUISITION_STATUS.EMPTY_RESULT,
  [GEOAPIFY_STATUS.INVALID_RESPONSE]: ACQUISITION_STATUS.EXTRACTION_FAILED,
  [GEOAPIFY_STATUS.NOT_CONFIGURED]: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  [GEOAPIFY_STATUS.AUTH_FAILED]: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  [GEOAPIFY_STATUS.RATE_LIMITED]: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  [GEOAPIFY_STATUS.TIMEOUT]: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
  [GEOAPIFY_STATUS.NETWORK_ERROR]: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
};

class GeoapifyProvider extends BusinessDataProvider {
  constructor() {
    super();
    this._client = null;
  }

  get name() {
    return 'geoapify';
  }

  /**
   * True only when a backend API key is configured.
   */
  isAvailable() {
    return Boolean(config.geoapify?.apiKey);
  }

  /**
   * Lazily-initialized axios client (never stores the key in a way that leaks).
   */
  _getClient() {
    if (this._client) return this._client;
    this._client = axios.create({
      timeout: config.geoapify.timeout,
      paramsSerializer: {
        indexes: false,
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return this._client;
  }

  /**
   * Search for businesses using Geoapify's geocode endpoint and optionally
   * enrich the top match with place-details (phone, website, hours).
   *
   * NOTE: Geoapify's `/v2/places` endpoint is category-driven and requires a
   * `type` or `categories` param — it is NOT suitable for free-text business
   * search. We therefore use the `/v1/geocode/search` endpoint (a "find a
   * place by name" API that returns a place_id), then enrich with the
   * `/v2/place-details` endpoint which supplies contact.phone, website,
   * opening_hours and hierarchical categories.
   *
   * @param {Object} hints - { name, city, state, country, latitude, longitude, query }
   * @param {Object} options
   * @returns {Promise<Object>} structured result: { provider, status, records, error, diagnostics, source }
   */
  async search(hints = {}, options = {}) {
    const startedAt = Date.now();
    const sourceUrl = config.geoapify?.geocodeUrl || 'geoapify://search';

    // Guard: no credential configured → report gracefully
    if (!this.isAvailable()) {
      const latencyMs = Date.now() - startedAt;
      return {
        provider: 'geoapify',
        status: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
        records: [],
        error: { category: 'NOT_CONFIGURED', safeMessage: 'Geoapify API key not configured.' },
        diagnostics: { httpStatus: null, errorCode: 'provider_unavailable', retryCount: 0, latencyMs },
        source: { url: sourceUrl, retrieval: new Date().toISOString() },
      };
    }

    const text = (hints && (hints.query || hints.name)) || null;
    const lat = hints?.latitude;
    const lng = hints?.longitude;

    const params = {
      apiKey: config.geoapify.apiKey,
      limit: options.limit || config.geoapify.maxResults || 5,
    };

    // Geocode search by business name; bias with coordinates when available
    if (text) params.text = text;
    if (lat != null && lng != null) params.bias = `proximity:${lng},${lat}`;

    // Must have at least a text query OR coordinates to search
    if (!params.text && (lat == null || lng == null)) {
      const latencyMs = Date.now() - startedAt;
      return {
        provider: 'geoapify',
        status: ACQUISITION_STATUS.EMPTY_RESULT,
        records: [],
        error: { category: 'UNSUPPORTED_URL', safeMessage: 'No search query or coordinates provided.' },
        diagnostics: { httpStatus: null, errorCode: 'empty_result', retryCount: 0, latencyMs },
        source: { url: sourceUrl, retrieval: new Date().toISOString() },
      };
    }

    try {
      const client = this._getClient();
      const response = await client.get(config.geoapify.geocodeUrl, { params });
      const latencyMs = Date.now() - startedAt;

      const features = response.data?.features;
      if (!Array.isArray(features) || features.length === 0) {
        return {
          provider: 'geoapify',
          status: ACQUISITION_STATUS.EMPTY_RESULT,
          records: [],
          error: { category: 'NO_RESULT', safeMessage: 'No businesses found matching the search criteria.' },
          diagnostics: { httpStatus: response.status, errorCode: 'empty_result', retryCount: 0, latencyMs },
          source: { url: sourceUrl, retrieval: new Date().toISOString() },
        };
      }

      const records = features
        .map((feature) => {
          try {
            return mapGeoapifyFeatureToProfile(feature);
          } catch {
            return null;
          }
        })
        .filter((r) => r !== null);

      if (records.length === 0) {
        return {
          provider: 'geoapify',
          status: ACQUISITION_STATUS.EXTRACTION_FAILED,
          records: [],
          error: { category: 'INVALID_RESPONSE', safeMessage: 'Geoapify response could not be parsed into a profile.' },
          diagnostics: { httpStatus: response.status, errorCode: 'extraction_failed', retryCount: 0, latencyMs },
          source: { url: sourceUrl, retrieval: new Date().toISOString() },
        };
      }

      return {
        provider: 'geoapify',
        status: ACQUISITION_STATUS.SUCCESS,
        records,
        error: null,
        diagnostics: { httpStatus: response.status, errorCode: null, retryCount: 0, latencyMs },
        source: { url: sourceUrl, retrieval: new Date().toISOString() },
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const status = this._classifyError(error);
      const safeMessage = this._safeErrorMessage(error);
      const httpStatus = error?.response?.status || null;
      this._logSafe(status, error);
      return {
        provider: 'geoapify',
        status: STATUS_TO_ACQUISITION[status] || ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
        records: [],
        error: { category: status, safeMessage, httpStatus },
        diagnostics: { httpStatus, errorCode: STATUS_TO_ACQUISITION[status] || 'provider_unavailable', retryCount: 0, latencyMs },
        source: { url: sourceUrl, retrieval: new Date().toISOString() },
      };
    }
  }

  /**
   * Extract a safe error message from an axios/GEOAPIFY error.
   * Never exposes the API key, request headers, or internal details.
   * @param {Error} error
   * @returns {string}
   */
  _safeErrorMessage(error) {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      return 'Geoapify authentication failed.';
    }
    if (error?.response?.status === 429) {
      return 'Geoapify rate limit exceeded.';
    }
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
      return 'Geoapify request timed out.';
    }
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return 'Geoapify service unreachable.';
    }
    return 'Geoapify request failed.';
  }

  /**
   * Fetch extended place details (phone, website, opening_hours, categories)
   * for a given place_id via the Geoapify `/v2/place-details` endpoint.
   *
   * On failure this returns null so the caller can proceed with the geocode
   * result alone — enrichment is best-effort.
   *
   * @param {string} placeId
   * @returns {Promise<Object|null>} canonical profile or null
   */
  async _fetchPlaceDetails(placeId) {
    if (!placeId) return null;
    try {
      const client = this._getClient();
      const response = await client.get(config.geoapify.placeDetailsUrl, {
        params: { apiKey: config.geoapify.apiKey, id: placeId },
      });
      const features = response.data?.features;
      if (!Array.isArray(features) || features.length === 0) return null;
      return mapGeoapifyFeatureToProfile(features[0]);
    } catch (error) {
      // Best-effort enrichment — do not fail the whole lookup on details failure
      const status = this._classifyError(error);
      if (status !== GEOAPIFY_STATUS.NO_RESULT && status !== GEOAPIFY_STATUS.TIMEOUT) {
        this._logSafe(status, error);
      }
      return null;
    }
  }

  /**
   * Return the best-matching normalized business record for the hints.
   * Enriches the chosen record with place-details (phone/website/hours) when
   * a place_id is available.
   *
   * @returns {Promise<Object|null>}
   */
  async getBusiness(hints, options = {}) {
    const result = await this.search(hints, options);
    // Lossless contract: result.status is a canonical ACQUISITION_STATUS
    if (result.status !== ACQUISITION_STATUS.SUCCESS || result.records.length === 0) {
      return null;
    }
    const records = result.records;

    // If coordinates were supplied, prefer the record closest to them;
    // otherwise take the top-ranked record from the API.
    let best = records[0];
    const lat = hints?.latitude;
    const lng = hints?.longitude;
    if (lat != null && lng != null) {
      let bestDist = Infinity;
      for (const rec of records) {
        const c = rec.location?.coordinates;
        if (!c) continue;
        const d = Math.hypot(c.lat - lat, c.lng - lng);
        if (d < bestDist) {
          bestDist = d;
          best = rec;
        }
      }
    }

    // Best-effort enrichment: pull place-details (phone/website/hours/categories)
    const placeId = best?.provider?.placeId;
    if (placeId) {
      const details = await this._fetchPlaceDetails(placeId);
      if (details) {
        best = this._mergeDetails(best, details);
      }
    }

    return best;
  }

  /**
   * Merge place-details fields into the geocode-derived profile, preferring
   * the more complete place-details values but never discarding coords/identity.
   */
  _mergeDetails(base, details) {
    // Start from the details profile (has phone/website/hours/categories), then
    // carry over identity/coords from the geocode base if details lacked them.
    const merged = {};
    const setIf = (dst, src, key) => {
      const v = src?.[key];
      if (v != null) dst[key] = v;
    };

    // business
    merged.business = { ...base.business };
    setIf(merged.business, details?.business, 'category');
    setIf(merged.business, details?.business, 'categories');
    if (details?.business?.description) merged.business.description = details.business.description;

    // contact
    merged.contact = { ...base.contact };
    setIf(merged.contact, details?.contact, 'phone');
    setIf(merged.contact, details?.contact, 'email');
    setIf(merged.contact, details?.contact, 'website');

    // location
    merged.location = { ...base.location };
    setIf(merged.location, details?.location, 'full_address');
    setIf(merged.location, details?.location, 'postal_code');
    setIf(merged.location, details?.location, 'street');

    // ratings (Geoapify rarely returns these; keep if present)
    merged.ratings = { ...base.ratings };
    if (details?.ratings?.rating != null) merged.ratings.rating = details.ratings.rating;
    if (details?.ratings?.review_count != null) merged.ratings.review_count = details.ratings.review_count;

    // hours — prefer details hours when non-empty
    const detailsHours = details?.hours && Object.keys(details.hours).length ? details.hours : null;
    merged.hours = detailsHours || base.hours || {};

    // services
    merged.services = details?.services && details.services.length ? details.services : base.services || [];

    // Keep geocode-derived coords/placeId
    merged.location.coordinates = base.location?.coordinates || details?.location?.coordinates || null;
    merged.provider = { ...base.provider, ...(details?.provider || {}) };

    return merged;
  }

  /**
   * Classify an axios/network error into a GEOAPIFY_STATUS (never leaks details).
   */
  _classifyError(error) {
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
      return GEOAPIFY_STATUS.TIMEOUT;
    }
    const status = error?.response?.status;
    if (status === 401 || status === 403) return GEOAPIFY_STATUS.AUTH_FAILED;
    if (status === 429) return GEOAPIFY_STATUS.RATE_LIMITED;
    if (status === 400 && /no.*result|not found/i.test(error?.response?.data || '')) {
      return GEOAPIFY_STATUS.NO_RESULT;
    }
    if (error?.response || error?.request || error?.code) {
      return GEOAPIFY_STATUS.NETWORK_ERROR;
    }
    return GEOAPIFY_STATUS.NETWORK_ERROR;
  }

  /**
   * Log a safe, secret-free failure message.
   */
  _logSafe(status, error) {
    const map = {
      [GEOAPIFY_STATUS.AUTH_FAILED]: 'Geoapify provider unavailable (authentication failed); using fallback extraction.',
      [GEOAPIFY_STATUS.RATE_LIMITED]: 'Geoapify provider rate-limited; using fallback extraction.',
      [GEOAPIFY_STATUS.TIMEOUT]: 'Geoapify provider timed out; using fallback extraction.',
      [GEOAPIFY_STATUS.NETWORK_ERROR]: 'Geoapify provider temporarily unavailable; using fallback extraction.',
      [GEOAPIFY_STATUS.INVALID_RESPONSE]: 'Geoapify provider returned an invalid response; using fallback extraction.',
    };
    const message = map[status] || 'Geoapify provider error; using fallback extraction.';
    // Log only the safe message — never the API key or raw stack/infra details.
    console.error(`[GeoapifyProvider] ${message} (${error?.response?.status || error?.code || 'unknown'})`);
  }
}

export default new GeoapifyProvider();
