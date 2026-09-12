/**
 * Business Intelligence Research Service
 * 
 * This service is the core of the business data extraction pipeline.
 * It extracts and normalizes business information from various sources.
 * Now works with BusinessDataExtractor output (no Google Maps API required).
 */

import BusinessProfile from './BusinessProfile.js';
import GeoapifyProvider from './providers/GeoapifyProvider.js';
import WebExtractionProvider from './providers/WebExtractionProvider.js';
import GoogleMapsUrlParserProvider from './GoogleMapsUrlParserProvider.js';
import { extractDeterministicHints } from './providers/ProviderAdapter.js';
import { validateBusinessProfile, sanitizeFieldValue } from './BusinessProfileValidator.js';
import { config } from '../config/env.js';
import { calculateMatchScore } from './EntityResolution.js';
import { initializeDatabase, getDb } from '../db/client.js';
import { IdentityRepository, NotFoundError, DuplicateError, ValidationError } from '../db/IdentityRepository.js';
import { CanonicalizationService } from './CanonicalizationService.js';
import { analyzeEntityRelocation, TEMPORAL_VERDICT } from './TemporalRelocationAnalyzer.js';
import { looksLikeStreetAddress } from '../utils/streetAddressDetector.js';

class BusinessResearchService {
  /**
   * Extract business information from new extraction format and return structured JSON
   */
  async extractBusinessIntelligence(extractedData) {
    try {
      if (!extractedData) {
        throw new Error('Business data is required');
      }

      const isFlatProfile =
        extractedData.identity !== undefined ||
        extractedData.contact !== undefined ||
        extractedData.location !== undefined ||
        extractedData.metadata !== undefined ||
        extractedData.confidence !== undefined;

      const normalizedData = isFlatProfile ? this.normalizeFlatProfile(extractedData) : extractedData;
      const isNewFormat = normalizedData.business !== undefined;

      if (isNewFormat) {
        return this.extractFromNewFormat(normalizedData);
      } else {
        return this.extractFromGooglePlacesFormat(normalizedData);
      }
    } catch (error) {
      console.error('Business research extraction error:', error);
      throw error;
    }
  }

  normalizeFlatProfile(data) {
    if (!data || typeof data !== 'object') return data;

    const flattened = {
      business: {
        name: data['identity.name'] ?? data.business?.name ?? null,
        category: data['identity.category'] ?? data.business?.category ?? null,
        categories: data['identity.categories'] ?? data.business?.categories ?? [],
        description: data['identity.description'] ?? data.business?.description ?? null,
        business_type: data['identity.business_type'] ?? data.business?.business_type ?? null,
      },
      contact: {
        phone: data['contact.phone'] ?? data.contact?.phone ?? null,
        email: data['contact.email'] ?? data.contact?.email ?? null,
        website: data['contact.website'] ?? data.contact?.website ?? null,
      },
      location: {
        full_address: data['location.full_address'] ?? data.location?.full_address ?? null,
        street: data['location.street'] ?? data.location?.street ?? null,
        city: data['location.city'] ?? data.location?.city ?? null,
        state: data['location.state'] ?? data.location?.state ?? null,
        country: data['location.country'] ?? data.location?.country ?? null,
        postal_code: data['location.postal_code'] ?? data.location?.postal_code ?? null,
        latitude: data['location.coordinates']?.lat ?? data.location?.latitude ?? data.location?.coordinates?.lat ?? null,
        longitude: data['location.coordinates']?.lng ?? data.location?.longitude ?? data.location?.coordinates?.lng ?? null,
      },
      ratings: {
        rating: data['ratings.rating'] ?? data.ratings?.rating ?? null,
        review_count: data['ratings.review_count'] ?? data.ratings?.review_count ?? null,
      },
      hours: data.hours ?? {},
      reviews: data.reviews ?? [],
      services: data.services ?? [],
      products: data.products ?? [],
      amenities: data.amenities ?? [],
      social_links: data.social_links ?? [],
      pricing: data.pricing ?? null,
      booking_url: data.booking_url ?? null,
      source_urls: data.source_urls ?? [],
      confidence: data.confidence ?? {},
      metadata: data.metadata ?? {},
      cached: data.cached ?? false,
    };

    return flattened;
  }

  /**
   * Extract from new BusinessDataExtractor format
   */
  extractFromNewFormat(data) {
    const business = data.business || {};
    const contact = data.contact || {};
    const location = data.location || {};
    const ratings = data.ratings || {};
    const hours = data.hours || {};
    const metadata = data.metadata || {};

    // Determine resolution status based on URL type and placeId availability
    const originalUrl = metadata.originalUrl || metadata.sourceUrl || '';
    const placeId = metadata.placeId || null;
    const isSearchUrl = originalUrl.includes('/search/');
    const isPlaceUrl = originalUrl.includes('/place/');
    
    let resolutionStatus = 'unresolved';
    let resolutionConfidence = 0;
    let query = null;
    let resolvedName = null;
    
    if (isSearchUrl) {
      // Search URL - extract query but no placeId
      const urlObj = new URL(originalUrl);
      query = urlObj.searchParams.get('query');
      resolutionStatus = 'unresolved';
      resolutionConfidence = 0;
      resolvedName = business.name || null;
    } else if (isPlaceUrl) {
      if (placeId && this.isValidPlaceId(placeId)) {
        // Place URL with valid placeId
        resolutionStatus = 'resolved';
        resolutionConfidence = data.confidence?.overall || 0.8;
        resolvedName = business.name || null;
      } else if (placeId && placeId.startsWith('cid:')) {
        // Place URL with CID - partially resolved
        resolutionStatus = 'resolved';
        resolutionConfidence = (data.confidence?.overall || 0.6);
        resolvedName = business.name || null;
      } else {
        // Place URL but no extractable placeId
        resolutionStatus = 'ambiguous';
        resolutionConfidence = 0.3;
        resolvedName = business.name || null;
      }
    } else {
      // Unknown URL type
      resolutionStatus = 'invalid';
      resolutionConfidence = 0;
    }

    const intelligence = {
      source: {
        query: query,
        placeId: placeId,
        resolvedName: resolvedName,
        resolutionStatus: resolutionStatus,
        resolutionConfidence: resolutionConfidence,
        mapsUrl: originalUrl || null,
      },
      identity: {
        name: business.name,
        category: business.category,
        businessType: business.business_type,
        description: business.description,
        categories: business.categories || [],
      },
      contact: {
        phone: contact.phone,
        email: contact.email,
        website: contact.website,
      },
      location: {
        address: location.full_address,
        city: location.city,
        state: location.state,
        country: location.country,
        postalCode: location.postal_code,
        coordinates: (location.latitude && location.longitude) ? {
          lat: location.latitude,
          lng: location.longitude,
        } : null,
      },
      digitalPresence: {
        googleMapsUrl: originalUrl || null,
        website: contact.website || null,
        socialProfiles: { facebook: null, instagram: null, twitter: null, linkedin: null },
        hasWebsite: !!contact.website,
        photos: [],
      },
      services: business.services || [],
      trustSignals: this.buildTrustSignals(ratings, data.reviews),
      positioning: {
        priceLevel: data.pricing || null,
        category: business.category,
        location: location.full_address,
      },
      facts: this.buildVerifiedFacts(business, contact, location, ratings, metadata),
      unknowns: this.identifyUnknowns(business, contact, location),
      rating: ratings.rating,
      reviewCount: ratings.review_count,
      openingHours: this.formatOpeningHours(hours),
      reviews: data.reviews || [],
      photos: [],
      confidence: data.confidence || {},
    };

    return intelligence;
  }

  /**
   * Check if a placeId is a valid Google Place ID (not a synthetic one)
   */
  isValidPlaceId(placeId) {
    if (!placeId || typeof placeId !== 'string') return false;
    if (placeId.startsWith('query:')) return false;
    if (placeId.startsWith('cid:')) return true; // CID is a valid identifier
    // Standard Place ID format
    if (placeId.startsWith('ChIJ') && placeId.length >= 27) return true;
    // CID format: 0x<hex>:0x<hex> (e.g., 0x390feb5b7b7b7b7b:0x1234567890abcdef)
    const cidRegex = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;
    if (cidRegex.test(placeId)) return true;
    return false;
  }
/**
   * Extract from legacy Google Places API format (for backward compatibility)
   */
  extractFromGooglePlacesFormat(data) {
    return {
      source: {
        placeId: data.place_id || null,
        mapsUrl: data.url || null,
      },
      identity: this.extractIdentity(data),
      contact: this.extractContact(data),
      location: this.extractLocation(data),
      digitalPresence: this.extractDigitalPresence(data),
      services: this.extractServices(data),
      trustSignals: this.extractTrustSignals(data),
      positioning: this.extractPositioning(data),
      facts: this.extractVerifiedFacts(data),
      unknowns: this.identifyUnknownsLegacy(data),
      rating: data.rating || null,
      reviewCount: data.user_ratings_total || null,
      openingHours: data.opening_hours || null,
      reviews: data.reviews || [],
      photos: data.photos?.map(photo => photo.photo_reference || photo.url) || [],
      confidence: {},
    };
  }

  buildTrustSignals(ratings, reviews) {
    const signals = [];
    if (ratings.rating !== null && ratings.rating !== undefined) {
      // PHASE 20 FIX: never manufacture verification status.
      // This observation was extracted (discovered), not verified by Google.
      signals.push({ type: 'rating', value: ratings.rating, source: 'google_maps_public', verified: false, verification: 'discovered', confidence: 0.6 });
    }
    if (ratings.review_count !== null && ratings.review_count !== undefined) {
      signals.push({ type: 'review_count', value: ratings.review_count, source: 'google_maps_public', verified: false, verification: 'discovered', confidence: 0.6 });
    }
    if (reviews && reviews.length > 0) {
      signals.push({ type: 'reviews_available', value: reviews.length, source: 'google_maps_public', verified: false, verification: 'discovered', confidence: 0.6 });
    }
    return signals;
  }

