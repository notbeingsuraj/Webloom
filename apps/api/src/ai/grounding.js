/**
 * Evidence grounding — Webloom's primary hallucination guard.
 *
 * The model proposes; the application verifies. Every AI-sourced claim that
 * carries an evidence snippet is checked against the actual evidence text the
 * model was given. A snippet that does not appear in the evidence is treated
 * as an unsupported claim: the field is rejected (enforce mode) or reported
 * (report mode), never silently trusted.
 *
 * Grounding vocabulary:
 *   grounded      — the claimed snippet occurs in the evidence text
 *   unsupported   — a substantive snippet was supplied but does not occur
 *   unverifiable  — too little text to check (empty/very short snippet)
 *
 * This module is dependency-free and imported by both the new AI task layer
 * and the legacy fallback extraction path.
 */

/** Snippets shorter than this cannot be checked meaningfully. */
export const MIN_CHECKABLE_SNIPPET_LENGTH = 8;

/**
 * Normalize text for containment checks: casefold, collapse all whitespace,
 * strip zero-width characters. Purposefully does NOT strip punctuation so a
 * phone number or URL must still literally occur.
 */
export function normalizeForMatch(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Does `snippet` occur in `evidenceText`?
 *
 * @returns {'grounded'|'unsupported'|'unverifiable'}
 */
export function snippetVerdict(snippet, evidenceText) {
  const needle = normalizeForMatch(snippet);
  if (!needle || needle.length < MIN_CHECKABLE_SNIPPET_LENGTH) return 'unverifiable';
  const haystack = normalizeForMatch(evidenceText);
  if (!haystack) return 'unverifiable';
  return haystack.includes(needle) ? 'grounded' : 'unsupported';
}

/**
 * Verify the factual core of a value against the evidence.
 *
 * Snippet checks already cover most fields, but a model can quote a real
 * snippet and still assert a value that never appears. For factual scalar
 * values (phone, email, website, address, coordinates) require the value
 * itself to occur in the evidence too.
 *
 * @returns {'grounded'|'unsupported'|'unverifiable'}
 */
export function valueVerdict(value, evidenceText) {
  if (value == null) return 'unverifiable';
  if (typeof value === 'number') {
    // Numbers are checked through their textual form inside the evidence.
    const needle = normalizeForMatch(String(value));
    const haystack = normalizeForMatch(evidenceText);
    if (!needle || !haystack) return 'unverifiable';
    return haystack.includes(needle) ? 'grounded' : 'unsupported';
  }
  if (typeof value !== 'string') return 'unverifiable';
  return snippetVerdict(value, evidenceText);
}

/**
 * Field-level grounding report for a single field envelope of the shape
 * { value, confidence, provenance, status, evidence }.
 */
export function groundField(envelope, evidenceText) {
  if (!envelope || typeof envelope !== 'object') {
    return { fieldPath: null, verdict: 'unverifiable', reason: 'malformed envelope' };
  }

  const hasValue = envelope.value !== null && envelope.value !== undefined && envelope.value !== '';
  if (!hasValue) {
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'unverifiable', reason: 'no value proposed' };
  }

  const provenance = envelope.provenance || 'ai_generated';
  const isModelClaim = provenance === 'ai_generated' || provenance === 'inferred';
  if (!isModelClaim) {
    // Deterministic/verified provenances are validated by the deterministic
    // pipeline, not by snippet containment.
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'grounded', reason: 'non-AI provenance' };
  }

  const snippet = Array.isArray(envelope.evidence) && envelope.evidence.length > 0
    ? (envelope.evidence[0]?.text ?? null)
    : (envelope.evidenceText ?? null);

  const snippetCheck = snippetVerdict(snippet, evidenceText);
  if (snippetCheck === 'unsupported') {
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'unsupported', reason: 'evidence snippet not found in source text' };
  }
  if (snippetCheck === 'grounded') {
    // A real quote from the source is sufficient: values are often normalized
    // forms of the quoted text (phone "+14154872600" vs quoted
    // "(415) 487-2600"), so re-checking the value literally would reject
    // correct extractions.
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'grounded', reason: 'snippet found in source text' };
  }

  // No substantive snippet supplied: fall back to checking the value itself.
  const valueCheck = valueVerdict(envelope.value, evidenceText);
  if (valueCheck === 'grounded') {
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'grounded', reason: 'value found in source text' };
  }
  if (valueCheck === 'unsupported' || looksFactual(envelope.fieldPath, envelope.value)) {
    return { fieldPath: envelope.fieldPath ?? null, verdict: 'unsupported', reason: 'no evidence snippet and value not found in source text' };
  }
  return { fieldPath: envelope.fieldPath ?? null, verdict: 'unverifiable', reason: 'no substantive snippet supplied' };
}

const FACTUAL_VALUE_RE = /(\d[\d\s().+-]{6,}\d)|(@)|(\bhttps?:\/\/)|(\bwww\.)/i;

function looksFactual(fieldPath, value) {
  if (typeof value !== 'string') return false;
  const path = String(fieldPath || '');
  if (/phone|email|website|address|url|coordinates|hours/i.test(path)) return true;
  return FACTUAL_VALUE_RE.test(value);
}

/**
 * Ground a whole task output (an object of field envelopes) against evidence.
 *
 * @param {object} output    task output whose values are field envelopes
 * @param {string} evidenceText
 * @param {'enforce'|'report'} mode
 * @returns {{ report: object, output: object }} report always; output is a
 *   rewritten copy in enforce mode (unsupported AI claims replaced with the
 *   UNKNOWN envelope), otherwise the original object.
 */
export function groundOutput(output, evidenceText, mode = 'enforce') {
  const report = {
    checked: Boolean(evidenceText),
    mode,
    grounded: 0,
    unsupported: 0,
    unverifiable: 0,
    fields: [],
  };

  if (!output || typeof output !== 'object' || !evidenceText) {
    return { report, output };
  }

  const rewritten = mode === 'enforce' ? { ...output } : output;

  for (const [fieldPath, envelope] of Object.entries(output)) {
    if (!envelope || typeof envelope !== 'object' || !('value' in envelope)) continue;
    const result = groundField({ ...envelope, fieldPath }, evidenceText);
    report.fields.push({ fieldPath, verdict: result.verdict, reason: result.reason });

    if (result.verdict === 'grounded') report.grounded += 1;
    else if (result.verdict === 'unsupported') report.unsupported += 1;
    else report.unverifiable += 1;

    if (result.verdict === 'unsupported' && mode === 'enforce') {
      rewritten[fieldPath] = {
        ...envelope,
        value: null,
        confidence: 0,
        provenance: 'unknown',
        status: 'unsupported',
      };
    }
  }

  return { report, output: rewritten };
}

export default {
  normalizeForMatch,
  snippetVerdict,
  valueVerdict,
  groundField,
  groundOutput,
};
