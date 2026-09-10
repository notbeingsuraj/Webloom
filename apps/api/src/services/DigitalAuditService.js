import AIService from './AIService.js';
import { buildDigitalAuditPrompt } from '../prompts/digitalAudit.js';
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';

/**
 * Digital Audit Service
 * 
 * Ruthlessly evaluates existing digital presence
 * Scores website quality, mobile experience, SEO, and conversion effectiveness
 */

class DigitalAuditService {
  /**
   * Perform comprehensive digital audit
   * @param {Object} businessData - Normalized business data with website info
   * @param {Object} options - Audit options
   * @returns {Object} Digital audit results
   */
  async auditDigitalPresence(businessData, options = {}) {
    try {
      const startTime = Date.now();

      // P1.5: Business facts (contact.website) come from canonical projection.
      // digitalPresence is endpoint-specific analysis metadata, not canonical.
      const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessData });
      const hasWebsite = !!canonical.identity.website || !!businessData.digitalPresence?.website;

      // If no website, return zero scores
      if (!hasWebsite) {
        return this.generateNoWebsiteAudit(businessData);
      }

      // Build audit prompt
      const prompt = buildDigitalAuditPrompt(businessData);

      // Use reasoning model for analysis
      const auditResults = await AIService.generate({
        prompt,
        model: 'reasoning',
        schema: true,
        temperature: 0.5, // Lower temperature for consistent scoring
        maxTokens: 5000,
        systemPrompt: `You are a senior digital marketing analyst and web auditor. Ruthlessly evaluate the business's digital presence. Score website quality, mobile experience, SEO, and conversion effectiveness. Return strict JSON with websiteExists, websiteUrl, categories (design, mobile, navigation, conversion, trust, seo, localSeo, content, branding, performance, contactAccessibility), overallScore, criticalIssues, recommendations, opportunityGap. IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.`,
      });

      const latency = Date.now() - startTime;

      // Validate audit results
      this.validateAuditResults(auditResults);

      // Calculate overall score
      auditResults.overallScore = this.calculateOverallScore(auditResults.categories);

