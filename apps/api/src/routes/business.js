import express from 'express';
import BusinessResearchService from '../services/BusinessResearchService.js';
import BusinessDataExtractor from '../services/BusinessDataExtractor.js';
import CanonicalBusinessProfileService from '../services/CanonicalBusinessProfileService.js';
import { config } from '../config/env.js';

const router = express.Router();

/**
 * POST /api/business/analyze
 * Extract business intelligence from a Google Maps URL.
 * Thin route — delegates to BusinessResearchService, which orchestrates the
 * provider chain (Geoapify → web-extraction fallback → AI enrichment).
 * No Geoapify calls live in this route.
 * 
 * Body: { googleMapsUrl: string }
 * Returns: { success, business, businessDNA, metadata }
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const { googleMapsUrl, name, city, state, country, latitude, longitude } = req.body;
    
    if (!googleMapsUrl && !name) {
      return res.status(400).json({ 
        error: 'Please provide a Google Maps URL or business name.',
        code: 'MISSING_INPUT',
        category: 'USER_INPUT_ERROR',
      });
    }

    // Validate URL format when provided (using the parser, not a network call)
    if (googleMapsUrl && !BusinessDataExtractor.validateGoogleMapsUrl(googleMapsUrl)) {
      return res.status(400).json({ 
        error: 'That doesn\'t appear to be a supported Google Maps URL. Please paste a URL from maps.google.com.',
        code: 'INVALID_URL',
        category: 'USER_INPUT_ERROR',
      });
    }

    // Orchestrated provider extraction (Geoapify-first, web fallback, AI enrichment)
    const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders({
      googleMapsUrl,
      name,
      city,
      state,
      country,
      latitude,
      longitude,
    });

    const rawIntelligence = result.intelligence;

    // Provider chain returned nothing usable → 503 provider_unavailable
    const nothingUsable =
      result.provider?.geoapify &&
      result.provider?.geoapify !== 'ok' &&
      (!rawIntelligence?.contact?.phone && !rawIntelligence?.contact?.website && !rawIntelligence?.location?.address);

    if (nothingUsable) {
      const providerError = {
        category: 'PROVIDER_UNAVAILABLE',
        httpStatus: null,
        safeMessage: 'Business provider temporarily unavailable. No business data was produced.',
      };

      return res.status(503).json({
        success: false,
        error: 'provider_unavailable',
        message: providerError.safeMessage,
        provider: {
          gateway: config.omniroute.baseUrl,
          model: config.omniroute.models.reasoning,
          category: providerError.category || 'PROVIDER_UNAVAILABLE',
          httpStatus: providerError.httpStatus || null,
          retryCount: 0,
          retryAttempted: false,
          geoapifyStatus: result.provider?.geoapify || null,
          webExtractionStatus: result.provider?.webExtraction || null,
        },
        data: null,
      });
    }

    // Brand-DNA generation is optional additive enrichment. Extraction has
    // already succeeded (business is valid). If the AI brand-DNA step fails
    // (e.g. transient upstream 500), we must NOT discard the successful
    // extraction or return HTTP 500. We surface an explicit failure state
    // instead, while keeping the valid business profile. Real extraction
    // errors are NOT swallowed here — they throw earlier, in
    // extractBusinessIntelligenceWithProviders, and follow the normal
    // errorHandler path.
    const { default: BrandStrategyService } = await import('../services/BrandStrategyService.js');
    let businessDNA = null;
    let brandStrategyStatus = 'not_attempted';
    try {
      businessDNA = await BrandStrategyService.generateBrandDNA(rawIntelligence);
      brandStrategyStatus = 'ok';
    } catch (brandError) {
      // Optional enrichment failed — log server-side (safe/redacted), do not 500.
      const safeMsg = brandError?.safeMessage || brandError?.message || 'unknown';
      console.error('[business/analyze] Brand DNA generation failed (non-fatal, extraction preserved):', safeMsg);
      brandStrategyStatus = 'failed';
      businessDNA = null;
    }

    // P1.4: Route business data through the canonical projection layer.
    // The canonical shape replaces raw intelligence as the HTTP representation
    // of business data. Endpoint-specific analysis metadata (source, facts,
    // unknowns, trustSignals, positioning, digitalPresence) moves to
    // metadata.analysis to preserve endpoint-specific information without
    // contaminating the canonical business representation.
    //
    // Provider metadata: the persisted provider-identity observations (if the
    // research pipeline produced them; best-effort) are handed to the
    // projection as canonical provider metadata — so provider IDs live in
    // `providers[]`, never in identity, and never as a route-reconstructed
    // field. When persistence was skipped, the projection still derives
    // provider info from the intelligence record's own source metadata.
    const canonicalService = CanonicalBusinessProfileService;
    const persistedProviders = result.persistence?.providerIdentities ?? null;
    const canonical = canonicalService.fromEntityData({
      record: rawIntelligence,
      providerIdentities: persistedProviders,
    });

    res.json({
      success: true,
      business: canonical,
      businessDNA,
      brandStrategy: { status: brandStrategyStatus },
      metadata: {
        source: 'geoapify_and_web_extraction',
        providers: result.provider,
        confidence: canonical.confidence?.entity || rawIntelligence?.confidence?.overall || 0,
        extractedAt: new Date().toISOString(),
        cached: false,
        persistence: result.persistence,
        brandDNAStatus: brandStrategyStatus,
        validationIssues: result.validation?.issues?.length ? result.validation.issues.map((i) => i.field) : [],
        // P1.4: endpoint-specific analysis metadata preserved separately
        analysis: {
          source: rawIntelligence?.source ?? null,
          facts: rawIntelligence?.facts ?? [],
          unknowns: rawIntelligence?.unknowns ?? [],
          trustSignals: rawIntelligence?.trustSignals ?? [],
          positioning: rawIntelligence?.positioning ?? null,
          digitalPresence: rawIntelligence?.digitalPresence ?? null,
          services: rawIntelligence?.services ?? [],
          rating: rawIntelligence?.rating ?? null,
          reviewCount: rawIntelligence?.reviewCount ?? null,
          openingHours: rawIntelligence?.openingHours ?? null,
          reviews: rawIntelligence?.reviews ?? [],
          photos: rawIntelligence?.photos ?? [],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/business/research
 * Extract business intelligence from a Google Maps URL (alias for /analyze)
 * 
 * Body: { googleMapsUrl: string }
 * Returns: Full business intelligence object
 */
