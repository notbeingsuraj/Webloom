/**
 * LeadWebsiteSpecService
 *
 * Generates a normalized, frontend-facing website specification for a lead.
 *
 * Flow (preserving the existing service separation):
 *   1. Read verified business facts through the canonical projection.
 *   2. Try the AI LandingPageSpecService (brandDNA + audit + canonical facts).
 *      AI output is merged over canonical facts only — it never invents
 *      identity, contact, or business facts.
 *   3. On AI failure (or missing brandDNA/audit), fall back to the
 *      deterministic config used by WebsiteGenerationService.assembleConfig —
 *      the same deterministic output the generated site would use — so the
 *      preview is never fabricated: it is built from the verified profile.
 *   4. Normalize into the stable frontend contract (see
 *      apps/web/src/types/websiteSpecification.ts).
 *
 * Provenance is preserved in the returned metadata so the UI can label where
 * the specification came from. Generation failures are surfaced as a truthful
 * `failed` state — never as a successful-looking output.
 */

import LandingPageSpecService from './LandingPageSpecService.js';
import WebsiteGenerationService from './WebsiteGenerationService.js';
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';

class LeadWebsiteSpecService {
  /**
   * Generate a website specification for a lead.
   *
   * @param {object} businessData  canonical intelligence record stored on the lead
   * @param {object|null} brandDNA brand DNA analysis (may be null when analysis failed)
   * @param {object|null} audit    digital audit (may be null)
   * @returns {Promise<object>} normalized contract:
   *   { specification, status, error, noSourceWebsite, generatedAt, metadata }
   */
  async generate(businessData, brandDNA, audit) {
    if (!businessData) {
      return this._failure('Business data is missing, so a website specification cannot be generated.');
    }

    const canonical = CanonicalBusinessProfileService.fromEntityData({ record: businessData });
    const hasIdentity = !!canonical.identity.name;

    if (!hasIdentity) {
      return this._failure('Business identity is unavailable, so a website specification cannot be generated.');
    }

    const noSourceWebsite = !canonical.identity.website;

    // Path A: AI landing-page spec (best-effort). Requires brandDNA + audit.
    let aiSpec = null;
    if (brandDNA && audit) {
      try {
        aiSpec = await LandingPageSpecService.generateSpec(brandDNA, this._dummyStrategy(brandDNA, audit), audit);
      } catch (error) {
        console.error('[LeadWebsiteSpec] AI landing-page spec failed, using deterministic fallback:', error?.message || String(error));
      }
    }

    // Path B: deterministic config (from the same assembly the generated site uses).
    let deterministic = null;
    try {
      const config = await WebsiteGenerationService.assembleConfig(businessData, {
        skipAIDesign: true,
        designIntelligence: null,
      });
      deterministic = config;
    } catch (error) {
      console.error('[LeadWebsiteSpec] Deterministic fallback failed:', error?.message || String(error));
    }

    if (!aiSpec && !deterministic) {
      return this._failure('Website specification generation failed. No source data was available to build from.');
    }

    const specification = aiSpec
      ? this._normalizeAiSpec(aiSpec, canonical, brandDNA)
      : this._normalizeDeterministic(deterministic, canonical, brandDNA);

    return {
      specification,
      status: 'generated',
      error: null,
      noSourceWebsite,
      generatedAt: new Date().toISOString(),
      metadata: {
        source: aiSpec ? 'landing-page-spec-ai' : 'deterministic-profile-config',
        version: aiSpec ? 'v1' : 'v1-deterministic',
        model: aiSpec ? 'reasoning' : 'deterministic',
      },
    };
  }

  /**
   * WebsiteStrategyService.generateStrategy requires a strategy object;
   * LandingPageSpecService actually consumes only brandDNA/audit for the copy
   * but the route signature requires a strategy argument. We surface a minimal
   * strategy built from brandDNA so the AI spec prompt still sees real data.
   */
  _dummyStrategy(brandDNA, audit) {
    const cta = brandDNA?.conversionStrategy?.primaryCTA;
    return {
      websiteGoal: brandDNA?.websiteObjectives?.[0]?.objective || 'Establish a compelling local web presence',
      targetAudience: brandDNA?.audience?.primary?.segment || null,
      primaryCTA: cta || { text: 'Contact', action: 'contact' },
      secondaryCTA: brandDNA?.conversionStrategy?.secondaryCTA || null,
      pages: [],
      homepageSections: [],
      trustStrategy: [],
      conversionStrategy: {},
      seoStrategy: {},
      visualDirection: brandDNA?.visualDirection || {},
      contentStrategy: {},
      metadata: { generatedAt: new Date().toISOString(), version: 'v1' },
    };
  }

  // ---------------------------------------------------------------------------
  // Normalizers
  // ---------------------------------------------------------------------------