  buildVerifiedFacts(business, contact, location, ratings, metadata) {
    const facts = [];
    const source = 'acquisition';
    // PHASE 20 FIX: these are EXTRACTED observations, not verified facts.
    // The language mirrors what we can actually claim: observed/discovered.
    if (business.name) facts.push({ claim: `Business name is ${business.name}`, source, verified: false, verification: 'discovered' });
    if (business.category) facts.push({ claim: `Business category is ${business.category}`, source, verified: false, verification: 'discovered' });
    if (ratings.rating) facts.push({ claim: `Has a rating of ${ratings.rating}/5`, source: 'google_maps_public', verified: false, verification: 'discovered' });
    if (ratings.review_count) facts.push({ claim: `Has ${ratings.review_count} reviews`, source: 'google_maps_public', verified: false, verification: 'discovered' });
    if (contact.website) facts.push({ claim: `Website: ${contact.website}`, source, verified: false, verification: 'discovered' });
    if (contact.phone) facts.push({ claim: `Phone: ${contact.phone}`, source, verified: false, verification: 'discovered' });
    if (location.full_address) facts.push({ claim: `Address: ${location.full_address}`, source, verified: false, verification: 'discovered' });
    if (metadata.hasJsonLd) facts.push({ claim: 'Structured data (JSON-LD) found on page', source: 'page_metadata', verified: true, verification: 'identified' });
    return facts;
  }

  identifyUnknowns(business, contact, location) {
    const unknowns = [];
    if (!business.name) unknowns.push('name');
    if (!business.category) unknowns.push('category');
    if (!contact.website) unknowns.push('website');
    if (!contact.phone) unknowns.push('phone');
    if (!contact.email) unknowns.push('email');
    if (!location.full_address) unknowns.push('address');
    if (!business.description) unknowns.push('description');
    return unknowns;
  }

  formatOpeningHours(hours) {
    if (!hours) return null;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const formatted = {};
    let hasAny = false;
    for (const day of days) {
      if (hours[day]) {
        formatted[day] = hours[day];
        hasAny = true;
      }
    }
    return hasAny ? formatted : null;
  }

  extractContact(data) {
    return {
      phone: data.phone || data.formatted_phone_number || null,
      email: data.email || null,
      website: data.website || null,
    };
  }

  extractLocation(data) {
    return {
      address: data.formatted_address || data.vicinity || null,
      city: data.address_components?.find(c => c.types.includes('locality'))?.long_name || null,
      state: data.address_components?.find(c => c.types.includes('administrative_area_level_1'))?.long_name || null,
      country: data.address_components?.find(c => c.types.includes('country'))?.long_name || null,
      postalCode: data.address_components?.find(c => c.types.includes('postal_code'))?.long_name || null,
      coordinates: data.geometry?.location ? {
        lat: data.geometry.location.lat,
        lng: data.geometry.location.lng,
      } : null,
    };
  }

  extractDigitalPresence(data) {
    return {
      googleMapsUrl: data.url || null,
      website: data.website || null,
      socialProfiles: { facebook: null, instagram: null, twitter: null, linkedin: null },
      hasWebsite: !!data.website,
      photos: data.photos?.map(p => p.photo_reference || p.url) || [],
    };
  }

  extractServices(data) {
    const services = [];
    if (data.types && Array.isArray(data.types)) {
      services.push(...data.types.filter(t => t !== 'point_of_interest' && t !== 'establishment'));
    }
    return services.length > 0 ? services : null;
  }

  extractTrustSignals(data) {
    const signals = [];
    if (data.rating) {
      signals.push({ type: 'rating', value: data.rating, source: 'google_maps', verified: true });
    }
    if (data.user_ratings_total) {
      signals.push({ type: 'review_count', value: data.user_ratings_total, source: 'google_maps', verified: true });
    }
    return signals;
  }

  extractPositioning(data) {
    return {
      priceLevel: data.price_level || null,
      category: data.types?.[0] || null,
      location: data.formatted_address || null,
    };
  }

  extractVerifiedFacts(data) {
    const facts = [];
    if (data.name) facts.push({ claim: `Business name is ${data.name}`, source: 'google_maps_public_data', verified: true });
    if (data.rating) facts.push({ claim: `Has a rating of ${data.rating}/5`, source: 'google_maps_public_data', verified: true });
    return facts;
  }

  identifyUnknowns(data) {
    const unknowns = [];
    if (!data.website) unknowns.push('website');
    if (!data.phone && !data.formatted_phone_number) unknowns.push('phone');
    if (!data.email) unknowns.push('email');
    return unknowns;
  }

  // =========================================================================
  // PROVIDER ORCHESTRATION (Geoapify-first, with web-extraction fallback)
  // =========================================================================

