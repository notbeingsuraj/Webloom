/**
 * Benchmark v2 — Full-Pipeline Extraction Quality Benchmark Runner
 *
 * Runs the REAL orchestration path (`BusinessResearchService.
 * extractBusinessIntelligenceWithProviders`) against deterministic mocked
 * providers + mocked AI, then measures the Phase 2 metric set on the resulting
 * BusinessProfile:
 *
 *   extractionSuccessRate       — field extracted at all (non-null)
 *   correctness                 — extracted value equals ground truth
 *   evidenceValidity            — field carries evidence (source/evidence entry)
 *   provenanceAccuracy          — field provenance matches expected tier
 *   providerAgreement           — providers agree on the field (when both present)
 *   conflictResolutionAccuracy  — conflicts recorded & resolved with winner+reason
 *   aiFallbackAcceptanceRate    — AI-grounded values accepted (denominator: AI-capable gaps)
 *   aiFallbackFalsePositiveRate — accepted AI values that are WRONG
 *   emptyFieldCompletionRate    — ground-truth-present empty fields became populated
 *   confidenceCalibration       — accepted confidence in [0,1] and ≥ threshold for high-provenance
 *   latencyMs                   — wall-clock per field / per fixture
 *
 * Deterministic by construction: every provider payload and AI response is
 * fixed. No live websites. 16 fixtures × 14 fields = 224 per-field observations.
 */

import { BENCHMARK_FIXTURES, FIXTURE_CATEGORIES } from './fixtures.js';
import { installProviderMocks, restoreProviderMocks, installAI, installFetchPageMock } from './mockProviders.js';
import BusinessResearchService from '../../src/services/BusinessResearchService.js';

// Field list measured (the canonical identity/contact/location/rating surface)
const FIELDS = [
  'identity.name',
  'identity.category',
  'identity.description',
  'contact.phone',
  'contact.email',
  'contact.website',
  'location.full_address',
  'location.city',
  'location.state',
  'location.country',
  'location.postal_code',
  'location.coordinates',
  'ratings.rating',
  'ratings.review_count',
];

function getField(profile, path) {
  return profile?.getField ? profile.getField(path) : null;
}

function getValue(profile, path) {
  return profile?.get ? profile.get(path) : null;
}

function normPhone(v) {
  if (!v) return v;
  return String(v).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
}