  _normalizeAiSpec(aiSpec, canonical, brandDNA) {
    const sections = (aiSpec.sections || []).map((section) => ({
      id: section.id ?? null,
      type: section.type ?? null,
      purpose: section.purpose ?? null,
      priority: section.priority ?? null,
      visibility: section.visibility ?? null,
      layout: section.layout ?? null,
      headline:
        section.content?.headline ??
        section.content?.subheadline ??
        section.content?.title ??
        null,
      content: this._stringifyContent(section.content) || null,
      items: this._extractItems(section),
    }));

    const services = this._verifiedServices(brandDNA);
    const objectives = this._normalizeObjectives(brandDNA?.websiteObjectives);
    const visual = this._normalizeVisualDirection(brandDNA?.visualDirection);

    return {
      businessName: canonical.identity.name,
      businessCategory: canonical.business.category,
      categories: this._taxonomyCategories(canonical),
      headline: aiSpec.pageTitle || canonical.identity.name,
      subheadline: aiSpec.pageDescription || `${canonical.identity.name} — ${canonical.business.category || 'local business'}.`,
      valueProposition: brandDNA?.positioning?.statement ?? null,
      targetAudience: brandDNA?.audience?.primary?.segment ?? null,
      primaryCTA: this._normalizeCta(aiSpec.primaryCTA) || this._fallbackCta(canonical),
      secondaryCTA: this._findSecondaryCta(aiSpec) ?? null,
      sections,
      services,
      testimonials: this._verifiedTestimonials(aiSpec),
      contact: this._normalizeContact(canonical),
      websiteObjectives: objectives,
      visualDirection: visual,
      typographyDirection: this._typographyDirection(visual),
      colorDirection: this._colorDirection(visual),
      imageryDirection: visual?.imagery?.style ?? null,
      responsiveBehavior: ['desktop', 'tablet', 'mobile'],
    };
  }