  /**
   * Build a full canonical BusinessProfile from the provider orchestration.
   *
   * Pipeline order (data priority):
   *   1. Deterministic data from input (name, coords)
   *   2. Geoapify structured place information (if available)
   *   3. Existing web-extraction fallback (for missing fields)
   *   4. AI enrichment (fill gaps only, never overwrite high-confidence)
   *   5. Schema validation
   *
   * @param {Object} input - { googleMapsUrl?, name?, city?, state?, country?, latitude?, longitude? }
   * @returns {Promise<Object>} { success, profile (BusinessProfile), intelligence, provider, validation }
   */
  async extractBusinessIntelligenceWithProviders(input = {}) {
    const { forceRefresh = false, ...restInput } = input;
    const hints = await this._buildHints(restInput);
    const profile = new BusinessProfile();
    const providerTrace = { geoapify: null, webExtraction: null, aiEnrichment: false };
    const sourceUrl = input.googleMapsUrl || input.sourceUrl || null;

    // --- LEVEL 1: deterministic data from input (IDENTIFIED provenance) ---
    if (hints.name) {
      profile.set('identity.name', hints.name, 'identified', 0.6, { sourceUrl });
    }
    if (hints.latitude != null && hints.longitude != null) {
      profile.set('location.coordinates', { lat: hints.latitude, lng: hints.longitude }, 'identified', 0.8, { sourceUrl });
    }

    // --- LEVEL 2: Geoapify structured data (provider provenance) ---
    // ONE acquisition: search() returns the lossless AcquisitionResult
    // (status, records, error, diagnostics). selectBestRecord() locally picks
    // the best match; enrichRecord() best-effort adds place-details for the
    // chosen record ONLY. There is no second search when the first returns no
    // record — the diagnostics come from the same acquisition call (#2).
    //
    // P1.7: After selectBestRecord, validate that the selected record's
    // coordinates are compatible with the authoritative URL/operator
    // coordinates. A candidate in a different city (e.g. Tarn Taran vs Sri
    // Ganganagar, 165 km apart) must be rejected even if it is the only
    // Geoapify result.
    let geoapifyRecord = null;
    if (GeoapifyProvider.isAvailable()) {
      const geoResult = await GeoapifyProvider.search(hints);
      providerTrace.geoapify = geoResult.status;
      providerTrace.geoapifyError = geoResult.error || null;
      providerTrace.geoapifyDiagnostics = geoResult.diagnostics || null;

      const best = GeoapifyProvider.selectBestRecord(geoResult, hints);
      if (best) {
        // P1.7: Coordinate-anchor validation. When authoritative coordinates
        // are available (a /place/ URL's @lat,lng or explicit operator-supplied
        // coordinates; NOT a search-URL viewport), the selected record must be
        // within a reasonable geographic radius. This prevents a name-only
        // search from silently returning a different business in another city.
        // hints.coordinatesAuthoritative (set in _buildHints) distinguishes
        // coordinates that anchor identity from coordinates that merely bias
        // the search ranking.
        const selectedRecord = await GeoapifyProvider.enrichRecord(best, {
          lat: hints?.latitude,
          lng: hints?.longitude,
        });
        const geoapifyCoords = selectedRecord?.location?.coordinates;
        const urlLat = hints?.latitude;
        const urlLng = hints?.longitude;
        let coordinateReject = false;
        if (geoapifyCoords && urlLat != null && urlLng != null && hints?.coordinatesAuthoritative === true) {
          const dist = Math.hypot(geoapifyCoords.lat - urlLat, geoapifyCoords.lng - urlLng);
          // 0.35° ≈ ~39 km: generous enough for pin-vs-centroid drift, but
          // tight enough to reject a business 165 km away in a different state.
          const MAX_DEVIATION_DEGREES = 0.35;
          if (dist > MAX_DEVIATION_DEGREES) {
            coordinateReject = true;
            console.warn(
              `[P1.7] Geoapify candidate rejected: coordinates ${geoapifyCoords.lat},${geoapifyCoords.lng} are ` +
              `${dist.toFixed(2)}° from authoritative coordinates ${urlLat},${urlLng}. ` +
              `Candidate city: ${selectedRecord?.location?.city || 'unknown'} — likely a different business.`,
            );
            providerTrace.geoapify = 'coordinate_rejected';
          }
        }
        if (!coordinateReject) {
          geoapifyRecord = selectedRecord;
          this._mergeCanonical(profile, geoapifyRecord, 'discovered', 'geoapify', sourceUrl);
          providerTrace.geoapify = 'ok';
        }
      }
      if (config?.debugBusinessAnalysis) {
        console.log(`[Geoapify] status=${geoResult.status}, error=${geoResult.error?.safeMessage || 'none'}`);
      }
    } else {
      console.error('Geoapify provider unavailable; using fallback extraction.');
      providerTrace.geoapify = 'not_configured';
    }

    // --- LEVEL 3: web-extraction fallback / completion of gaps ---
    let webRecord = null;
    if (sourceUrl) {
      const webResult = await WebExtractionProvider.search({ googleMapsUrl: sourceUrl });
      // Lossless contract: webResult.status is now one of ACQUISITION_STATUS.
      // Only a SUCCESS (or PARTIAL with evidence) yields records.
      if (
        (webResult.status === 'success' || webResult.status === 'partial') &&
        webResult.records.length > 0
      ) {
        webRecord = webResult.records[0];
        providerTrace.webExtraction = 'ok';
        
        // When both Geoapify and web-extraction records exist, use Entity Resolution
        // to determine if they represent the same business before merging.
        if (geoapifyRecord) {
          try {
            const matchResult = calculateMatchScore(geoapifyRecord, webRecord);
            const resolutionInfo = {
              score: parseFloat(matchResult.score.toFixed(2)),
              matchType: matchResult.matchType,
              signals: Object.keys(matchResult.signals).filter(k => matchResult.signals[k] === true),
              contradictions: matchResult.contradictions.map(c => c.field),
            };
            
            if (config?.debugBusinessAnalysis) {
              console.log(`[EntityResolution] geoapify vs web_extraction: score=${resolutionInfo.score}, matchType=${resolutionInfo.matchType}`);
            }
            
            // Decide merge behavior based on entity resolution result
            if (matchResult.matchType === 'same_entity') {
              // Confident match: normal merge behavior with onlyIfMissing=true to preserve Geoapify
              this._mergeCanonical(profile, webRecord, 'discovered', 'web_extraction', sourceUrl, /* onlyIfMissing= */ true, resolutionInfo);
            } else if (matchResult.matchType === 'uncertain') {
              // Uncertain match: very conservative merge (only fill true gaps)
              this._mergeCanonical(profile, webRecord, 'discovered', 'web_extraction', sourceUrl, /* onlyIfMissing= */ true, resolutionInfo);
            } else if (matchResult.matchType === 'different_entity') {
              // Different entities: prevent blindly merging conflicting data
              // Only merge non-identity fields that have no contradictions
              if (config?.debugBusinessAnalysis) {
                console.warn(`[EntityResolution] Records appear to be different entities; skipping aggressive merge`);
              }
              this._mergeConservativelyForDifferentEntities(profile, webRecord, sourceUrl, resolutionInfo);
            }
            
            // Store resolution metadata on profile for observability
            profile._entityResolutionTrace = profile._entityResolutionTrace || [];
            profile._entityResolutionTrace.push(resolutionInfo);
          } catch (err) {
            // Entity Resolution failure must not crash the pipeline
            console.error(`[EntityResolution] Matching failed (best-effort): ${err?.message || String(err)}`);
            // Fall back to conservative merge
            this._mergeCanonical(profile, webRecord, 'discovered', 'web_extraction', sourceUrl, /* onlyIfMissing= */ true);
          }
        } else {
          // No Geoapify record: merge web-extraction normally
          this._mergeCanonical(profile, webRecord, 'discovered', 'web_extraction', sourceUrl, /* onlyIfMissing= */ false);
        }
      } else {
        // Lossless: preserve the exact status + error, not a bare 'error'
        providerTrace.webExtraction =
          webResult.status === 'success' ? 'no_evidence' : webResult.status;
        providerTrace.webExtractionError = webResult.error || null;
        providerTrace.webExtractionDiagnostics = webResult.diagnostics || null;
      }
    }

    // --- LEVEL 3.5: P1.8 source-grounded Google Maps fallback ---
    // When Geoapify omits fields (address/phone/email/website) that the
    // supplied Google Maps source actually contains, recover them from the
    // source before any AI enrichment. Deterministic first (URL parser +
    // provider record), then evidence-grounded AI extraction ONLY when the
    // retrieved page text contains the missing field.
    {
      const { extractFallbackFields, extractGoogleMapsSourceIdentity } = await import('./GoogleMapsFallbackExtractor.js');
      const parsedSource = sourceUrl
        ? (() => { try { return GoogleMapsUrlParserProvider.parse(sourceUrl); } catch { return null; } })()
        : null;

      // Structured source evidence available without any fetch:
      //   - exact Google Maps source identity (placeId, coordinates)
      //   - best provider record (Geoapify) for fields Geoapify returned
      //   - retrieved page text when web extraction visited a Google Maps page
      const sourceEvidences = [];
      if (parsedSource) sourceEvidences.push(parsedSource);
      const providerRecordForFallback = geoapifyRecord || webRecord || null;

      // Fetch the source text ONLY when we have a URL and fields are still
      // missing. If web extraction already retrieved visible text, reuse it —
      // never double-fetch.
      let sourceText = webRecord?.metadata?.sourceText || null;
      if (!sourceText && sourceUrl && this._hasGaps(profile)) {
        try {
          const { default: extractor } = await import('./BusinessDataExtractor.js');
          const pageData = await extractor.fetchPage(sourceUrl);
          sourceText = (pageData.html || '').replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 6000);
        } catch {
          sourceText = null;
        }
      }

      if (sourceUrl || parsedSource || providerRecordForFallback || sourceText) {
        const fallbackResult = await extractFallbackFields({
          sourceUrl,
          sourceType: 'google_maps_url',
          sourceText,
          parsedSource: parsedSource || null,
          providerRecord: providerRecordForFallback,
          existingCanonicalProfile: profile.toObject(),
        });

        // Merge recovered fields with FIELD-LEVEL provenance (P1.8 §12).
        // Never upgrade AI-generated values: their provenance stays
        // ai_generated even though they were recovered by the fallback. The
        // `onlyIfMissing` guard preserves higher-tier fields (identified/
        // discovered) — the fallback only fills genuine gaps.
        const mergeFallbackField = (fieldPath, value, evidenceMeta) => {
          if (value == null) return;
          if (profile.get(fieldPath) != null) return; // authoritative wins
          const prov = evidenceMeta?.provenance === 'ai_generated' ? 'ai_generated' : 'discovered';
          const conf = evidenceMeta?.confidence ?? 0.75;
          const sourceInfo = {
            sourceUrl: evidenceMeta?.sourceUrl || sourceUrl || undefined,
            provider: 'google_maps_fallback',
            extractionMethod: evidenceMeta?.extractionMethod || 'provider',
            metadata: {
              fallback: true,
              sourceType: evidenceMeta?.sourceType || 'google_maps_url',
              evidenceSnippet: evidenceMeta?.evidenceSnippet || null,
            },
          };
          try {
            profile.set(fieldPath, value, prov, conf, sourceInfo);
          } catch (err) {
            console.error(`[P1.8] Fallback merge failed for ${fieldPath} (best-effort): ${err?.message || String(err)}`);
          }
        };

        const ev = fallbackResult.evidence || {};
        if (fallbackResult.fields.address) {
          mergeFallbackField('location.full_address', fallbackResult.fields.address, ev.address);
          const comp = fallbackResult.fields.addressComponents;
          if (comp?.street) mergeFallbackField('location.street', comp.street, ev.address);
          if (comp?.city) mergeFallbackField('location.city', comp.city, ev.address);
          if (comp?.state) mergeFallbackField('location.state', comp.state, ev.address);
          if (comp?.postalCode) mergeFallbackField('location.postal_code', comp.postalCode, ev.address);
          if (comp?.country) mergeFallbackField('location.country', comp.country, ev.address);
        }
        if (fallbackResult.fields.phone) {
          mergeFallbackField('contact.phone', fallbackResult.fields.phone, ev.phone);
        }
        if (fallbackResult.fields.email) {
          mergeFallbackField('contact.email', fallbackResult.fields.email, ev.email);
        }
        if (fallbackResult.fields.website) {
          mergeFallbackField('contact.website', fallbackResult.fields.website, ev.website);
        }
        if (fallbackResult.fields.coordinates) {
          mergeFallbackField('location.coordinates', fallbackResult.fields.coordinates, ev.coordinates);
        }
        if (fallbackResult.fields.name && !profile.get('identity.name')) {
          mergeFallbackField('identity.name', fallbackResult.fields.name, ev.name);
        }
        if (fallbackResult.fields.category && !profile.get('identity.category')) {
          mergeFallbackField('identity.category', fallbackResult.fields.category, ev.category);
        }

        // Surface fallback provenance for observability and canonicalization.
        if (fallbackResult.evidence && Object.keys(fallbackResult.evidence).length > 0) {
          profile.fallbackEvidence = profile.fallbackEvidence || {};
          Object.assign(profile.fallbackEvidence, fallbackResult.evidence);
        }
        providerTrace.fallback = {
          status: fallbackResult.aiExtracted ? 'ai_extraction' : (Object.keys(fallbackResult.fields).length ? 'deterministic' : 'no_evidence'),
          recoveredFields: Object.keys(fallbackResult.fields),
          aiExtracted: fallbackResult.aiExtracted,
          unresolvedFields: fallbackResult.unresolvedFields || [],
          source: sourceUrl || null,
        };
      }
    }

    // --- LEVEL 3.9: P1.9 Google reputation extraction (rating/reviews) ---
    // Google Maps visibly contains ratings + reviews, but the provider chain
    // (Geoapify rarely returns ratings; web extraction omits them). Recover
    // reputation ONLY from actual evidence: structured provider record first,
    // then deterministic source-text parsing, then evidence-grounded AI.
    // AI NEVER guesses a rating or estimates a review count.
    // NOTE: sourceText from LEVEL 3.5 is block-scoped; re-derive here from
    // webRecord metadata or a fresh fetch, never double-fetch when possible.
    {
      const { extractReputation } = await import('./GoogleMapsReputationExtractor.js');
      const providerRecordForReputation = geoapifyRecord || webRecord || null;

      let reputationSourceText = webRecord?.metadata?.sourceText || null;
      if (!reputationSourceText && sourceUrl) {
        try {
          const { default: extractor } = await import('./BusinessDataExtractor.js');
          const pageData = await extractor.fetchPage(sourceUrl);
          reputationSourceText = (pageData.html || '').replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 6000);
        } catch {
          reputationSourceText = null;
        }
      }

