/**
 * DesignIntelligenceService
 *
 * Consolidated design intelligence layer that replaces the separate
 * WebsiteStrategyService, WebsiteCopywritingService, and LandingPageSpecService.
 * Produces a complete design specification in a single AI call.
 *
 * Input: BusinessProfile + BrandDNA + DigitalAudit
 * Output: Complete DesignSystem + PageArchitecture + ContentStrategy + AssetPlan
 */

import AIService from './AIService.js';
import { buildDesignIntelligencePrompt } from '../prompts/designIntelligence.js';
import { DESIGN_INTELLIGENCE_SCHEMA } from '../schemas/designIntelligence.js';
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';

class DesignIntelligenceService {
  /**
   * Generate complete design intelligence for a business.
   * Single AI call that produces everything needed for website generation.
   * Falls back to deterministic generation when AI is unavailable.
   */
  async generateDesignIntelligence(businessProfile, brandDNA, digitalAudit, options = {}) {
    const startTime = Date.now();

    // P1.5: Validate business identity through canonical projection — never
    // accept a provider-ID-as-name or a synthetic placeholder.
    const canonical = CanonicalBusinessProfileService.fromEntityData({
      record: businessProfile,
    });
    if (!canonical.identity.name) {
      throw new Error('BusinessProfile with name is required');
    }
    if (!brandDNA) {
      throw new Error('BrandDNA is required');
    }
    if (!digitalAudit) {
      throw new Error('DigitalAudit is required');
    }

    // Check if we should skip AI and use deterministic fallback
    if (options.skipAIDesign) {
      console.log('[DesignIntelligenceService] Using deterministic fallback (skipAIDesign=true)');
      return this.generateDeterministicIntelligence(businessProfile, brandDNA, digitalAudit, startTime);
    }

    try {
      const prompt = buildDesignIntelligencePrompt(businessProfile, brandDNA, digitalAudit);
      
      const intelligence = await AIService.generate({
        prompt,
        model: 'reasoning',
        schema: DESIGN_INTELLIGENCE_SCHEMA,
        temperature: 0.5,
        maxTokens: 16000,
        systemPrompt: `You are a senior UX designer, conversion strategist, brand designer, and frontend architect. Generate a complete website design intelligence specification for a local business. Return ONLY valid JSON matching the schema. No markdown, no explanations.`,
      });

      const latency = Date.now() - startTime;
      this.validateIntelligence(intelligence);

      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'design-intelligence-v1',
        tokens: null,
        latency,
        error: null,
      });

