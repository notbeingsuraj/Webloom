/**
 * Opportunity score normalization.
 *
 * Webloom's opportunity score has historically been stored in two different
 * scales depending on the producer:
 *
 *   1. `0..1`   — normalized probability-like value (e.g. 0.3)
 *   2. `0..10`  — audit category mean (DigitalAuditService.overallScore)
 *   3. `0..100` — the canonical display scale used by the UI ("30/100")
 *
 * The frontend displays ONE canonical representation: `score/100`.
 *
 * Rules:
 *   - a value in (0, 1] is treated as a fraction and scaled to 0..100
 *   - a value in (1, 10] is treated as a 0..10 scale and scaled to 0..100
 *     (legacy audit-derived scores)
 *   - a value in (10, 100] is already on the display scale
 *   - 0 is a valid score (no website → no digital presence)
 *   - null / undefined / NaN / non-finite values → "Not available"
 *   - values above 100 are clamped to 100
 *
 * When the score is derived from an incomplete analysis (e.g. the digital
 * audit degraded or failed), the caller must pass `preliminary: true` so the
 * UI can label it "Preliminary" instead of presenting it as a final verdict.
 */

export type ScoreState = 'complete' | 'preliminary' | 'unavailable';

export interface NormalizedScore {
  /** Canonical 0..100 display value, or null when unavailable. */
  value: number | null;
  /** Whether the numeric value is trustworthy enough to display as final. */
  state: ScoreState;
  /** Human-readable display string: "30/100", "Preliminary 30/100", "—". */
  display: string;
  /** Raw input as received (for debugging). */
  raw: number | null | undefined;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Normalize any of the accepted score scales to the canonical 0..100 display.
 * Never throws — invalid input maps to `unavailable`.
 */
export function normalizeOpportunityScore(
  raw: number | null | undefined,
  options: { preliminary?: boolean } = {},
): NormalizedScore {
  if (!isFiniteNumber(raw)) {
    return { value: null, state: 'unavailable', display: 'Not available', raw: raw ?? null };
  }

  let value: number;
  if (raw === 0) {
    value = 0;
  } else if (raw > 0 && raw <= 1) {
    // 0.3 → 30
    value = Math.round(raw * 100);
  } else if (raw > 1 && raw <= 10) {
    // legacy 0..10 audit scale → 0..100
    value = Math.round(raw * 10);
  } else {
    // already 0..100
    value = Math.round(raw);
  }

  const clamped = Math.min(100, Math.max(0, value));
  const preliminary = options.preliminary === true;

  return {
    value: clamped,
    state: preliminary ? 'preliminary' : 'complete',
    display: preliminary ? `Preliminary ${clamped}/100` : `${clamped}/100`,
    raw: raw ?? null,
  };
}

/**
 * Map a lead's stored score + audit status into a single normalized score
 * that Overview and Analysis both render from. Keeps the two tabs consistent
 * by construction (one source of truth).
 */
export function resolveLeadScore(input: {
  score?: number | null;
  status?: string | null;
}): NormalizedScore {
  const preliminary =
    input.status === 'preliminary' ||
    input.status === 'failed' ||
    input.status === 'degraded';
  return normalizeOpportunityScore(input.score, { preliminary });
}

export default normalizeOpportunityScore;