      const repResult = await extractReputation({
        providerRecord: providerRecordForReputation,
        sourceText: reputationSourceText,
        sourceUrl,
        existingCanonicalProfile: profile.toObject(),
      });

      if (repResult?.reputation) {
        const rep = repResult.reputation;
        const merged = this._mergeReputation(profile, rep, repResult);
        providerTrace.reputation = {
          status: rep.status || 'unavailable',
          provenance: rep.provenance || null,
          aiExtracted: Boolean(repResult.aiExtracted),
          rating: rep.rating ?? null,
          reviewCount: rep.reviewCount ?? null,
          reviewCountSamples: Array.isArray(rep.reviews) ? rep.reviews.length : 0,
          source: rep.source || null,
          merged: merged,
        };
      }
    }

    // --- LEVEL 4: AI enrichment of gaps (does not overwrite high-confidence data) ---
    if (this._hasGaps(profile)) {
      await this._enrichMissingWithAI(profile, sourceUrl);
      providerTrace.aiEnrichment = true;
    }

    // --- LEVEL 5: validation ---
    const validation = validateBusinessProfile(profile.toObject());
    if (validation.issues.length > 0 && config?.debugBusinessAnalysis) {
      console.error('[BusinessResearchService] Profile validation issues:', validation.issues.map((i) => i.field).join(', '));
    }

    // --- LEVEL 6: persistent identity resolution ---
    // Persist the observed provider record(s) to a durable BusinessEntity so
    // Webloom can remember which real-world business a provider record belongs
    // to across research requests. Best-effort: a persistence failure must not
    // fail the research pipeline, but is logged/surfaced, never treated as
    // "identity not found".
    let persistence = { status: 'skipped', entityId: null };
    if (geoapifyRecord || webRecord) {
      persistence = await this._persistIdentity(profile, hints, sourceUrl, geoapifyRecord, webRecord);
    }

    const intelligence = this._profileToIntelligence(profile, hints, providerTrace);

    return {
      success: true,
      profile,
      intelligence,
      provider: providerTrace,
      validation,
      hints,
      persistence,
    };
  }

  /**
   * Persist a provider observation to a durable BusinessEntity.
   *
   * First checks the (provider, providerRecordId) mapping. If already known,
   * it reuses the mapped entity. Otherwise, when multiple providers observed
   * the same business, it runs Entity Resolution; on a strong match the
   * second provider's observation maps to the same persistent entity.
   *
   * Lifecycle:
   *   first observation  → create BusinessEntity + ProviderIdentity
   *   repeat observation → reuse entity, touchProviderIdentity (update lastSeen)
   *   new provider, same business (same_entity) → map to same entity
   *   different entity   → creates a distinct entity (never contaminates)
   *   uncertain          → creates/keeps a separate provisional entity (no forced reuse)
   *
   * Persistence failures are surfaced (logged + status) and never treated as
   * "identity not found". The research pipeline is never failed by this step.
   *
   * @param {BusinessProfile} profile
   * @param {Object} hints
   * @param {string|null} sourceUrl
   * @param {Object|null} geoapifyRecord
   * @param {Object|null} webRecord
   * @returns {Promise<Object>} { status, entityId, providerIdentities, resolutionRecord }
   */
  async _persistIdentity(profile, hints, sourceUrl, geoapifyRecord, webRecord) {
    let repo;
    let transientEntityId = null;
    try {
      // Lazily initialize DB (safe if the raw connection already exists)
      const db = (() => {
        try {
          return getDb();
        } catch {
          return null;
        }
      })();

      let dbInstance = db;
      if (!dbInstance) {
        // First use in this process — initialize (creates tables if absent)
        dbInstance = await initializeDatabase(config?.database?.sqlitePath || './webloom.db');
      }
      repo = new IdentityRepository(dbInstance);
    } catch (err) {
      console.error(`[IdentityPersistence] Database unavailable: ${err?.message || String(err)}`);
      return { status: 'database_unavailable', entityId: null, providerIdentities: [], resolutionRecord: null };
    }

    // Build ordered list of provider observations to persist.
    // Geoapify is the primary/authoritative provider; web-extraction is secondary.
    //
    // P1.7: When the Google Maps URL carries an authoritative placeId/cid,
    // use THAT as the providerRecordId for geoapify — not the raw URL.
    // The raw URL changes with tracking parameters and is not a stable
    // identity key. A deterministic placeId from the URL is the correct
    // identifier for the provider mapping, ensuring repeat lookups resolve
    // to the same persistent entity.
    const urlPlaceId = hints?.placeId || hints?.cid || null;
    const observations = [];
    if (geoapifyRecord) {
      observations.push({
        record: geoapifyRecord,
        provider: 'geoapify',
        providerRecordId: urlPlaceId || geoapifyRecord?.provider?.placeId || sourceUrl || null,
      });
    }
    if (webRecord) {
      observations.push({
        record: webRecord,
        provider: 'web_extraction',
        providerRecordId: sourceUrl || null,
      });
    }

    if (observations.length === 0) {
      return { status: 'no_observations', entityId: null, providerIdentities: [], resolutionRecord: null };
    }

    try {
      let entityId = null;
      const providerIdentities = [];
      let resolutionRecord = null;
      const reviewItems = [];

      // Primary observation determines the initial entity via provider lookup.
      const primary = observations[0];
      let primaryMapping = null;
      if (primary.providerRecordId) {
        try {
          primaryMapping = repo.findProviderIdentity(primary.provider, primary.providerRecordId);
        } catch (err) {
          if (err instanceof NotFoundError) primaryMapping = null;
          else throw err;
        }
      }

      if (primaryMapping) {
        // Already-known identity — reuse it.
        entityId = primaryMapping.entityId;
        try {
          repo.touchProviderIdentity(primary.provider, primary.providerRecordId, {
            resolutionMethod: 'known_identity',
          });
        } catch (err) {
          // Non-fatal observation update failure
          console.error(`[IdentityPersistence] touchProviderIdentity failed (best-effort): ${err?.message || String(err)}`);
        }
      } else {
        // Unseen primary observation — create a new persistent entity ONLY when
        // there is genuine identity evidence.  P1.2 synthetic identity
        // prevention: never manufacture 'Unknown Business' / 'Unknown' as
        // durable canonical values; those strings silently corrupt identity
        // resolution, downstream research, and intelligence rendering.
        if (!this._hasSufficientIdentity(primary.record, hints)) {
          return { status: 'insufficient_evidence', entityId: null, providerIdentities: [], resolutionRecord: null };
        }

        // Pick the canonical name. A provider (esp. Geoapify when the search
        // drifts to a street-level feature) can return a street address in the
        // `name` field. The URL-derived hint name is authoritative identity;
        // an address-looking string must not become the canonical business name.
        const recordName = this._canonicalName(primary.record);
        const canonicalName =
          recordName && !this._looksLikeStreetAddress(recordName)
            ? recordName
            : hints.name || recordName || 'Unknown Business';
        const canonicalAddress = this._canonicalAddress(primary.record) || null;

        // Safety net: if after all canonical accessors the name is still
        // synthetic / null, do not create an entity.
        if (this._isSyntheticName(canonicalName)) {
          return { status: 'insufficient_evidence', entityId: null, providerIdentities: [], resolutionRecord: null };
        }

        const identityData = {
          canonicalName,
          canonicalAddress: canonicalAddress || 'Unknown',
          canonicalPhone: this._canonicalContact(primary.record)?.phone || null,
          canonicalWebsite: this._canonicalContact(primary.record)?.website || null,
          canonicalLatitude: this._canonicalCoordinates(primary.record)?.lat ?? null,
          canonicalLongitude: this._canonicalCoordinates(primary.record)?.lng ?? null,
          category: this._canonicalCategory(primary.record) || null,
        };

        if (primary.providerRecordId) {
          const created = repo.createEntityWithProviderIdentity(identityData, {
            provider: primary.provider,
            providerRecordId: primary.providerRecordId,
            resolutionMethod: 'first_observation',
            resolutionConfidence: 0.95,
          });
          entityId = created.entity.entityId;
          providerIdentities.push(created.providerIdentity);
        } else {
          const entity = repo.createEntity(identityData);
          entityId = entity.entityId;
        }
      }

      // Secondary observation (another provider for the same business).
      if (observations.length > 1) {
        const secondary = observations[1];
        if (secondary.providerRecordId) {
          let secondaryMapping = null;
          try {
            secondaryMapping = repo.findProviderIdentity(secondary.provider, secondary.providerRecordId);
          } catch (err) {
            if (err instanceof NotFoundError) secondaryMapping = null;
            else throw err;
          }

          if (secondaryMapping) {
            // Already known — reuse its entity.
            try {
              repo.touchProviderIdentity(secondary.provider, secondary.providerRecordId, {
                resolutionMethod: 'known_identity',
              });
            } catch (err) {
              console.error(`[IdentityPersistence] touchProviderIdentity failed (best-effort): ${err?.message || String(err)}`);
            }
            // Secondary known entity should align with primary when both describe
            // the same business; do not force-overwrite a conflicting known mapping.
          } else {
            // Run Entity Resolution to decide whether secondary maps to the
            // primary entity or must stay separate.
            let matchType = 'uncertain';
            let matchScore = 0;
            try {
              const matchResult = calculateMatchScore(primary.record, secondary.record);
              matchScore = parseFloat(matchResult.score.toFixed(2));
              matchType = matchResult.matchType;
            } catch (err) {
              console.error(`[IdentityPersistence] Entity Resolution failed (best-effort): ${err?.message || String(err)}`);
            }

            const resolveToPrimary = matchType === 'same_entity' && matchScore >= 0.85;
            const targetEntityId = resolveToPrimary ? entityId : (() => {
              // P1.2: Never manufacture synthetic identity values for uncertain
              // secondary observations. If the secondary record lacks sufficient
              // identity evidence, map it to the primary entity rather than
              // creating a fake "Unknown Business" entity.  If the primary entity
              // itself has no real identity (can happen when both are AI-derived
              // and synthetic), do not create a synthetic secondary entity either.
              if (this._isSyntheticName(this._canonicalName(secondary.record)) && !this._canonicalAddress(secondary.record)) {
                // Insufficient secondary identity — map to primary and let
                // review queue handle the ambiguity.
                return entityId;
              }
              const secondaryRecordName = this._canonicalName(secondary.record);
              const secondaryCanonicalName =
                secondaryRecordName && !this._looksLikeStreetAddress(secondaryRecordName)
                  ? secondaryRecordName
                  : hints.name || secondaryRecordName || 'Unknown Business';
              const e = repo.createEntity({
                canonicalName: this._isSyntheticName(secondaryCanonicalName) ? null : secondaryCanonicalName,
                canonicalAddress: this._canonicalAddress(secondary.record) || 'Unknown',
                canonicalPhone: this._canonicalContact(secondary.record)?.phone || null,
                canonicalWebsite: this._canonicalContact(secondary.record)?.website || null,
                canonicalLatitude: this._canonicalCoordinates(secondary.record)?.lat ?? null,
                canonicalLongitude: this._canonicalCoordinates(secondary.record)?.lng ?? null,
                category: this._canonicalCategory(secondary.record) || null,
              });
              return e.entityId;
            })();

            const mapping = repo.createProviderIdentity({
              provider: secondary.provider,
              providerRecordId: secondary.providerRecordId,
              entityId: targetEntityId,
              resolutionMethod: resolveToPrimary ? 'same_entity_match' : (matchType === 'different_entity' ? 'different_entity' : 'uncertain'),
              resolutionConfidence: resolveToPrimary ? matchScore : null,
            });
            providerIdentities.push(mapping);

            // Persist the genuine resolution decision.
            resolutionRecord = repo.createResolutionRecord({
              entityId: targetEntityId,
              matchScore,
              matchType,
              providerA: primary.provider,
              providerRecordIdA: primary.providerRecordId || null,
              providerB: secondary.provider,
              providerRecordIdB: secondary.providerRecordId || null,
              status: resolveToPrimary ? 'confirmed' : 'pending_review',
              confidence: matchScore,
              notes: resolveToPrimary
                ? 'Strong match; secondary provider mapped to primary entity.'
                : (matchType === 'different_entity'
                  ? 'Providers describe distinct entities; kept separate.'
                  : 'Ambiguous match; provisional separate entity pending review.'),
            });

            // Hook A (Phase 15): enqueue a human-review item for genuinely
            // ambiguous pairwise resolutions. same_entity (merged into primary)
            // and different_entity (confidently distinct) need no review; only
            // same_brand_different_location and uncertain are queued. The
            // resolution_record above remains the immutable evidence; this review
            // is the separate, actionable state. Best-effort — a review-queue
            // failure never breaks persistence, and the dedupe key keeps repeated
            // research of the same pair from piling up duplicates.
            if (!resolveToPrimary && (matchType === 'same_brand_different_location' || matchType === 'uncertain')) {
              try {
                const review = repo.createReviewItem({
                  entityId,
                  relatedEntityId: targetEntityId !== entityId ? targetEntityId : null,
                  provider: primary.provider,
                  providerRecordId: primary.providerRecordId || null,
                  relatedProvider: secondary.provider,
                  relatedProviderRecordId: secondary.providerRecordId || null,
                  matchType,
                  matchScore,
                  reason: resolutionRecord?.notes || 'Ambiguous entity resolution pending human review.',
                  evidence: { source: 'pairwise_resolution', matchType, matchScore },
                  dedupeContext: {
                    providerA: primary.provider,
                    providerRecordIdA: primary.providerRecordId || null,
                    providerB: secondary.provider,
                    providerRecordIdB: secondary.providerRecordId || null,
                    matchType,
                  },
                });
                reviewItems.push(review);
              } catch (reviewErr) {
                console.error(`[ReviewQueue] Failed to enqueue pairwise review (best-effort): ${reviewErr?.message || String(reviewErr)}`);
              }
            }
          }
        }
      }

      // Associate the resolved persistent entity ID with the in-memory profile.
      if (entityId) {
        profile.setEntityId(entityId);
        
        // PHASE 5: Load canonical fields from persistent storage into the profile
        // This ensures that previously canonicalized fields are available for merging
        try {
          await repo.loadCanonicalFieldsIntoProfile(entityId, profile);
        } catch (loadErr) {
          console.error(`[CanonicalProfileLoad] Failed to load canonical fields: ${loadErr?.message || String(loadErr)}`);
        }
      }

      // PHASE 4: Canonicalization - Process observations to build canonical business intelligence
      try {
        const canonicalizationService = new CanonicalizationService(repo);
        
        // Process each observation through canonicalization
        for (const obs of observations) {
          if (obs.record && entityId) {
            const sourceInfo = {
              sourceUrl: sourceUrl || obs.record?.metadata?.sourceUrl,
              provider: obs.provider,
              providerRecordId: obs.providerRecordId
            };
            
            const canonicalizationResult = await canonicalizationService.processObservation({
              entityId,
              provider: obs.provider,
              providerRecordId: obs.providerRecordId,
              record: obs.record,
              sourceInfo: { sourceUrl },
              confidence: 0.8
            });
            
            // Log canonicalization results
            if (config?.debugBusinessAnalysis) {
              console.log(`[Canonicalization] Entity ${entityId}: ${canonicalizationResult.canonicalizedFields.length} fields canonicalized, ${canonicalizationResult.conflictsDetected.length} conflicts, ${canonicalizationResult.provenanceUpgrades.length} provenance upgrades`);
            }
          }
        }
      } catch (canonErr) {
        // Canonicalization failure must not break the research pipeline
        console.error(`[Canonicalization] Failed (best-effort): ${canonErr?.message || String(canonErr)}`);
      }

      // Refresh the in-memory profile so downstream consumers receive the
      // canonical selection after processing fresh provider observations.
      if (entityId) {
        try {
          await repo.loadCanonicalFieldsIntoProfile(entityId, profile);
        } catch (loadErr) {
          console.error(`[CanonicalProfileLoad] Failed to refresh canonical fields: ${loadErr?.message || String(loadErr)}`);
        }
      }

      // Hook B (Phase 15): temporal relocation analysis over the entity's full,
      // now-persisted observation history (durable across restarts). A genuine
      // old->new move carrying stable identity is queued as `relocated_entity`;
      // a simultaneous two-address branch is queued as
      // `same_brand_different_location`. `uncertain` (insufficient history) is
      // intentionally NOT queued so the common null case does not flood the
      // queue. This never merges entities and never mutates canonical data.
      // Best-effort — a failure here never breaks persistence.
      if (entityId) {
        try {
          const temporal = analyzeEntityRelocation(repo, entityId);
          if (
            temporal.verdict === TEMPORAL_VERDICT.RELOCATED ||
            temporal.verdict === TEMPORAL_VERDICT.SAME_BRAND_DIFFERENT_LOCATION
          ) {
            const reviewMatchType =
              temporal.verdict === TEMPORAL_VERDICT.RELOCATED
                ? 'relocated_entity'
                : 'same_brand_different_location';
            const review = repo.createReviewItem({
              entityId,
              matchType: reviewMatchType,
              reason: temporal.reason,
              evidence: { source: 'temporal_analysis', verdict: temporal.verdict, ...temporal.evidence },
              dedupeContext: {
                entityId,
                addressFrom: temporal.evidence?.addressFrom || null,
                addressTo: temporal.evidence?.addressTo || null,
                matchType: reviewMatchType,
              },
            });
            reviewItems.push(review);
          }
        } catch (temporalErr) {
          console.error(`[ReviewQueue] Temporal relocation analysis failed (best-effort): ${temporalErr?.message || String(temporalErr)}`);
        }
      }

      return {
        status: 'ok',
        entityId,
        providerIdentities,
        resolutionRecord,
        reviewItems,
      };
    } catch (err) {
      if (err instanceof DuplicateError) {
        // Concurrent creation race: another request created the mapping first.
        // Recover by re-fetching the provider identity and reusing its entity.
        console.error(`[IdentityPersistence] Duplicate provider identity (best-effort recovery): ${err?.message || String(err)}`);
        for (const obs of observations) {
          if (obs.providerRecordId) {
            try {
              const existing = repo.findProviderIdentity(obs.provider, obs.providerRecordId);
              if (existing) {
                if (transientEntityId && transientEntityId !== existing.entityId) {
                  repo.deleteEntity(transientEntityId);
                }
                profile.setEntityId(existing.entityId);
                return {
                  status: 'ok',
                  entityId: existing.entityId,
                  providerIdentities: [existing],
                  resolutionRecord: null,
                  reviewItems: [],
                  recoveredFromDuplicate: true,
                };
              }
            } catch (innerErr) {
              // continue attempting recovery
            }
          }
        }
        // Could not recover — surface as a persistence error, not "not found".
        console.error(`[IdentityPersistence] Duplicate identity and recovery failed`);
        return { status: 'duplicate_unresolved', entityId: null, providerIdentities: [], resolutionRecord: null };
      }

      // Genuine persistence failure — surface, do not swallow as "not found".
      console.error(`[IdentityPersistence] Persistence failure: ${err?.message || String(err)}`);
      return { status: 'error', entityId: null, providerIdentities: [], resolutionRecord: null, error: err?.message || String(err) };
    }
  }

  // ---- lightweight accessors for canonical record shapes ----

  /**
   * Check if a canonical name is a synthetic placeholder rather than a real
   * business identity.  P1.2 synthetic identity prevention: these strings must
   * never be persisted as durable canonical identity values.
   *
   * @param {string|null} name
   * @returns {boolean} true if the name is a synthetic placeholder
   */
  _isSyntheticName(name) {
    if (!name || typeof name !== 'string') return true;
    const trimmed = name.trim().toLowerCase();
    return /^(unknown\s*business|unknown|n\/a|unnamed business|na)$/i.test(trimmed);
  }

  /**
   * Detect address-looking strings that sometimes leak into the name field.
   * A street address is a location datum, not a business identity — it must
   * never become (or replace) the canonical business name.
   *
   * Delegates to the shared detector so the same guard applies in the
   * CanonicalizationService write path and loadCanonicalFieldsIntoProfile.
   *
   * @param {string|null} name
   * @returns {boolean}
   */
  _looksLikeStreetAddress(name) {
    return looksLikeStreetAddress(name);
  }

  /**
   * Determine whether a record carries enough identity evidence to safely
   * persist a BusinessEntity.  Returns true when at least one authoritative
   * identity signal is present: a real (non-synthetic) name, a hard provider
   * identifier (placeId / CID), coordinates, a normalized phone, or a
   * website — alone or combined.
   *
   * This is the P1.2 synthetic identity prevention gate: if a record has no
   * usable identity, we must NOT manufacture one (e.g. "Unknown Business").
   *
   * P1.2 AI quarantine (requirement 2G): an AI-derived record (metadata.aiExtracted)
   * must NOT independently create a durable authoritative identity.  AI names/
   * phones/websites are candidate evidence only; they cannot bootstrap an entity
   * unless a deterministic signal (URL-derived hint name/coords, or a hard
   * provider identifier) anchors the identity.
   *
   * @param {Object} record     - canonical flat provider record
   * @param {Object} recordHints - deterministic input hints (may carry name/coords)
   * @returns {boolean}
   */
  _hasSufficientIdentity(record, recordHints) {
    const isAiDerived = Boolean(record?.metadata?.aiExtracted);
    const name = recordHints?.name || this._canonicalName(record);
    const hasRealName = !this._isSyntheticName(name);
    const hasCoords = Boolean(this._canonicalCoordinates(record)?.lat);
    const hasProviderId = Boolean(record?.provider?.placeId || record?.source?.placeId);
    const contact = this._canonicalContact(record) || {};
    const hasPhone = Boolean(contact.phone);
    const hasWebsite = Boolean(contact.website);
    const address = this._canonicalAddress(record);
    const hasRealAddress = Boolean(address && !/^(unknown|n\/a)$/i.test(String(address).trim()));

    // Deterministic anchors that are authoritative regardless of AI derivation:
    // hard provider ID, URL-derived hint name, or URL-derived coordinates.
    const hasDeterministicAnchor =
      hasProviderId ||
      Boolean(recordHints?.name && !this._isSyntheticName(recordHints.name)) ||
      Boolean(recordHints?.latitude != null && recordHints?.longitude != null);

    if (isAiDerived) {
      // AI-derived data alone must never bootstraps a durable entity.
      return hasDeterministicAnchor;
    }

    return hasRealName || hasCoords || hasProviderId || hasPhone || hasWebsite || hasRealAddress;
  }

  _canonicalName(record) {
    return record?.business?.name || record?.identity?.name?.value || record?.identity?.name || record?.name || null;
  }

  _canonicalAddress(record) {
    return record?.location?.full_address || record?.location?.address || record?.address || null;
  }

  _canonicalContact(record) {
    return record?.contact || null;
  }

  _canonicalCoordinates(record) {
    return record?.location?.coordinates || null;
  }

  _canonicalCategory(record) {
    return record?.business?.category || record?.identity?.category?.value || record?.identity?.category || record?.category || null;
  }

  /**
   * Convert deterministic input hints from URL / name / coords.
   *
   * Coordinate authority: operator-supplied latitude/longitude (from the
   * request body) and coordinates embedded in a /place/ URL are AUTHORITATIVE
   * identity anchors. The @lat,lng of a /search/ URL is a viewport, not a pin:
   * it is forwarded on the hints for proximity bias only and MUST NOT drive
   * the P1.7 coordinate-rejection gate. That gate is keyed off
   * hints.coordinatesAuthoritative.
   */
  async _buildHints(input = {}) {
    const hints = extractDeterministicHints(input);

    // Explicit operator-supplied coordinates are authoritative anchors.
    const operatorCoords =
      input?.latitude != null && input?.longitude != null;
    let urlAuthority = null; // 'place' | 'search' | null

    // Pull from a Google Maps URL via GoogleMapsUrlParser if available.
    if (input.googleMapsUrl) {
      try {
        const { default: parser } = await import('./GoogleMapsUrlParserProvider.js');
        const parsed = parser.parse(input.googleMapsUrl);
        const identified = parsed.identified || {};
        if (identified.placeName && !hints.name) hints.name = identified.placeName;
        urlAuthority = identified.urlType || null;
        // Coordinates from a URL: only /place/ URLs carry a business pin.
        // /search/ URLs carry a viewport center — proximity bias only, never
        // an authoritative anchor (see coordinatesAuthoritative below).
        if (identified.coordinates) {
          if (hints.latitude == null) hints.latitude = identified.coordinates.lat;
          if (hints.longitude == null) hints.longitude = identified.coordinates.lng;
        }
      } catch {
        // ignore parse failure; rely on other hints
      }
    }

    // Authoritative ONLY when the coordinates came from an explicit operator
    // input or a /place/ URL pin. Viewport coords (or no URL type at all)
    // never anchor identity.
    hints.coordinatesAuthoritative =
      operatorCoords || urlAuthority === 'place';

    // P1.7: Always attempt to forward placeId/cid from the URL, even when
    // extractDeterministicHints() already found a name from the input.
    // These are authoritative identity anchors that constrain provider lookup
    // and must not be silently dropped.
    if (input.googleMapsUrl && !hints.placeId) {
      try {
        const { default: parser } = await import('./GoogleMapsUrlParserProvider.js');
        const parsed = parser.parse(input.googleMapsUrl);
        const identified = parsed.identified || {};
        if (identified.placeId) hints.placeId = identified.placeId;
        if (identified.urlType) hints.urlType = identified.urlType;
        // Forward cid separately when the placeId is in hex CID format
        if (identified.placeId && identified.placeId.startsWith('0x')) {
          hints.cid = identified.placeId;
        }
      } catch {
        // ignore parse failure
      }
    }
    hints.sourceUrl = input.googleMapsUrl || input.sourceUrl || null;
    return hints;
  }

  /**
   * Merge a canonical provider record into the BusinessProfile.
   * @param {BusinessProfile} profile
   * @param {Object} record - canonical flat shape
   * @param {string} provenance
   * @param {string} providerLabel - 'geoapify' | 'web_extraction'
   * @param {string|null} sourceUrl
   * @param {boolean} onlyIfMissing - if true, do not overwrite existing values
   * @param {Object} resolutionInfo - (optional) Entity Resolution match result metadata
   */
  _mergeCanonical(profile, record, provenance, providerLabel, sourceUrl, onlyIfMissing = false, resolutionInfo = null) {
    if (!record || typeof record !== 'object') return;

    const sourceInfo = { sourceUrl: sourceUrl || undefined };
    const confidence = record.confidence || {};

    // P1.2 AI quarantine: if the record was produced by AI extraction (flagged
    // in the extraction metadata), downgrade its provenance to ai_generated so
    // its identity fields can NEVER outrank deterministic URL/provider identity.
    // AI data remains available as candidate/evidence data (fills gaps only).
    const isAiDerived = Boolean(record?.metadata?.aiExtracted);
    const effectiveProvenance = isAiDerived && provenance === 'discovered' ? 'ai_generated' : provenance;

    const setOrSkip = (fieldPath, value, conf) => {
      if (value == null || value === '') return;
      if (onlyIfMissing && profile.get(fieldPath) != null) return;

      // Data-quality guard: an address-looking string must never replace an
      // existing real business name. Providers (esp. Geoapify when the search
      // drifts to a street-level feature) can return a street address in the
      // `name` field. A URL-derived business name (`identified`) or another
      // provider's real name already on the profile is authoritative; the
      // address string is a different datum (the location), not identity.
      if (fieldPath === 'identity.name') {
        const existingName = profile.get('identity.name');
        if (existingName && this._looksLikeStreetAddress(value) && !this._looksLikeStreetAddress(existingName)) {
          return;
        }
        // Never let a bare address become the canonical business name at all.
        if (!existingName && this._looksLikeStreetAddress(value)) {
          return;
        }
      }

      profile.set(fieldPath, value, effectiveProvenance, conf, sourceInfo);
    };

    if (record.business) {
      setOrSkip('identity.name', sanitizeFieldValue(record.business.name), confidence.name || 0.9);
      setOrSkip('identity.category', sanitizeFieldValue(record.business.category), confidence.category || 0.8);
      if (Array.isArray(record.business.categories) && record.business.categories.length) {
        if (!onlyIfMissing || !profile.get('identity.categories') || profile.get('identity.categories').length === 0) {
          profile.set('identity.categories', record.business.categories, effectiveProvenance, 0.8, sourceInfo);
        }
      }
      setOrSkip('identity.description', sanitizeFieldValue(record.business.description), 0.7);
      setOrSkip('identity.business_type', sanitizeFieldValue(record.business.business_type), 0.8);
    }

    if (record.contact) {
      setOrSkip('contact.phone', sanitizeFieldValue(record.contact.phone), confidence.phone || 0.9);
      setOrSkip('contact.email', sanitizeFieldValue(record.contact.email), 0.8);
      setOrSkip('contact.website', sanitizeFieldValue(record.contact.website), confidence.website || 0.85);
    }

    if (record.location) {
      setOrSkip('location.full_address', sanitizeFieldValue(record.location.full_address), confidence.address || 0.9);
      setOrSkip('location.street', sanitizeFieldValue(record.location.street), 0.85);
      setOrSkip('location.city', sanitizeFieldValue(record.location.city), 0.85);
      setOrSkip('location.state', sanitizeFieldValue(record.location.state), 0.8);
      setOrSkip('location.country', sanitizeFieldValue(record.location.country), 0.85);
      setOrSkip('location.postal_code', sanitizeFieldValue(record.location.postal_code), 0.85);
      const coords = record.location.coordinates || (record.location.latitude != null && record.location.longitude != null ? { lat: record.location.latitude, lng: record.location.longitude } : null);
      if (coords) setOrSkip('location.coordinates', coords, 0.95);
    }

    if (record.ratings) {
      if (typeof record.ratings.rating === 'number') setOrSkip('ratings.rating', record.ratings.rating, confidence.rating || 0.85);
      if (typeof record.ratings.review_count === 'number') setOrSkip('ratings.review_count', record.ratings.review_count, 0.85);
    }

    if (record.hours && Object.keys(record.hours).some((k) => record.hours[k])) {
      // Merge day-by-day; prefer existing over new when onlyIfMissing
      if (!onlyIfMissing) {
        profile.set('hours', record.hours, effectiveProvenance, 0.8, sourceInfo);
      } else {
        const existingHours = profile.get('hours') || {};
        const merged = { ...existingHours };
        for (const [day, val] of Object.entries(record.hours)) {
          if (val && !merged[day]) merged[day] = val;
        }
        profile.set('hours', merged, effectiveProvenance, 0.8, sourceInfo);
      }
    }

    if (Array.isArray(record.services) && record.services.length) {
      if (!onlyIfMissing || profile.get('identity.services') == null) {
        profile.set('identity.services', record.services, effectiveProvenance, 0.7, sourceInfo);
      }
    }
  }

  /**
   * Conservative merge for records identified as potentially different entities.
   * Only merges non-identity data (ratings, hours, amenities) that are unlikely to differ
   * between unrelated businesses. Completely skips merging identity fields (name, category,
   * address) that would conflict if these are truly different entities.
   *
   * @param {BusinessProfile} profile
   * @param {Object} record - provider record
   * @param {string|null} sourceUrl
   * @param {Object} resolutionInfo - Entity Resolution metadata
   */
  _mergeConservativelyForDifferentEntities(profile, record, sourceUrl, resolutionInfo) {
    if (!record || typeof record !== 'object') return;

    const sourceInfo = { sourceUrl: sourceUrl || undefined };
    const confidence = record.confidence || {};

    // Only merge supplemental data that would not change business identity:
    // - Hours (business hours can be supplementary)
    // - Ratings/reviews (public data, non-identifying)
    // DO NOT merge: name, address, phone, website, category, description

    if (record.hours && Object.keys(record.hours).some((k) => record.hours[k])) {
      const existingHours = profile.get('hours') || {};
      if (Object.keys(existingHours).length === 0) {
        // Only merge if profile has no hours yet
        profile.set('hours', record.hours, 'discovered', 0.5, sourceInfo);
      }
    }

    if (record.ratings) {
      if (typeof record.ratings.rating === 'number' && profile.get('ratings.rating') == null) {
        profile.set('ratings.rating', record.ratings.rating, 'discovered', 0.6, sourceInfo);
      }
      if (typeof record.ratings.review_count === 'number' && profile.get('ratings.review_count') == null) {
        profile.set('ratings.review_count', record.ratings.review_count, 'discovered', 0.6, sourceInfo);
      }
    }
  }

  /**
   * Merge P1.9 reputation extraction results into the profile with provenance.
   *
   * Authority: structured provider (observed) > source-text parser (observed)
   * > AI evidence extraction (ai_generated). AI never upgrades to observed.
   * Gaps-only: never overwrite an existing higher-tier rating/review count.
   *
   * @param {BusinessProfile} profile
   * @param {Object} rep - reputation block from GoogleMapsReputationExtractor
   * @param {Object} result - { provenance, aiExtracted }
   * @returns {boolean} merged anything
   */
  _mergeReputation(profile, rep, result = {}) {
    if (!rep || typeof rep !== 'object') return false;
    let merged = false;
    const provenances = { observed: 3, parsed: 2, ai_generated: 0.5 };

    const isNewerOrMissing = (path, prov) => {
      const existing = profile.getField(path);
      if (!existing || existing.value == null) return true;
      const existingPriority = provenances[existing.provenance] ?? 0;
      const newPriority = provenances[prov] ?? 0;
      return newPriority > existingPriority;
    };

    const prov = result.provenance === 'ai_generated' ? 'ai_generated' : 'discovered';
    const sourceInfo = {
      sourceUrl: rep.sourceUrl || undefined,
      provider: rep.source === 'provider_record' ? 'structured_provider' : 'google_maps',
      extractionMethod: rep.source === 'provider_record' ? 'provider' : (result.aiExtracted ? 'ai_evidence_extraction' : 'parser'),
      metadata: {
        reputation: true,
        provenance: result.provenance || 'observed',
        confidence: rep.confidence ?? 0,
        status: rep.status ?? null,
        evidence: rep.evidence ?? null,
      },
    };

    if (rep.rating != null && isNewerOrMissing('ratings.rating', prov)) {
      profile.set('ratings.rating', rep.rating, prov, rep.confidence ?? 0.7, sourceInfo);
      merged = true;
    }
    if (rep.reviewCount != null && isNewerOrMissing('ratings.review_count', prov)) {
      profile.set('ratings.review_count', rep.reviewCount, prov, rep.confidence ?? 0.7, sourceInfo);
      merged = true;
    }
    if (Array.isArray(rep.reviews) && rep.reviews.length > 0) {
      profile.set('ratings.reviews', rep.reviews, prov, rep.confidence ?? 0.6, sourceInfo);
      merged = true;
    }
    if (rep.reviewSummary != null) {
      profile.set('ratings.review_summary', rep.reviewSummary, prov, rep.confidence ?? 0.5, sourceInfo);
      merged = true;
    }
    if (rep.sentiment != null) {
      profile.set('ratings.sentiment', rep.sentiment, prov, rep.confidence ?? 0.5, sourceInfo);
      merged = true;
    }
    if (Array.isArray(rep.themes) && rep.themes.length > 0) {
      profile.set('ratings.themes', rep.themes, prov, rep.confidence ?? 0.5, sourceInfo);
      merged = true;
    }

    return merged;
  }

  /**
   * Enrich missing profile fields without overwriting provider facts.
   */
  async _enrichMissingWithAI(profile, sourceUrl) {
    try {
      const { default: AIService } = await import('./AIService.js');

      // Known structured information (do NOT ask AI to re-derive these)
      const known = {
        name: profile.get('identity.name'),
        phone: profile.get('contact.phone'),
        website: profile.get('contact.website'),
        address: profile.get('location.full_address'),
        coordinates: profile.get('location.coordinates'),
        rating: profile.get('ratings.rating'),
        review_count: profile.get('ratings.review_count'),
        category: profile.get('identity.category'),
      };

      // Unresolved fields AI may attempt to fill / normalize
      const unresolved = {
        description: profile.get('identity.description'),
        services: (profile.get('identity.services') || []).slice(0, 20),
        category: known.category,
      };

      // If nothing meaningful is unresolved, skip AI to save calls
      const hasSomethingToEnrich =
        !known.category ||
        !known.description ||
        (unresolved.services && unresolved.services.length === 0);

      if (!hasSomethingToEnrich) return;

      const prompt = [
        'You are a business-data enrichment assistant. You are given KNOWN verified structured facts for a business and a list of UNRESOLVED fields.',
        '',
        'KNOWN STRUCTURED DATA (do not contradict or overwrite these):',
        JSON.stringify(known, null, 2),
        '',
        'UNRESOLVED FIELDS TO FILL (return existing values if already set):',
        JSON.stringify(unresolved, null, 2),
        '',
        'Rules:',
        '- Only fill fields that are currently null/empty; never change provided KNOWN values.',
        '- category must be a short concrete business type/category label.',
        '- description must be 1-3 concise sentences about the business (not a hallucination of facts).',
        '- services must be an array of concrete service strings derived from the business category/known facts. Leave empty if you cannot infer any.',
        '- Return ONLY valid JSON matching the schema. No markdown, no extra text.',
      ].join('\n');

      const schema = {
        type: 'object',
        properties: {
          category: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          services: { type: 'array', items: { type: 'string' } },
        },
        required: ['category', 'description', 'services'],
      };

      const result = await AIService.generate({
        prompt,
        model: 'reasoning',
        schema,
        temperature: 0.3,
        maxTokens: 1500,
        systemPrompt: 'You enrich only the missing business fields using the provided known data. Never invent factual fields like phone/address/website that were not verified.',
      });

      if (result && typeof result === 'object') {
        if (result.category && profile.get('identity.category') == null) {
          profile.set('identity.category', sanitizeFieldValue(result.category), 'inferred', 0.6, { sourceUrl });
        }
        if (result.description && profile.get('identity.description') == null) {
          profile.set('identity.description', sanitizeFieldValue(result.description), 'inferred', 0.6, { sourceUrl });
        }
        if (Array.isArray(result.services) && result.services.length && profile.get('identity.services') == null) {
          profile.set('identity.services', result.services.map(sanitizeFieldValue), 'inferred', 0.6, { sourceUrl });
        }
      }
    } catch (error) {
      // AI enrichment is best-effort; never fail the whole pipeline on it.
      console.error('[BusinessResearchService] AI enrichment failed (best-effort):', error?.safeMessage || error?.message);
    }
  }

  _hasGaps(profile) {
    const fields = [
      'identity.name',
      'identity.category',
      'identity.description',
      'contact.phone',
      'contact.website',
      'location.full_address',
    ];
    return fields.some((f) => profile.get(f) == null);
  }

  /**
   * Convert a canonical BusinessProfile into the Webloom "intelligence" shape
   * (same shape produced by extractBusinessIntelligence) so downstream
   * consumers (BrandStrategyService, WebsiteStrategy, etc.) are unchanged.
   */
  _profileToIntelligence(profile, hints, providerTrace) {
    const name = profile.get('identity.name');
    const category = profile.get('identity.category');
    const phone = profile.get('contact.phone');
    const website = profile.get('contact.website');
    const address = profile.get('location.full_address');
    const coordinates = profile.get('location.coordinates');
    const rating = profile.get('ratings.rating');
    const reviewCount = profile.get('ratings.review_count');
    const reviews = profile.get('ratings.reviews') || [];
    const reviewSummary = profile.get('ratings.review_summary') || null;
    const sentiment = profile.get('ratings.sentiment') || null;
    const themes = profile.get('ratings.themes') || [];
    const services = profile.get('identity.services') || [];

    // Get enhanced field info with provenance and conflict info
    const getFieldWithProvenance = (path) => {
      const field = profile.getField(path);
      if (!field) return { value: null, provenance: null, confidence: 0, hasConflict: false };
      const conflicts = profile.getConflicts ? profile.getConflicts(path) : [];
      return {
        value: field.value,
        provenance: field.provenance,
        confidence: field.confidence,
        hasConflict: conflicts.length > 0,
        conflictCount: conflicts.length
      };
    };

    const nameInfo = getFieldWithProvenance('identity.name');
    const categoryInfo = getFieldWithProvenance('identity.category');
    const phoneInfo = getFieldWithProvenance('contact.phone');
    const websiteInfo = getFieldWithProvenance('contact.website');
    const addressInfo = getFieldWithProvenance('location.full_address');
    const coordinatesInfo = getFieldWithProvenance('location.coordinates');
    const ratingInfo = getFieldWithProvenance('ratings.rating');
    const reviewCountInfo = getFieldWithProvenance('ratings.review_count');

    // P1.9: Aggregate reputation provenance for the intelligence shape.
    // Surface the full reputation block alongside the flat rating/reviewCount
    // so downstream consumers (canonical projection, routes, frontend) can
    // distinguish structured-provider, parsed, and AI-extracted reputation data.
    const reputationData = {
      rating: ratingInfo.value,
      reviewCount: reviewCountInfo.value,
      reviews: Array.isArray(reviews) ? reviews : [],
      reviewSummary,
      sentiment,
      themes,
      provenance: ratingInfo.provenance || reviewCountInfo.provenance || null,
      confidence: Math.max(ratingInfo.confidence || 0, reviewCountInfo.confidence || 0),
      status: ratingInfo.value != null || reviewCountInfo.value != null
        ? (ratingInfo.provenance === 'ai_generated' || reviewCountInfo.provenance === 'ai_generated'
            ? 'ai_extracted_from_evidence'
            : 'source_extracted')
        : 'unavailable',
    };

    return {
      source: {
        query: hints.query || null,
        placeId: null,
        resolvedName: name,
        resolutionStatus: name ? 'resolved' : 'unresolved',
        resolutionConfidence: name ? 0.9 : 0,
        mapsUrl: hints.sourceUrl || null,
        providers: providerTrace,
        // P1.8: surface fallback field-level evidence for observability and
        // canonical projection enrichment. The canonical projection reads
        // from identity._provenance for field-level metadata; this block
        // provides the raw evidence snapshots (extractionMethod, confidence,
        // sourceUrl, evidenceSnippet) that the canonical shape may expose
        // under enrichment.fallbackEvidence.
        fallbackEvidence: profile.fallbackEvidence || null,
      },
      identity: {
        name: nameInfo.value,
        category: categoryInfo.value,
        businessType: profile.get('identity.business_type'),
        description: profile.get('identity.description'),
        categories: profile.get('identity.categories') || [],
        // Provenance metadata
        _provenance: {
          name: { provenance: nameInfo.provenance, confidence: nameInfo.confidence, hasConflict: nameInfo.hasConflict },
          category: { provenance: categoryInfo.provenance, confidence: categoryInfo.confidence, hasConflict: categoryInfo.hasConflict },
          phone: { provenance: phoneInfo.provenance, confidence: phoneInfo.confidence, hasConflict: phoneInfo.hasConflict },
          website: { provenance: websiteInfo.provenance, confidence: websiteInfo.confidence, hasConflict: websiteInfo.hasConflict },
          address: { provenance: addressInfo.provenance, confidence: addressInfo.confidence, hasConflict: addressInfo.hasConflict },
          coordinates: { provenance: coordinatesInfo.provenance, confidence: coordinatesInfo.confidence, hasConflict: coordinatesInfo.hasConflict },
          rating: { provenance: ratingInfo.provenance, confidence: ratingInfo.confidence, hasConflict: ratingInfo.hasConflict },
          reviewCount: { provenance: reviewCountInfo.provenance, confidence: reviewCountInfo.confidence, hasConflict: reviewCountInfo.hasConflict },
        },
      },
      contact: {
        phone: phoneInfo.value,
        email: profile.get('contact.email'),
        website: websiteInfo.value,
      },
      location: {
        address: addressInfo.value,
        city: profile.get('location.city'),
        state: profile.get('location.state'),
        country: profile.get('location.country'),
        postalCode: profile.get('location.postal_code'),
        coordinates: coordinatesInfo.value || null,
      },
      digitalPresence: {
        googleMapsUrl: hints.sourceUrl || null,
        website: websiteInfo.value,
        socialProfiles: { facebook: null, instagram: null, twitter: null, linkedin: null },
        hasWebsite: !!websiteInfo.value,
        photos: [],
      },
      services,
      trustSignals: this.buildTrustSignals({ rating: ratingInfo.value, review_count: reviewCountInfo.value }, []),
      positioning: {
        priceLevel: null,
        category: categoryInfo.value,
        location: addressInfo.value,
      },
      facts: [
        // P1.2 provenance regression: facts must reflect actual provenance
        // from the BusinessProfile rather than claiming verified: true for all.
        // Only data with 'verified' provenance should be marked as verified.
        ...(nameInfo.value ? [{ claim: `Business name is ${nameInfo.value}`, source: nameInfo.provenance || 'unknown', verified: nameInfo.provenance === 'verified', verification: nameInfo.provenance || 'unknown' }] : []),
        ...(ratingInfo.value != null ? [{ claim: `Has a rating of ${ratingInfo.value}/5`, source: ratingInfo.provenance || 'unknown', verified: ratingInfo.provenance === 'verified', verification: ratingInfo.provenance || 'unknown' }] : []),
        ...(phoneInfo.value ? [{ claim: `Phone: ${phoneInfo.value}`, source: phoneInfo.provenance || 'unknown', verified: phoneInfo.provenance === 'verified', verification: phoneInfo.provenance || 'unknown' }] : []),
        ...(websiteInfo.value ? [{ claim: `Website: ${websiteInfo.value}`, source: websiteInfo.provenance || 'unknown', verified: websiteInfo.provenance === 'verified', verification: websiteInfo.provenance || 'unknown' }] : []),
        ...(addressInfo.value ? [{ claim: `Address: ${addressInfo.value}`, source: addressInfo.provenance || 'unknown', verified: addressInfo.provenance === 'verified', verification: addressInfo.provenance || 'unknown' }] : []),
      ],
      unknowns: this.identifyUnknownsIntelligence({ website: websiteInfo.value, phone: phoneInfo.value, email: null }),
      rating: ratingInfo.value,
      reviewCount: reviewCountInfo.value,
      reviews,
      reviewSummary,
      sentiment,
      themes,
      reputation: reputationData,
      openingHours: profile.get('hours') || null,
      photos: [],
      confidence: { overall: name ? 0.9 : 0 },
      validationIssues: [],
    };
  }

  identifyUnknownsIntelligence({ website, phone, email }) {
    const unknowns = [];
    if (!website) unknowns.push('website');
    if (!phone) unknowns.push('phone');
    if (!email) unknowns.push('email');
    return unknowns;
  }

  // ===========================================================================
  // PHASE 18: Re-run affected research after a resolved identity review.
  //
  // Closes the intelligence loop:
  //   research → identity resolution → review → human decision → corrected
  //   persistent identity → RE-RUN affected research → refreshed canonical
  //   intelligence → refreshed downstream outputs.
  //
  // This is the AUTHORITATIVE re-run path. It deliberately does NOT invent a
  // second research pipeline: it reuses the exact same repository reads,
  // canonicalization service, canonical-profile load, and intelligence
  // projection used by the primary research path, so the corrected persistent
  // identity state is what drives the refreshed output.
  //
  // The caller (ReResearchService) supplies the persisted, post-decision
  // entity state. This method rebuilds a fresh BusinessProfile and regenerates
  // the canonical intelligence snapshot deterministically.
  // ===========================================================================

  /**
   * Rebuild canonical business intelligence from a persisted entity's
   * canonical fields. Deterministic — no provider fetches, no AI. Throws if
   * the entity is absent, so callers surface persistence failures explicitly.
   *
   * @param {IdentityRepository} repo
   * @param {string} entityId
   * @param {Object} [providerTrace] - provider provenance labels for the snapshot
   * @returns {Promise<Object>} intelligence in the standard profile shape
   * @throws {NotFoundError} if the entity does not exist
   */
  async regenerateCanonicalIntelligence(repo, entityId, providerTrace = {}) {
    const entity = repo.getEntityById(entityId);
    if (!entity) {
      throw new NotFoundError(`Entity ${entityId} not found; cannot regenerate intelligence.`);
    }

    const profile = new BusinessProfile();
    profile.setEntityId(entityId);
    await repo.loadCanonicalFieldsIntoProfile(entityId, profile);

    const intelligence = this._profileToIntelligence(profile, {}, providerTrace);
    Object.assign(intelligence, {
      source: {
        ...(intelligence.source || {}),
        entityId,
        refreshedAt: new Date().toISOString(),
        refreshReason: 'post-review-rerun',
        providers: providerTrace,
      },
    });
    return intelligence;
  }
}

export default new BusinessResearchService();
