/**
 * WebExtractionProvider
 *
 * Concrete BusinessDataProvider that wraps the existing
 * BusinessDataExtractor web-scraping + AI-extraction pipeline as a
 * drop-in fallback inside the provider abstraction.
 *
 * This is LEVEL 3 in the data priority (after deterministic hints and a
 * structured provider like Geoapify). It preserves all existing Webloom
 * extraction/fallback behavior and returns data in the same canonical flat
 * profile shape the rest of the pipeline consumes.
 *
 * LOSSLESS ERROR CONTRACT (Phase 20):
 * Every search() result is a structured object describing WHAT happened:
 *   { provider, status, records, error?, diagnostics, source, retrieval }
 * Provider failures must NEVER silently become { status:'error', records:[] }
 * without preserving the error category, safe message, and timing.
 */

import BusinessDataProvider from './BusinessDataProvider.js';
import {
  createAcquisitionResult,
  classifyEmptyAcquisition,
  ACQUISITION_STATUS,
} from '../AcquisitionResult.js';

class WebExtractionProvider extends BusinessDataProvider {
  constructor() {
    super();
    this._extractorPromise = null;
  }

  get name() {
    return 'web_extraction';
  }

  isAvailable() {
    return true; // web extraction has no external key requirement
  }

  /**
   * Lazily resolve BusinessDataExtractor to avoid circular imports.
   */
  async _getExtractor() {
    if (!this._extractorPromise) {
      // Dynamic import breaks the static import cycle
      this._extractorPromise = import('../BusinessDataExtractor.js').then((m) => m.default || m);
    }
    return this._extractorPromise;
  }

  /**
   * Run the existing web-extraction pipeline for a Google Maps URL.
   * Returns the canonical flat profile shape (BusinessDataExtractor returns
   * the flattened profile via profile.toObject() with metadata).
   *
   * @param {Object} hints - { googleMapsUrl } or forwarded extraction input
   * @param {Object} options
   * @returns {Promise<Object>} structured result:
   *   {
   *     provider: 'web_extraction',
   *     status,             // one of ACQUISITION_STATUS
   *     records,            // canonical profile records
   *     error,              // safe error description (never secrets)
   *     diagnostics,        // { httpStatus, errorCode, retryCount, latencyMs }
   *     source,             // { url, retrieval }
   *   }
   */
  async search(hints = {}) {
    // Web extraction is per-URL; supports Google Maps URLs primarily.
    // If no URL is provided, there's nothing authoritative to scrape.
    const url = hints?.googleMapsUrl || hints?.sourceUrl || null;
    const startedAt = Date.now();

    if (!url) {
      return createAcquisitionResult({
        provider: this.name,
        sourceUrl: null,
        status: ACQUISITION_STATUS.UNSUPPORTED_URL,
        fields: {},
        completeness: 0,
        confidence: 0,
        errors: [{ category: 'UNSUPPORTED_URL', safeMessage: 'No URL provided for web extraction.' }],
        errorCode: 'unsupported_url',
        message: 'No URL provided for web extraction.',
        latencyMs: 0,
      });
    }

    try {
      const extractor = await this._getExtractor();
      const result = await extractor.extractFromGoogleMapsUrl(url, {
        forceRefresh: Boolean(hints?.forceRefresh),
      });
      const latencyMs = Date.now() - startedAt;

      if (!result || typeof result !== 'object') {
        return classifyEmptyAcquisition({
          provider: this.name,
          sourceUrl: url,
          record: {},
          latencyMs,
        });
      }

      // BusinessDataExtractor returns the flattened canonical profile
      // (toObject shape) with a metadata block — wrap in a single record.
      const record = { ...result };
      // Normalize coord fields into location.coordinates if present as lat/lng
      if (record.location && record.location.latitude != null && record.location.longitude != null && !record.location.coordinates) {
        record.location.coordinates = {
          lat: record.location.latitude,
          lng: record.location.longitude,
        };
      }
      if (record.location && record.location.coordinates && record.location.latitude == null) {
        record.location.latitude = record.location.coordinates.lat;
        record.location.longitude = record.location.coordinates.lng;
      }
      record.source = 'web_extraction';
      record.retrieval = new Date().toISOString();

      // Check whether the extracted profile contains identity evidence.
      // A request that succeeded at the HTTP layer but produced no usable
      // business evidence must NOT masquerade as success.
      const fields = this._flattenIdentityFields(record);
      const hasEvidence = Object.values(fields).some(
        (v) => v != null && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0)
      );

      if (!hasEvidence) {
        return classifyEmptyAcquisition({
          provider: this.name,
          sourceUrl: url,
          record,
          latencyMs,
        });
      }

      return createAcquisitionResult({
        provider: this.name,
        sourceUrl: url,
        status: ACQUISITION_STATUS.SUCCESS,
        records: [record],
        diagnostics: { httpStatus: 200 },
        latencyMs,
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      // Lossless error: category + safe message + timing preserved
      const safeMessage = error?.safeMessage || error?.message || 'Unknown web-extraction failure';
      const category = error?.category || (error?.response ? 'HTTP_ERROR' : 'PROVIDER_UNAVAILABLE');
      const httpStatus = error?.response?.status || null;
      console.error(`[WebExtractionProvider] Web extraction failed: ${safeMessage}`);
      return createAcquisitionResult({
        provider: this.name,
        sourceUrl: url,
        status: ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
        fields: {},
        completeness: 0,
        confidence: 0,
        errors: [{ category, safeMessage, httpStatus }],
        errorCode: category === 'HTTP_ERROR' ? 'extraction_failed' : 'provider_unavailable',
        message: safeMessage,
        latencyMs,
      });
    }
  }

  /**
   * Extract identity-critical flat fields from a canonical record.
   * @param {Object} record - canonical flat profile shape
   * @returns {Object} dot-path field map
   */
  _flattenIdentityFields(record) {
    const fields = {};
    if (record.identity?.name) fields['identity.name'] = record.identity.name;
    if (record.contact?.phone) fields['contact.phone'] = record.contact.phone;
    if (record.contact?.website) fields['contact.website'] = record.contact.website;
    if (record.location?.full_address) fields['location.full_address'] = record.location.full_address;
    if (record.location?.coordinates) fields['location.coordinates'] = record.location.coordinates;
    return fields;
  }

  /**
   * Best-matching record (web extraction returns a single resolved profile).
   */
  async getBusiness(hints, options = {}) {
    const result = await this.search(hints, options);
    if (result.status === ACQUISITION_STATUS.SUCCESS && result.records.length > 0) return result.records[0];
    return null;
  }
}

export default new WebExtractionProvider();