      // Log AI call
      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'digital-audit-v1',
        tokens: null,
        latency,
        error: null,
      });

      return {
        ...auditResults,
        metadata: {
          auditedAt: new Date().toISOString(),
          version: 'v1',
          latency,
          hasWebsite,
        },
      };
    } catch (error) {
      console.error('Digital audit error:', error);

      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'digital-audit-v1',
        tokens: null,
        latency: null,
        error: error.message,
      });

      throw new Error(`Failed to perform digital audit: ${error.message}`);
    }
  }

  /**
   * Generate audit for business with no website
   */
  generateNoWebsiteAudit(businessData) {
    // P1.5: phone comes from canonical projection.
    // googleMapsUrl remains on the source data (endpoint-specific metadata).
    const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessData });
    const googleMapsUrl = businessData.digitalPresence?.googleMapsUrl
      || businessData.source?.mapsUrl
      || null;
    const phone = canonical.identity.phone || null;

    return {
      websiteExists: false,
      websiteUrl: null,
      lastChecked: new Date().toISOString(),
      overallScore: 0,
      categories: {
        design: { score: 0, notes: 'No website exists', verified: true },
        mobile: { score: 0, notes: 'No website exists', verified: true },
        navigation: { score: 0, notes: 'No website exists', verified: true },
        conversion: { score: 0, notes: 'No website exists', verified: true },
        trust: { score: 0, notes: 'No website exists', verified: true },
        seo: { score: 0, notes: 'No website exists', verified: true },
        localSeo: {
          score: googleMapsUrl ? 3 : 0,
          notes: googleMapsUrl
            ? 'Google Business Profile exists but no website'
            : 'No website or Google Business Profile detected',
          verified: true,
        },
        content: { score: 0, notes: 'No website exists', verified: true },
        branding: { score: 0, notes: 'No website exists', verified: true },
        performance: { score: 0, notes: 'No website exists', verified: true },
        contactAccessibility: {
          score: phone ? 2 : 0,
          notes: phone
            ? 'Phone available via Google Maps only'
            : 'No contact information available online',
          verified: true,
        },
      },
      strengths: [],
      weaknesses: [
        {
          area: 'Digital Presence',
          description: 'Business has no website',
          severity: 'critical',
        },
        {
          area: 'Online Visibility',
          description: 'Limited online discoverability without a website',
          severity: 'critical',
        },
        {
          area: 'Credibility',
          description: 'No digital presence to establish trust with potential customers',
          severity: 'high',
        },
      ],
      criticalIssues: [
        {
          issue: 'No website exists',
          impact: 'Missing out on online leads, reduced credibility, losing customers to competitors with websites',
          recommendation: 'Build a professional website immediately',
          priority: 'immediate',
        },
      ],
      recommendations: [
        {
          category: 'Website Development',
          recommendation: 'Create a professional website with core pages: Home, Services, About, Contact',
          expectedImpact: 'high',
          effort: 'medium',
          priority: 1,
        },
        {
          category: 'Mobile Optimization',
          recommendation: 'Ensure new website is mobile-responsive from day one',
          expectedImpact: 'high',
          effort: 'low',
          priority: 1,
        },
        {
          category: 'Contact Information',
          recommendation: 'Display phone number, email, and address prominently',
          expectedImpact: 'high',
          effort: 'low',
          priority: 1,
        },
        {
          category: 'Local SEO',
          recommendation: 'Optimize Google Business Profile and link to new website',
          expectedImpact: 'medium',
          effort: 'low',
          priority: 2,
        },
        {
          category: 'Conversion',
          recommendation: 'Include clear call-to-action buttons (Call, Book, Contact)',
          expectedImpact: 'high',
          effort: 'low',
          priority: 1,
        },
      ],
      opportunityGap: {
        description: 'Complete absence of digital presence represents maximum opportunity gap',
        businessImpact: 'Losing customers daily to competitors with websites. Unable to capture online search traffic. No platform to showcase services or build trust.',
        competitivePosition: 'behind',
      },
      dataLimitations: [
        'No website to audit',
        'Cannot assess design, UX, or content quality',
        'Limited to publicly available business data only',
      ],
      metadata: {
        auditedAt: new Date().toISOString(),
        version: 'v1',
        hasWebsite: false,
      },
    };
  }

  /**
   * Calculate overall score from category scores
   */
  calculateOverallScore(categories) {
    const scores = Object.values(categories).map(cat => cat.score);
    const sum = scores.reduce((acc, score) => acc + score, 0);
    return Math.round((sum / scores.length) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Validate audit results structure
   */
  validateAuditResults(results) {
    if (typeof results.websiteExists !== 'boolean') {
      throw new Error('Invalid websiteExists field');
    }

    if (!results.categories) {
      throw new Error('Missing categories');
    }

    const requiredCategories = [
      'design', 'mobile', 'navigation', 'conversion', 
      'trust', 'seo', 'localSeo', 'content', 'branding',
      'performance', 'contactAccessibility'
    ];

    for (const category of requiredCategories) {
      if (!results.categories[category]) {
        throw new Error(`Missing category: ${category}`);
      }
      
      const cat = results.categories[category];
      if (typeof cat.score !== 'number' || cat.score < 0 || cat.score > 10) {
        throw new Error(`Invalid score for ${category}: must be 0-10`);
      }
    }

    if (!Array.isArray(results.criticalIssues)) {
      throw new Error('criticalIssues must be an array');
    }

    if (!Array.isArray(results.recommendations)) {
      throw new Error('recommendations must be an array');
    }

    return true;
  }

  /**
   * Extract summary for dashboard display
   */
  extractAuditSummary(auditResults) {
    return {
      overallScore: auditResults.overallScore,
      websiteExists: auditResults.websiteExists,
      criticalIssuesCount: auditResults.criticalIssues.length,
      topWeaknesses: auditResults.weaknesses.slice(0, 3),
      topRecommendations: auditResults.recommendations
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3),
      competitivePosition: auditResults.opportunityGap?.competitivePosition,
    };
  }

  /**
   * Generate digital gap score (inverse of overall score)
   * Higher gap = more opportunity
   */
  calculateDigitalGap(auditResults) {
    if (!auditResults.websiteExists) {
      return 100; // Maximum gap
    }

    // Invert the score: lower quality = higher gap
    const gap = ((10 - auditResults.overallScore) / 10) * 100;
    return Math.round(gap);
  }

  /**
   * Identify quick wins (high impact, low effort improvements)
   */
  identifyQuickWins(auditResults) {
    return auditResults.recommendations
      .filter(rec => rec.effort === 'low' && rec.expectedImpact === 'high')
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);
  }
}

export default new DigitalAuditService();
