/**
 * Tests for Phase 3 — fine-tuning pipeline foundation.
 *
 *   A. Experiment config — finetune/configs/webloom-v0.1.json is a valid,
 *      complete, single-source-of-truth experiment definition.
 *   B. Formatted rows — train+validation JSONL carry pinned prompts and the
 *      meta block (evidence, provenanceSources, failureCategories, split),
 *      never holdout rows.
 *   C. Holdout protection — the automated guard (protect_holdout.mjs) passes
 *      clean input and fails loud (non-zero, HOLDOUT LEAK) on any holdout id
 *      appearing in a formatted training file.
 *   D. Registry candidate — webloom-ai-v0.1.0 is registered (type webloom,
 *      status configured), resolves through the provider for opt-in use, and
 *      is NOT servable until trained + promoted.
 *   E. Commands wiring — npm scripts ai:finetune:validate/finetune/evaluate
 *      and ai:model:load exist; run artifacts are gitignored.
 *
 * Run: node test_ai_finetune.js
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './test_env_ai.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const API_ROOT = path.join(REPO_ROOT, 'apps/api');
const NODE = process.execPath;

let passed = 0;
let failed = 0;
const failures = [];
const pendingChecks = [];

function check(name, fn) {
  pendingChecks.push([name, fn]);
}

async function runChecks() {
  for (const [name, fn] of pendingChecks) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      failed += 1;
      failures.push({ name, error });
    }
  }
}

// ---------------------------------------------------------------- A. Config
const CONFIG = path.join(REPO_ROOT, 'finetune/configs/webloom-v0.1.json');
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
}

check('A1: config file exists and is single source', () => {
  const legacy = ['lora.json', 'train.json', 'tokenizer.json'];
  for (const f of legacy) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'finetune/configs', f)), false, `${f} must be consolidated into webloom-v0.1.json`);
  }
});

check('A2: experiment metadata is complete', () => {
  const exp = loadConfig().experiment;
  assert.equal(exp.id, 'webloom-v0.1');
  assert.equal(exp.foundationModel, 'Qwen/Qwen2.5-7B-Instruct');
  assert.equal(exp.registryModelId, 'webloom-ai-v0.1.0');
  assert.equal(exp.status, 'configured');
});

check('A3: conservative training block with bounded epochs', () => {
  const t = loadConfig().training;
  assert.ok(t.learningRate > 0 && t.learningRate <= 5e-4, `learningRate ${t.learningRate}`);
  assert.ok(Number.isInteger(t.numTrainEpochs) && t.numTrainEpochs >= 1 && t.numTrainEpochs <= 50);
  assert.equal(Number.isInteger(t.seed), true);
  assert.equal(t.evalStrategy, 'steps');
  assert.equal(t.metricForBestModel, 'eval_loss');
  assert.equal(t.outputDir.startsWith('finetune/runs/'), true, `outputDir ${t.outputDir} must live under finetune/runs/`);
});

check('A4: data block enforces holdout isolation', () => {
  const d = loadConfig().data;
  assert.deepEqual(d.trainSplits, ['train', 'validation']);
  assert.equal(d.holdoutNeverTrained, true);
  assert.ok(d.maxSeqLength >= 512);
});

check('A5: LoRA + quantization blocks are explicit', () => {
  const l = loadConfig().lora;
  const q = loadConfig().quantization;
  assert.ok(Number.isInteger(l.r) && l.r >= 1 && l.r <= 64);
  assert.ok(Array.isArray(l.targetModules) && l.targetModules.length > 0);
  assert.equal(l.taskType, 'CAUSAL_LM');
  assert.equal(q.enabled, true);
  assert.equal(q.bits, 4);
});

// --------------------------------------------------- B. Formatted row shape
const TRAIN_ROW = path.join(REPO_ROOT, 'finetune/format/extraction@v0.1.0/train.jsonl');

check('B1: train rows keep pinned prompt + assistant gold', () => {
  const lines = fs.readFileSync(TRAIN_ROW, 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length === 4, `expected 4 extraction train rows, got ${lines.length}`);
  const row = JSON.parse(lines[0]);
  assert.equal(typeof row.exampleId, 'string');
  assert.equal(row.promptVersion, 'webloom-tasks-v1');
  assert.ok(['system', 'user', 'assistant'].every((r, i) => row.messages[i].role === r));
  const assistant = row.messages[2];
  assert.equal(typeof JSON.parse(assistant.content), 'object');
});

check('B2: validation split is formatted too', () => {
  const p = path.join(REPO_ROOT, 'finetune/format/extraction@v0.1.0/validation.jsonl');
  assert.ok(fs.existsSync(p), 'validation.jsonl must exist');
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length >= 1);
});

check('B3: meta preserves evidence/provenance/failure-categories/split', () => {
  const row = JSON.parse(fs.readFileSync(TRAIN_ROW, 'utf8').split('\n')[0]);
  const meta = row.meta;
  assert.equal(meta.split, 'train');
  assert.ok(Array.isArray(meta.provenanceSources) && meta.provenanceSources.length > 0, 'provenanceSources must be derived from evidence');
  assert.ok(Array.isArray(meta.evidence) && meta.evidence.length > 0, 'evidence must be preserved');
  const firstSource = meta.evidence[0];
  assert.ok(typeof firstSource.source === 'string' && firstSource.source.length > 0, 'evidence source label required');
  assert.ok(Array.isArray(meta.failureCategories), 'baseline failure categories must be carried');
  assert.equal(meta.confidence, null, 'confidence must stay null (runtime measurement), never fabricated');
  assert.equal(meta.uncertainty, null);
});

// ------------------------------------------------- C. Holdout protection
function guardWithFormatDir(dir) {
  return execFileSync(NODE, [path.join(REPO_ROOT, 'finetune/scripts/protect_holdout.mjs'), '--format', dir], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

function makeTempFormat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webloom-guard-'));
  fs.mkdirSync(path.join(dir, 'extraction@v0.1.0'));
  return dir;
}

check('C1: clean formatted dir passes the guard', () => {
  const dir = makeTempFormat();
  fs.writeFileSync(path.join(dir, 'extraction@v0.1.0/train.jsonl'), JSON.stringify({
    exampleId: 'ext-tartine-001', task: 'extraction.business_profile', split: 'train',
    meta: { split: 'train', evidence: [], provenanceSources: [], failureCategories: [] },
    messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{}' }],
  }) + '\n', 'utf8');
  const out = guardWithFormatDir(dir);
  assert.match(out, /Holdout guard PASS/, out);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('C2: a holdout exampleId in a training file fails loud', () => {
  const dir = makeTempFormat();
  fs.writeFileSync(path.join(dir, 'extraction@v0.1.0/train.jsonl'), JSON.stringify({
    exampleId: 'ext-skyline-001', task: 'extraction.business_profile', split: 'train',
    meta: { split: 'train', evidence: [], provenanceSources: [], failureCategories: [] },
    messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{}' }],
  }) + '\n', 'utf8');
  let threw = null;
  try {
    guardWithFormatDir(dir);
  } catch (error) {
    threw = error;
  }
  assert.ok(threw, 'guard must exit non-zero');
  const stderrAndStdout = `${threw.stdout ?? ''}${threw.stderr ?? ''}`;
  assert.match(stderrAndStdout, /HOLDOUT LEAK/, stderrAndStdout);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('C3: an unknown exampleId in a training file fails loud', () => {
  const dir = makeTempFormat();
  fs.writeFileSync(path.join(dir, 'extraction@v0.1.0/train.jsonl'), JSON.stringify({
    exampleId: 'ext-doesnotexist-999', task: 'extraction.business_profile', split: 'train',
    meta: { split: 'train', evidence: [], provenanceSources: [], failureCategories: [] },
    messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{}' }],
  }) + '\n', 'utf8');
  let threw = null;
  try {
    guardWithFormatDir(dir);
  } catch (error) {
    threw = error;
  }
  assert.ok(threw, 'guard must exit non-zero');
  assert.match(`${threw.stdout ?? ''}${threw.stderr ?? ''}`, /not in the manifest/);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('C4: formatted files never contain holdout ids or businesses', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
  const holdoutIds = new Set();
  const holdoutBusiness = new Set();
  for (const e of manifest.datasets.filter((x) => x.split === 'holdout')) {
    for (const line of fs.readFileSync(path.join(REPO_ROOT, 'datasets', e.path), 'utf8').split('\n').filter(Boolean)) {
      const x = JSON.parse(line);
      holdoutIds.add(x.exampleId);
      const b = x.input?.rawBusinessData?.name ?? x.input?.profile?.businessName ?? x.input?.profile?.name;
      if (b) holdoutBusiness.add(b);
    }
  }
  for (const dir of fs.readdirSync(path.join(REPO_ROOT, 'finetune/format'))) {
    const d = path.join(REPO_ROOT, 'finetune/format', dir);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of ['train.jsonl', 'validation.jsonl']) {
      const file = path.join(d, f);
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        assert.equal(holdoutIds.has(row.exampleId), false, `holdout id ${row.exampleId} in ${file}`);
        assert.equal(row.meta?.split, f.replace('.jsonl', ''), `meta.split mismatch in ${file}`);
      }
    }
  }
});

// ------------------------------------------------------ D. Registry candidate
// test_env_ai.js redirects the registry to a temp file, so D1 registers the
// candidate into that fixture (validates against the metadata schema) instead
// of assuming the real models/registry.json is present.
const CANDIDATE_METADATA = () => ({
  id: 'webloom-ai-v0.1.0',
  type: 'webloom',
  foundationModel: 'Qwen/Qwen2.5-7B-Instruct',
  provider: 'local',
  servingModel: 'qwen2.5-7b-webloom-v0.1',
  quantization: 'nf4-qlora',
  license: 'Apache-2.0',
  promptVersion: 'webloom-tasks-v1',
  datasetVersions: {
    extraction: 'v0.1.0', 'business-dna': 'v0.1.0',
    'website-analysis': 'v0.1.0', strategy: 'v0.1.0',
    'evaluation-validation': 'v0.1.0',
  },
  trainingConfig: { experimentId: 'webloom-v0.1', baseModel: 'Qwen/Qwen2.5-7B-Instruct', learningRate: 0.0002, epochs: 8, seed: 17 },
  loraConfig: { r: 8, alpha: 16, dropout: 0.05 },
  status: 'configured',
});

check('D1: candidate registers with honest metadata', async () => {
  const { registerModel, getModel } = await import('./src/ai/modelRegistry.js');
  const rec = registerModel(CANDIDATE_METADATA());
  assert.equal(rec.status, 'configured', 'no trained adapter yet — no candidate/improvement claim');
  assert.equal(getModel('webloom-ai-v0.1.0').type, 'webloom');
  assert.equal(rec.foundationModel, 'Qwen/Qwen2.5-7B-Instruct', 'same base as baseline for a clean comparison');
  assert.equal(rec.quantization, 'nf4-qlora');
  assert.ok(rec.trainingConfig && rec.loraConfig, 'training + LoRA configs must be pinned');
  assert.equal(Object.keys(rec.datasetVersions).includes('evaluation-holdout'), false, 'holdout must never appear in candidate datasetVersions');
});

check('D2: provider resolves the candidate opt-in and stays unservable', async () => {
  const { createProvider } = await import('./src/ai/providers/index.js');
  const p = createProvider('webloom', { modelId: 'webloom-ai-v0.1.0' });
  assert.equal(p.type, 'webloom');
  assert.equal(p.modelId, 'webloom-ai-v0.1.0');
  assert.equal(p.model, 'qwen2.5-7b-webloom-v0.1');
  assert.equal(p.isConfigured(), false, 'configured-but-untrained model must NOT serve');
  await assert.rejects(() => p.run({ prompt: 'x', schema: null }), /not configured/i);
});

check('D3: candidate is never the auto default', async () => {
  const { resolveProviders } = await import('./src/ai/providers/index.js');
  const providers = resolveProviders(['webloom'], { modelId: 'webloom-ai-v0.1.0' });
  assert.deepEqual(providers, [], 'unconfigured webloom must drop out of the chain');
});

// ------------------------------------------------------- E. Commands wiring
check('E1: npm scripts exist and point at real files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(API_ROOT, 'package.json'), 'utf8'));
  for (const script of ['ai:finetune:validate', 'ai:finetune', 'ai:finetune:evaluate', 'ai:model:load', 'ai:dataset:format']) {
    assert.ok(pkg.scripts[script], `missing script ${script}`);
  }
  assert.ok(pkg.scripts['ai:finetune:validate'].includes('protect_holdout.mjs'));
  assert.ok(pkg.scripts['ai:finetune'].includes('../../finetune'), 'finetune command must frame the training entrypoint');
});

check('E2: run output is gitignored', () => {
  const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /finetune\/runs\//);
  assert.match(gitignore, /finetune\/\.venv\//);
});

check('E3: model load check reports configured state', () => {
  // Point the child at the REAL registry (test_env_ai.js redirected it to temp).
  const env = {
    ...process.env,
    WEBLOOM_MODELS_DIR: path.join(REPO_ROOT, 'models'),
    WEBLOOM_MODEL_REGISTRY: path.join(REPO_ROOT, 'models/registry.json'),
  };
  const out = execFileSync(NODE, [path.join(REPO_ROOT, 'finetune/scripts/model_load_check.mjs'), '--model', 'webloom-ai-v0.1.0'], {
    encoding: 'utf8', cwd: REPO_ROOT, env,
  });
  assert.match(out, /webloom-ai-v0\.1\.0/);
  assert.match(out, /status\s+: configured/);
});

// -------------------------------------------------------------------- run
runChecks().then(() => {
  for (const { name, error } of failures) {
    console.error(`✗ ${name}\n  ${error?.message ?? error}`);
  }
  console.log(`test_ai_finetune: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});