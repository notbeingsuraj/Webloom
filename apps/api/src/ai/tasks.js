/**
 * Task registry — the formal specification of what the Webloom AI model does.
 *
 * Tasks are deliberately small and separated (never one giant operation):
 *
 *   extraction.*        A. field extraction from raw data + evidence
 *   evidence.*          B. evidence reasoning / contradiction detection
 *   classification.*    C. industry / segment classification
 *   brand.*             D. brand intelligence (Business DNA)
 *   website.*           E. website intelligence (analysis)
 *   strategy.*          F. strategic generation (website strategy, landing page)
 *
 * Each task pins: the contract (output JSON Schema), the prompt builder and
 * its version, inference parameters, whether grounding against evidence is
 * enforced, the dataset it trains/evaluates against, and a post-validation
 * hook for rules JSON Schema cannot express.
 */

import {
  EXTRACTION_CONTRACT,
  EVIDENCE_REASONING_CONTRACT,
  CLASSIFICATION_CONTRACT,
  BRAND_DNA_CONTRACT,
  WEBSITE_ANALYSIS_CONTRACT,
  WEBSITE_STRATEGY_CONTRACT,
  LANDING_PAGE_CONTRACT,
} from './contracts/index.js';
import {
  PROMPT_VERSION,
  buildExtractionPrompt,
  buildEvidenceReasoningPrompt,
  buildClassificationPrompt,
  buildBrandDnaPrompt,
  buildWebsiteAnalysisPrompt,
  buildWebsiteStrategyPrompt,
  buildLandingPagePrompt,
} from './prompts/index.js';

const EMPTY_IS_INVALID = 'field has a status of "missing"/"unsupported" but also carries a value';
const VALUE_WITHOUT_STATUS = 'field carries a value but status is not "extracted"/"ambiguous"';

