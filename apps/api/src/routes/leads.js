
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import BusinessDataExtractor from '../services/BusinessDataExtractor.js';
import BusinessResearchService from '../services/BusinessResearchService.js';
import BrandStrategyService from '../services/BrandStrategyService.js';
import DigitalAuditService from '../services/DigitalAuditService.js';
import CanonicalBusinessProfileService from '../services/CanonicalBusinessProfileService.js';

const router = express.Router();

// In-memory lead cache (in production, use database)
const leadCache = new Map();

/**
 * POST /api/leads
 * Create a new lead from a Google Maps URL
 * 
 * Body: { googleMapsUrl, leadName?, internalNotes?, customInstructions? }
 * Returns: Full lead object with business analysis, brand DNA, digital audit
 */
router.post('/', async (req, res, next) => {
  try {
    const { googleMapsUrl, leadName, internalNotes, customInstructions } = req.body;
    
    if (!googleMapsUrl) {
      return res.status(400).json({ 
        error: 'googleMapsUrl is required' 
      });
    }

    // Validate URL format
    const isValid = BusinessDataExtractor.validateGoogleMapsUrl(googleMapsUrl);
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid Google Maps URL format',
        code: 'INVALID_URL'
      });
    }

    // Extract business data.
    // Use the orchestrated provider path (deterministic URL hints → Geoapify →
    // web extraction → AI enrichment), the same robust pipeline as
    // /api/business/analyze. The single-path AI-dependent extractor
    // (extractFromGoogleMapsUrl) can return an empty acquisition when the AI
    // gateway is unavailable; the orchestrated path still resolves identity
    // from the URL + provider records, so the demo flow keeps working.
    let extractedData = null;
    let extractionTrace = null;
    try {
      const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders({
        googleMapsUrl,
      });
      extractedData = result.intelligence;
      extractionTrace = result.provider || null;
    } catch (extractError) {
      // Fall back to the direct extractor so the route still attempts a result
      // when the orchestrated path throws (it should not, but be resilient).
      console.error('[leads] Orchestrated extraction failed, falling back:', extractError?.message || String(extractError));
      extractedData = await BusinessDataExtractor.extractFromGoogleMapsUrl(googleMapsUrl);
    }

    // Provider chain returned nothing usable → surface a structured
    // provider-unavailable result instead of persisting an empty lead.
    const nothingUsable =
      extractionTrace &&
      extractionTrace.geoapify &&
      extractionTrace.geoapify !== 'ok' &&
      (!extractedData?.contact?.phone && !extractedData?.contact?.website && !extractedData?.location?.address);

    if (nothingUsable) {
      return res.status(503).json({
        success: false,
        error: 'provider_unavailable',
        message: 'Business provider temporarily unavailable. No business data was produced.',
        category: 'PROVIDER_UNAVAILABLE',
      });
    }

    // Transform to normalized BusinessProfile
    const businessData = extractedData.metadata?.providers
      ? extractedData
      : await BusinessResearchService.extractBusinessIntelligence(extractedData);

    // Build Business DNA — optional additive enrichment. Extraction has already
    // succeeded (business is valid). If the AI brand-DNA step fails (e.g.
    // transient upstream timeout), we must NOT discard the successful
    // extraction or return HTTP 500. We surface an explicit failure state
    // instead, while keeping the valid business profile. This mirrors the
    // documented graceful-degradation behavior in routes/business.js.
    let brandDNA = null;
    let brandStrategyStatus = 'not_attempted';
    try {
      brandDNA = await BrandStrategyService.generateBrandDNA(businessData);
      brandStrategyStatus = 'ok';
    } catch (brandError) {
      const safeMsg = brandError?.safeMessage || brandError?.message || 'unknown';
      console.error('[leads] Brand DNA generation failed (non-fatal, extraction preserved):', safeMsg);
      brandStrategyStatus = 'failed';
      brandDNA = null;
    }

    // Perform digital audit — also optional enrichment. If the AI audit step
    // fails, degrade to a deterministic no-website audit so the lead still
    // renders (overallScore + categories are always present).
    let audit;
    try {
      audit = await DigitalAuditService.auditDigitalPresence(businessData);
    } catch (auditError) {
      const safeMsg = auditError?.safeMessage || auditError?.message || 'unknown';
      console.error('[leads] Digital audit failed (non-fatal, extraction preserved):', safeMsg);
      audit = DigitalAuditService.generateNoWebsiteAudit(businessData);
    }

    // P1.5: Project business data through the canonical read layer.
    // Canonical fields provide identity/contact/location/reputation.
    // Analysis-specific metadata (trustSignals, facts, unknowns, digitalPresence,
    // positioning) remains in analysis — it is not canonical business data.
    const canonical = CanonicalBusinessProfileService.fromEntityData({
      record: businessData,
    });

    // Create lead object
    const leadId = uuidv4();
    const lead = {
      _id: leadId,
      // P1.5: No synthetic identity fallback — null when no authoritative name.
      // P1.2 invariant: canonical identity never invents 'Unnamed Business'.
      leadName: leadName || canonical.identity.name || null,
      internalNotes: internalNotes || '',
      customInstructions: customInstructions || '',
      status: 'new',
      source: {
        googleMapsUrl,
        extractedAt: extractedData.metadata?.extractedAt || new Date().toISOString(),
      },
      // P1.5: Business identity comes from canonical projection.
      businessName: canonical.identity.name,
      businessCategory: canonical.business.category,
      location: {
        address: canonical.identity.address || null,
        city: canonical.identity.addressComponents?.city || null,
        state: canonical.identity.addressComponents?.state || null,
        country: canonical.identity.addressComponents?.country || null,
        coordinates: canonical.identity.coordinates || null,
      },
      contact: {
        phone: canonical.identity.phone,
        email: canonical.business.email,
        website: canonical.identity.website,
      },
      // P1.5: Canonical business facts only. Analysis-specific metadata
      // (trustSignals, facts, unknowns) moves to analysis.metrics.
      businessData: {
        rating: canonical.reputation.rating,
        reviewCount: canonical.reputation.reviewCount,
        services: canonical.business.services,
        openingHours: canonical.business.hours,
      },
      analysis: {
        businessData,
        // P1.5: analysis-specific metrics preserved separately from canonical business data.
        metrics: {
          trustSignals: businessData.trustSignals ?? null,
          facts: businessData.facts ?? null,
          unknowns: businessData.unknowns ?? null,
          digitalPresence: businessData.digitalPresence ?? null,
          positioning: businessData.positioning ?? null,
          source: businessData.source ?? null,
        },
        brandDNA,
        audit,
        brandStrategyStatus,
        extractedAt: new Date().toISOString(),
      },
      opportunityScore: {
        total: audit.overallScore || 0,
        priority: audit.overallScore >= 70 ? 'high' : audit.overallScore >= 40 ? 'medium' : 'low',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    leadCache.set(leadId, lead);

    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads/stats/dashboard
 * Dashboard statistics
 */
router.get('/stats/dashboard', (req, res, next) => {
  try {
    const leads = Array.from(leadCache.values());
    const totalLeads = leads.length;
    const highPriority = leads.filter(l => l.opportunityScore?.priority === 'high').length;
    const websitesGenerated = leads.filter(l => l.generatedWebsite).length;
    const contacted = leads.filter(l => l.status === 'contacted' || l.status === 'won').length;

    res.json({
      success: true,
      data: {
        totalLeads,
        highPriority,
        websitesGenerated,
        contacted,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads
 * List all leads with optional pagination
 * 
 * Query: page, limit, status
 * Returns: { leads: Lead[], pagination: {...} }
 */
router.get('/', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    
    let leads = Array.from(leadCache.values());
    
    if (status) {
      leads = leads.filter(l => l.status === status);
    }
    
    // Sort by createdAt descending
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const total = leads.length;
    const start = (page - 1) * limit;
    const paginatedLeads = leads.slice(start, start + limit);
    
    // Return minimal lead data for list view
    const minimalLeads = paginatedLeads.map(lead => ({
      _id: lead._id,
      businessName: lead.businessName,
      businessCategory: lead.businessCategory,
      status: lead.status,
      opportunityScore: lead.opportunityScore,
      location: lead.location,
      contact: lead.contact,
      businessData: lead.businessData,
      createdAt: lead.createdAt,
    }));

    res.json({
      success: true,
      data: minimalLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});


/**
 * GET /api/leads/:id
 * Get full lead details by ID
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = leadCache.get(id);
    
    if (!lead) {
      return res.status(404).json({ 
        error: 'Lead not found' 
      });
    }

    res.json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/leads/:id
 * Update lead (status, notes, etc.)
 */
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = leadCache.get(id);
    
    if (!lead) {
      return res.status(404).json({ 
        error: 'Lead not found' 
      });
    }

    const allowedUpdates = ['status', 'leadName', 'internalNotes', 'customInstructions'];
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    const updatedLead = { ...lead, ...updates, updatedAt: new Date().toISOString() };
    leadCache.set(id, updatedLead);

    res.json({
      success: true,
      data: updatedLead,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/leads/:id
 * Delete a lead
 */
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!leadCache.has(id)) {
      return res.status(404).json({ 
        error: 'Lead not found' 
      });
    }

    leadCache.delete(id);

    res.json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/leads/:id/brand-dna
 * Regenerate brand DNA for a lead
 */
router.post('/:id/brand-dna', async (req, res, next) => {
  try {
    const { id } = req.params;
    const lead = leadCache.get(id);
    
    if (!lead) {
      return res.status(404).json({ 
        error: 'Lead not found' 
      });
    }

    const brandDNA = await BrandStrategyService.generateBrandDNA(lead.analysis.businessData);
    
    // Update lead with new brand DNA
    lead.analysis.brandDNA = brandDNA;
    lead.updatedAt = new Date().toISOString();
    leadCache.set(id, lead);

    res.json({
      success: true,
      data: brandDNA,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
