import AIService from './AIService.js';
import { buildBrandStrategyPrompt } from '../prompts/brandStrategy.js';
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';

/**
 * Brand Strategy Service
 * Analyzes normalized business data to determine commercial and branding DNA
 */

class BrandStrategyService {
  async generateBrandDNA(normalizedBusinessData, options = {}) {
    try {
      const startTime = Date.now();
      
      // P1.5: Validate using canonical projection — business identity must exist
      // in the canonical layer. The full intelligence shape is still passed to the
      // AI prompt builder for complete context (trustSignals, facts, unknowns, etc.).
      const canonical = CanonicalBusinessProfileService.fromEntityData({
        record: normalizedBusinessData,
      });
      if (!canonical.identity.name) {
        throw new Error('Valid normalized business data is required');
      }

      const prompt = buildBrandStrategyPrompt(normalizedBusinessData);
      
      const brandStrategy = await AIService.generate({
        prompt,
        model: 'reasoning',
        schema: true,
        temperature: 0.7,
        maxTokens: 6000,
        systemPrompt: `You are a senior brand strategist and local-business growth consultant. Analyze the supplied business information. Your objective is to determine the commercial and branding DNA of the business. Return strict JSON following the structure with fields: businessIdentity, audience, customerIntent, painPoints, purchaseTriggers, services, competitiveAdvantages, trustSignals, brandPersonality, toneOfVoice, visualDirection, positioning, websiteObjectives, conversionStrategy, strategicRecommendations, confidence. IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, no extra text.`,
      });

      const latency = Date.now() - startTime;
      this.validateBrandStrategy(brandStrategy);

      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'brand-strategy-v1',
        tokens: null,
        latency,
        error: null,
      });

      return {
        ...brandStrategy,
        metadata: {
          generatedAt: new Date().toISOString(),
          version: 'v1',
          latency,
          sourceDataQuality: this.assessDataQuality(normalizedBusinessData),
        },
      };
    } catch (error) {
      console.error('Brand strategy generation error:', error);
      
      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'brand-strategy-v1',
        tokens: null,
        latency: null,
        error: error.message,
      });

      throw new Error(`Failed to generate brand strategy: ${error.message}`);
    }
  }

  validateBrandStrategy(strategy) {
    const requiredFields = [
      'businessIdentity',
      'audience',
      'customerIntent',
      'painPoints',
      'services',
      'trustSignals',
      'brandPersonality',
      'positioning',
      'conversionStrategy',
    ];

    for (const field of requiredFields) {
      if (!strategy[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!strategy.audience.primary) throw new Error('Missing primary audience');
    if (!strategy.services.core || !Array.isArray(strategy.services.core)) {
      throw new Error('Invalid services structure');
    }
    if (!strategy.conversionStrategy.primaryCTA) throw new Error('Missing primary CTA');

    return true;
  }

  assessDataQuality(data) {
    let score = 0;
    let maxScore = 0;

    // P1.5: Business identity/contact/location fields come from the canonical
    // projection layer. Analysis-specific metadata (trustSignals, facts) remains
    // on the source data.
    const canonical = CanonicalBusinessProfileService.fromEntityData({ record: data });
    const checks = [
      { field: canonical.identity.name, weight: 10 },
      { field: canonical.business.category, weight: 8 },
      { field: canonical.business.description, weight: 7 },
      { field: canonical.identity.address, weight: 6 },
      { field: canonical.identity.phone, weight: 5 },
      { field: canonical.identity.website, weight: 5 },
      { field: data.trustSignals?.length > 0, weight: 8 },
      { field: canonical.business.services?.length > 0, weight: 7 },
      { field: data.facts?.length > 0, weight: 6 },
    ];

    checks.forEach(check => {
      maxScore += check.weight;
      if (check.field) score += check.weight;
    });

    const percentage = (score / maxScore) * 100;

    return {
      score: Math.round(percentage),
      rating: percentage >= 80 ? 'excellent' : 
              percentage >= 60 ? 'good' : 
              percentage >= 40 ? 'fair' : 'poor',
      missingData: data.unknowns || [],
    };
  }

  extractKeyInsights(brandStrategy) {
    return {
      targetAudience: brandStrategy.audience.primary.segment,
      positioning: brandStrategy.positioning.statement,
      primaryCTA: brandStrategy.conversionStrategy.primaryCTA.text,
      topCompetitiveAdvantages: brandStrategy.competitiveAdvantages
        .filter(a => a.verified)
        .slice(0, 3)
        .map(a => a.advantage),
      brandPersonality: brandStrategy.brandPersonality.primary,
      confidence: brandStrategy.confidence?.overall || null,
    };
  }

  calculateOpportunityScore(brandStrategy, normalizedData) {
    let score = 0;

    // Digital presence gap (0-30 points)
    if (!normalizedData.digitalPresence?.hasWebsite) {
      score += 30;
    } else {
      score += 10;
    }

    // Trust signals strength (0-25 points)
    const verifiedTrustSignals = brandStrategy.trustSignals.filter(t => t.verified);
    if (verifiedTrustSignals.length >= 3) score += 25;
    else if (verifiedTrustSignals.length >= 2) score += 15;
    else score += 5;

    // Competitive advantages (0-20 points)
    const strongAdvantages = brandStrategy.competitiveAdvantages.filter(a => a.verified);
    score += Math.min(strongAdvantages.length * 5, 20);

    // Business maturity (0-15 points)
    const reviewCount = normalizedData.trustSignals?.find(t => t.type === 'review_count')?.value || 0;
    if (reviewCount > 100) score += 15;
    else if (reviewCount > 50) score += 10;
    else if (reviewCount > 20) score += 5;

    // High-value services (0-10 points)
    score += Math.min(brandStrategy.services.highValue?.length * 3, 10);

    return Math.min(Math.round(score), 100);
  }

  determinePriority(opportunityScore) {
    if (opportunityScore >= 80) return 'critical';
    if (opportunityScore >= 60) return 'high';
    if (opportunityScore >= 40) return 'medium';
    return 'low';
  }
}

export default new BrandStrategyService();
