/**
 * Tests for the AI evaluation harness (eval/{metrics,backends,report,run}.js).
 *
 *   A. Metric functions      — values/phone equivalence, field metrics golden
 *                              case, key coverage, score deltas, calibration.
 *   B. Backends              — echo returns expected output; fallback needs
 *                              WebloomAI and serves envelope tasks; unknown
 *                              backend rejected; envelope detection.
 *   C. Report aggregation    — totals/skipped/ok computed correctly.
 *   D. End-to-end runner     — child-process runs of eval/run.js over the
 *                              holdout split: echo 6/6 ok, fallback 2 ok + 4
 *                              skipped (generative tasks unsupported).
 *
 * Run: node test_ai_eval.js
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import './test_env_ai.js';

let passed = 0;
let failed = 0;
const failures = [];
const pendingChecks = [];

function check(name, fn) {
  pendingChecks.push([name, fn]);
}

const checkAsync = (name, fn) => check(name, fn);

async function runChecks() {
  for (const [name, fn] of pendingChecks) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      failed += 1;
      failures.push(`${name}: ${error.message}`);
      console.error(`  \u2717 ${name}`);
    }
  }
}

import { valuesEquivalent, fieldValueEquivalent, fieldMetrics, keyCoverageMetrics, scoreDeltaMetrics, calibrationFromPairList } from './eval/metrics.js';
import { createBackend, envelopeTask } from './eval/backends.js';
import { buildReport } from './eval/report.js';
import { WebloomAI } from './src/ai/WebloomAI.js';
import { getTask } from './src/ai/tasks.js';

/* ------------------------------------------------------------------ */
/* A. Metrics                                                          */
/* ------------------------------------------------------------------ */

check('valuesEquivalent handles scalar, case, arrays, objects', () => {
  assert.equal(valuesEquivalent('X', 'x'), true);
  assert.equal(valuesEquivalent('a', 'b'), false);
  assert.equal(valuesEquivalent(5, 5), true);
  assert.equal(valuesEquivalent(null, undefined), false);
  assert.equal(valuesEquivalent(5, '5'), false);
  assert.equal(valuesEquivalent(['a', 'b'], ['b', 'a']), true);
  assert.equal(valuesEquivalent(['a', 'b'], ['a', 'c']), false);
  assert.equal(valuesEquivalent({ x: 1 }, { x: 1 }), true);
});

check('fieldValueEquivalent normalizes phone/coordinates but not else', () => {
  assert.equal(fieldValueEquivalent('contact.phone', '+1 (415) 487-2600', '14154872600'), true);
  assert.equal(fieldValueEquivalent('latLng', '37.7,-122.4', '37.7-122.4'), false, 'non-digit normalization must not apply');
  assert.equal(fieldValueEquivalent('identity.name', 'Tartine', 'tartine'), true, 'case-insensitive string compare');
});

check('fieldMetrics golden case: tp/fp/fn/tn and rates', () => {
  const predicted = {
    a: { value: 'X', confidence: 0.9, provenance: 'observed', status: 'extracted' },
    b: { value: 'WRONG', confidence: 0.8, provenance: 'observed', status: 'extracted' },
    c: null,
    d: null,
  };
  const expected = {
    a: { value: 'x', confidence: 0.95, provenance: 'observed', status: 'extracted' },
    b: { value: 'right', confidence: 0.7, provenance: 'observed', status: 'extracted' },
    c: { value: 'cat', confidence: 1, provenance: 'observed', status: 'extracted' },
    d: null,
  };
  const m = fieldMetrics(predicted, expected);
  assert.equal(m.fields, 4);
  assert.equal(m.expectedValued, 3);
  assert.equal(m.tp, 1);
  assert.equal(m.fp, 1);
  assert.equal(m.fn, 1);
  assert.equal(m.tn, 1);
  assert.equal(m.precision, 0.5);
  assert.equal(m.recall, 0.5);
  assert.equal(m.f1, 0.5);
  assert.equal(m.hallucinationRate, 0.5);
  assert.equal(m.missRate, 0.5);
  assert.equal(m.abstentionAccuracy, 0.5);
  assert.equal(m.calibration.pairs, 2, 'only predicted-valued fields carry calibration pairs');
});

check('fieldMetrics treats missing predicted value on expected-valued field as miss (not hallucination)', () => {
  const m = fieldMetrics(
    { k: { value: null } },
    { k: { value: 'present' } },
  );
  assert.equal(m.fn, 1);
  assert.equal(m.fp, 0);
  assert.equal(m.missRate, 1);
  assert.equal(m.hallucinationRate, 0);
});

check('keyCoverageMetrics flags only undefined keys', () => {
  const cov = keyCoverageMetrics({ a: 1 }, { a: 1, b: 2, c: 3 });
  assert.equal(cov.keys, 3);
  assert.equal(cov.coverage, 0.3333);
  assert.deepEqual(cov.missing, ['b', 'c']);
  assert.equal(keyCoverageMetrics({}, {}, { ignoreKeys: ['x'] }).coverage, 1);
});

