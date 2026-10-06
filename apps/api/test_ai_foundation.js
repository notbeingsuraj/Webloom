/**
 * Webloom AI foundation tests.
 *
 * Covers the new AI task layer (not the legacy services/ai chain, which is
 * tested by test_ai_providers.js / test_ai_provenance.js):
 *
 *   A. Task/contract registry    — every task has a valid contract + postValidate
 *   B. Grounding                 — snippet/value verdicts, enforce/report, phone normalization
 *   C. Confidence                — bands, envelope bands, calibration report
 *   D. Providers                 — createProvider, resolveProviders('auto'), fallback semantics
 *   E. WebloomAI.run()           — provider loop, post-validation, grounding enforcement,
 *                                  UNKNOWN fallback, fabricated-field rejection
 *   F. Model registry            — register/activate/benchmark/compare (temp file)
 *   G. Correction store          — record/list/conversion (temp file)
 *
 * Run: node test_ai_foundation.js
 */

import assert from 'node:assert/strict';
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

import { TASK_IDS, getTask } from './src/ai/tasks.js';
import { getContract } from './src/ai/contracts/index.js';
import { unknownEnvelope } from './src/ai/contracts/common.js';
import { snippetVerdict, valueVerdict, groundField, groundOutput, normalizeForMatch } from './src/ai/grounding.js';
import { confidenceBand, envelopeBand, overallConfidence, calibrationReport } from './src/ai/confidence.js';
import { createProvider, resolveProviders, PROVIDER_NAMES } from './src/ai/providers/index.js';
import { WebloomAI } from './src/ai/WebloomAI.js';
import {
  registerModel, reloadRegistry, getModel, listModels, getActiveModel, setActiveModel,
  recordBenchmark, compareModels, bumpVersion,
} from './src/ai/modelRegistry.js';
import { recordCorrection, listCorrections, correctionsToExampleDrafts } from './src/ai/hitl/correctionStore.js';

/* ------------------------------------------------------------------ */
/* A. Task / contract registry                                         */
/* ------------------------------------------------------------------ */

check('task registry exposes the 7 expected tasks', () => {
  assert.deepEqual([...TASK_IDS].sort(), [
    'brand.dna',
    'classification.business',
    'evidence.reasoning',
    'extraction.business_profile',
    'strategy.landing_page',
    'strategy.website',
    'website.analysis',
  ]);
});

