/**
 * BusinessDataExtractorQualityAdapter — Quality Boundary for Legacy Extractor
 *
 * Wraps BusinessDataExtractor.extractFromGoogleMapsUrl to route its
 * field assignments through the CandidatePipeline before they reach
 * BusinessProfile.set().
 *
 * This adapter preserves the exact public contract of
 * BusinessDataExtractor (return value shape, error handling, caching)
 * while ensuring all field values pass through validation and selection.
 */

import { runCandidatePipeline } from './CandidatePipeline.js';

/**
 * Adapter that processes a BusinessDataExtractor result through the candidate pipeline.
 *
 * @param {BusinessProfile} profile - target profile
 * @param {Object} extractedResult - result from BusinessDataExtractor.extractFromGoogleMapsUrl (or similar)
 * @param {string} googleMapsUrl - source URL
 * @param {Object} [options] - { sourceUrl, pageData, metadata }
 * @returns {Promise<Object>} pipeline result with diagnostics
 */
export async function processExtractorResultThroughPipeline(profile, extractedResult, googleMapsUrl, options = {}) {
  if (!extractedResult || typeof extractedResult !== 'object') {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const { sourceUrl = null, pageData = null, metadata = null } = options;

  // Build records from the extracted result
  const records = [];

  // 1. IDENTIFIED fields (from URL parsing - handled before extractor call, but we include for completeness)
  // These are typically already set by the caller before calling this adapter

  // 2. AI/WEB EXTRACTION fields (the main extracted profile)
  if (extractedResult.business || extractedResult.contact || extractedResult.location ||
      extractedResult.ratings || extractedResult.hours || extractedResult.reviews ||
      extractedResult.social_links || extractedResult.services || extractedResult.products) {

    const provenance = extractedResult.metadata?.aiExtracted ? 'ai_generated' : 'discovered';
    const sourceInfo = {
      sourceUrl: pageData?.url || googleMapsUrl,
      provider: 'web_extraction',
      extractionMethod: extractedResult.metadata?.aiExtracted ? 'ai' : 'dom',
    };

    records.push({
      record: extractedResult,
      provenance,
      sourceInfo,
    });
  }

  // 3. OFFICIAL WEBSITE merge (if present in extracted result or provided separately)
  // The extractor already handles this via profile.merge() but we can process
  // the website data if it's available in the extracted result
  if (extractedResult.metadata?.websiteData) {
    records.push({
      record: extractedResult.metadata.websiteData,
      provenance: 'verified',
      sourceInfo: {
        sourceUrl: extractedResult.metadata.websiteUrl,
        provider: 'official_website',
        extractionMethod: 'dom',
      },
    });
  }

  if (records.length === 0) {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const pipelineResult = await runCandidatePipeline({
    records,
    profileContext: profile.toObject ? profile.toObject() : profile,
    options: {
      onlyIfMissing: false, // Let pipeline handle existing field logic
      isConservativeMerge: false,
    },
  });

  // Apply accepted candidates to profile
  pipelineResult.applyToProfile(profile, { sourceUrl: googleMapsUrl, provider: 'web_extraction' });

  return pipelineResult;
}

/**
 * Process the DIRECT extraction path (when extractor fetches Google Maps directly).
 * This covers the path where BusinessDataExtractor fetches and parses Google Maps HTML.
 *
 * @param {BusinessProfile} profile
 * @param {Object} directMetadata - metadata from extractFromDirectGoogleMapsHtml
 * @param {string} googleMapsUrl
 * @param {Object} [options]
 * @returns {Promise<Object>} pipeline result
 */
export async function processDirectExtractionThroughPipeline(profile, directMetadata, googleMapsUrl, options = {}) {
  if (!directMetadata || !directMetadata.extractedFields) {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  const { sourceUrl = null } = options;
  const extracted = directMetadata.extractedFields;
  const provenance = 'discovered'; // Direct HTML extraction is deterministic

  // Build a synthetic record from extracted fields
  const record = { business: {}, contact: {}, location: {}, ratings: {} };
  if (extracted.name) record.business.name = extracted.name;
  if (extracted.phone) record.contact.phone = extracted.phone;
  if (extracted.address) record.location.full_address = extracted.address;
  if (extracted.city) record.location.city = extracted.city;
  if (extracted.state) record.location.state = extracted.state;
  if (extracted.postalCode) record.location.postal_code = extracted.postalCode;
  if (extracted.rating != null) record.ratings.rating = extracted.rating;
  if (extracted.reviewCount != null) record.ratings.review_count = extracted.reviewCount;
  if (extracted.reviews?.length) record.ratings.reviews = extracted.reviews;

  const pipelineResult = await runCandidatePipeline({
    records: [{
      record,
      provenance,
      sourceInfo: {
        sourceUrl: directMetadata.sourceUrl || googleMapsUrl,
        provider: 'direct_google_maps_html',
        extractionMethod: 'dom',
      },
    }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options: { onlyIfMissing: false },
  });

  pipelineResult.applyToProfile(profile, { sourceUrl: googleMapsUrl, provider: 'direct_google_maps_html' });

  return pipelineResult;
}

/**
 * Process official website extraction through the pipeline.
 *
 * @param {BusinessProfile} profile
 * @param {Object} websiteData - result from OfficialWebsiteProvider.extract()
 * @param {string} websiteUrl
 * @param {Object} [options]
 * @returns {Promise<Object>} pipeline result
 */
export async function processWebsiteThroughPipeline(profile, websiteData, websiteUrl, options = {}) {
  if (!websiteData) {
    return { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
  }

  // Official website data gets 'verified' provenance
  const record = {
    business: {
      name: websiteData.business?.name,
      category: websiteData.business?.category,
      description: websiteData.business?.description,
      categories: websiteData.business?.categories,
      business_type: websiteData.business?.business_type,
    },
    contact: {
      phone: websiteData.contact?.phone,
      email: websiteData.contact?.email,
      website: websiteData.contact?.website,
    },
    location: {
      full_address: websiteData.location?.full_address,
      street: websiteData.location?.street,
      city: websiteData.location?.city,
      state: websiteData.location?.state,
      country: websiteData.location?.country,
      postal_code: websiteData.location?.postal_code,
      coordinates: websiteData.location?.coordinates,
    },
    ratings: {
      rating: websiteData.ratings?.rating,
      review_count: websiteData.ratings?.review_count,
    },
    hours: websiteData.hours,
    social_links: websiteData.social_links,
    services: websiteData.services,
  };

  const pipelineResult = await runCandidatePipeline({
    records: [{
      record,
      provenance: 'verified',
      sourceInfo: {
        sourceUrl: websiteUrl,
        provider: 'official_website',
        extractionMethod: 'dom',
      },
    }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options: { onlyIfMissing: false },
  });

  pipelineResult.applyToProfile(profile, { sourceUrl: websiteUrl, provider: 'official_website' });

  return pipelineResult;
}

/**
 * Convenience: run the adapter inline for a single field merge (used by direct profile.set calls).
 * This maintains backward compatibility for code that calls profile.set() directly
 * but wants validation/selection semantics.
 */
export async function validateAndApplySingleField(profile, fieldPath, value, provenance, sourceInfo, confidence = 0.6) {
  const record = {};
  const parts = fieldPath.split('.');
  let target = record;
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] = target[parts[i]] || {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;

  const result = await runCandidatePipeline({
    records: [{ record, provenance, sourceInfo }],
    profileContext: profile.toObject ? profile.toObject() : profile,
    options: { onlyIfMissing: false },
  });

  result.applyToProfile(profile, sourceInfo);
  return result;
}

export default {
  processExtractorResultThroughPipeline,
  processDirectExtractionThroughPipeline,
  processWebsiteThroughPipeline,
  validateAndApplySingleField,
};