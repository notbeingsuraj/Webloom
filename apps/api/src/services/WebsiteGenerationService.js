/**
 * WebsiteGenerationService
 *
 * Orchestrates local website generation from a verified BusinessProfile:
 *
 *   verified business (from /api/business/analyze)
 *     + optional WebsiteStrategy / WebsiteCopy / LandingPageSpec (existing AI services)
 *     ↓
 *   assemble deterministic site.config.json (facts strictly from profile)
 *     → factual validation
 *     → copy reusable Astro template into generated-sites/<slug>/
 *     → write site.config.json
 *     → npm install → astro build → start localhost server on free port
 *     ↓
 *   { slug, path, port, url, status }
 *
 * The AI never invents business facts; it only provides design/content config
 * that this service merges over the verified profile. Any AI-provided copy is
 * passed through the FactualDataValidator.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import GeneratedSiteManager from './GeneratedSiteManager.js';
import DesignIntelligenceService from './DesignIntelligenceService.js';
import { validateFactualFields, sanitizeAICopy } from './FactualDataValidator.js';
import { config } from '../config/env.js';
// P1.3: ONE canonical read layer for business facts. extractFacts now reads
// through the canonical projection instead of direct shape-specific access,
// so WebsiteGenerationService no longer needs to know which of Webloom's four
// business shapes it receives (flat provider / BusinessProfile / intelligence /
// persisted entity).
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';

// Deterministic category → theme defaults used when no AI spec is available.
const THEMES = {
  bakery: {
    style: 'warm-editorial',
    colorPalette: { primary: '#8a5a2b', secondary: '#5c3d1e', accent: '#e0a458', background: '#fbf7f0', surface: '#f4ecdf', text: '#3a2a1a', muted: '#8a7663' },
    typography: { headingFont: "'Fraunces', Georgia, serif", bodyFont: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    borderRadius: '14px',
  },
  restaurant: {
    style: 'warm-editorial',
    colorPalette: { primary: '#b03a2e', secondary: '#7c241c', accent: '#f2b632', background: '#fdfbf7', surface: '#f5efe5', text: '#2a2018', muted: '#7d6f5e' },
    typography: { headingFont: "'Playfair Display', Georgia, serif", bodyFont: "system-ui, sans-serif" },
    borderRadius: '12px',
  },
  furniture: {
    style: 'premium-editorial',
    colorPalette: { primary: '#1f2a33', secondary: '#3d4c5c', accent: '#c8a24a', background: '#f7f5f1', surface: '#eeece6', text: '#1c1c1c', muted: '#6b6b6b' },
    typography: { headingFont: "Georgia, 'Times New Roman', serif", bodyFont: "system-ui, sans-serif" },
    borderRadius: '8px',
  },
  corporate: {
    style: 'professional-corporate',
    colorPalette: { primary: '#1f3a5f', secondary: '#2e5b8a', accent: '#c9a86a', background: '#ffffff', surface: '#f4f6f9', text: '#16202c', muted: '#5b6b7c' },
    typography: { headingFont: "'Inter', system-ui, sans-serif", bodyFont: "'Inter', system-ui, sans-serif" },
    borderRadius: '10px',
  },
  retail: {
    style: 'clean-retail',
    colorPalette: { primary: '#0f2f4f', secondary: '#2c6e91', accent: '#f2a03d', background: '#ffffff', surface: '#f4f6f8', text: '#14181c', muted: '#5f6b75' },
    typography: { headingFont: "system-ui, sans-serif", bodyFont: "system-ui, sans-serif" },
    borderRadius: '12px',
  },
  health: {
    style: 'calm-health',
    colorPalette: { primary: '#2f6f6a', secondary: '#1f4f4b', accent: '#f0a35e', background: '#fbfdfd', surface: '#eef5f5', text: '#142422', muted: '#5e7572' },
    typography: { headingFont: "'Inter', system-ui, sans-serif", bodyFont: "'Inter', system-ui, sans-serif" },
    borderRadius: '12px',
  },
  default: {
    style: 'modern',
    colorPalette: { primary: '#2563eb', secondary: '#7c3aed', accent: '#f59e0b', background: '#ffffff', surface: '#f8fafc', text: '#0f172a', muted: '#64748b' },
    typography: { headingFont: "Georgia, 'Times New Roman', serif", bodyFont: "system-ui, -apple-system, sans-serif" },
    borderRadius: '12px',
  },
};

const CATEGORY_TO_THEME = [
  [/bakery|pastr|bread|cake/i, 'bakery'],
  [/restaurant|cafe|café|coffee|food|pizz|sushi|bar|grill|bistro|diner|deli/i, 'restaurant'],
  [/furniture|home|interior|decor|furnish/i, 'furniture'],
  [/office|center|cowork|business center|corporat|bank|insurance/i, 'corporate'],
  [/retail|store|shop|boutique|mall|market|outlet/i, 'retail'],
  [/health|dental|clinic|pharma|medical|fitness|gym|spa|salon|beauty/i, 'health'],
];

class WebsiteGenerationService {
  /**
   * @param {object} business  verified intelligence object from extractBusinessIntelligenceWithProviders
   * @param {object} [options]
   *   designIntelligence  - DesignIntelligenceService JSON (optional, will be generated if not provided)
   *   build     - run install+build (default true); set false to just scaffold
   *   start     - start server after build (default true)
   *   regenerateMode - 'content' | 'design' | 'assets' | 'all' (default 'all')
   */
  async generate(business, options = {}) {
    if (!business || !business.identity?.name) {
      throw new Error('A verified business with a name is required to generate a website');
    }

    const slug = this.slugify(business.identity.name);
    
    // Generate or use provided design intelligence
    let designIntelligence = options.designIntelligence;
    if (!designIntelligence && !options.skipAIDesign) {
      try {
        const { default: BrandStrategyService } = await import('./BrandStrategyService.js');
        const { default: DigitalAuditService } = await import('./DigitalAuditService.js');
        
        const brandDNA = await BrandStrategyService.generateBrandDNA(business);
        const digitalAudit = await DigitalAuditService.auditDigitalPresence(business);
        designIntelligence = await new DesignIntelligenceService().generateDesignIntelligence(
          business, brandDNA, digitalAudit, options
        );
      } catch (error) {
        console.error('[WebsiteGenerationService] AI design generation failed, using deterministic fallback:', error.message);
        designIntelligence = null;
      }
    }

    const config = await this.assembleConfig(business, { 
      ...options, 
      designIntelligence 
    });
    // `_validation` is an internal audit record; keep it out of the written JSON.
    const { _validation, ...writtenConfig } = config;

    // --- scaffold ---
    await GeneratedSiteManager.copyTemplate(slug);
    await GeneratedSiteManager.writeConfig(slug, writtenConfig);

    const result = {
      success: true,
      slug,
      path: GeneratedSiteManager.siteDir(slug),
      status: 'scaffolded',
      designIntelligence: designIntelligence ? DesignIntelligenceService.extractSummary(designIntelligence) : null,
    };

    const doBuild = options.build !== false;
    const doStart = options.start !== false;

    if (doBuild) {
      // Install only if requested (helps offline/dev iterations). ManagedSite
      // tolerates install failures when node_modules is usable; a real install
      // failure (no node_modules) surfaces here as a build-level error.
      if (GeneratedSiteManager.shouldRunInstall) {
        await GeneratedSiteManager.runInstall(slug);
      }
      // If node_modules present, build; otherwise throw a clear install error.
      await GeneratedSiteManager.runBuild(slug);
      result.build = 'ok';
      result.status = 'built';
    }

    if (doStart) {
      const port = await GeneratedSiteManager.allocatePort(slug);
      const live = await GeneratedSiteManager.start(slug, port);
      result.port = live.port;
      result.url = live.url;
      result.status = 'running';
    }

    return result;
  }

  /**
   * Assemble site.config.json from verified facts + design intelligence (AI or deterministic).
   * V2: Uses DesignIntelligenceService output when available for richer, business-specific output.
   */
  async assembleConfig(business, options = {}) {
    const facts = this.extractFacts(business);
    const designIntelligence = options.designIntelligence || null;
    
    // Determine copy source: AI-generated (from design intelligence) or deterministic fallback
    let cleanCopy;
    let copyIssues = [];
    
    if (designIntelligence?.contentStrategy) {
      // Use AI-generated content strategy, sanitize for factual safety
      const aiCopy = this.convertContentStrategyToCopy(designIntelligence.contentStrategy, facts);
      const { clean, issues } = sanitizeAICopy(aiCopy, { 
        phone: facts.phone, 
        email: facts.email, 
        rating: facts.rating 
      });
      cleanCopy = clean;
      copyIssues = issues;
    } else {
      // Fallback to deterministic copy
      cleanCopy = this.defaultCopy(facts);
      copyIssues = [];
    }

    // Theme: use AI-generated design system or deterministic fallback
    const theme = designIntelligence?.designSystem 
      ? this.convertDesignSystemToTheme(designIntelligence.designSystem, facts)
      : this.resolveTheme(facts, null);

    // Sections: use AI-generated page architecture or deterministic fallback
    const sections = designIntelligence?.pageArchitecture?.sections
      ? designIntelligence.pageArchitecture.sections
          .filter(s => s.priority === 'critical' || s.priority === 'essential' || 
                       (s.priority === 'recommended' && this.hasRequiredFacts(facts, s.requiredFacts)))
          .map(s => s.id)
      : this.resolveSections(facts, cleanCopy);

    // CTA: use AI-generated content strategy or deterministic fallback
    const primaryCta = designIntelligence?.contentStrategy?.hero?.cta
      ? { 
          text: designIntelligence.contentStrategy.hero.cta.primary,
          action: designIntelligence.contentStrategy.hero.cta.action,
          href: null
        }
      : this.resolvePrimaryCta(facts, null, null);
      
    const secondaryCta = designIntelligence?.contentStrategy?.hero?.secondaryCta
      ? {
          text: designIntelligence.contentStrategy.hero.secondaryCta?.text,
          href: designIntelligence.contentStrategy.hero.secondaryCta?.action
        }
      : this.resolveSecondaryCta(facts, null, null);

    const config = {
      site: {
        slug: this.slugify(facts.name),
        title: facts.name,
        description: designIntelligence?.contentStrategy?.hero?.subheadline 
          || this.descriptionFor(facts, null),
        lang: 'en',
        style: theme.style,
      },
      business: facts,
      facts: this.verifiedFacts(facts),
      copy: this.convertContentStrategyToCopy(designIntelligence?.contentStrategy, facts) || this.defaultCopy(facts),
      sections,
      theme,
      primaryCta,
      secondaryCta,
      provenance: business.source?.providers || {},
      generatedAt: new Date().toISOString(),
      designIntelligence: {
        layoutFamily: options.designIntelligence?.pageArchitecture?.layoutFamily,
        visualDirection: options.designIntelligence?.designSystem?.visualDirection,
        assetPlan: options.designIntelligence?.assetPlan,
      }
    };

    // Factual safety: assembled factual fields must match the verified profile.
    const fieldIssues = validateFactualFields(facts, config);
    const allIssues = [...fieldIssues, ...copyIssues];
    if (fieldIssues.some((i) => /fabricated|name|phone|email|website|address/.test(i))) {
      const err = new Error(`Factual safety failure: ${allIssues.join('; ')}`);
      err.code = 'FACTUAL_SAFETY';
      throw err;
    }
    config._validation = { issues: allIssues };
    return config;
  }

  slugify(name) {
    const base = String(name || 'business')
      .toLowerCase()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'business';
    return base;
  }

  /**
   * Extract a flat verified-facts object from the business intelligence shape.
   * P1.3: reads THROUGH the canonical read layer (CanonicalBusinessProfileService)
   * so this consumer no longer depends on any single source shape. The read
   * layer guards synthetic identity, provider-ID leakage, and AI provenance
   * across all four source shapes (flat provider / BusinessProfile /
   * intelligence / persisted entity).
   * Only non-null profile values are set; unknown remain null (never invented).
   */
  extractFacts(business) {
    const canonical = CanonicalBusinessProfileService.fromBusinessProfile(business);
    const cats = Array.isArray(canonical.business.categories) ? canonical.business.categories.map((c) => String(c)).filter(Boolean) : [];
    const hours = canonical.business.hours || null;
    const addr = canonical.identity.addressComponents || {};
    const coords = canonical.identity.coordinates || null;
    return {
      name: canonical.identity.name ?? null,
      category: canonical.business.category ?? null,
      categories: cats,
      description: canonical.business.description ?? null,
      phone: canonical.identity.phone ?? null,
      email: canonical.business.email ?? null,
      website: canonical.identity.website ?? null,
      address: canonical.identity.address ?? null,
      city: addr.city ?? null,
      state: addr.state ?? null,
      country: addr.country ?? null,
      postalCode: addr.postalCode ?? null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      hours,
      hoursText: this.hoursToText(hours),
      rating: canonical.reputation.rating ?? null,
      reviewCount: canonical.reputation.reviewCount ?? null,
    };
  }

  hoursToText(hours) {
    if (!hours) return null;
    if (typeof hours === 'string') return hours;
    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const lines = [];
    for (const day of dayNames) {
      const key = day.toLowerCase();
      const val = hours[key] ?? hours[day.toLowerCase().slice(0,3)] ?? hours[day] ?? null;
      if (val) lines.push(`${day}: ${typeof val === 'object' ? JSON.stringify(val) : Array.isArray(val) ? val.join(', ') : val}`);
    }
    return lines.length ? lines.join(' · ') : null;
  }

  defaultCopy(facts) {
    const name = facts.name || 'This business';
    return {
      hero: {
        headline: name,
        subheadline: facts.description || `${name} — ${facts.category || 'local business'}.`,
        cta: null,
        secondaryCta: null,
      },
      services: {
        heading: 'What we offer',
        items: (facts.categories && facts.categories.length ? facts.categories.map((c) => ({ name: c, description: '' })) : []),
      },
      about: {
        heading: 'About',
        story: facts.description || `Welcome to ${name}.`,
        differentiators: [],
      },
      faq: [],
    };
  }

  descriptionFor(facts, copy) {
    if (copy?.hero?.subheadline) return copy.hero.subheadline;
    return facts.description || `Local business website for ${facts.name}.`;
  }

  resolveTheme(facts, spec) {
    const specTheme = spec?.theme;
    if (specTheme && !specTheme.error && (specTheme.colorPalette || specTheme.typography)) {
      const base = THEMES.default;
      return {
        style: specTheme.style || base.style,
        colorPalette: {
          primary: specTheme.colorPalette?.primary || base.colorPalette.primary,
          secondary: specTheme.colorPalette?.secondary || base.colorPalette.secondary,
          accent: specTheme.colorPalette?.accent || base.colorPalette.accent,
          background: specTheme.colorPalette?.background || base.colorPalette.background,
          surface: specTheme.colorPalette?.surface || base.colorPalette.surface,
          text: specTheme.colorPalette?.text || base.colorPalette.text,
          muted: specTheme.colorPalette?.muted || base.colorPalette.muted,
        },
        typography: {
          headingFont: specTheme.typography?.headingFont || base.typography.headingFont,
          bodyFont: specTheme.typography?.bodyFont || base.typography.bodyFont,
        },
        borderRadius: base.borderRadius,
      };
    }
    const cat = facts.category || (facts.categories && facts.categories[0]) || '';
    for (const [re, key] of CATEGORY_TO_THEME) {
      if (re.test(cat)) return THEMES[key];
    }
    return THEMES.default;
  }

  resolveSections(facts, copy) {
    const sections = ['hero'];
    if (facts.description || (copy?.about?.story && copy.about.story !== `Welcome to ${facts.name}.`)) sections.push('about');
    const hasServices = (facts.categories && facts.categories.length) || (copy?.services?.items && copy.services.items.length);
    if (hasServices) sections.push('services');
    if (facts.hours || facts.hoursText) sections.push('hours');
    if (facts.latitude != null || facts.longitude != null || facts.address) sections.push('location');
    if (facts.phone || facts.email || facts.website) sections.push('contact');
    if (copy?.faq && copy.faq.length) sections.push('faq');
    sections.push('cta');
    return Array.from(new Set(sections));
  }

  resolvePrimaryCta(facts, spec, strategy) {
    const specCta = spec?.primaryCTA;
    if (specCta?.text) {
      return { text: specCta.text, action: specCta.action || 'contact', href: null };
    }
    // Deterministic default based on available channels.
    if (facts.phone) return { text: facts.category ? `Call ${facts.name}` : 'Call now', action: 'call', href: null };
    if (facts.website) return { text: 'Visit our website', action: 'website', href: null };
    return { text: 'Get directions', action: 'directions', href: null };
  }

  resolveSecondaryCta(facts, spec, strategy) {
    const specSecondary = spec?.sections?.find?.((s) => s.type === 'hero')?.content?.secondaryCta;
    if (specSecondary?.text) {
      return { text: specSecondary.text, href: null };
    }
    if (facts.phone && facts.website) return { text: 'Visit website', href: facts.website };
    return null;
  }

  verifiedFacts(facts) {
    const list = [];
    if (facts.name) list.push({ claim: `Business name is ${facts.name}`, source: 'structured_provider', verified: true });
    if (facts.category) list.push({ claim: `Category: ${facts.category}`, source: 'structured_provider', verified: true });
    if (facts.rating != null) list.push({ claim: `Rating ${facts.rating}/5`, source: 'structured_provider', verified: true });
    return list;
  }

  /**
   * Convert AI content strategy to copy format for renderer
   */
  convertContentStrategyToCopy(contentStrategy, facts) {
    if (!contentStrategy) return null;
    
    const name = facts.name || 'This business';
    
    return {
      hero: {
        headline: contentStrategy.hero?.headline || name,
        subheadline: contentStrategy.hero?.subheadline || facts.description || `${name} — ${facts.category || 'local business'}.`,
        cta: contentStrategy.hero?.cta?.primary || null,
        secondaryCta: contentStrategy.hero?.secondaryCta?.text || null,
      },
      services: {
        heading: contentStrategy.sections?.services?.heading || 'What we offer',
        items: contentStrategy.sections?.services?.items?.map(item => ({
          name: item.name,
          description: item.description || '',
          benefits: item.benefits || []
        })) || (facts.categories && facts.categories.length ? facts.categories.map(c => ({ name: c, description: '' })) : []),
      },
      about: {
        heading: contentStrategy.sections?.about?.heading || 'About',
        story: contentStrategy.sections?.about?.story || facts.description || `Welcome to ${name}.`,
        differentiators: contentStrategy.sections?.about?.differentiators || [],
      },
      faq: contentStrategy.sections?.faq?.questions?.map(q => ({
        question: q.question,
        answer: q.answer
      })) || [],
      trust: contentStrategy.sections?.trust?.elements || [],
      statistics: contentStrategy.sections?.statistics?.items || [],
      location: contentStrategy.sections?.location || null,
      hours: contentStrategy.sections?.hours || null,
      contact: contentStrategy.sections?.contact || null,
      cta: contentStrategy.sections?.cta || null,
    };
  }

  /**
   * Convert AI design system to theme format for renderer
   */
  convertDesignSystemToTheme(designSystem, facts) {
    if (!designSystem) {
      // Fallback to deterministic theme
      const cat = facts.category || (facts.categories && facts.categories[0]) || '';
      for (const [re, key] of CATEGORY_TO_THEME) {
        if (re.test(cat)) return THEMES[key];
      }
      return THEMES.default;
    }

    const ds = designSystem;
    return {
      style: ds.visualDirection || 'custom',
      colorPalette: {
        primary: ds.colorSystem?.primary || '#2563eb',
        secondary: ds.colorSystem?.secondary || '#7c3aed',
        accent: ds.colorSystem?.accent || '#f59e0b',
        background: ds.colorSystem?.background || '#ffffff',
        surface: ds.colorSystem?.surface || '#f8fafc',
        text: ds.colorSystem?.text || '#0f172a',
        muted: ds.colorSystem?.mutedText || '#64748b',
      },
      typography: {
        headingFont: ds.typography?.display?.family || "Georgia, 'Times New Roman', serif",
        bodyFont: ds.typography?.body?.family || "system-ui, -apple-system, sans-serif",
      },
      borderRadius: ds.shapeLanguage?.radius || '12px',
      // Additional design tokens for enhanced renderer
      designTokens: {
        motion: ds.motion,
        imageTreatment: ds.imageTreatment,
        iconTreatment: ds.iconTreatment,
        layout: ds.layout,
        weightScale: ds.typography?.weightScale,
        letterSpacing: ds.typography?.letterSpacing,
        shadowStyle: ds.imageTreatment?.shadowStyle,
      }
    };
  }

  /**
   * Check if business has required facts for a section
   */
  hasRequiredFacts(facts, requiredFacts) {
    if (!requiredFacts || !requiredFacts.length) return true;
    return requiredFacts.every(factPath => {
      const value = factPath.split('.').reduce((obj, key) => obj?.[key], facts);
      return value != null && value !== '';
    });
  }

  /**
   * Check if business has required facts for a section (deterministic fallback)
   */
  resolveTheme(facts, spec) {
    const specTheme = spec?.theme;
    if (specTheme && !specTheme.error && (specTheme.colorPalette || specTheme.typography)) {
      const base = THEMES.default;
      return {
        style: specTheme.style || base.style,
        colorPalette: {
          primary: specTheme.colorPalette?.primary || base.colorPalette.primary,
          secondary: specTheme.colorPalette?.secondary || base.colorPalette.secondary,
          accent: specTheme.colorPalette?.accent || base.colorPalette.accent,
          background: specTheme.colorPalette?.background || base.colorPalette.background,
          surface: specTheme.colorPalette?.surface || base.colorPalette.surface,
          text: specTheme.colorPalette?.text || base.colorPalette.text,
          muted: specTheme.colorPalette?.muted || base.colorPalette.muted,
        },
        typography: {
          headingFont: specTheme.typography?.headingFont || base.typography.headingFont,
          bodyFont: specTheme.typography?.bodyFont || base.typography.bodyFont,
        },
        borderRadius: base.borderRadius,
      };
    }
    const cat = facts.category || (facts.categories && facts.categories[0]) || '';
    for (const [re, key] of CATEGORY_TO_THEME) {
      if (re.test(cat)) return THEMES[key];
    }
    return THEMES.default;
  }

  resolveSections(facts, copy) {
    const sections = ['hero'];
    if (facts.description || (copy?.about?.story && copy.about.story !== `Welcome to ${facts.name}.`)) sections.push('about');
    const hasServices = (facts.categories && facts.categories.length) || (copy?.services?.items && copy.services.items.length);
    if (hasServices) sections.push('services');
    if (facts.hours || facts.hoursText) sections.push('hours');
    if (facts.latitude != null || facts.longitude != null || facts.address) sections.push('location');
    if (facts.phone || facts.email || facts.website) sections.push('contact');
    if (copy?.faq && copy.faq.length) sections.push('faq');
    sections.push('cta');
    return Array.from(new Set(sections));
  }

  resolvePrimaryCta(facts, spec, strategy) {
    const specCta = spec?.primaryCTA;
    if (specCta?.text) {
      return { text: specCta.text, action: specCta.action || 'contact', href: null };
    }
    // Deterministic default based on available channels.
    if (facts.phone) return { text: facts.category ? `Call ${facts.name}` : 'Call now', action: 'call', href: null };
    if (facts.website) return { text: 'Visit our website', action: 'website', href: null };
    return { text: 'Get directions', action: 'directions', href: null };
  }

  resolveSecondaryCta(facts, spec, strategy) {
    const specSecondary = spec?.sections?.find?.((s) => s.type === 'hero')?.content?.secondaryCta;
    if (specSecondary?.text) {
      return { text: specSecondary.text, href: null };
    }
    if (facts.phone && facts.website) return { text: 'Visit website', href: facts.website };
    return null;
  }

  /**
   * List generated sites (from manifest) for the UI.
   */
  async list() {
    const manifest = await GeneratedSiteManager.readManifest();
    const entries = Object.entries(manifest).map(([slug, m]) => ({
      slug,
      port: m?.port ?? null,
      url: m?.url ?? null,
      status: m?.status ?? 'unknown',
      startedAt: m?.startedAt ?? null,
      path: GeneratedSiteManager.siteDir(slug),
    }));
    entries.sort((a, b) => a.slug.localeCompare(b.slug));
    return entries;
  }

  async siteDir(slug) {
    return GeneratedSiteManager.siteDir(slug);
  }
}

export default new WebsiteGenerationService();
