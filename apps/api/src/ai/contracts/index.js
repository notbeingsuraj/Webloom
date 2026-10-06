/**
 * Task contracts — the strict output shapes for every task the Webloom AI
 * layer is allowed to run.
 *
 * Task ids are namespaced `category.name` and map 1:1 to dataset splits. The
 * contract deliberately mirrors what the existing services already validate
 * (BrandStrategyService.validateBrandStrategy, DigitalAuditService.validateAuditResults,
 * LandingPageSpecService.validateSpec, WebsiteStrategyService.validateStrategy)
 * so live model output validated here remains drop-in compatible with the
 * production services during migration.
 */

import {
  fieldEnvelope,
  STRING_FIELD,
  NUMBER_FIELD,
  INTEGER_FIELD,
  STRING_LIST_FIELD,
  COORDINATES_FIELD,
  SOCIAL_LINKS_FIELD,
} from './common.js';

/* ------------------------------------------------------------------ *
 * A. EXTRACTION
 * ------------------------------------------------------------------ */

const EXTRACTION_FIELDS = {
  'identity.name': STRING_FIELD(),
  'identity.category': STRING_FIELD(),
  'identity.categories': STRING_LIST_FIELD(),
  'identity.business_type': STRING_FIELD(),
  'identity.description': STRING_FIELD(),
  'identity.services': STRING_LIST_FIELD(),
  'identity.products': STRING_LIST_FIELD(),
  'identity.amenities': STRING_LIST_FIELD(),
  'contact.phone': STRING_FIELD(),
  'contact.email': STRING_FIELD(),
  'contact.website': STRING_FIELD(),
  'location.full_address': STRING_FIELD(),
  'location.city': STRING_FIELD(),
  'location.state': STRING_FIELD(),
  'location.postal_code': STRING_FIELD(),
  'location.coordinates': COORDINATES_FIELD(),
  hours: fieldEnvelope({ type: ['string', 'object', 'null'] }),
  social_links: SOCIAL_LINKS_FIELD(),
  'ratings.rating': NUMBER_FIELD(),
  'ratings.review_count': INTEGER_FIELD(),
};

export const EXTRACTION_CONTRACT = {
  title: 'WebloomExtractionResult',
  type: 'object',
  properties: EXTRACTION_FIELDS,
  required: Object.keys(EXTRACTION_FIELDS),
};

/* ------------------------------------------------------------------ *
 * B. EVIDENCE REASONING
 * ------------------------------------------------------------------ */

export const EVIDENCE_REASONING_CONTRACT = {
  title: 'WebloomEvidenceReasoning',
  type: 'object',
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fieldPath: { type: 'string', minLength: 1 },
          verdict: { type: 'string', enum: ['supported', 'conflicting', 'unsupported', 'insufficient_evidence'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
          evidenceIndexes: { type: 'array', items: { type: 'integer', minimum: 0 } },
        },
        required: ['fieldPath', 'verdict', 'confidence', 'rationale', 'evidenceIndexes'],
      },
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fieldPath: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
          resolution: { type: 'string' },
        },
        required: ['fieldPath', 'values', 'resolution'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['assessments', 'contradictions', 'summary'],
};

/* ------------------------------------------------------------------ *
 * C. CLASSIFICATION
 * ------------------------------------------------------------------ */

export const CLASSIFICATION_CONTRACT = {
  title: 'WebloomBusinessClassification',
  type: 'object',
  properties: {
    industry: STRING_FIELD(),
    businessType: STRING_FIELD(),
    serviceCategories: STRING_LIST_FIELD(),
    customerSegment: STRING_FIELD(),
    positioning: STRING_FIELD(),
  },
  required: ['industry', 'businessType', 'serviceCategories', 'customerSegment', 'positioning'],
};

/* ------------------------------------------------------------------ *
 * D. BRAND INTELLIGENCE (Business DNA)
 * ------------------------------------------------------------------ */

const brandObject = () => ({ type: 'object' });

export const BRAND_DNA_CONTRACT = {
  title: 'WebloomBusinessDNA',
  type: 'object',
  properties: {
    businessIdentity: brandObject(),
    audience: {
      type: 'object',
      properties: { primary: { type: ['string', 'object'] } },
      required: ['primary'],
    },
    customerIntent: brandObject(),
    painPoints: { type: 'array' },
    services: {
      type: 'object',
      properties: { core: { type: 'array' } },
      required: ['core'],
    },
    trustSignals: { type: 'array' },
    brandPersonality: brandObject(),
    positioning: brandObject(),
    conversionStrategy: {
      type: 'object',
      properties: {
        primaryCTA: {
          type: 'object',
          properties: { text: { type: 'string' }, action: { type: 'string' } },
          required: ['text', 'action'],
        },
      },
      required: ['primaryCTA'],
    },
  },
  required: [
    'businessIdentity',
    'audience',
    'customerIntent',
    'painPoints',
    'services',
    'trustSignals',
    'brandPersonality',
    'positioning',
    'conversionStrategy',
  ],
};