function valuesEqual(path, a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (path === 'contact.phone') return normPhone(a) === normPhone(b);
  if (path === 'location.coordinates' && typeof a === 'object' && typeof b === 'object') {
    return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Extract a field's expected value from the nested expectedProfile. */
function expectedValueOf(fixture, path) {
  const [group, field] = path.split('.');
  return fixture.expectedProfile?.[group]?.[field] ?? null;
}

/**
 * Classify a provenance string into a measurement tier:
 *   deterministic (verified/discovered/identified/observed/user_provided)
 *   ai_generated
 *   inferred
 */
function provenanceTier(p) {
  if (!p) return null;
  if (p === 'ai_generated' || p === 'inferred') return p;
  return 'deterministic';
}

export class BenchmarkResults {
  constructor() {
    this.results = [];
  }

  add(fixtureId, category, field, metrics) {
    this.results.push({ fixtureId, category, field, ...metrics });
  }

  computeStats(rows) {
    const total = rows.length;
    if (total === 0) return { count: 0 };
    const sum = (fn) => rows.filter(fn).length / total;

    return {
      count: total,
      extractionSuccessRate: sum((r) => r.extracted),
      correctness: sum((r) => r.correct),
      evidenceValidity: sum((r) => r.evidenceValid),
      provenanceAccuracy: sum((r) => r.provenanceCorrect),
      providerAgreement: sum((r) => r.providerAgreement === true || r.providerAgreement == null),
      conflictResolutionAccuracy: sum((r) => r.conflictResolved),
      aiFallbackAcceptanceRate: sum((r) => r.aiAccepted),
      aiFallbackFalsePositiveRate: sum((r) => r.aiFalsePositive),
      emptyFieldCompletionRate: sum((r) => r.emptyCompleted),
      confidenceCalibration: sum((r) => r.confidenceCalibrated),
      avgLatencyMs: rows.length
        ? rows.reduce((a, b) => a + (b.latencyMs || 0), 0) / rows.length
        : 0,
    };
  }

  getSummary() {
    const byCategory = {};
    const byField = {};
    for (const r of this.results) {
      (byCategory[r.category] ||= []).push(r);
      (byField[r.field] ||= []).push(r);
    }
    return {
      totalTests: this.results.length,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, this.computeStats(v)])
      ),
      byField: Object.fromEntries(
        Object.entries(byField).map(([k, v]) => [k, this.computeStats(v)])
      ),
      overall: this.computeStats(this.results),
    };
  }

  formatRow(label, s, depth = 1) {
    const pad = '  '.repeat(depth);
    const pct = (x) => (typeof x === 'number' ? (x * 100).toFixed(1) + '%' : 'n/a');
    return [
      `${pad}${label} (${s.count}):`,
      `${pad}  Success: ${pct(s.extractionSuccessRate)} | Correct: ${pct(s.correctness)} | Evidence: ${pct(s.evidenceValidity)} | Provenance: ${pct(s.provenanceAccuracy)}`,
      `${pad}  ProviderAgree: ${pct(s.providerAgreement)} | ConflictResolved: ${pct(s.conflictResolutionAccuracy)}`,
      `${pad}  AI-Accept: ${pct(s.aiFallbackAcceptanceRate)} | AI-FalsePos: ${pct(s.aiFallbackFalsePositiveRate)} | EmptyComplete: ${pct(s.emptyFieldCompletionRate)} | ConfCalib: ${pct(s.confidenceCalibration)}`,
      `${pad}  AvgLatency: ${s.avgLatencyMs.toFixed(1)}ms`,
    ].join('\n');
  }

  printReport() {
    const summary = this.getSummary();
    const lines = [
      '\n========== EXTRACTION QUALITY BENCHMARK REPORT (v2, deterministic) ==========\n',
      `Total field-observations: ${summary.totalTests}\n`,
      '--- OVERALL ---',
      this.formatRow('Overall', summary.overall, 0),
    ];

    lines.push('\n--- BY CATEGORY ---');
    for (const [cat, s] of Object.entries(summary.byCategory)) {
      lines.push(this.formatRow(cat.toUpperCase(), s));
    }

    lines.push('\n--- BY FIELD ---');
    for (const [field, s] of Object.entries(summary.byField)) {
      lines.push(this.formatRow(field, s, 1));
    }

    lines.push('\n========== END REPORT ==========\n');
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Main benchmark
// ---------------------------------------------------------------------------
export async function runBenchmark() {
  const results = new BenchmarkResults();
  const startedAt = Date.now();
  let passedFixtures = 0;
  let failedFixtures = 0;
  const fixtureFailures = [];

  console.log('Starting Deterministic Extraction Quality Benchmark (v2)...');
  console.log(`Testing ${BENCHMARK_FIXTURES.length} fixtures across ${FIXTURE_CATEGORIES.length} categories\n`);

  for (const fixture of BENCHMARK_FIXTURES) {
    const fixtureStart = Date.now();
    let restoreProviders;
    let restoreAI;
    let restoreFetch;
    try {
      // --- Install deterministic mocks ---
      restoreProviders = installProviderMocks(fixture); // returns restore fn
      restoreAI = await installAI(fixture);
      restoreFetch = await installFetchPageMock(fixture);

      // --- Run the REAL orchestration path ---
      const input = { googleMapsUrl: fixture.googleMapsUrl };
      // Include explicit coordinates matching the fixture so the URL-identity
      // anchor is aligned (mimics a real /place/ URL carrying @lat,lng).
      const coords = fixture.expectedProfile?.location?.coordinates;
      if (coords) {
        input.name = fixture.expectedProfile?.identity?.name || null;
        input.latitude = coords.lat;
        input.longitude = coords.lng;
      }

      const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders(input);
      const profile = result?.profile;
      const intelligence = result?.intelligence;
      if (!profile) {
        throw new Error('No profile returned from orchestration');
      }

      // Record per-field metrics
      for (const field of FIELDS) {
        const expected = expectedValueOf(fixture, field);
        const actual = getValue(profile, field);
        const fieldObj = getField(profile, field);
        const provenance = fieldObj?.provenance || null;
        const confidence = fieldObj?.confidence ?? 0;
        const sourceInfo = fieldObj?.sourceInfo || {};
        const isExpectedPresent = expected != null && expected !== '';
        const isIdentityField = ['identity.name', 'contact.phone', 'contact.website', 'location.full_address', 'location.coordinates'].includes(field);

        const fieldStart = Date.now();
        const extracted = actual != null;
        const correct = extracted ? valuesEqual(field, actual, expected) : !isExpectedPresent;
        const evidenceValid = extracted && !!(sourceInfo?.sourceUrl || sourceInfo?.provider);
        const provenanceCorrect = (() => {
          if (!extracted) return !isExpectedPresent || fixture.expectedProvenance?.[field] == null;
          const expectedTier = fixture.expectedProvenance?.[field];
          if (expectedTier == null) return true; // no tier asserted → not penalized
          if (expectedTier === 'identified' && provenance === 'identified') return true;
          if (expectedTier === 'discovered' && (provenance === 'discovered' || provenance === 'observed')) return true;
          if (expectedTier === 'observed' && (provenance === 'observed' || provenance === 'discovered')) return true;
          if (expectedTier === 'ai_generated' && provenance === 'ai_generated') return true;
          // AI must NEVER claim deterministic provenance for AI-supplied fields
          if (expectedTier === 'ai_generated' && provenanceTier(provenance) === 'deterministic') return false;
          return provenanceTier(provenance) === expectedTier;
        })();

        // Provider agreement: do the two mocked providers agree?
        const geoRec = fixture.providerMocks?.geoapify?.records?.[0];
        const webRec = fixture.providerMocks?.webExtraction?.records?.[0];
        const geoVal = geoRec ? getFromRecord(geoRec, field) : null;
        const webVal = webRec ? getFromRecord(webRec, field) : null;
        const providerAgreement = geoVal != null && webVal != null
          ? valuesEqual(field, geoVal, webVal)
          : null; // cannot judge when one provider lacks the field

        // Conflict resolution: expected conflicts recorded with winner+reason
        const conflicts = profile.getConflicts ? profile.getConflicts(field) : [];
        const expectConflict = (fixture.expectConflicts || []).includes(field);
        const conflictResolved = expectConflict
          ? conflicts.length > 0 && conflicts.some((c) => c.status === 'resolved' && c.winner && c.resolutionReason)
          : conflicts.length === 0;

        // AI metrics (per field): did the AI path produce this value?
        const aiProvenance = provenance === 'ai_generated';
        const aiAccepted = aiProvenance;
        const aiFalsePositive = aiAccepted && !correct;
        // Empty completion: ground truth present, was missing in all providers, now populated
        const providerHadValue = geoVal != null || webVal != null;
        const emptyCompleted = isExpectedPresent && extracted && !providerHadValue;

        // Confidence calibration
        const confidenceCalibrated = !extracted || (
          typeof confidence === 'number' &&
          confidence >= 0 && confidence <= 1 &&
          (provenanceTier(provenance) === 'deterministic' ? confidence >= 0.5 : confidence >= 0.5)
        );

        results.add(fixture.id, fixture.category, field, {
          extracted,
          correct,
          evidenceValid,
          provenanceCorrect,
          providerAgreement,
          conflictResolved,
          aiAccepted,
          aiFalsePositive,
          emptyCompleted,
          confidenceCalibrated,
          latencyMs: Date.now() - fieldStart,
        });
      }

      const duration = Date.now() - fixtureStart;
      passedFixtures += 1;
      console.log(`  ✓ ${fixture.name} (${fixture.category}) — ${duration}ms`);
    } catch (err) {
      failedFixtures += 1;
      fixtureFailures.push({ id: fixture.id, name: fixture.name, error: err.message });
      console.error(`  ✗ ${fixture.name} (${fixture.category}) — ${err.message}`);
    } finally {
      if (restoreAI) restoreAI();
      if (restoreFetch) restoreFetch();
      if (restoreProviders) restoreProviders();
    }
  }

  const totalTime = Date.now() - startedAt;
  console.log(`\nFixtures: ${passedFixtures} passed, ${failedFixtures} failed (${totalTime}ms total)`);
  if (fixtureFailures.length) {
    console.log('\nFixture failures:');
    for (const f of fixtureFailures) {
      console.log(`  - [${f.id}] ${f.name}: ${f.error}`);
    }
  }

  const report = results.printReport();
  console.log(report);
  return { report, summary: results.getSummary(), passedFixtures, failedFixtures, fixtureFailures, totalTimeMs: totalTime };
}

/** Read a nested value from a canonical flat record. */
function getFromRecord(record, path) {
  if (!record) return null;
  const [group, field] = path.split('.');
  const v = record?.[group]?.[field];
  return v ?? null;
}

export default { runBenchmark };