router.post('/research', async (req, res, next) => {
  try {
    const { googleMapsUrl } = req.body;
    
    if (!googleMapsUrl) {
      return res.status(400).json({ 
        error: 'googleMapsUrl is required',
        category: 'USER_INPUT_ERROR',
      });
    }

    // Validate URL format
    const isValid = BusinessDataExtractor.validateGoogleMapsUrl(googleMapsUrl);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'That doesn\'t appear to be a supported Google Maps URL. Please paste a URL from maps.google.com.',
        code: 'INVALID_URL',
        category: 'USER_INPUT_ERROR',
      });
    }

    // Extract business data via the provider orchestration (Geoapify → web fallback → AI)
    const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders({
      googleMapsUrl,
      name: req.body.name,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    });

    // P1.4: Route business data through the canonical projection layer.
    // Provider metadata: pass through persisted provider-identity observations
    // (when the research pipeline produced them) so provider IDs stay inside
    // canonical `providers[]` rather than leaking into identity.
    const canonicalService = CanonicalBusinessProfileService;
    const persistedProviders = result.persistence?.providerIdentities ?? null;
    const canonical = canonicalService.fromEntityData({
      record: result.intelligence,
      providerIdentities: persistedProviders,
    });

    res.json({
      success: true,
      data: canonical,
      metadata: {
        extractedAt: new Date().toISOString(),
        sourceUrl: googleMapsUrl,
        providers: result.provider,
        validationIssues: result.validation?.issues?.length ? result.validation.issues.map((i) => i.field) : [],
        // P1.4: endpoint-specific analysis metadata preserved separately
        analysis: {
          source: result.intelligence?.source ?? null,
          facts: result.intelligence?.facts ?? [],
          unknowns: result.intelligence?.unknowns ?? [],
          trustSignals: result.intelligence?.trustSignals ?? [],
          positioning: result.intelligence?.positioning ?? null,
          digitalPresence: result.intelligence?.digitalPresence ?? null,
          services: result.intelligence?.services ?? [],
          rating: result.intelligence?.rating ?? null,
          reviewCount: result.intelligence?.reviewCount ?? null,
          openingHours: result.intelligence?.openingHours ?? null,
          reviews: result.intelligence?.reviews ?? [],
          photos: result.intelligence?.photos ?? [],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/business/validate-url
 * Validate a Google Maps URL without full extraction
 * 
 * Body: { googleMapsUrl: string }
 * Returns: { valid: boolean, placeId?: string, query?: string }
 */
router.post('/validate-url', async (req, res, next) => {
  try {
    const { googleMapsUrl } = req.body;
    
    if (!googleMapsUrl) {
      return res.status(400).json({ 
        error: 'googleMapsUrl is required' 
      });
    }

    const isValid = BusinessDataExtractor.validateGoogleMapsUrl(googleMapsUrl);
    
    if (!isValid) {
      return res.json({ valid: false });
    }

    // Extract identifiers without full fetch
    const placeId = BusinessDataExtractor.extractPlaceId(googleMapsUrl);
    const placeName = BusinessDataExtractor.extractPlaceName(googleMapsUrl);

    res.json({
      valid: true,
      placeId,
      query: placeName,
      resolvedUrl: googleMapsUrl,
    });
  } catch (error) {
    next(error);
  }
});

export default router;