for (const taskId of TASK_IDS) {
  check(`${taskId} contract validates an unknown-envelope-free baseline`, () => {
    const task = getTask(taskId);
    const contract = getContract(taskId);
    assert.equal(task.contract, contract, 'task pins the registry contract');
    assert.equal(typeof task.buildPrompt, 'function', 'prompt builder present');
    assert.equal(typeof task.postValidate, 'function', 'postValidate present');
    assert.ok(task.version && typeof task.version === 'string');
    if (typeof contract.properties === 'object') {
      for (const [key, schema] of Object.entries(contract.properties)) {
        assert.ok(schema && schema.type, `${taskId}:${key} has a schema`);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* B. Grounding                                                        */
/* ------------------------------------------------------------------ */

check('normalizeForMatch collapses whitespace and case', () => {
  assert.equal(normalizeForMatch('  Meera  Marg\nJawahar '), 'meera marg jawahar');
  assert.equal(normalizeForMatch('A\u200BB'), 'ab');
});

check('snippetVerdict grounded / unsupported / unverifiable', () => {
  const evidence = 'Manan Furnitures\nMeera Marg, Jawahar Nagar\nPhone: +91 98765 43210';
  assert.equal(snippetVerdict('Phone: +91 98765 43210', evidence), 'grounded');
  assert.equal(snippetVerdict('meera marg, jawahar nagar', evidence), 'grounded');
  assert.equal(snippetVerdict('Founded 1990', evidence), 'unsupported');
  assert.equal(snippetVerdict('4.5', evidence), 'unverifiable');
  assert.equal(snippetVerdict(null, evidence), 'unverifiable');
  assert.equal(snippetVerdict('anything', ''), 'unverifiable');
});

check('valueVerdict handles numbers', () => {
  const evidence = 'Rated 4.5 (2,847 reviews)';
  assert.equal(valueVerdict(4.5, evidence), 'grounded');
  assert.equal(valueVerdict(2.1, evidence), 'unsupported');
});

check('groundField accepts normalized phone with a real quote', () => {
  const evidence = 'Phone: (415) 487-2600\nTartine Bakery';
  const envelope = {
    fieldPath: 'contact.phone',
    value: '+14154872600',
    confidence: 0.97,
    provenance: 'ai_generated',
    status: 'extracted',
    evidence: [{ source: 'google_maps_page', text: '(415) 487-2600' }],
  };
  assert.equal(groundField(envelope, evidence).verdict, 'grounded');
});

check('groundField rejects invented quote', () => {
  const evidence = 'Manan Furnitures\nMeera Marg';
  const envelope = {
    fieldPath: 'identity.description',
    value: 'Best furniture store in town',
    confidence: 0.9,
    provenance: 'ai_generated',
    status: 'extracted',
    evidence: [{ source: 'google_maps_page', text: 'named Best Furniture Store 2020' }],
  };
  assert.equal(groundField(envelope, evidence).verdict, 'unsupported');
});

check('groundField skips non-AI provenances', () => {
  const envelope = { fieldPath: 'identity.name', value: 'Whatever', provenance: 'observed', status: 'extracted' };
  assert.equal(groundField(envelope, '').verdict, 'grounded');
});

check('groundField treats null-valued envelopes as unverifiable', () => {
  const envelope = unknownEnvelope();
  assert.equal(groundField({ ...envelope, fieldPath: 'x' }, 'anything').verdict, 'unverifiable');
});

check('groundOutput enforce mode nulls unsupported AI claims and reports counts', () => {
  const output = {
    'identity.name': {
      value: 'Tartine Bakery', confidence: 0.98, provenance: 'ai_generated', status: 'extracted',
      evidence: [{ source: 's', text: 'Tartine Bakery' }],
    },
    'contact.phone': {
      value: '+919999999999', confidence: 0.95, provenance: 'ai_generated', status: 'extracted',
      evidence: [{ source: 's', text: '+91 99999 99999' }],
    },
    'identity.services': unknownEnvelope(),
  };
  const evidence = 'Tartine Bakery\nMeera Marg';
  const { report, output: rewritten } = groundOutput(output, evidence, 'enforce');
  assert.equal(report.grounded, 1);
  assert.equal(report.unsupported, 1);
  assert.equal(report.unverifiable, 1);
  assert.equal(rewritten['identity.name'].value, 'Tartine Bakery');
  assert.equal(rewritten['contact.phone'].value, null);
  assert.equal(rewritten['contact.phone'].provenance, 'unknown');
  assert.equal(rewritten['contact.phone'].status, 'unsupported');
  assert.equal(rewritten['identity.services'].status, 'missing');
});

check('groundOutput report mode does not rewrite', () => {
  const output = {
    'identity.name': {
      value: 'Nope', confidence: 0.9, provenance: 'ai_generated', status: 'extracted',
      evidence: [{ source: 's', text: 'definitely not in evidence text anywhere' }],
    },
  };
  const { report, output: kept } = groundOutput(output, 'the actual evidence', 'report');
  assert.equal(report.unsupported, 1);
  assert.equal(kept['identity.name'].value, 'Nope');
});

/* ------------------------------------------------------------------ */
/* C. Confidence                                                       */
/* ------------------------------------------------------------------ */

check('confidence bands at 0.85/0.65/0.4', () => {
  assert.equal(confidenceBand(0.9), 'HIGH');
  assert.equal(confidenceBand(0.85), 'HIGH');
  assert.equal(confidenceBand(0.7), 'MEDIUM');
  assert.equal(confidenceBand(0.5), 'LOW');
  assert.equal(confidenceBand(0.3), 'UNSUPPORTED');
  assert.equal(confidenceBand(0), 'UNSUPPORTED');
  assert.equal(confidenceBand(NaN), 'UNSUPPORTED');
});

check('envelopeBand ignores value-less/unknown envelopes', () => {
  assert.equal(envelopeBand({ value: 'x', confidence: 0.9, provenance: 'ai_generated', status: 'extracted' }), 'HIGH');
  assert.equal(envelopeBand({ value: null, confidence: 0.9, provenance: 'unknown', status: 'missing' }), 'UNSUPPORTED');
  assert.equal(envelopeBand({ value: 'x', confidence: 0.9, provenance: 'ai_generated', status: 'missing' }), 'UNSUPPORTED');
});

check('overallConfidence averages valued fields only', () => {
  const output = {
    a: { value: 'x', confidence: 0.9, provenance: 'ai_generated', status: 'extracted' },
    b: { value: 'y', confidence: 0.5, provenance: 'ai_generated', status: 'extracted' },
    c: unknownEnvelope(),
  };
  const oc = overallConfidence(output);
  assert.equal(oc.valuedFields, 2);
  assert.equal(oc.overall, 0.7);
  assert.equal(oc.band, 'MEDIUM');
  assert.equal(overallConfidence({ c: unknownEnvelope() }).overall, 0);
});

check('calibrationReport computes ECE and false-confidence rate', () => {
  const pairs = [
    { confidence: 0.9, correct: true },
    { confidence: 0.9, correct: true },
    { confidence: 0.9, correct: false },
    { confidence: 0.5, correct: true },
    { confidence: 0.5, correct: false },
  ];
  const cr = calibrationReport(pairs, 5);
  assert.ok(cr.ece > 0 && cr.ece < 1, `ece=${cr.ece}`);
  assert.ok(cr.brier > 0);
  assert.equal(cr.falseConfidenceCount, 1);
  assert.ok(cr.falseConfidenceRate > 0);
});

/* ------------------------------------------------------------------ */
/* D. Providers                                                        */
/* ------------------------------------------------------------------ */

check('createProvider knows the well-known names', () => {
  assert.equal(createProvider('webloom').name, 'webloom-finetuned');
  assert.equal(createProvider('external').name, 'external-llm');
  assert.equal(createProvider('local-foundation').name, 'local-foundation');
  assert.equal(createProvider('fallback').name, 'fallback');
  assert.throws(() => createProvider('nope'), /Unknown AI provider/);
});

check('resolveProviders auto resolves to the external chain', () => {
  const providers = resolveProviders('auto');
  assert.ok(providers.some((p) => p.name === 'external-llm'));
  assert.ok(!providers.some((p) => p.name === 'fallback'));
});

check('resolveProviders auto+unknown includes the deterministic fallback', () => {
  const providers = resolveProviders('auto', {}, true);
  assert.ok(providers.some((p) => p.name === 'fallback'));
});

check('fallback provider returns all-UNKNOWN envelopes for extraction', async () => {
  const p = createProvider('fallback');
  assert.equal(p.isConfigured(), true);
  const contract = getContract('extraction.business_profile');
  const result = await p.run({ prompt: '', schema: contract, operation: 'extraction' });
  for (const [key, envelope] of Object.entries(result.value)) {
    assert.equal(envelope.value, null, `${key} should be null`);
    assert.equal(envelope.provenance, 'unknown', `${key} provenance`);
    assert.equal(envelope.status, 'missing', `${key} status`);
  }
  assert.equal(Object.keys(result.value).length, 20);
});

check('fallback provider refuses generative contracts', async () => {
  const p = createProvider('fallback');
  const contract = getContract('brand.dna');
  await assert.rejects(() => p.run({ prompt: '', schema: contract, operation: 'brand' }), /cannot serve non-envelope/);
});

/* ------------------------------------------------------------------ */
/* E. WebloomAI.run()                                                  */
/* ------------------------------------------------------------------ */

class StubProvider {
  constructor(name, output, { overrides = {} } = {}) {
    this.name = name;
    this.type = 'stub';
    this.modelId = `stub-${name}`;
    this.output = output;
    this.overrides = overrides;
  }
  isConfigured() { return this.overrides.configured ?? true; }
  run(request) {
    return Promise.resolve({
      value: this.output,
      raw: JSON.stringify(this.output),
      provider: this.name,
      model: `stub-${this.name}`,
      usage: null,
      latencyMs: 1,
    });
  }
}

const fullUnknownExtraction = (contract) => {
  const output = {};
  for (const key of Object.keys(contract.properties)) output[key] = unknownEnvelope();
  return output;
};

checkAsync('run() with fallback returns UNKNOWN envelopes, provider metadata, and passes its own schema', async () => {
  const ai = new WebloomAI();
  const result = await ai.run('extraction.business_profile', {
    rawBusinessData: {},
    evidence: [{ source: 'google_maps_page', text: 'Tartine Bakery\nMeera Marg' }],
  }, { provider: 'fallback', onFail: 'unknown' });
  assert.equal(result.inference.provider, 'fallback');
  assert.equal(result.inference.grounding.mode, 'enforce');
  assert.equal(result.output['identity.name'].value, null);
  assert.equal(result.inference.confidence.valuedFields, 0);
  assert.equal(result.inference.confidence.band, 'UNSUPPORTED');
  assert.ok(Array.isArray(result.__attempts));
});

checkAsync('run() enforces grounding: fabricated claim becomes UNKNOWN', async () => {
  const contract = getContract('extraction.business_profile');
  const fabricated = fullUnknownExtraction(contract);
  fabricated['identity.name'] = {
    value: 'Invented Deli', confidence: 0.95, provenance: 'ai_generated', status: 'extracted',
    evidence: [{ source: 'google_maps_page', text: 'Invented Deli is famous' }],
  };
  const ai = new WebloomAI({ providers: [new StubProvider('stub', fabricated)] });
  const result = await ai.run('extraction.business_profile', {
    rawBusinessData: {},
    evidence: [{ source: 'google_maps_page', text: 'Tartine Bakery\nMeera Marg' }],
  }, { provider: 'stub', onFail: 'unknown' });
  assert.equal(result.output['identity.name'].value, null);
  assert.equal(result.output['identity.name'].status, 'unsupported');
  assert.equal(result.inference.grounding.unsupported, 1);
});

checkAsync('run() rejects output that fails post-validation and moves to the next provider', async () => {
  const contract = getContract('extraction.business_profile');
  const bad = fullUnknownExtraction(contract);
  bad['identity.name'] = {
    value: 'Tartine Bakery', confidence: 0.9, provenance: 'ai_generated', status: 'missing',
  };
  const good = fullUnknownExtraction(contract);
  const ai = new WebloomAI({ providers: [
    new StubProvider('bad', bad),
    new StubProvider('good', good),
  ] });
  const result = await ai.run('extraction.business_profile', {
    rawBusinessData: {},
    evidence: [{ source: 'google_maps_page', text: 'Tartine Bakery\nMeera Marg' }],
  }, { provider: 'bad,good', onFail: 'unknown' });

  assert.equal(result.inference.provider, 'good');
  assert.ok(result.__attempts.some((a) => a.provider === 'bad' && !a.ok));
});

checkAsync('run() with generic task and onFail throw surfaces a typed error when all providers fail', async () => {
  const ai = new WebloomAI();
  await assert.rejects(
    () => ai.run('brand.dna', { profile: {} }, { provider: 'fallback' }),
    /All providers failed|cannot serve non-envelope/,
  );
});

checkAsync('run() leaves generative tasks ungrounded by default', async () => {
  const output = {
    businessIdentity: {},
    audience: { primary: 'Everyone' },
    customerIntent: {},
    painPoints: [],
    services: { core: ['x'] },
    trustSignals: [],
    brandPersonality: {},
    positioning: {},
    conversionStrategy: { primaryCTA: { text: 'go', action: 'call' } },
  };
  const ai = new WebloomAI({ providers: [new StubProvider('stub', output)] });
  const result = await ai.run('brand.dna', { profile: { name: 'X' } }, { provider: 'stub' });
  assert.equal(result.inference.grounding.mode, 'off');
});

/* ------------------------------------------------------------------ */
/* F. Model registry (temp file)                                       */
/* ------------------------------------------------------------------ */

reloadRegistry();

check('registerModel stores and validates metadata', () => {
  const stored = registerModel({
    id: 'webloom-ai-test-0.0.1',
    type: 'webloom',
    foundationModel: 'Qwen/Qwen2.5-7B-Instruct',
    promptVersion: 'webloom-tasks-v1',
    datasetVersions: { train: ['extraction@v0.1.0'] },
  });
  assert.equal(stored.status, 'configured');
  assert.equal(getModel('webloom-ai-test-0.0.1').id, 'webloom-ai-test-0.0.1');
  assert.throws(() => registerModel({ id: 'missing-fields' }), /Invalid model metadata/);
});

check('setActiveModel / getActiveModel with demotion semantics', () => {
  registerModel({ id: 'webloom-ai-test-prod-0.0.1', type: 'webloom', status: 'evaluated' });
  setActiveModel('production', 'webloom-ai-test-prod-0.0.1');
  assert.equal(getActiveModel('production').id, 'webloom-ai-test-prod-0.0.1');
  assert.throws(() => setActiveModel('production', 'does-not-exist'), /Cannot activate unknown model/);
  const first = getActiveModel('production');
  registerModel({ id: 'webloom-ai-test-prod-0.0.2', type: 'webloom', status: 'evaluated' });
  setActiveModel('production', 'webloom-ai-test-prod-0.0.2');
  assert.equal(getActiveModel('production').id, 'webloom-ai-test-prod-0.0.2');
  assert.ok(getModel(first.id), 'demoted model record stays in registry');
});

check('recordBenchmark flips status configured→evaluated and appends', () => {
  recordBenchmark('webloom-ai-test-0.0.1', {
    runId: 'bench-x',
    datasetVersion: 'v0.1.0',
    split: 'holdout',
    tasks: ['extraction.business_profile'],
    backend: 'echo',
    provider: 'echo',
    metrics: { f1: 1, hallucinationRate: 0 },
  });
  const model = getModel('webloom-ai-test-0.0.1');
  assert.equal(model.status, 'evaluated');
  assert.equal(model.benchmarks.length, 1);
});

check('compareModels reports deltas on shared runs', () => {
  recordBenchmark('webloom-ai-test-prod-0.0.1', {
    runId: 'bench-compare',
    datasetVersion: 'v0.1.0',
    split: 'holdout',
    tasks: ['extraction.business_profile'],
    backend: 'echo',
    provider: 'echo',
    metrics: { f1: 0.8, hallucinationRate: 0.05 },
  });
  recordBenchmark('webloom-ai-test-prod-0.0.2', {
    runId: 'bench-compare-b',
    datasetVersion: 'v0.1.0',
    split: 'holdout',
    tasks: ['extraction.business_profile'],
    backend: 'echo',
    provider: 'echo',
    metrics: { f1: 0.95, hallucinationRate: 0.01 },
  });
  const cmp = compareModels('webloom-ai-test-prod-0.0.1', 'webloom-ai-test-prod-0.0.2');
  assert.ok(cmp.comparisons.length >= 1);
  assert.ok(cmp.comparisons[0].deltas.f1.delta > 0);
});

check('bumpVersion handles major/minor/patch', () => {
  assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(bumpVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(bumpVersion('0.1.0', 'major'), '1.0.0');
  assert.throws(() => bumpVersion('abc'), /Not a semver/);
});

/* ------------------------------------------------------------------ */
/* G. Correction store (temp file)                                     */
/* ------------------------------------------------------------------ */

check('recordCorrection validates and persists, listCorrections filters', () => {
  const c = recordCorrection({
    taskId: 'extraction.business_profile',
    fieldPath: 'contact.phone',
    originalValue: '+91 99999 99999',
    correctedValue: '+91 98765 43210',
    reason: 'hallucination',
    correctedBy: 'human-01',
    source: 'production',
  });
  assert.equal(c.correctionId.length > 0, true);
  const all = listCorrections();
  assert.equal(all.length, 1);
  const filtered = listCorrections({ taskId: 'brand.dna' });
  assert.equal(filtered.length, 0);
  assert.throws(() => recordCorrection({ taskId: 'x', reason: 'banana', correctedBy: 'u', source: 'production' }), /Invalid correction/);
});

check('correctionsToExampleDrafts creates needs_annotation drafts', () => {
  const drafts = correctionsToExampleDrafts('extraction.business_profile');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].annotation.status, 'needs_annotation');
  assert.equal(drafts[0].expectedOutput, '+91 98765 43210');
});

/* ------------------------------------------------------------------ */

await runChecks();

console.log(`\nAI foundation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Failures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}