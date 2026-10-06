/**
 * Evaluation metrics for the Webloom AI benchmark.
 *
 * All metric functions are pure (result, expected) → numbers, so they can be
 * run over any backend (echo sanity, deterministic fallback, live models) and
 * aggregated across examples and tasks.
 *
 * Two metric families:
 *  - envelope metrics: per-field precision/recall/F1 over "is the field valued
 *    and correct", plus abstention accuracy and hallucination rate. Applied to
 *    tasks whose output is a bag of {value, confidence, provenance, status}
 *    envelopes (extraction, classification).
 *  - generative metrics: schema compliance and key coverage (brand.dna,
 *    strategy.*) and score deltas for website.analysis.
 */

import { calibrationReport as _cr } from '../src/ai/confidence.js';

const round = (n, places = 4) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Compare a predicted field value against the expected value.
 */
export function valuesEquivalent(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const norm = (xs) => xs.map((x) => (typeof x === 'object' && x ? JSON.stringify(x) : String(x))).sort().join('|');
    return norm(a) === norm(b);
  }
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** Field-value equivalence with path-aware normalization (e.g. phone digits). */
export function fieldValueEquivalent(path, a, b) {
  if (/phone|coordinates/i.test(String(path || ''))) {
    const digits = (v) => (v == null ? '' : String(v).replace(/\D/g, ''));
    const da = digits(a);
    const db = digits(b);
    if (da && db && da === db) return true;
  }
  return valuesEquivalent(a, b);
}

/**
 * Per-field metrics for envelope tasks.
 *
 * @param {object} predicted  model output (values are envelopes)
 * @param {object} expected   expected output (values are envelopes)
 * @returns {object} summary counts + derived rates
 */
export function fieldMetrics(predicted = {}, expected = {}) {
  const fields = new Set([...Object.keys(predicted), ...Object.keys(expected)]);
  const per = [];
  let tp = 0; // correctly extracted
  let fp = 0; // valued but wrong (wrong value OR hallucinated when expected missing)
  let fn = 0; // expected valued but predicted missing/wrong
  let tn = 0; // both missing
  let statusOk = 0;
  let statusTotal = 0;
  const confidences = []; // {confidence, correct} for calibration
  let expectedValued = 0;

  for (const field of fields) {
    const p = predicted[field];
    const e = expected[field];
    const pValued = Boolean(p && p.value !== null && p.value !== undefined && p.value !== '');
    const eValued = Boolean(e && e.value !== null && e.value !== undefined && e.value !== '');
    if (eValued) expectedValued += 1;

    if (e && p) {
      statusTotal += 1;
      const pStatus = pValued ? (p.status || 'extracted') : 'missing';
      const eStatus = eValued ? (e.status || 'extracted') : 'missing';
      if (pStatus === eStatus || (!pValued && !eValued)) statusOk += 1;
    }

    const correct = pValued && eValued && fieldValueEquivalent(field, p.value, e.value);

    if (correct) {
      tp += 1;
      if (typeof p.confidence === 'number') confidences.push({ confidence: p.confidence, correct: true });
    } else if (pValued) {
      fp += 1;
      if (typeof p.confidence === 'number') confidences.push({ confidence: p.confidence, correct: false });
    } else if (eValued) {
      fn += 1;
    } else {
      tn += 1;
    }

    per.push({
      field,
      predicted: pValued ? p.value : null,
      expected: eValued ? e.value : null,
      correct,
      predictedValued: pValued,
      expectedValued: eValued,
      statusOk: statusTotal > 0 && e && p ? (pValued === eValued || (p.status || '') === (e.status || '')) : null,
    });
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const abstentionAccuracy = fp + tn > 0 ? tn / (fp + tn) : 1; // of the fields the model left empty, how many were correctly left empty
  const hallucinationRate = tp + fp > 0 ? fp / (tp + fp) : 0;
  const missRate = tp + fn > 0 ? fn / (tp + fn) : 0;

  return {
    fields: fields.size,
    expectedValued,
    tp,
    fp,
    fn,
    tn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    abstentionAccuracy: round(abstentionAccuracy),
    hallucinationRate: round(hallucinationRate),
    missRate: round(missRate),
    statusAccuracy: statusTotal > 0 ? round(statusOk / statusTotal) : null,
    calibration: { pairs: confidences.length, confidences },
    per,
  };
}

/**
 * Generative metrics: schema compliance (already gated by the task layer) and
 * reference-key coverage — how much of the expected structure the output
 * actually delivered.
 */
export function keyCoverageMetrics(predicted = {}, expected = {}, { ignoreKeys = [] } = {}) {
  const keys = Object.keys(expected || {}).filter((k) => !ignoreKeys.includes(k));
  if (keys.length === 0) return { coverage: 1, missing: [], keys: 0 };
  const missing = keys.filter((k) => predicted[k] === undefined);
  return {
    coverage: round((keys.length - missing.length) / keys.length),
    missing,
    keys: keys.length,
  };
}

/**
 * Website-analysis score accuracy: mean absolute error on overall score and
 * the 0-10 category scores (only when the website actually exists in both).
 */
export function scoreDeltaMetrics(predicted = {}, expected = {}) {
  const overallDelta = [];
  const categoryDeltas = [];
  if (typeof predicted.overallScore === 'number' && typeof expected.overallScore === 'number') {
    overallDelta.push(Math.abs(predicted.overallScore - expected.overallScore));
  }
  const cats = new Set([
    ...Object.keys(predicted.categories || {}),
    ...Object.keys(expected.categories || {}),
  ]);
  for (const cat of cats) {
    const p = predicted.categories?.[cat]?.score;
    const e = expected.categories?.[cat]?.score;
    if (typeof p === 'number' && typeof e === 'number') categoryDeltas.push(Math.abs(p - e));
  }
  return {
    overallMAE: overallDelta.length ? round(overallDelta.reduce((a, b) => a + b, 0) / overallDelta.length) : null,
    categoryMAE: categoryDeltas.length ? round(categoryDeltas.reduce((a, b) => a + b, 0) / categoryDeltas.length) : null,
    websiteExistsMatch: predicted.websiteExists === expected.websiteExists,
  };
}

export function calibrationFromPairList(pairs) {
  return _cr(pairs);
}

export default { valuesEquivalent, fieldValueEquivalent, fieldMetrics, keyCoverageMetrics, scoreDeltaMetrics, calibrationFromPairList };