/* ------------------------------------------------------------------ *
 * E. WEBSITE INTELLIGENCE (Digital audit / website analysis)
 * ------------------------------------------------------------------ */

const AUDIT_CATEGORIES = [
  'design', 'mobile', 'navigation', 'conversion', 'trust', 'seo',
  'localSeo', 'content', 'branding', 'performance', 'contactAccessibility',
];

export const WEBSITE_ANALYSIS_CONTRACT = {
  title: 'WebloomWebsiteAnalysis',
  type: 'object',
  properties: {
    websiteExists: { type: 'boolean' },
    overallScore: { type: 'number', minimum: 0, maximum: 10 },
    categories: {
      type: 'object',
      properties: Object.fromEntries(
        AUDIT_CATEGORIES.map((c) => [c, {
          type: 'object',
          properties: {
            score: { type: 'number', minimum: 0, maximum: 10 },
            issues: { type: 'array' },
            recommendations: { type: 'array' },
            verified: { type: 'boolean' },
          },
          required: ['score', 'issues', 'recommendations'],
        }]),
      ),
      required: AUDIT_CATEGORIES,
    },
    criticalIssues: { type: 'array' },
    recommendations: { type: 'array' },
    weaknesses: { type: 'array' },
  },
  required: ['websiteExists', 'overallScore', 'categories', 'criticalIssues', 'recommendations', 'weaknesses'],
};

/* ------------------------------------------------------------------ *
 * F. STRATEGIC GENERATION
 * ------------------------------------------------------------------ */

const CTA_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' }, action: { type: 'string' } },
  required: ['text', 'action'],
};

export const WEBSITE_STRATEGY_CONTRACT = {
  title: 'WebloomWebsiteStrategy',
  type: 'object',
  properties: {
    websiteGoal: { type: ['string', 'object'] },
    targetAudience: { type: ['string', 'object'] },
    primaryCTA: CTA_SCHEMA,
    secondaryCTA: { type: ['object', 'string'] },
    pages: { type: 'array' },
    homepageSections: { type: 'array' },
    trustStrategy: { type: 'array' },
    conversionStrategy: { type: ['object', 'array'] },
    seoStrategy: { type: ['object', 'array'] },
    visualDirection: { type: 'object' },
    contentStrategy: { type: ['object', 'array'] },
  },
  required: [
    'websiteGoal', 'targetAudience', 'primaryCTA', 'secondaryCTA', 'pages',
    'homepageSections', 'trustStrategy', 'conversionStrategy', 'seoStrategy',
    'visualDirection', 'contentStrategy',
  ],
};

export const LANDING_PAGE_CONTRACT = {
  title: 'WebloomLandingPageSpec',
  type: 'object',
  properties: {
    pageTitle: { type: 'string', minLength: 1 },
    pageDescription: { type: 'string' },
    primaryCTA: CTA_SCHEMA,
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', minLength: 1 },
          priority: { type: ['string', 'null'] },
          content: { type: ['object', 'string'] },
        },
        required: ['type'],
      },
    },
    theme: { type: 'object' },
    metadata: { type: 'object' },
  },
  required: ['pageTitle', 'pageDescription', 'primaryCTA', 'sections', 'theme', 'metadata'],
};

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const TASK_CONTRACTS = Object.freeze({
  'extraction.business_profile': EXTRACTION_CONTRACT,
  'evidence.reasoning': EVIDENCE_REASONING_CONTRACT,
  'classification.business': CLASSIFICATION_CONTRACT,
  'brand.dna': BRAND_DNA_CONTRACT,
  'website.analysis': WEBSITE_ANALYSIS_CONTRACT,
  'strategy.website': WEBSITE_STRATEGY_CONTRACT,
  'strategy.landing_page': LANDING_PAGE_CONTRACT,
});

export function getContract(taskId) {
  const contract = TASK_CONTRACTS[taskId];
  if (!contract) throw new Error(`Unknown AI task contract: ${taskId}`);
  return contract;
}

export {
  fieldEnvelope,
  STRING_FIELD,
  NUMBER_FIELD,
  INTEGER_FIELD,
  STRING_LIST_FIELD,
  COORDINATES_FIELD,
  SOCIAL_LINKS_FIELD,
};