  _normalizeDeterministic(config, canonical, brandDNA) {
    const facts = config.facts || {};
    const theme = config.theme || {};
    const sections = this._deterministicSections(config, canonical);
    const services = this._verifiedServices(brandDNA);
    const objectives = this._normalizeObjectives(brandDNA?.websiteObjectives);
    const visual = this._normalizeVisualDirection(brandDNA?.visualDirection);

    return {
      businessName: canonical.identity.name,
      businessCategory: canonical.business.category,
      categories: this._taxonomyCategories(canonical),
      headline: facts.name || canonical.identity.name,
      subheadline:
        config.site?.description ||
        facts.description ||
        `${canonical.identity.name} — ${canonical.business.category || 'local business'}.`,
      valueProposition: brandDNA?.positioning?.statement ?? null,
      targetAudience: brandDNA?.audience?.primary?.segment ?? null,
      primaryCTA: this._normalizeCta(config.primaryCta) || this._fallbackCta(canonical),
      secondaryCTA: this._normalizeCta(config.secondaryCta) || null,
      sections,
      services,
      testimonials: [],
      contact: this._normalizeContact(canonical),
      websiteObjectives: objectives,
      visualDirection: {
        mood: theme.style || null,
        colorPalette: {
          primary: theme.colorPalette?.primary ?? null,
          secondary: theme.colorPalette?.secondary ?? null,
          reasoning:
            config.designIntelligence?.visualDirection?.colorPalette?.reasoning ?? null,
        },
        imagery: {
          style: config.designIntelligence?.visualDirection?.imagery?.style ?? null,
          subjects: [],
          avoid: [],
        },
        typography: {
          style: facts.category || null,
          reasoning: `Typography matched to ${canonical.business.category || 'business'} category.`,
        },
      },
      typographyDirection: theme.typography?.headingFont || null,
      colorDirection: theme.colorPalette?.primary || null,
      imageryDirection: config.designIntelligence?.visualDirection?.imagery?.style ?? null,
      responsiveBehavior: ['desktop', 'tablet', 'mobile'],
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _normalizeCta(cta) {
    if (!cta) return null;
    return {
      text: cta.text ?? null,
      action: cta.action ?? null,
      reasoning: cta.reasoning ?? null,
    };
  }

  _fallbackCta(canonical) {
    const phone = canonical.identity.phone;
    if (phone) {
      return { text: 'Call now', action: 'call', reasoning: 'Primary contact available from verified sources.' };
    }
    return { text: 'Visit us', action: 'visit', reasoning: 'Standard CTA for a local business profile.' };
  }

  _findSecondaryCta(spec) {
    for (const section of spec.sections || []) {
      const cta = section.cta;
      if (cta && cta.text && cta.text !== spec.primaryCTA?.text) {
        return this._normalizeCta(cta);
      }
    }
    return null;
  }

  _normalizeContact(canonical) {
    return {
      phone: canonical.identity.phone ?? null,
      email: canonical.business.email ?? null,
      website: canonical.identity.website ?? null,
      address: canonical.identity.address ?? null,
    };
  }

  _taxonomyCategories(canonical) {
    const cats = Array.isArray(canonical.business.categories)
      ? canonical.business.categories
      : [];
    const services = Array.isArray(canonical.business.services)
      ? canonical.business.services
      : [];
    // Merge both taxonomy sources; dedupe; never present as real services.
    return [...new Set([...cats, ...services].filter(Boolean))].slice(0, 12);
  }

  /**
   * Only AI services explicitly flagged `verified` are presented as services.
   * Suggested/inferred services are left out — the UI never labels taxonomy
   * codes or AI guesses as real services.
   */
  _verifiedServices(brandDNA) {
    const core = Array.isArray(brandDNA?.services?.core) ? brandDNA.services.core : [];
    return core
      .filter((s) => s && (s.verified === true || s.source === 'verified'))
      .map((s) => s.service)
      .filter(Boolean)
      .slice(0, 12);
  }

  _normalizeObjectives(objectives) {
    if (!Array.isArray(objectives)) return [];
    return objectives
      .filter((o) => o && o.objective)
      .map((o) => ({
        objective: o.objective,
        priority: o.priority ?? null,
        metrics: Array.isArray(o.metrics) ? o.metrics : [],
      }))
      .slice(0, 8);
  }

  _normalizeVisualDirection(vd) {
    if (!vd) return null;
    if (typeof vd === 'string') {
      return { mood: vd, colorPalette: null, imagery: null, typography: null };
    }
    return {
      mood: vd.mood ?? null,
      colorPalette: vd.colorPalette
        ? {
            primary: vd.colorPalette.primary ?? null,
            secondary: vd.colorPalette.secondary ?? null,
            reasoning: vd.colorPalette.reasoning ?? null,
          }
        : null,
      imagery: vd.imagery
        ? {
            style: vd.imagery.style ?? null,
            subjects: Array.isArray(vd.imagery.subjects) ? vd.imagery.subjects : [],
            avoid: Array.isArray(vd.imagery.avoid) ? vd.imagery.avoid : [],
          }
        : null,
      typography: vd.typography
        ? {
            style: vd.typography.style ?? null,
            reasoning: vd.typography.reasoning ?? null,
          }
        : null,
    };
  }

  _typographyDirection(visual) {
    return visual?.typography?.style ?? null;
  }

  _colorDirection(visual) {
    return visual?.colorPalette?.primary ?? null;
  }

  _stringifyContent(content) {
    if (!content || typeof content !== 'object') return null;
    const values = Object.entries(content)
      .filter(([key]) => !['headline', 'title', 'subheadline', 'images', 'cta'].includes(key))
      .map(([, v]) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : null))
      .filter(Boolean);
    return values.length ? values.join(' · ') : null;
  }

  _extractItems(section) {
    const items = [];
    const content = section.content || {};
    if (Array.isArray(content.services)) {
      content.services.forEach((s) => {
        if (typeof s === 'string') items.push(s);
        else if (s && (s.name || s.service)) items.push(s.name || s.service);
      });
    }
    if (Array.isArray(content.features)) {
      content.features.forEach((f) => {
        if (typeof f === 'string') items.push(f);
        else if (f && (f.title || f.name)) items.push(f.title || f.name);
      });
    }
    return items.slice(0, 12);
  }

  _verifiedTestimonials(spec) {
    const section = (spec.sections || []).find((s) => s.type === 'testimonials');
    const testimonials = section?.content?.testimonials;
    if (!Array.isArray(testimonials)) return [];
    return testimonials
      .filter((t) => t && (t.verified === true || t.source === 'verified'))
      .map((t) => ({
        quote: t.quote ?? t.text ?? null,
        source: t.author ?? t.name ?? t.source ?? null,
      }))
      .slice(0, 3);
  }

  _deterministicSections(config, canonical) {
    const sections = [];
    const typeLabels = {
      navigation: 'Navigation',
      hero: 'Hero',
      trustIndicators: 'Trust indicators',
      services: 'Services & offerings',
      valueProposition: 'Value proposition',
      about: 'About',
      testimonials: 'Testimonials',
      gallery: 'Gallery',
      faq: 'FAQ',
      location: 'Location & contact',
      cta: 'Call to action',
      footer: 'Footer',
    };
    const copy = config.copy || {};
    (config.sections || []).forEach((id, index) => {
      sections.push({
        id,
        type: id,
        purpose: `The ${typeLabels[id] || id} section of the page.`,
        priority: index === 0 ? 'critical' : 'essential',
        visibility: 'always',
        layout: 'full-width',
        headline:
          id === 'hero' ? copy.hero?.headline || canonical.identity.name : null,
        content:
          id === 'hero'
            ? copy.hero?.subheadline || null
            : id === 'services'
              ? copy.services?.heading || null
              : id === 'about'
                ? copy.about?.story || null
                : null,
        items: id === 'services' ? copy.services?.items?.map((i) => i.name) || [] : [],
      });
    });
    return sections;
  }

  _failure(message) {
    return {
      specification: null,
      status: 'failed',
      error: message,
      noSourceWebsite: false,
      generatedAt: new Date().toISOString(),
      metadata: null,
    };
  }
}

export default new LeadWebsiteSpecService();