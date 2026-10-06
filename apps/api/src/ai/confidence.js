/**
 * Confidence handling and calibration.
 *
 * Two separate concerns:
 *
 *  1. Runtime banding — a single place that maps a confidence number plus the
 *     provenance/status of a field envelope onto the operational bands
 *     HIGH / MEDIUM / LOW / UNSUPPORTED. The legacy pipeline has three
 *     divergent provenance-priority maps; this module is the canonical
 *     reading for the AI task layer.
 *
 *  2. Offline calibration — given {confidence, correct} pairs produced by the
 *     benchmark runner, compute whether a model's self-reported 0.90 actually
 *     means ~90% correctness (Expected Calibration Error, Brier score,
 *     false-confidence rate). Confidence that is not measured is not trusted.
 */

export const BAND_THRESHOLDS = Object.freeze({
  HIGH: 0.85,
  MEDIUM: 0.65,
  LOW: 0.4,
});

export const BANDS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNSUPPORTED']);

/**
 * Map a raw confidence number onto a band.
 * @param {number} confidence 0..1
 * @returns {'HIGH'|'MEDIUM'|'LOW'|'UNSUPPORTED'}
 */
export function confidenceBand(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence <= 0) {
    return 'UNSUPPORTED';
  }
  if (confidence >= BAND_THRESHOLDS.HIGH) return 'HIGH';
  if (confidence >= BAND_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (confidence >= BAND_THRESHOLDS.LOW) return 'LOW';
  return 'UNSUPPORTED';
}

/**
 * Band for a field envelope. A null value, an unknown provenance, or an
 * unsupported status is UNSUPPORTED regardless of the number the model gave.
 */
export function envelopeBand(envelope) {
  if (!envelope || typeof envelope !== 'object') return 'UNSUPPORTED';
  const noValue = envelope.value === null || envelope.value === undefined || envelope.value === '';
  const unknownProvenance = envelope.provenance === 'unknown';
  const unsupported = envelope.status === 'unsupported' || envelope.status === 'missing';
  if (noValue || unknownProvenance || unsupported) return 'UNSUPPORTED';
  return confidenceBand(envelope.confidence);
}

/**
 * Overall confidence for a task output built from field envelopes.
 * Mean of the field confidences that actually carry a value; 0 when none do.
 */
export function overallConfidence(output) {
  if (!output || typeof output !== 'object') return { overall: 0, band: 'UNSUPPORTED', valuedFields: 0 };
  const confidences = [];
  for (const envelope of Object.values(output)) {
    if (!envelope || typeof envelope !== 'object' || !('value' in envelope)) continue;
    const band = envelopeBand(envelope);
    if (band === 'UNSUPPORTED') continue;
    if (typeof envelope.confidence === 'number') confidences.push(envelope.confidence);
  }
  if (confidences.length === 0) return { overall: 0, band: 'UNSUPPORTED', valuedFields: 0 };
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return { overall: round(mean, 4), band: confidenceBand(mean), valuedFields: confidences.length };
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Calibration report over [{confidence, correct}] pairs.
 *
 * @param {Array<{confidence:number, correct:boolean}>} pairs
 * @param {number} bins
 */
export function calibrationReport(pairs, bins = 10) {
  const valid = (pairs || []).filter(
    (p) => p && typeof p.confidence === 'number' && Number.isFinite(p.confidence) && typeof p.correct === 'boolean',
  );

  const result = {
    count: valid.length,
    bins: [],
    ece: null,
    brier: null,
    accuracy: null,
    meanConfidence: null,
    falseConfidenceRate: null,
    falseConfidenceCount: 0,
  };

  if (valid.length === 0) return result;

  const brier = valid.reduce((acc, p) => acc + (p.confidence - (p.correct ? 1 : 0)) ** 2, 0) / valid.length;
  const accuracy = valid.filter((p) => p.correct).length / valid.length;
  const meanConfidence = valid.reduce((acc, p) => acc + p.confidence, 0) / valid.length;

  const binSize = 1 / bins;
  let ece = 0;
  for (let i = 0; i < bins; i += 1) {
    const lower = round(i * binSize, 6);
    const upper = round((i + 1) * binSize, 6);
    const members = valid.filter((p) => {
      const isLast = i === bins - 1;
      return isLast ? p.confidence >= lower && p.confidence <= upper : p.confidence >= lower && p.confidence < upper;
    });
    if (members.length === 0) {
      result.bins.push({ lower, upper, count: 0, meanConfidence: null, accuracy: null, gap: null });
      continue;
    }
    const binConf = members.reduce((a, p) => a + p.confidence, 0) / members.length;
    const binAcc = members.filter((p) => p.correct).length / members.length;
    const gap = Math.abs(binConf - binAcc);
    ece += (members.length / valid.length) * gap;
    result.bins.push({
      lower,
      upper,
      count: members.length,
      meanConfidence: round(binConf, 4),
      accuracy: round(binAcc, 4),
      gap: round(gap, 4),
    });
  }

  const falseConfidence = valid.filter((p) => p.confidence >= BAND_THRESHOLDS.HIGH && !p.correct);

  result.ece = round(ece, 4);
  result.brier = round(brier, 4);
  result.accuracy = round(accuracy, 4);
  result.meanConfidence = round(meanConfidence, 4);
  result.falseConfidenceCount = falseConfidence.length;
  result.falseConfidenceRate = round(falseConfidence.length / valid.length, 4);

  return result;
}

export default {
  BANDS,
  BAND_THRESHOLDS,
  confidenceBand,
  envelopeBand,
  overallConfidence,
  calibrationReport,
};
