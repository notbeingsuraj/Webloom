/**
 * Versioned prompt templates for the Webloom AI task layer.
 *
 * Every builder is a pure function of its input — no timestamps, no random
 * ids — so a prompt is reproducible for benchmarking and its version
 * (PROMPT_VERSION) is recorded with every inference result and dataset
 * example.
 *
 * Shared discipline, stated once per prompt because models do not carry
 * context between calls:
 *   - Unknown facts are returned as UNKNOWN envelopes, never guessed.
 *   - Every AI-sourced factual claim carries an exact-quote evidence snippet.
 *   - No fabricated phone numbers, addresses, hours, prices, awards,
 *     certifications, or claims.
 */

import { EXTRACTION_CONTRACT } from '../contracts/index.js';

export const PROMPT_VERSION = 'webloom-tasks-v1';

const DISCIPLINE = [
  'STRICT RULES:',
  '- Return ONLY valid JSON matching the requested schema. No markdown, no commentary.',
  '- For every field return an envelope: { value, confidence, provenance, status, evidence }.',
  '- If a fact is not explicitly supported by the supplied input, return value: null, confidence: 0, provenance: "unknown", status: "missing".',
  '- A null is always better than a plausible guess.',
  '- confidence is your real certainty in [0,1]. Do not inflate it.',
  '- provenance must be "ai_generated" for anything you derive; never claim "verified" or "observed".',
  '- evidence entries must quote the input exactly (source, text, url).',
  '- Never invent phone numbers, addresses, emails, opening hours, prices, services, certifications, awards, reviews, or company history.',
].join('\n');

function fence(text) {
  return ['```', String(text ?? ''), '```'].join('\n');
}

function serialize(label, value) {
  return `${label}:\n${fence(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}`;
}

/* ------------------------------------------------------------------ */

export function buildExtractionPrompt(input = {}) {
  return [
    'You are Webloom\'s business-information extraction engine.',
    'Extract structured business facts ONLY from the supplied raw data, website content, and evidence.',
    '',
    DISCIPLINE,
    '',
    serialize('RAW BUSINESS DATA', input.rawBusinessData ?? null),
    '',
    serialize('WEBSITE CONTENT', input.websiteText ?? null),
    '',
    serialize('EVIDENCE (array of {source, text, url})', input.evidence ?? []),
    '',
    'Return one envelope per field for this exact field list:',
    Object.keys(EXTRACTION_CONTRACT.properties).join(', '),
  ].join('\n');
}

export function buildEvidenceReasoningPrompt(input = {}) {
  return [
    'You are Webloom\'s evidence-reasoning engine.',
    'Assess each field claim against the supplied evidence: is it supported, conflicting, unsupported, or unverifiable?',
    'Detect contradictions between sources and recommend a resolution only when the evidence warrants one.',
    '',
    DISCIPLINE,
    '',
    serialize('FIELD CLAIMS (array of {fieldPath, value, source})', input.claims ?? []),
    '',
    serialize('EVIDENCE (array of {source, text, url})', input.evidence ?? []),
    '',
    'Return: assessments[], contradictions[], summary.',
  ].join('\n');
}

export function buildClassificationPrompt(input = {}) {
  return [
    'You are Webloom\'s business classification engine.',
    'Classify the business: industry, business type, service categories, customer segment, and market positioning.',
    'Classify only what the supplied profile and content support. Use UNKNOWN envelopes for anything unsupported.',
    '',
    DISCIPLINE,
    '',
    serialize('BUSINESS PROFILE', input.profile ?? null),
    '',
    serialize('WEBSITE CONTENT', input.websiteText ?? null),
  ].join('\n');
}

export function buildBrandDnaPrompt(input = {}) {
  return [
    'You are Webloom\'s brand-strategy engine. Produce the Business DNA for this business.',
    'Business DNA covers: businessIdentity, audience, customerIntent, painPoints, services, trustSignals, brandPersonality, positioning, conversionStrategy.',
    'Ground every statement in the supplied profile or content. Mark inferred judgments honestly with provenance "inferred" and lower confidence.',
    'Do NOT invent services, awards, certifications, testimonials, or claims that are not in the input.',
    '',
    DISCIPLINE,
    '',
    serialize('BUSINESS PROFILE', input.profile ?? null),
    '',
    serialize('WEBSITE CONTENT', input.websiteText ?? null),
    '',
    serialize('BRAND EVIDENCE', input.brandEvidence ?? []),
  ].join('\n');
}

export function buildWebsiteAnalysisPrompt(input = {}) {
  return [
    'You are Webloom\'s website analysis engine. Audit the supplied website content.',
    'Score each category 0-10 (design, mobile, navigation, conversion, trust, seo, localSeo, content, branding, performance, contactAccessibility),',
    'list criticalIssues, recommendations, and weaknesses. overallScore is the 0-10 mean quality score.',
    'Only report issues you can support from the supplied content. If content is unavailable for a category, score conservatively and say so in that category\'s issues.',
    '',
    DISCIPLINE,
    '',
    serialize('BUSINESS PROFILE', input.profile ?? null),
    '',
    serialize('WEBSITE CONTENT', input.websiteText ?? null),
  ].join('\n');
}

export function buildWebsiteStrategyPrompt(input = {}) {
  return [
    'You are Webloom\'s website strategy engine.',
    'Produce a website strategy from the Business DNA and website analysis:',
    'websiteGoal, targetAudience, primaryCTA, secondaryCTA, pages[], homepageSections[], trustStrategy[], conversionStrategy, seoStrategy, visualDirection, contentStrategy.',
    'Do NOT invent services or claims that are not in the Business DNA.',
    '',
    DISCIPLINE,
    '',
    serialize('BUSINESS PROFILE', input.profile ?? null),
    '',
    serialize('BUSINESS DNA', input.brandDna ?? null),
    '',
    serialize('WEBSITE ANALYSIS', input.websiteAnalysis ?? null),
  ].join('\n');
}

export function buildLandingPagePrompt(input = {}) {
  return [
    'You are Webloom\'s landing-page specification engine.',
    'Produce a landing-page spec: pageTitle, pageDescription, primaryCTA {text, action}, sections[], theme, metadata.',
    'Sections must include navigation, hero, trustIndicators, cta, and footer.',
    'Use only verified data from the Business DNA for factual statements. No fake claims, reviews, or awards.',
    'SKIP sections that have no verified data rather than inventing content.',
    '',
    DISCIPLINE,
    '',
    serialize('BUSINESS PROFILE', input.profile ?? null),
    '',
    serialize('BUSINESS DNA', input.brandDna ?? null),
    '',
    serialize('WEBSITE STRATEGY', input.websiteStrategy ?? null),
  ].join('\n');
}

export default {
  PROMPT_VERSION,
  buildExtractionPrompt,
  buildEvidenceReasoningPrompt,
  buildClassificationPrompt,
  buildBrandDnaPrompt,
  buildWebsiteAnalysisPrompt,
  buildWebsiteStrategyPrompt,
  buildLandingPagePrompt,
};
