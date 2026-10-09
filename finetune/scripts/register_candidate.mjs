#!/usr/bin/env node
/**
 * Register Webloom AI v0.1 in models/registry.json from the experiment
 * artifacts — no hand-typed metrics, no registry drift.
 *
 * Reads (in order of authority):
 *   finetune/configs/webloom-v0.1.json        pinned experiment definition
 *   finetune/experiments/<id>/manifest.json   training run (written by train_lora.py)
 *   finetune/experiments/<id>/evaluation.json validation checkpoint selection
 *   apps/api/eval/reports/webloom-v0.1-validation.json   (optional) served
 *     validation benchmark → recorded via recordBenchmark()
 *
 * Status is set to `candidate` — never `active-production`. The baseline stays
 * the default; promotion is decided only by the untouched holdout benchmark.
 *
 * Usage: node finetune/scripts/register_candidate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../apps/api/src/ai/paths.js';
import { registerModel, recordBenchmark } from '../../apps/api/src/ai/modelRegistry.js';

const CONFIG = path.join(REPO_ROOT, 'finetune/configs/webloom-v0.1.json');
const EXP_DIR = path.join(REPO_ROOT, 'finetune/experiments');
const REPORT = path.join(REPO_ROOT, 'apps/api/eval/reports/webloom-v0.1-validation.json');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function round(n, places = 4) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * 10 ** places) / 10 ** places;
}

function aggregateReport(report) {
  const ok = report.results.filter((r) => r.ok);
  const envelopeSummaries = Object.values(report.perTask)
    .map((t) => t.summary)
    .filter((s) => s.envelope);
  const sums = envelopeSummaries.reduce(
    (a, s) => ({
      tp: a.tp + s.envelope.tp, fp: a.fp + s.envelope.fp,
      fn: a.fn + s.envelope.fn, tn: a.tn + s.envelope.tn,
      n: a.n + s.examples,
    }),
    { tp: 0, fp: 0, fn: 0, tn: 0, n: 0 },
  );
  const precision = sums.tp + sums.fp > 0 ? sums.tp / (sums.tp + sums.fp) : null;
  const recall = sums.tp + sums.fn > 0 ? sums.tp / (sums.tp + sums.fn) : null;
  const f1 = precision != null && recall != null && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall) : null;

  const generative = Object.values(report.perTask)
    .map((t) => t.summary)
    .filter((s) => s.genericCoverage != null);
  const genCoverage = generative.length
    ? generative.reduce((a, s) => a + s.genericCoverage * s.examples, 0)
      / generative.reduce((a, s) => a + s.examples, 0)
    : null;

  const grounding = ok.reduce(
    (a, r) => ({
      grounded: a.grounded + (r.groundingReport?.grounded ?? 0),
      unsupported: a.unsupported + (r.groundingReport?.unsupported ?? 0),
      unverifiable: a.unverifiable + (r.groundingReport?.unverifiable ?? 0),
    }),
    { grounded: 0, unsupported: 0, unverifiable: 0 },
  );

  const confidences = ok
    .map((r) => r.inference?.confidence?.overall)
    .filter((c) => typeof c === 'number');
  const meanConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  const exactMatches = envelopeSummaries.length
    ? envelopeSummaries.filter((s) => s.envelope.fp === 0 && s.envelope.fn === 0).length
    : null;

  return {
    examples: report.totals.examples,
    ok: report.totals.ok,
    pctOk: report.totals.pctOk,
    envelope: f1 != null ? {
      microPrecision: round(precision),
      microRecall: round(recall),
      microF1: round(f1),
      hallucinationRate: round(sums.tp + sums.fp > 0 ? sums.fp / (sums.tp + sums.fp) : 0),
      missRate: round(sums.tp + sums.fn > 0 ? sums.fn / (sums.tp + sums.fn) : 0),
      exactMatchTasks: exactMatches,
      envelopeTasks: envelopeSummaries.length,
    } : null,
    generativeCoverage: genCoverage != null ? round(genCoverage) : null,
    grounding,
    confidence: meanConfidence != null ? { mean: round(meanConfidence) } : null,
    avgLatencyMs: report.totals.avgLatencyMs,
  };
}

function weaknessesFrom(report, evaluation, metrics) {
  const out = [];
  const failures = report.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    out.push(`${failures.length}/${report.totals.examples} validation examples failed the pipeline: `
      + failures.slice(0, 3).map((f) => `${f.task} (${String(f.error).slice(0, 60)})`).join('; ')
      + (failures.length > 3 ? ' …' : ''));
  }
  const contractFails = report.results.filter((r) => r.ok && r.schemaCompliant === false).length;
  if (contractFails > 0) out.push(`${contractFails} outputs passed parsing but violated the task contract on validation.`);
  const unsupported = metrics?.grounding?.unsupported ?? 0;
  if (unsupported > 0) out.push(`${unsupported} generated claims were unsupported by evidence on validation (grounding enforcement caught them).`);
  if (evaluation?.control && evaluation?.best) {
    const best = evaluation.ranking?.find((r) => r.checkpoint === evaluation.best_checkpoint);
    if (best && evaluation.control.composite != null && best.composite <= evaluation.control.composite) {
      out.push(`Validation composite (${best.composite}) did not beat the un-fine-tuned base control (${evaluation.control.composite}) — the adapter has not yet demonstrated improvement over the foundation model.`);
    }
  }
  out.push('Validated on the 6-example validation split only; numbers are high-variance and NOT a holdout result. No improvement claim until the untouched holdout benchmark.');
  out.push('Foundation (1.54B) is far smaller than the baseline serving model (7B): a holdout loss is plausible and must be measured, not assumed.');
  return out;
}

function main() {
  const config = readJson(CONFIG);
  if (!config) throw new Error(`missing config ${CONFIG}`);
  const expId = config.experiment.id;
  const manifest = readJson(path.join(EXP_DIR, expId, 'manifest.json'));
  if (!manifest) throw new Error(`missing experiment manifest — run \`npm run ai:finetune\` first (expected ${path.join(EXP_DIR, expId, 'manifest.json')})`);
  const evaluation = readJson(path.join(EXP_DIR, expId, 'evaluation.json'));
  const report = readJson(REPORT);

  const base = manifest.model;
  const servingModel = `${base.split('/').pop().toLowerCase().replace('-instruct', '')}-${config.experiment.adapterSuffix ?? 'webloom-v0.1'}`;
  const metrics = report ? aggregateReport(report) : null;
  const best = evaluation?.ranking?.find((r) => r.checkpoint === evaluation.best_checkpoint) ?? null;

  const metadata = {
    id: config.experiment.registryModelId,
    type: 'webloom',
    foundationModel: base,
    provider: 'local',
    servingModel,
    quantization: manifest.quantization?.enabled ? 'nf4-qlora' : `${String(manifest.dtype || 'bf16').replace('torch.', '')}-lora`,
    license: config.experiment.foundationSelection?.license ?? 'Apache-2.0',
    promptVersion: 'webloom-tasks-v1',
    datasetVersions: {
      extraction: config.data.datasetVersion,
      'business-dna': config.data.datasetVersion,
      'website-analysis': config.data.datasetVersion,
      strategy: config.data.datasetVersion,
      'evaluation-validation': config.data.validationVersion,
      // NOTE: no evaluation-holdout key — the holdout is untouched by this model.
    },
    trainingConfig: {
      baseModel: base,
      modelRevision: manifest.modelRevision ?? null,
      experimentId: expId,
      configFile: manifest.configFile,
      configSha256: manifest.configSha256,
      commit: manifest.commitShort,
      learningRate: config.training.learningRate,
      scheduler: config.training.lrSchedulerType,
      warmupSteps: manifest.schedule?.warmupSteps ?? null,
      epochs: config.training.numTrainEpochs,
      batchPerDevice: config.training.perDeviceTrainBatchSize,
      gradAccum: config.training.gradientAccumulationSteps,
      effectiveBatchSize: manifest.schedule?.effectiveBatchSize ?? null,
      seed: config.training.seed,
      maxSeqLength: config.data.maxSeqLength,
      optimizer: manifest.optimizer,
      dtype: String(manifest.dtype ?? '').replace('torch.', ''),
      quantized4bit: Boolean(manifest.quantization?.enabled),
      trainExamples: manifest.data?.train ?? null,
      validationExamples: manifest.data?.validation ?? null,
      durationSeconds: manifest.durationSeconds ?? null,
      hardware: manifest.hardware ? `${manifest.hardware.cpu ?? 'unknown'} / ${manifest.hardware.memoryGb ?? '?'} GB / device=${manifest.device}` : null,
      framework: manifest.framework ?? null,
    },
    loraConfig: {
      r: config.lora.r,
      alpha: config.lora.loraAlpha,
      dropout: config.lora.loraDropout,
      targetModules: config.lora.targetModules,
      bias: config.lora.bias,
    },
    adapter: {
      selectedCheckpoint: evaluation?.best_checkpoint ?? manifest.bestCheckpoint ?? null,
      selectionBasis: evaluation?.basis ?? null,
      controlComposite: evaluation?.control?.composite ?? null,
      artifacts: `finetune/runs/${expId}/ (gitignored) — regenerate with: npm run ai:finetune`,
      experimentManifest: `finetune/experiments/${expId}/manifest.json`,
      evaluation: `finetune/experiments/${expId}/evaluation.json`,
    },
    validation: evaluation ? {
      split: 'validation',
      rows: evaluation.validationRows ?? null,
      composite: best?.composite ?? null,
      jsonValidity: best?.jsonValidity ?? null,
      coverage: best?.coverage ?? null,
      abstentionAccuracy: best?.abstentionAccuracy ?? null,
      hallucinatedLabels: best?.hallucinatedLabels ?? null,
      controlComposite: evaluation.control?.composite ?? null,
      report: fs.existsSync(REPORT) ? path.relative(REPO_ROOT, REPORT) : null,
      servedMetrics: metrics,
    } : null,
    status: 'candidate',
    knownWeaknesses: weaknessesFrom(report, evaluation, metrics),
  };

  const record = registerModel(metadata);
  console.log(`registered ${record.id} (status=${record.status}) foundation=${record.foundationModel} serving=${record.servingModel}`);

  if (report && metrics) {
    const entry = recordBenchmark(record.id, {
      runId: `validation-${report.runId}`,
      datasetVersion: config.data.validationVersion,
      split: ['validation'],
      tasks: Object.keys(report.perTask).sort(),
      backend: 'webloom',
      provider: report.model?.provider ?? 'local',
      promptVersion: 'webloom-tasks-v1',
      metrics: {
        ...metrics,
        validationComposite: best?.composite ?? null,
        controlComposite: evaluation?.control?.composite ?? null,
      },
      notes: 'Development benchmark on the VALIDATION split (6 examples). Opt-in candidate run via --backend webloom. NOT the holdout — the decisive baseline comparison is the next phase.',
    });
    console.log(`recorded validation benchmark ${entry.runId} (${metrics.ok}/${metrics.examples} ok)`);
  } else {
    console.log('no validation report found — registry updated without a benchmark entry (run the eval step first if intended).');
  }
}

main();