check('scoreDeltaMetrics computes MAEs and websiteExists match only when comparable', () => {
  const p = { websiteExists: true, overallScore: 7, categories: { design: { score: 3 }, seo: { score: 5 } } };
  const e = { websiteExists: true, overallScore: 8, categories: { design: { score: 5 }, seo: { score: 5 }, content: { score: 2 } } };
  const d = scoreDeltaMetrics(p, e);
  assert.equal(d.overallMAE, 1);
  assert.equal(d.categoryMAE, 1);
  assert.equal(d.websiteExistsMatch, true);
  assert.equal(scoreDeltaMetrics({ websiteExists: false }, { websiteExists: false, overallScore: 8 }).overallMAE, null);
});

check('calibrationFromPairList aggregates pairs through confidence calibration', () => {
  const pairs = [
    { confidence: 0.9, correct: true },
    { confidence: 0.5, correct: false },
  ];
  const cal = calibrationFromPairList(pairs);
  assert.equal(cal.count, 2);
  assert.equal(cal.accuracy, 0.5);
  assert.equal(cal.meanConfidence, 0.7);
});

/* ------------------------------------------------------------------ */
/* B. Backends                                                         */
/* ------------------------------------------------------------------ */

check('echo backend returns the expected output verbatim', async () => {
  const backend = createBackend('echo');
  const example = {
    task: 'extraction.business_profile',
    expectedOutput: { 'identity.name': { value: 'Tartine' } },
  };
  const { result } = await backend.runner(example);
  assert.equal(result.output['identity.name'].value, 'Tartine');
  assert.equal(result.inference.provider, 'echo');
  assert.equal(result.inference.grounding.mode, 'off');
});

check('createBackend rejects unknown backends and requires webloomAI for real ones', () => {
  assert.throws(() => createBackend('nope'), /Unknown backend/);
  assert.throws(() => createBackend('fallback'), /requires webloomAI/);
  assert.throws(() => createBackend('baseline'), /requires webloomAI/);
});

check('envelopeTask detects envelope-shaped contracts only', () => {
  assert.equal(envelopeTask(getTask('extraction.business_profile')), true);
  assert.equal(envelopeTask(getTask('website.analysis')), false);
});

check('fallback backend serves envelope tasks with UNKNOWN envelopes', async () => {
  const webloomAI = new WebloomAI();
  const backend = createBackend('fallback', { webloomAI });
  const { result } = await backend.runner({
    task: 'extraction.business_profile',
    input: {
      rawBusinessData: {},
      evidence: [{ source: 'google_maps_page', text: 'Tartine Bakery\nMeera Marg' }],
    },
  });
  assert.equal(result.inference.provider, 'fallback');
  assert.equal(result.output['identity.name'].value, null);
  assert.equal(result.output['identity.name'].status, 'missing');
});

/* ------------------------------------------------------------------ */
/* C. Report aggregation                                              */
/* ------------------------------------------------------------------ */

check('buildReport totals ok/skipped/failed and per-task summaries', async () => {
  const envelopeOk = {
    exampleId: 'e1', task: 'extraction.business_profile', ok: true, skipped: false, error: null,
    attempts: 1, latencyMs: 1,
    metrics: { type: 'envelope', fields: 10, expectedValued: 3, tp: 2, fp: 0, fn: 1, tn: 7, f1: 0.8, hallucinationRate: 0, missRate: 0.3333 },
    inference: { provider: 'echo', model: 'echo' },
  };
  const skipped = { exampleId: 'e2', task: 'strategy.website', ok: false, skipped: true, error: 'skipped: ...', attempts: 0, latencyMs: 0, metrics: { type: 'failure' }, inference: null };
  const report = await buildReport({
    results: [envelopeOk, skipped],
    backend: 'fallback', runId: 'bench-test', startedAt: new Date().toISOString(),
  });
  assert.equal(report.totals.examples, 2);
  assert.equal(report.totals.ok, 1);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.skipped, 1);
  assert.equal(report.perTask['extraction.business_profile'].summary.envelope.f1, 0.8);
});

/* ------------------------------------------------------------------ */
/* D. End-to-end runner (child process)                                */
/* ------------------------------------------------------------------ */

function runEvalCli(args) {
  const script = fileURLToPath(new URL('./eval/run.js', import.meta.url));
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 60000 });
}

check('eval/run.js echo holdout is 6/6 ok at 100%', () => {
  const out = runEvalCli(['--backend', 'echo', '--dataset', 'holdout']);
  assert.match(out, /Examples: 6\/6 ok\s+\(100%\)/);
  assert.doesNotMatch(out, /FAIL/);
});

check('eval/run.js fallback holdout serves 2 envelope examples and skips 4 generative', () => {
  const out = runEvalCli(['--backend', 'fallback', '--dataset', 'holdout']);
  assert.match(out, /Examples: 2\/6 ok/);
  assert.match(out, /Skipped: 4 /);
});

check('eval/run.js echo train is 14/14 ok', () => {
  const out = runEvalCli(['--backend', 'echo', '--dataset', 'train']);
  assert.match(out, /Examples: 14\/14 ok\s+\(100%\)/);
});

check('eval/run.js rejects unknown backends and unknown tasks', () => {
  assert.throws(() => runEvalCli(['--backend', 'magic']), /Unknown backend/);
  assert.throws(() => runEvalCli(['--task', 'nope']), /Unknown task/);
});

check('eval/run.js --task filters to a single task', () => {
  const out = runEvalCli(['--backend', 'echo', '--dataset', 'holdout', '--task', 'extraction.business_profile']);
  assert.match(out, /Examples: 2\/2 ok\s+\(100%\)/);
});

await runChecks();

console.log(`\nAI eval: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Failures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}