      return { 
        ...intelligence, 
        metadata: { 
          generatedAt: new Date().toISOString(), 
          version: 'v1', 
          latency 
        } 
      };
    } catch (error) {
      console.error('[DesignIntelligenceService] AI generation failed, using deterministic fallback:', error.message);
      
      // Log the AI failure
      await AIService.logAICall({
        requestId: options.requestId || null,
        businessId: options.businessId || null,
        model: 'reasoning',
        promptVersion: 'design-intelligence-v1',
        tokens: null,
        latency: null,
        error: error.message,
      });
      
      // Fall back to deterministic generation
      return this.generateDeterministicIntelligence(businessProfile, brandDNA, digitalAudit, startTime);
    }
  }

  /**
   * Generate deterministic design intelligence without AI.
   * Uses business category, brand DNA, and audit data to make intelligent design decisions.
   */
  generateDeterministicIntelligence(businessProfile, brandDNA, digitalAudit, startTime) {
    // P1.5: Read business facts through the canonical projection.
    const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessProfile });
    const facts = canonical.identity || {};
    const category = canonical.business.category
      || (canonical.business.categories && canonical.business.categories[0])
      || 'general';
    const brandPersonality = brandDNA?.brandPersonality || ['professional', 'trustworthy'];
    const hasWebsite = canonical.identity.website;
    const hasPhone = canonical.identity.phone;
    const hasHours = canonical.business.hours && Object.keys(canonical.business.hours).length > 0;
    const hasAddress = canonical.identity.address;
    const hasRating = canonical.reputation.rating != null;
    const services = canonical.business.services || [];

    // Determine layout family based on category and brand personality
    const layoutFamily = this.selectLayoutFamily(category, brandPersonality);
    
    // Select visual direction
    const visualDirection = this.selectVisualDirection(category, brandPersonality);
    
    // Generate color system based on category and personality
    const colorSystem = this.generateColorSystem(category, brandPersonality);
    
    // Generate typography
    const typography = this.generateTypography(category, brandPersonality);
    
    // Generate layout
    const layout = this.generateLayout(category, layoutFamily);
    
    // Generate shape language
    const shapeLanguage = this.generateShapeLanguage(category, brandPersonality);
    
    // Generate motion settings
    const motion = this.generateMotion(category, brandPersonality);
    
    // Generate image treatment
    const imageTreatment = this.generateImageTreatment(category);
    
    // Generate icon treatment
    const iconTreatment = this.generateIconTreatment(category, brandPersonality);

    // Generate page architecture
    const pageArchitecture = this.generatePageArchitecture(category, layoutFamily, {
      hasWebsite,
      hasPhone,
      hasHours,
      hasAddress,
      hasRating,
      servicesCount: services.length,
      hasDescription: !!facts.description,
    });

    // Generate content strategy
    const contentStrategy = this.generateContentStrategy(businessProfile, brandPersonality, pageArchitecture);
    
    // Generate asset plan
    const assetPlan = this.generateAssetPlan(category, layoutFamily);

    const intelligence = {
      designSystem: {
        visualDirection,
        brandPersonality,
        colorSystem,
        typography,
        layout,
        shapeLanguage,
        motion,
        imageTreatment,
        iconTreatment,
      },
      pageArchitecture,
      contentStrategy,
      assetPlan,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: 'v1',
        latency: Date.now() - startTime,
        model: 'deterministic',
        confidence: 0.85,
        reasoning: 'Generated using deterministic design intelligence based on business category and brand personality',
      }
    };

    this.validateIntelligence(intelligence);
    return intelligence;
  }

  /**
   * Select layout family based on business category and brand personality
   */
  selectLayoutFamily(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    // Luxury/premium categories
    if (cat.includes('luxury') || cat.includes('high-end') || 
        personality.includes('luxury') || personality.includes('premium') ||
        cat.includes('hotel') || cat.includes('spa') || cat.includes('resort')) {
      return 'luxury';
    }
    
    // Food/beverage categories
    if (cat.includes('bakery') || cat.includes('cafe') || cat.includes('coffee') ||
        cat.includes('restaurant') || cat.includes('bistro') || cat.includes('deli')) {
      return 'warm-artisan';
    }
    
    // Fitness/energetic
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('yoga') ||
        cat.includes('crossfit') || personality.includes('energetic') || personality.includes('dynamic')) {
      return 'energetic';
    }
    
    // Professional services
    if (cat.includes('law') || cat.includes('legal') || cat.includes('finance') ||
        cat.includes('accounting') || cat.includes('consulting') || cat.includes('insurance') ||
        cat.includes('real estate') || cat.includes('medical') || cat.includes('dental') ||
        personality.includes('professional') || personality.includes('trustworthy')) {
      return 'professional';
    }
    
    // Retail/shop
    if (cat.includes('retail') || cat.includes('store') || cat.includes('shop') ||
        cat.includes('boutique') || cat.includes('eyewear') || cat.includes('optical')) {
      return 'modern-minimal';
    }
    
    // Creative/editorial
    if (cat.includes('photography') || cat.includes('design') || cat.includes('studio') ||
        cat.includes('gallery') || cat.includes('creative') || personality.includes('creative')) {
      return 'editorial';
    }
    
    // Default to modern-minimal
    return 'modern-minimal';
  }

  /**
   * Select visual direction based on category and brand personality
   */
  selectVisualDirection(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    if (cat.includes('bakery') || cat.includes('cafe') || cat.includes('restaurant') || cat.includes('coffee')) {
      return 'warm, inviting food photography with natural lighting and organic textures';
    }
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('yoga')) {
      return 'energetic, dynamic imagery showing active lifestyles and premium facilities';
    }
    if (cat.includes('luxury') || cat.includes('hotel') || cat.includes('spa') || cat.includes('resort')) {
      return 'cinematic, sophisticated imagery with refined elegance and aspirational lifestyle';
    }
    if (cat.includes('law') || cat.includes('legal') || cat.includes('finance') || cat.includes('medical') || cat.includes('dental')) {
      return 'clean, authoritative photography conveying trust, competence, and professionalism';
    }
    if (cat.includes('bakery') || cat.includes('artisan') || cat.includes('craft') || cat.includes('handmade')) {
      return 'warm, tactile imagery emphasizing craftsmanship, ingredients, and process';
    }
    if (cat.includes('retail') || cat.includes('eyewear') || cat.includes('fashion') || cat.includes('boutique')) {
      return 'clean, product-focused photography with lifestyle context and aspirational styling';
    }
    return 'modern, professional imagery with clean composition and authentic moments';
  }

  /**
   * Generate color system based on category and brand personality
   */
  generateColorSystem(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    // Predefined color systems by category
    const colorSystems = {
      bakery: {
        background: '#fefaf5',
        surface: '#fffef8',
        text: '#2d2824',
        mutedText: '#8b7d73',
        primary: '#b87333',      // warm copper
        secondary: '#d4a574',    // warm gold
        accent: '#e8b86d',       // soft amber
        border: '#e8ddd0',
      },
      cafe: {
        background: '#fdf8f3',
        surface: '#faf5ef',
        text: '#2c2520',
        mutedText: '#9a8d80',
        primary: '#8b5e3c',      // coffee brown
        secondary: '#c4a078',    // latte
        accent: '#d4a574',       // caramel
        border: '#e8ddd4',
      },
      restaurant: {
        background: '#fefcf8',
        surface: '#fffef9',
        text: '#1e1a16',
        mutedText: '#8a8078',
        primary: '#c0392b',      // deep red
        secondary: '#e67e22',    // terracotta
        accent: '#f39c12',       // gold
        border: '#e8ddd0',
      },
      gym: {
        background: '#0d1117',
        surface: '#161b22',
        text: '#e6edf3',
        mutedText: '#8b949e',
        primary: '#58a6ff',      // electric blue
        secondary: '#f78166',    // coral
        accent: '#a5d6ff',       // light blue
        border: '#30363d',
      },
      gym_light: {
        background: '#f0f4f8',
        surface: '#ffffff',
        text: '#1e293b',
        mutedText: '#64748b',
        primary: '#0ea5e9',      // sky blue
        secondary: '#f97316',    // orange
        accent: '#22d3ee',       // cyan
        border: '#e2e8f0',
      },
      hotel: {
        background: '#fafafa',
        surface: '#ffffff',
        text: '#1a1a1a',
        mutedText: '#737373',
        primary: '#1a1a2e',      // deep navy
        secondary: '#c9a86a',    // champagne gold
        accent: '#e8d5b7',       // warm champagne
        border: '#e5e5e5',
      },
      law: {
        background: '#fafafa',
        surface: '#ffffff',
        text: '#1a1a2e',
        mutedText: '#6b7280',
        primary: '#1e3a5f',      // navy
        secondary: '#374151',    // dark gray
        accent: '#d4a843',       // gold
        border: '#e5e7eb',
      },
      retail: {
        background: '#ffffff',
        surface: '#fafafa',
        text: '#111827',
        mutedText: '#6b7280',
        primary: '#111827',      // near black
        secondary: '#374151',    // gray
        accent: '#f59e0b',       // amber
        border: '#e5e7eb',
      },
      medical: {
        background: '#f8fafc',
        surface: '#ffffff',
        text: '#0f172a',
        mutedText: '#64748b',
        primary: '#0e7490',      // teal
        secondary: '#0369a1',    // blue
        accent: '#06b6d4',       // cyan
        border: '#e0f2fe',
      },
      default: {
        background: '#ffffff',
        surface: '#f8fafc',
        text: '#0f172a',
        mutedText: '#64748b',
        primary: '#2563eb',      // blue
        secondary: '#7c3aed',    // purple
        accent: '#f59e0b',       // amber
        border: '#e2e8f0',
      },
    };
    
    // Match category to color system
    for (const [key, colors] of Object.entries(colorSystems)) {
      if (cat.includes(key)) return colors;
    }
    return colorSystems.default;
  }

  /**
   * Generate typography system
   */
  generateTypography(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    // Typography systems by category
    const typographySystems = {
      bakery: {
        display: { family: "'Fraunces', 'Georgia', serif", weight: 700, lineHeight: 1.15, sizeScale: 'clamp(2.5rem, 6vw, 4.5rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.65, sizeScale: '1rem' },
      },
      cafe: {
        display: { family: "'Playfair Display', Georgia, serif", weight: 600, lineHeight: 1.2, sizeScale: 'clamp(2.5rem, 6vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.6, sizeScale: '1rem' },
      },
      restaurant: {
        display: { family: "'Playfair Display', Georgia, serif", weight: 600, lineHeight: 1.15, sizeScale: 'clamp(2.5rem, 6vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.6, sizeScale: '1rem' },
      },
      gym: {
        display: { family: "'Space Grotesk', 'Inter', sans-serif", weight: 800, lineHeight: 1.1, sizeScale: 'clamp(2.5rem, 7vw, 5rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 500, lineHeight: 1.5, sizeScale: '1rem' },
      },
      hotel: {
        display: { family: "'Cormorant Garamond', Georgia, serif", weight: 600, lineHeight: 1.15, sizeScale: 'clamp(2.5rem, 5vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.7, sizeScale: '1rem' },
      },
      law: {
        display: { family: "'Merriweather', Georgia, serif", weight: 700, lineHeight: 1.2, sizeScale: 'clamp(2rem, 5vw, 3.5rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.65, sizeScale: '1rem' },
      },
      retail: {
        display: { family: "'Space Grotesk', 'Inter', sans-serif", weight: 700, lineHeight: 1.15, sizeScale: 'clamp(2.5rem, 6vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.6, sizeScale: '1rem' },
      },
      medical: {
        display: { family: "'Inter', system-ui, sans-serif", weight: 700, lineHeight: 1.2, sizeScale: 'clamp(2.5rem, 6vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.65, sizeScale: '1rem' },
      },
      default: {
        display: { family: "'Inter', system-ui, sans-serif", weight: 700, lineHeight: 1.15, sizeScale: 'clamp(2.5rem, 6vw, 4rem)' },
        body: { family: "'Inter', system-ui, sans-serif", weight: 400, lineHeight: 1.6, sizeScale: '1rem' },
      },
    };
    
    // Match category to typography system
    for (const [key, typo] of Object.entries(typographySystems)) {
      if (cat.includes(key)) return typo;
    }
    return typographySystems.default;
  }

  /**
   * Generate layout configuration
   */
  generateLayout(category, layoutFamily) {
    const layoutConfigs = {
      editorial: {
        maxWidth: '76rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'asymmetric-editorial',
        heroComposition: 'split-left',
      },
      luxury: {
        maxWidth: '80rem',
        sectionSpacing: 'clamp(5rem, 10vw, 8rem)',
        grid: 'asymmetric-luxury',
        heroComposition: 'full-bleed',
      },
      'modern-minimal': {
        maxWidth: '72rem',
        sectionSpacing: 'clamp(3.5rem, 7vw, 5rem)',
        grid: 'clean-systematic',
        heroComposition: 'centered',
      },
      'bold-modern': {
        maxWidth: '76rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'bold-modular',
        heroComposition: 'split-right',
      },
      'warm-artisan': {
        maxWidth: '74rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'organic-grid',
        heroComposition: 'centered',
      },
      professional: {
        maxWidth: '70rem',
        sectionSpacing: 'clamp(3.5rem, 7vw, 5rem)',
        grid: 'structured-grid',
        heroComposition: 'split-left',
      },
      energetic: {
        maxWidth: '76rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'dynamic-grid',
        heroComposition: 'split-right',
      },
      classic: {
        maxWidth: '72rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'classic-grid',
        heroComposition: 'centered',
      },
      'single-page': {
        maxWidth: '48rem',
        sectionSpacing: 'clamp(3rem, 6vw, 4rem)',
        grid: 'single-column',
        heroComposition: 'centered',
      },
      default: {
        maxWidth: '76rem',
        sectionSpacing: 'clamp(4rem, 8vw, 6rem)',
        grid: 'standard-grid',
        heroComposition: 'centered',
      },
    };
    
    return layoutConfigs[layoutFamily] || layoutConfigs.default;
  }

  /**
   * Generate shape language
   */
  generateShapeLanguage(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    if (cat.includes('luxury') || cat.includes('hotel') || cat.includes('spa')) {
      return { radius: '16px', buttonShape: 'pill', cardShape: 'rounded', inputShape: 'rounded' };
    }
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('sport')) {
      return { radius: '8px', buttonShape: 'sharp', cardShape: 'sharp', inputShape: 'sharp' };
    }
    if (cat.includes('bakery') || cat.includes('cafe') || cat.includes('artisan') || cat.includes('handmade')) {
      return { radius: '20px', buttonShape: 'pill', cardShape: 'organic', inputShape: 'pill' };
    }
    if (cat.includes('tech') || cat.includes('software') || cat.includes('startup')) {
      return { radius: '8px', buttonShape: 'sharp', cardShape: 'sharp', inputShape: 'rounded' };
    }
    if (cat.includes('law') || cat.includes('legal') || cat.includes('finance') || cat.includes('medical')) {
      return { radius: '8px', buttonShape: 'rounded', cardShape: 'rounded', inputShape: 'rounded' };
    }
    if (cat.includes('creative') || cat.includes('design') || cat.includes('studio') || cat.includes('photography')) {
      return { radius: '12px', buttonShape: 'soft', cardShape: 'organic', inputShape: 'rounded' };
    }
    // Default
    return { radius: '12px', buttonShape: 'rounded', cardShape: 'rounded', inputShape: 'rounded' };
  }

  /**
   * Generate motion settings
   */
  generateMotion(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('sport') || personality.includes('energetic')) {
      return { intensity: 'moderate', allowedEffects: ['fade', 'slide', 'scale', 'stagger'] };
    }
    if (cat.includes('luxury') || cat.includes('hotel') || cat.includes('spa') || cat.includes('hotel')) {
      return { intensity: 'subtle', allowedEffects: ['fade', 'reveal'] };
    }
    if (cat.includes('creative') || cat.includes('design') || cat.includes('studio')) {
      return { intensity: 'expressive', allowedEffects: ['fade', 'slide', 'scale', 'stagger', 'parallax'] };
    }
    if (cat.includes('law') || cat.includes('legal') || cat.includes('finance') || cat.includes('medical')) {
      return { intensity: 'subtle', allowedEffects: ['fade', 'reveal'] };
    }
    // Default
    return { intensity: 'subtle', allowedEffects: ['fade', 'slide', 'reveal'] };
  }

  /**
   * Generate image treatment
   */
  generateImageTreatment(category) {
    const cat = category?.toLowerCase() || '';
    
    if (cat.includes('bakery') || cat.includes('cafe') || cat.includes('restaurant') || cat.includes('food')) {
      return { 
        aspectRatios: ['4:3', '1:1', '16:9'], 
        overlayStyle: 'gradient', 
        borderTreatment: 'organic', 
        shadowStyle: 'elevated' 
      };
    }
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('sport')) {
      return { 
        aspectRatios: ['16:9', '4:3'], 
        overlayStyle: 'gradient', 
        borderTreatment: 'sharp', 
        shadowStyle: 'dramatic' 
      };
    }
    if (cat.includes('luxury') || cat.includes('hotel') || cat.includes('spa') || cat.includes('resort')) {
      return { 
        aspectRatios: ['16:9', '4:5', '1:1'], 
        overlayStyle: 'vignette', 
        borderTreatment: 'film', 
        shadowStyle: 'elevated' 
      };
    }
    if (cat.includes('retail') || cat.includes('eyewear') || cat.includes('fashion')) {
      return { 
        aspectRatios: ['4:5', '1:1', '3:4'], 
        overlayStyle: 'none', 
        borderTreatment: 'sharp', 
        shadowStyle: 'subtle' 
      };
    }
    if (cat.includes('law') || cat.includes('legal') || cat.includes('medical') || cat.includes('dental')) {
      return { 
        aspectRatios: ['16:9', '4:3'], 
        overlayStyle: 'none', 
        borderTreatment: 'sharp', 
        shadowStyle: 'subtle' 
      };
    }
    // Default
    return { 
      aspectRatios: ['16:9', '4:3', '1:1'], 
      overlayStyle: 'gradient', 
      borderTreatment: 'rounded', 
      shadowStyle: 'subtle' 
    };
  }

  /**
   * Generate icon treatment
   */
  generateIconTreatment(category, brandPersonality) {
    const cat = category?.toLowerCase() || '';
    const personality = brandPersonality?.join(' ').toLowerCase() || '';
    
    if (cat.includes('creative') || cat.includes('design') || cat.includes('artisan') || cat.includes('handmade')) {
      return { style: 'hand-drawn', weight: '2px', size: '1.5rem' };
    }
    if (cat.includes('tech') || cat.includes('software') || cat.includes('startup')) {
      return { style: 'minimal', weight: '2px', size: '1.25rem' };
    }
    if (cat.includes('luxury') || cat.includes('hotel') || cat.includes('spa')) {
      return { style: 'duotone', weight: '1.5px', size: '1.5rem' };
    }
    if (cat.includes('gym') || cat.includes('fitness') || cat.includes('sport')) {
      return { style: 'filled', weight: 'bold', size: '1.5rem' };
    }
    // Default
    return { style: 'outline', weight: '2px', size: '1.25rem' };
  }

  /**
   * Generate page architecture
   */
  generatePageArchitecture(category, layoutFamily, features) {
    const cat = category?.toLowerCase() || '';
    const sections = [];
    
    // Always include navigation and hero
    sections.push({
      id: 'navigation',
      type: 'navigation',
      priority: 'critical',
      reason: 'Primary navigation and brand anchor',
      requiredFacts: [],
      content: { style: 'sticky', position: 'top', mobileBehavior: 'drawer' },
      layout: 'sticky-top',
      responsive: { mobileBehavior: 'drawer' },
    });
    
    sections.push({
      id: 'hero',
      type: 'hero',
      priority: 'critical',
      reason: 'Primary value proposition and conversion entry point',
      requiredFacts: ['identity.name'],
      content: { composition: 'centered' },
      layout: 'hero-primary',
      responsive: { heroBehavior: 'stack' },
    });
    
    // Services section
    const servicesCount = parseInt(features?.servicesCount) || 0;
    if (servicesCount >= 1) {
      sections.push({
        id: 'services',
        type: 'services',
        priority: 'essential',
        reason: 'Core offerings drive conversion',
        requiredFacts: ['services'],
        content: { layout: 'grid', maxItems: 6 },
        layout: 'grid-cards',
        responsive: { gridBehavior: 'stack' },
      });
    }
    
    // Featured service for single standout offering
    if (servicesCount === 1) {
      sections.push({
        id: 'featured-service',
        type: 'featured-service',
        priority: 'recommended',
        reason: 'Highlight signature offering',
        requiredFacts: ['services'],
        content: { layout: 'split', assetRequired: true },
        layout: 'split-media-content',
        responsive: { heroBehavior: 'stack' },
      });
    }
    
    // About section
    if (features?.hasDescription) {
      sections.push({
        id: 'about',
        type: 'about',
        priority: 'recommended',
        reason: 'Build credibility and connection',
        requiredFacts: ['identity.description'],
        content: { layout: 'split', differentiators: true },
        layout: 'split-media-content',
        responsive: { heroBehavior: 'stack' },
      });
    }
    
    // Gallery for visual businesses
    const visualCategories = ['bakery', 'cafe', 'restaurant', 'hotel', 'hotel', 'spa', 'retail', 'photography', 'studio', 'creative', 'design', 'fashion', 'eyewear'];
    if (visualCategories.some(v => category?.toLowerCase().includes(v))) {
      sections.push({
        id: 'gallery',
        type: 'gallery',
        priority: 'recommended',
        reason: 'Visual proof of quality and atmosphere',
        requiredFacts: [],
        content: { layout: 'masonry', count: 6 },
        layout: 'masonry-gallery',
        responsive: { gridBehavior: 'masonry' },
      });
    }
    
    // Testimonials (when we have reviews)
    // Would need verified reviews
    
    // Trust signals
    sections.push({
      id: 'trust',
      type: 'trust',
      priority: 'recommended',
      reason: 'Build credibility with verified signals',
      requiredFacts: ['rating', 'reviewCount', 'services'],
      content: { elements: ['rating', 'reviews', 'years', 'certifications'] },
      layout: 'trust-bar',
      responsive: { gridBehavior: 'stack' },
    });
    
    // Statistics for established businesses
    sections.push({
      id: 'statistics',
      type: 'statistics',
      priority: 'conditional',
      reason: 'Quantify credibility with metrics',
      requiredFacts: [],
      content: { items: ['years', 'customers', 'projects'] },
      layout: 'stats-grid',
      responsive: { gridBehavior: 'stack' },
    });
    
    // Location
    if (features?.hasAddress) {
      sections.push({
        id: 'location',
        type: 'location',
        priority: 'essential',
        reason: 'Physical location critical for local conversion',
        requiredFacts: ['location.address', 'location.coordinates'],
        content: { mapEmbed: true, directionsLink: true },
        layout: 'map-with-info',
        responsive: { heroBehavior: 'scale' },
      });
    }
    
    // Hours
    if (features?.hasHours) {
      sections.push({
        id: 'hours',
        type: 'hours',
        priority: 'essential',
        reason: 'Operating hours critical for local business',
        requiredFacts: ['openingHours'],
        content: { format: 'weekly-schedule', highlightToday: true },
        layout: 'hours-table',
        responsive: { gridBehavior: 'stack' },
      });
    }
    
    // Contact
    if (features?.hasPhone || features?.hasWebsite || features?.hasEmail) {
      sections.push({
        id: 'contact',
        type: 'contact',
        priority: 'essential',
        reason: 'Direct conversion pathway',
        requiredFacts: ['contact.phone', 'contact.email', 'contact.website'],
        content: { channels: ['phone', 'email', 'website', 'directions'] },
        layout: 'contact-grid',
        responsive: { gridBehavior: 'stack' },
      });
    }
    
    // CTA section
    sections.push({
      id: 'cta',
      type: 'cta',
      priority: 'critical',
      reason: 'Final conversion opportunity',
      requiredFacts: [],
      content: { headline: 'Ready to visit?', subheadline: 'We\'d love to serve you' },
      layout: 'cta-band',
      responsive: { heroBehavior: 'scale' },
    });
    
    // Footer
    sections.push({
      id: 'footer',
      type: 'footer',
      priority: 'critical',
      reason: 'Brand closure and legal requirements',
      requiredFacts: ['identity.name', 'location.address'],
      content: { copyright: true, socialLinks: true },
      layout: 'standard-footer',
      responsive: { gridBehavior: 'stack' },
    });
    
    return {
      layoutFamily,
      sections,
      navigation: {
        style: 'sticky',
        position: 'top',
        mobileBehavior: 'drawer',
      },
      responsive: {
        breakpoints: { mobile: '640px', tablet: '1024px', desktop: '1280px' },
        heroBehavior: 'stack',
        gridBehavior: 'stack',
      },
    };
  }

  /**
   * Generate content strategy
   */
  generateContentStrategy(businessProfile, brandPersonality, pageArchitecture) {
    // P1.5: Read business facts through the canonical projection.
    const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessProfile });
    const facts = canonical.identity || {};
    const name = facts.name || 'This Business';
    const category = canonical.business.category || 'local business';
    const description = canonical.business.description || '';
    const phone = canonical.identity.phone;
    const website = canonical.identity.website;
    const address = canonical.identity.address;
    const hasPhone = !!phone;
    const hasWebsite = !!website;
    const hasAddress = !!address;
    const services = canonical.business.services || [];
    
    const primaryAction = hasPhone ? 'call' : (hasWebsite ? 'visit' : 'directions');
    const primaryCtaText = hasPhone 
      ? `Call ${name}` 
      : (hasWebsite ? 'Visit Website' : 'Get Directions');
    const secondaryCtaText = hasWebsite && !hasPhone 
      ? 'Call for Info' 
      : (hasPhone && hasWebsite ? 'Visit Website' : 'Get Directions');
    
    // Determine CTA action
    const ctaAction = primaryAction;
    
    return {
      hero: {
        headline: `${name} — ${category.charAt(0).toUpperCase() + category.slice(1)}`,
        subheadline: description || `${name} is a ${category} serving the local community with quality and care.`,
        cta: {
          primary: primaryCtaText,
          action: ctaAction,
          reasoning: hasPhone ? 'Phone is primary conversion channel' : (hasWebsite ? 'Website is primary conversion channel' : 'Directions for physical visits'),
        },
        secondaryCta: {
          text: secondaryCtaText,
          action: hasWebsite && !hasPhone ? 'call' : (hasPhone && hasWebsite ? 'website' : 'directions'),
        },
      },
      sections: {
        about: {
          heading: `About ${name}`,
          story: `Welcome to ${name}. ${description || `We are a ${category} dedicated to serving our community with excellence.`}`,
          differentiators: [
            'Locally owned and operated',
            'Quality-focused service',
            'Community-centered approach',
          ],
        },
        services: {
          heading: 'Our Services',
          items: services.map(s => ({
            name: s,
            description: `Professional ${s.toLowerCase()} services`,
            benefits: ['Quality guaranteed', 'Experienced team'],
          })),
        },
        gallery: {
          heading: 'Our Work',
          images: [],
        },
        testimonials: {
          heading: 'What Our Customers Say',
          questions: [],
        },
        trust: {
          heading: 'Why Choose Us',
          elements: [
            { claim: 'Locally trusted', verified: true, icon: 'shield' },
            { claim: 'Quality guaranteed', verified: true, icon: 'check' },
            { claim: 'Fair pricing', verified: true, icon: 'tag' },
          ],
        },
        statistics: {
          heading: 'By the Numbers',
          items: [
            { label: 'Years Serving', value: '5+' },
            { label: 'Happy Customers', value: '1000+' },
            { label: 'Services Offered', value: String(Math.max(1, services.length)) },
          ],
        },
        location: {
          heading: 'Visit Us',
          address: canonical.identity.address || 'Address available on contact',
        },
        hours: {
          heading: 'Hours',
          schedule: canonical.business.hours || {},
        },
        contact: {
          heading: 'Get in Touch',
          phone: canonical.identity.phone,
          email: canonical.business.email,
          website: canonical.identity.website,
        },
        cta: {
          headline: `Ready to Experience ${name}?`,
          subheadline: `Contact us today to learn more about our ${category} services.`,
          ctaText: primaryCtaText,
        },
      },
      ctaStrategy: {
        primary: primaryCtaText,
        secondary: secondaryCtaText,
        microConversions: ['View phone number', 'Get directions', 'Visit website', 'Check hours'],
      },
      trustStrategy: {
        elements: [
          { claim: 'Licensed & Insured', verified: true },
          { claim: 'Locally Owned', verified: true },
          { claim: '5+ Years Experience', verified: false },
        ],
        placement: 'trust-bar-above-footer',
      },
      voice: {
        tone: 'conversational',
        personality: ['approachable', 'knowledgeable', 'trustworthy'],
        avoid: ['corporate jargon', 'overpromising', 'generic claims'],
      },
    };
  }

  /**
   * Generate asset plan
   */
  generateAssetPlan(category, layoutFamily) {
    const cat = category?.toLowerCase() || '';
    
    // Hero asset
    let heroType = 'generated';
    let heroSubject = 'business exterior';
    if (cat.includes('bakery') || cat.includes('cafe')) {
      heroType = 'generated';
      heroSubject = 'artisan bakery interior with fresh pastries';
    } else if (cat.includes('restaurant') || cat.includes('cafe')) {
      heroType = 'generated';
      heroSubject = 'restaurant dining room with plated dishes';
    } else if (cat.includes('gym') || cat.includes('fitness')) {
      heroType = 'generated';
      heroSubject = 'premium fitness facility with modern equipment';
    } else if (cat.includes('hotel') || cat.includes('luxury')) {
      heroType = 'generated';
      heroSubject = 'luxury hotel lobby with elegant furnishings';
    } else if (cat.includes('retail') || cat.includes('eyewear')) {
      heroType = 'generated';
      heroSubject = 'modern retail space with product displays';
    } else if (cat.includes('law') || cat.includes('legal') || cat.includes('medical') || cat.includes('dental')) {
      heroType = 'generated';
      heroSubject = 'professional office interior with consultation area';
    } else {
      heroType = 'pattern';
      heroSubject = 'abstract geometric pattern in brand colors';
    }
    
    // Supporting assets
    const supporting = [
      { id: 'service-1', purpose: 'service-illustration', subject: 'primary service in action', aspectRatio: '4:3', resolution: '2k' },
      { id: 'about-1', purpose: 'about-illustration', subject: 'team at work', aspectRatio: '4:3', resolution: '2k' },
      { id: 'location-1', purpose: 'location-context', subject: 'business exterior and neighborhood', aspectRatio: '16:9', resolution: '2k' },
    ];
    
    // Gallery
    let galleryCount = 0;
    const visualCategories = ['bakery', 'cafe', 'restaurant', 'hotel', 'spa', 'retail', 'photography', 'studio', 'creative', 'design', 'fashion', 'gym', 'fitness'];
    if (visualCategories.some(v => category?.toLowerCase().includes(v))) {
      galleryCount = 6;
    }
    
    return {
      hero: {
        type: heroType,
        subject: heroSubject,
        aspectRatio: '16:9',
        resolution: '4k',
        treatment: {},
      },
      supporting: supporting,
      gallery: {
        count: galleryCount,
        style: 'editorial',
        layout: 'masonry',
      },
      optimization: {
        formats: ['webp', 'avif', 'jpg'],
        sizes: ['3840w', '1920w', '960w', '480w'],
        loading: { hero: 'eager', others: 'lazy' },
      },
    };
  }

  validateIntelligence(intelligence) {
    const required = [
      'designSystem', 
      'pageArchitecture', 
      'contentStrategy', 
      'assetPlan',
      'metadata'
    ];
    for (const field of required) {
      if (!intelligence[field]) throw new Error(`Missing required field: ${field}`);
    }
    
    // Validate design system completeness
    const ds = intelligence.designSystem;
    if (!ds.visualDirection || !ds.brandPersonality || !ds.colorSystem || 
        !ds.typography || !ds.layout || !ds.shapeLanguage) {
      throw new Error('Incomplete design system');
    }

    // Validate page architecture
    if (!intelligence.pageArchitecture?.sections || !Array.isArray(intelligence.pageArchitecture.sections)) {
      throw new Error('Invalid page architecture sections');
    }
    if (!intelligence.pageArchitecture.layoutFamily) {
      throw new Error('Missing layout family');
    }

    // Validate content strategy
    if (!intelligence.contentStrategy?.hero || !intelligence.contentStrategy?.sections) {
      throw new Error('Incomplete content strategy');
    }

    // Validate asset plan
    if (!intelligence.assetPlan?.hero || !intelligence.assetPlan?.supporting) {
      throw new Error('Incomplete asset plan');
    }

    return true;
  }

  static extractSummary(intelligence) {
    // Guard: handle missing or malformed intelligence gracefully
    if (!intelligence) return null;
    const pa = intelligence.pageArchitecture || {};
    const ds = intelligence.designSystem || {};
    const ap = intelligence.assetPlan || {};
    const cs = intelligence.contentStrategy || {};
    const sections = Array.isArray(pa.sections)
      ? pa.sections.map(s => (typeof s === 'string' ? s : s?.id)).filter(Boolean)
      : [];
    return {
      layoutFamily: pa.layoutFamily || null,
      visualDirection: ds.visualDirection || null,
      primaryColor: ds.colorSystem?.primary || null,
      typography: ds.typography
        ? `${ds.typography.display?.family || ''} / ${ds.typography.body?.family || ''}`
        : null,
      sections,
      heroAsset: ap.hero?.type || null,
      supportingAssets: Array.isArray(ap.supporting) ? ap.supporting.length : 0,
      primaryCTA: cs.hero?.cta?.primary || null,
    };
  }
}

export default DesignIntelligenceService;