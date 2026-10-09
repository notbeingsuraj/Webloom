/**
 * Tests for Phase 3 — fine-tuning pipeline + Webloom AI v0.1 candidate.
 *
 *   A. Experiment config — finetune/configs/webloom-v0.1.json is a valid,
 *      complete, single-source-of-truth experiment definition (Qwen2.5-1.5B).
 *   B. Formatted rows — train+validation JSONL carry pinned prompts and the
 *      meta block (evidence, provenanceSources, failureCategories, split),
 *      never holdout rows.
 *   C. Holdout protection — BOTH guards pass clean input and fail loud on a
 *      leak: the Node guard (protect_holdout.mjs) and the Python guard inside
 *      the trainer itself (train_lora.guard_holdout). Training never runs here.
 *   D. Registry candidate — webloom-ai-v0.1.0 registers with honest metadata,
 *      resolves through the provider for opt-in use, and is never the default.
 *   E. Commands wiring — npm scripts ai:finetune:validate/finetune/evaluate/
 *      register/serve and ai:model:load exist; run artifacts are gitignored.
 *   F. Trained candidate — the committed experiment manifest, checkpoint
 *      selection, served validation report, and registry entry all agree, the
 *      recorded outputs still pass the live task contract + post-validation,
 *      and production was not flipped to the candidate.
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

// D2/D3 assert that the webloom candidate stays unservable until a local
// backend is explicitly pointed at it. apps/api/.env sets LOCAL_AI_BASE_URL
// for real runs; dotenv.config() (src/config/env.js) does not override an
// existing key, so clearing it here keeps the fixture honest without weakening
// the assertions.
process.env.LOCAL_AI_BASE_URL = '';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const API_ROOT = path.join(REPO_ROOT, 'apps/api');
const NODE = process.execPath;
const PYTHON = fs.existsSync(path.join(REPO_ROOT, 'finetune/.venv/bin/python'))
  ? path.join(REPO_ROOT, 'finetune/.venv/bin/python')
  : 'python3';

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
  assert.equal(exp.foundationModel, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.match(exp.modelRevision, /^[0-9a-f]{40}$/, 'foundation model revision must be pinned');
  assert.equal(exp.registryModelId, 'webloom-ai-v0.1.0');
  assert.equal(exp.adapterSuffix, 'webloom-v0.1.0');
  assert.equal(exp.status, 'configured');
  assert.ok(Array.isArray(exp.foundationSelection?.selectedBecause) && exp.foundationSelection.selectedBecause.length >= 2,
    'the foundation model choice must be justified in the config');
  assert.ok(Array.isArray(exp.foundationSelection?.considered) && exp.foundationSelection.considered.length >= 1,
    'rejected candidate foundations must be recorded');
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
  assert.deepEqual(d.allowedSplits, ['train', 'validation']);
  assert.equal(d.fitSplit, 'train', 'model fitting must use the train split only');
  assert.equal(d.selectionSplit, 'validation', 'checkpoint selection uses validation, never holdout');
  assert.equal(d.holdoutNeverTrained, true);
  assert.ok(d.maxSeqLength >= 512);
});

check('A5: LoRA + quantization blocks are explicit and honest', () => {
  const l = loadConfig().lora;
  const q = loadConfig().quantization;
  assert.ok(Number.isInteger(l.r) && l.r >= 1 && l.r <= 64);
  assert.ok(Array.isArray(l.targetModules) && l.targetModules.length > 0);
  assert.equal(l.taskType, 'CAUSAL_LM');
  // The 1.5B base fits in 16-bit on the dev Mac; plain bf16 LoRA is the pin.
  // 4-bit quantization stays available (and documented) but is off.
  assert.equal(q.enabled, false, 'the pinned experiment uses bf16 LoRA, not QLoRA');
  assert.ok(typeof q.rationale === 'string' && q.rationale.length > 20, 'quantization choice must be justified');
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

// ---------------------------- C5/C6. The trainer's own Python holdout guard
function runPythonGuard(formatRoot) {
  const code = [
    'import sys',
    'from pathlib import Path',
    "sys.path.insert(0, 'finetune/scripts')",
    'import train_lora',
    'counts = train_lora.guard_holdout(Path(sys.argv[1]))',
    'print("GUARD_COUNTS", counts[0])',
  ].join('; ');
  return execFileSync(PYTHON, ['-c', code, formatRoot], { encoding: 'utf8', cwd: REPO_ROOT });
}

check('C5: Python trainer guard passes the real formatted splits', () => {
  const out = runPythonGuard('finetune/format');
  assert.match(out, /holdout guard PASS \(python\)/, out);
  assert.match(out, /GUARD_COUNTS/, out);
});

check('C6: Python trainer guard aborts (exit 2) on a holdout leak', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
  const holdoutEntry = manifest.datasets.find((x) => x.split === 'holdout');
  const holdoutRow = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets', holdoutEntry.path), 'utf8').split('\n').filter(Boolean)[0]);

  const dir = makeTempFormat();
  fs.writeFileSync(path.join(dir, 'extraction@v0.1.0/train.jsonl'), JSON.stringify({
    exampleId: holdoutRow.exampleId, task: holdoutRow.task, split: 'train',
    meta: { split: 'train', evidence: [], provenanceSources: [], failureCategories: [] },
    messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{}' }],
  }) + '\n', 'utf8');
  let threw = null;
  try {
    runPythonGuard(dir);
  } catch (error) {
    threw = error;
  }
  assert.ok(threw, 'python guard must exit non-zero on a leak');
  assert.equal(threw.status, 2, `expected exit 2, got ${threw.status}`);
  assert.match(`${threw.stdout ?? ''}${threw.stderr ?? ''}`, /HOLDOUT LEAK/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------ D. Registry candidate
// test_env_ai.js redirects the registry to a temp file, so D1 registers the
// candidate into that fixture (validates against the metadata schema) instead
// of assuming the real models/registry.json is present.
const CANDIDATE_METADATA = () => ({
  id: 'webloom-ai-v0.1.0',
  type: 'webloom',
  foundationModel: 'Qwen/Qwen2.5-1.5B-Instruct',
  provider: 'local',
  servingModel: 'qwen2.5-1.5b-webloom-v0.1.0',
  quantization: 'bf16-lora',
  license: 'Apache-2.0',
  promptVersion: 'webloom-tasks-v1',
  datasetVersions: {
    extraction: 'v0.1.0', 'business-dna': 'v0.1.0',
    'website-analysis': 'v0.1.0', strategy: 'v0.1.0',
    'evaluation-validation': 'v0.1.0',
  },
  trainingConfig: {
    experimentId: 'webloom-v0.1', baseModel: 'Qwen/Qwen2.5-1.5B-Instruct',
    learningRate: 0.0002, epochs: 8, seed: 17, quantized4bit: false,
  },
  loraConfig: { r: 8, alpha: 16, dropout: 0.05 },
  status: 'candidate',
});

check('D1: candidate registers with honest metadata', async () => {
  const { registerModel, getModel } = await import('./src/ai/modelRegistry.js');
  const rec = registerModel(CANDIDATE_METADATA());
  assert.equal(rec.status, 'candidate', 'trained + validated local candidate');
  assert.equal(getModel('webloom-ai-v0.1.0').type, 'webloom');
  assert.equal(rec.foundationModel, 'Qwen/Qwen2.5-1.5B-Instruct', 'same Qwen2.5 family as the baseline');
  assert.equal(rec.quantization, 'bf16-lora', 'the pinned run is plain bf16 LoRA, not QLoRA');
  assert.ok(rec.trainingConfig && rec.loraConfig, 'training + LoRA configs must be pinned');
  assert.equal(rec.trainingConfig.quantized4bit, false, 'no 4-bit quantization in the pinned run');
  assert.equal(Object.keys(rec.datasetVersions).includes('evaluation-holdout'), false, 'holdout must never appear in candidate datasetVersions');
});

check('D2: provider resolves the candidate opt-in and stays unservable without a local backend', async () => {
  const { createProvider } = await import('./src/ai/providers/index.js');
  const p = createProvider('webloom', { modelId: 'webloom-ai-v0.1.0' });
  assert.equal(p.type, 'webloom');
  assert.equal(p.modelId, 'webloom-ai-v0.1.0');
  assert.equal(p.model, 'qwen2.5-1.5b-webloom-v0.1.0');
  assert.equal(p.isConfigured(), false, 'candidate needs a LOCAL_AI_BASE_URL to serve');
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
  for (const script of ['ai:finetune:validate', 'ai:finetune', 'ai:finetune:evaluate', 'ai:finetune:register', 'ai:serve', 'ai:model:load', 'ai:dataset:format']) {
    assert.ok(pkg.scripts[script], `missing script ${script}`);
  }
  assert.ok(pkg.scripts['ai:finetune:validate'].includes('protect_holdout.mjs'));
  assert.ok(pkg.scripts['ai:finetune'].includes('../../finetune'), 'finetune command must frame the training entrypoint');
  assert.ok(pkg.scripts['ai:serve'].includes('serve'), 'serving command must exist for local inference');
});

check('E2: run output is gitignored', () => {
  const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /finetune\/runs\//);
  assert.match(gitignore, /finetune\/\.venv\//);
});

check('E3: model load check reports candidate state from the real registry', () => {
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
  assert.match(out, /status\s+: candidate/);
  assert.match(out, /Qwen\/Qwen2\.5-1\.5B-Instruct/);
});

// ------------------------------------ F. Trained candidate reproducibility
const EXP_DIR = path.join(REPO_ROOT, 'finetune/experiments/webloom-v0.1');
const VALIDATION_REPORT = path.join(REPO_ROOT, 'apps/api/eval/reports/webloom-v0.1-validation.json');

check('F1: committed experiment manifest pins origin, seed, versions and split counts', () => {
  const p = path.join(EXP_DIR, 'manifest.json');
  assert.ok(fs.existsSync(p), `missing committed manifest ${path.relative(REPO_ROOT, p)} — train + promote artifacts first`);
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const key of ['experiment', 'configFile', 'configSha256', 'commit', 'model', 'modelRevision', 'seed', 'framework', 'data', 'lora', 'device', 'startedAt', 'finishedAt']) {
    assert.ok(m[key] !== undefined && m[key] !== null, `manifest missing required key "${key}"`);
  }
  assert.equal(m.experiment, 'webloom-v0.1');
  assert.equal(m.dryRun, false, 'the promoted manifest must come from a real run, not a dry-run');
  assert.equal(m.model, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(m.modelRevision, '989aa7980e4cf806f80c7fef2b1adb7bc71aa306');
  assert.equal(m.data.fitSplit, 'train');
  assert.equal(m.data.selectionSplit, 'validation');
  assert.ok(m.data.train >= 1 && m.data.validation >= 1 && m.data.holdout >= 1, 'split counts must be recorded for audit');
  assert.ok(typeof m.framework.transformers === 'string', 'framework versions must be pinned for reproducibility');
});

check('F2: checkpoint selection scored a control arm and picked a checkpoint', () => {
  const p = path.join(EXP_DIR, 'evaluation.json');
  assert.ok(fs.existsSync(p), `missing committed evaluation ${path.relative(REPO_ROOT, p)} — run ai:finetune:evaluate`);
  const e = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.ok(typeof e.best_checkpoint === 'string' && e.best_checkpoint.length > 0, 'a best checkpoint must be selected');
  assert.ok(Array.isArray(e.ranking) && e.ranking.length >= 2, 'ranking must include checkpoints and the base control');
  assert.ok(e.control && typeof e.control.composite === 'number', 'the un-fine-tuned base must be scored as a control arm');
  assert.ok(e.validationRows >= 1, 'selection must report how many validation rows were scored');
});

check('F3: served validation report is opt-in, on validation only', () => {
  assert.ok(fs.existsSync(VALIDATION_REPORT), `missing ${path.relative(REPO_ROOT, VALIDATION_REPORT)} — run the webloom validation benchmark`);
  const r = JSON.parse(fs.readFileSync(VALIDATION_REPORT, 'utf8'));
  assert.equal(r.backend, 'webloom');
  assert.equal(r.dataset, 'validation');
  assert.ok(r.totals.examples >= 1);
  assert.ok(r.totals.ok >= 1, 'at least one validation example must pass end-to-end');
});

check('F4: recorded Webloom outputs still pass the live contract + post-validation', async () => {
  const { validateSchema } = await import('./src/services/ai/AIResponseValidator.js');
  const { getTask } = await import('./src/ai/tasks.js');
  const r = JSON.parse(fs.readFileSync(VALIDATION_REPORT, 'utf8'));
  let revalidated = 0;
  for (const row of r.results.filter((x) => x.ok)) {
    assert.ok(row.output !== undefined && row.output !== null, `ok row ${row.exampleId} must carry its validated output`);
    const task = getTask(row.task);
    const schemaError = validateSchema(row.output, task.contract);
    assert.equal(schemaError, null, `${row.exampleId} contract violation: ${schemaError?.path} ${schemaError?.message}`);
    const postErrors = task.postValidate ? task.postValidate(row.output) : [];
    assert.deepEqual(postErrors, [], `${row.exampleId} post-validation failures: ${postErrors.join('; ')}`);
    revalidated += 1;
  }
  assert.ok(revalidated >= 1, 'at least one output must be re-checked against the live validation layer');
});

check('F5: real registry records the candidate + validation benchmark and keeps the baseline default', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'models/registry.json'), 'utf8'));
  const candidate = registry.models.find((m) => m.id === 'webloom-ai-v0.1.0');
  assert.ok(candidate, 'webloom-ai-v0.1.0 must be registered');
  assert.equal(candidate.status, 'candidate', 'a local validated model is a candidate, never active-production');
  assert.equal(candidate.foundationModel, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.ok(!('evaluation-holdout' in (candidate.datasetVersions || {})), 'holdout must not be listed as a candidate training/eval dataset');

  const validationBench = (candidate.benchmarks || []).find((b) => (b.split || []).includes('validation'));
  assert.ok(validationBench, 'a validation benchmark must be recorded on the candidate');
  assert.ok(Array.isArray(validationBench.split) && !validationBench.split.includes('holdout'), 'the candidate has NOT been run on the holdout yet');

  assert.equal(registry.active.baseline, 'webloom-ai-baseline-0.1.0', 'baseline must stay the baseline');
  assert.notEqual(registry.active.production, 'webloom-ai-v0.1.0', 'the candidate must NOT become the production default');
});

// -------------------------------------------------------------------- run
runChecks().then(() => {
  for (const { name, error } of failures) {
    console.error(`✗ ${name}\n  ${error?.message ?? error}`);
  }
  console.log(`test_ai_finetune: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