/** Consistency rules shared by every envelope-shaped task output. */
function validateEnvelopeConsistency(output) {
  const errors = [];
  for (const [fieldPath, envelope] of Object.entries(output || {})) {
    if (!envelope || typeof envelope !== 'object') continue;
    const hasValue = envelope.value !== null && envelope.value !== undefined && envelope.value !== '';
    const isMissing = envelope.status === 'missing' || envelope.status === 'unsupported';
    if (isMissing && hasValue) errors.push(`${fieldPath}: ${EMPTY_IS_INVALID}`);
    if (!isMissing && envelope.status && !hasValue) errors.push(`${fieldPath}: ${VALUE_WITHOUT_STATUS}`);
    if (hasValue && envelope.provenance === 'unknown') errors.push(`${fieldPath}: value present with provenance "unknown"`);
  }
  return errors;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export const TASKS = Object.freeze({
  'extraction.business_profile': {
    id: 'extraction.business_profile',
    version: 'extraction-v1',
    category: 'extraction',
    dataset: 'extraction',
    contract: EXTRACTION_CONTRACT,
    buildPrompt: buildExtractionPrompt,
    grounded: true,
    options: { temperature: 0, maxTokens: 5000, model: 'reasoning' },
    postValidate: (output) => validateEnvelopeConsistency(output),
  },

  'evidence.reasoning': {
    id: 'evidence.reasoning',
    version: 'evidence-v1',
    category: 'evidence',
    dataset: 'extraction',
    contract: EVIDENCE_REASONING_CONTRACT,
    buildPrompt: buildEvidenceReasoningPrompt,
    grounded: true,
    options: { temperature: 0, maxTokens: 3000, model: 'reasoning' },
    postValidate: (output) => {
      const errors = [];
      for (const a of output?.assessments || []) {
        if (a.verdict === 'supported' && (!Array.isArray(a.evidenceIndexes) || a.evidenceIndexes.length === 0)) {
          errors.push(`assessment ${a.fieldPath}: supported verdict without evidence indexes`);
        }
      }
      return errors;
    },
  },

  'classification.business': {
    id: 'classification.business',
    version: 'classification-v1',
    category: 'classification',
    dataset: 'extraction',
    contract: CLASSIFICATION_CONTRACT,
    buildPrompt: buildClassificationPrompt,
    grounded: true,
    options: { temperature: 0, maxTokens: 1500, model: 'reasoning' },
    postValidate: (output) => validateEnvelopeConsistency(output),
  },

  'brand.dna': {
    id: 'brand.dna',
    version: 'brand-dna-v1',
    category: 'brand',
    dataset: 'business-dna',
    contract: BRAND_DNA_CONTRACT,
    buildPrompt: buildBrandDnaPrompt,
    grounded: false, // generative: grounding applies to facts inside copy via FactualDataValidator downstream
    options: { temperature: 0.7, maxTokens: 6000, model: 'reasoning' },
    postValidate: (output) => {
      const errors = [];
      if (!output?.audience?.primary) errors.push('audience.primary is required');
      if (!nonEmptyArray(output?.services?.core)) errors.push('services.core must be a non-empty array');
      if (!output?.conversionStrategy?.primaryCTA?.text) errors.push('conversionStrategy.primaryCTA.text is required');
      return errors;
    },
  },

  'website.analysis': {
    id: 'website.analysis',
    version: 'website-analysis-v1',
    category: 'website',
    dataset: 'website-analysis',
    contract: WEBSITE_ANALYSIS_CONTRACT,
    buildPrompt: buildWebsiteAnalysisPrompt,
    grounded: false,
    options: { temperature: 0.5, maxTokens: 5000, model: 'reasoning' },
    postValidate: (output) => {
      const errors = [];
      if (typeof output?.websiteExists === 'boolean' && output.websiteExists === true) {
        for (const [name, cat] of Object.entries(output?.categories || {})) {
          if (cat && (typeof cat.score !== 'number' || cat.score < 0 || cat.score > 10)) {
            errors.push(`categories.${name}.score must be 0-10`);
          }
        }
      }
      return errors;
    },
  },

  'strategy.website': {
    id: 'strategy.website',
    version: 'website-strategy-v1',
    category: 'strategy',
    dataset: 'strategy',
    contract: WEBSITE_STRATEGY_CONTRACT,
    buildPrompt: buildWebsiteStrategyPrompt,
    grounded: false,
    options: { temperature: 0.6, maxTokens: 7000, model: 'reasoning' },
    postValidate: (output) => {
      const errors = [];
      if (!nonEmptyArray(output?.pages)) errors.push('pages must be a non-empty array');
      if (!nonEmptyArray(output?.homepageSections)) errors.push('homepageSections must be a non-empty array');
      if (!output?.primaryCTA?.text || !output?.primaryCTA?.action) errors.push('primaryCTA requires text and action');
      return errors;
    },
  },

  'strategy.landing_page': {
    id: 'strategy.landing_page',
    version: 'landing-page-v1',
    category: 'strategy',
    dataset: 'strategy',
    contract: LANDING_PAGE_CONTRACT,
    buildPrompt: buildLandingPagePrompt,
    grounded: false,
    options: { temperature: 0.5, maxTokens: 8000, model: 'reasoning' },
    postValidate: (output) => {
      const errors = [];
      if (!nonEmptyArray(output?.sections)) errors.push('sections must be a non-empty array');
      const types = (output?.sections || []).map((s) => s?.type);
      for (const critical of ['navigation', 'hero', 'trustIndicators', 'cta', 'footer']) {
        if (!types.includes(critical)) errors.push(`missing critical section: ${critical}`);
      }
      if (!output?.primaryCTA?.text || !output?.primaryCTA?.action) errors.push('primaryCTA requires text and action');
      if (!output?.pageTitle) errors.push('pageTitle is required');
      return errors;
    },
  },
});

export const TASK_IDS = Object.freeze(Object.keys(TASKS));

export function getTask(taskId) {
  const task = TASKS[taskId];
  if (!task) throw new Error(`Unknown AI task "${taskId}". Known: ${TASK_IDS.join(', ')}`);
  return task;
}

export { PROMPT_VERSION };
export default TASKS;
