#!/usr/bin/env node
/**
 * Webloom AI benchmark runner.
 *
 * Runs an AI task dataset split through a chosen backend and reports
 * field-level metrics, hallucination rate, and (for live/baseline runs)
 * confidence calibration.
 *
 * Usage:
 *   node eval/run.js --backend echo|fallback|baseline|webloom|live
 *                    [--dataset holdout|train] [--task <taskId>]
 *                    [--max <n>] [--out <report.json>] [--grounding enforce|raw]
 *                    [--model <registryId>] [--verbose]
 *
 * Backends:
 *   echo     — returns expected outputs verbatim. Validates the harness; a
 *              perfect-score sanity backend, never a real model.
 *   fallback — deterministic UNKNOWN envelopes via the real task layer. No
 *              network; proves the runner works without a model.
 *   baseline — registered baseline foundation model (local/Ollama preferred).
 *              Requires a running model server. Explicit opt-in.
 *   webloom  — a fine-tuned Webloom registry model. Opt-in: pass --model
 *              <registryId> (e.g. webloom-ai-v0.1.0) to evaluate a candidate
 *              WITHOUT promoting it to production. Requires a serving backend.
 *   live     — production provider chain ('auto': fine-tuned → external).
 *              Requires API keys. Explicit opt-in.
 *
 * Only ever use baseline/live/webloom numbers when deciding to promote or
 * tune a model. echo/fallback numbers are harness tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/ai/paths.js';
import webloomAI from '../src/ai/instance.js';
import { getTask, TASK_IDS } from '../src/ai/tasks.js';
import { validateSchema } from '../src/services/ai/AIResponseValidator.js';
import { groundOutput } from '../src/ai/grounding.js';
import { createBackend } from './backends.js';
import { fieldMetrics, keyCoverageMetrics, scoreDeltaMetrics } from './metrics.js';
import { buildReport, printReport } from './report.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function loadExamples(dataset) {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
  const entries = manifest.datasets.filter((e) => e.split === dataset && (dataset === 'holdout' ? e.holdout : true));
  const examples = [];
  for (const entry of entries) {
    const file = path.join(REPO_ROOT, 'datasets', entry.path);
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const ex = JSON.parse(line);
      examples.push({ ...ex, meta: { file, manifestEntry: entry } });
    }
  }
  return { examples, manifest };
}

function envelopeMetrics(predicted, expected) {
  const fm = fieldMetrics(predicted, expected);
  return {
    type: 'envelope',
    fields: fm.fields,
    expectedValued: fm.expectedValued,
    tp: fm.tp,
    fp: fm.fp,
    fn: fm.fn,
    tn: fm.tn,
    f1: fm.f1,
    precision: fm.precision,
    recall: fm.recall,
    hallucinationRate: fm.hallucinationRate,
    missRate: fm.missRate,
    abstentionAccuracy: fm.abstentionAccuracy,
    statusAccuracy: fm.statusAccuracy,
    calibrationPairs: fm.calibration.confidences,
    per: fm.per.map(({ field, predicted, expected, correct, predictedValued, expectedValued }) => ({
      field, predicted, expected, correct, predictedValued, expectedValued,
    })),
  };
}

function generativeMetrics(task, predicted, expected) {
  const coverage = keyCoverageMetrics(predicted, expected);
  let scoreDelta = null;
  if (task.id === 'website.analysis') scoreDelta = scoreDeltaMetrics(predicted, expected);
  return {
    type: 'generative',
    keys: coverage.keys,
    requiredKeys: coverage.keys - coverage.missing.length,
    coverage: coverage.coverage,
    missing: coverage.missing,
    scoreDelta,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backend = args.backend || 'echo';
  const dataset = args.dataset || 'holdout';
  const taskFilter = args.task ?? null;
  const max = args.max ? parseInt(args.max, 10) : null;
  const out = args.out || null;
  const verbose = Boolean(args.verbose);
  const grounding = args.grounding === 'raw' ? 'report' : 'enforce';

  const { examples: allExamples } = loadExamples(dataset);
  let examples = taskFilter ? allExamples.filter((e) => e.task === taskFilter) : allExamples;
  if (taskFilter && taskFilter !== 'all') {
    if (!TASK_IDS.includes(taskFilter)) throw new Error(`Unknown task "${taskFilter}". Known: ${TASK_IDS.join(', ')}`);
    examples = allExamples.filter((e) => e.task === taskFilter);
  }
  if (max) examples = examples.slice(0, max);
  if (examples.length === 0) throw new Error(`No examples for backend ${backend}, dataset ${dataset}, task ${taskFilter || 'all'}`);

  const backendImpl = createBackend(backend, { webloomAI, grounding, modelId: args.model ?? null });
  if (!['echo', 'fallback'].includes(backend)) {
    console.log(`[run] backend=${backend} grounding=${grounding} — this is a real-model run, not a harness sanity check.`);
  }

  const startedAt = new Date().toISOString();
  const runId = `bench-${backend}-${dataset}-${Date.now()}`;
  const results = [];

  for (const ex of examples) {
    const task = getTask(ex.task);
    const started = Date.now();
    const record = {
      exampleId: ex.exampleId,
      task: ex.task,
      datasetVersion: ex.datasetVersion,
      ok: false,
      skipped: false,
      error: null,
      inference: null,
      metrics: null,
      attempts: null,
      latencyMs: 0,
      groundingReport: null,
    };
    try {
      if (backend === 'fallback' && !envelopeTaskShape(task)) {
        record.skipped = true;
        record.error = 'skipped: fallback backend cannot serve non-envelope (generative) tasks';
        results.push(record);
        continue;
      }
      const ran = await backendImpl.runner(ex);
      if (ran.error) {
        // Backends may return a rich failure (baseline captures the model's
        // raw output for failure analysis even when post-validation rejected
        // it). Treat it as a recorded failure, never a masked success.
        record.error = ran.error;
        record.failure = ran.failure ?? null;
        results.push(record);
        if (verbose) console.log(`FAIL ${ex.exampleId}${ran.failure?.shape?.consumed !== undefined ? ` (consumed=${ran.failure.shape.consumed})` : ''}`);
        continue;
      }
      const result = ran.result;
      record.inference = result.inference;
      record.attempts = result.__attempts?.length ?? 1;
      record.latencyMs = result.inference?.latencyMs ?? Date.now() - started;

      const schemaError = validateSchema(result.output, task.contract);
      if (schemaError) {
        if (backend === 'baseline') {
          // Baseline instrumentation: keep measuring value accuracy and record
          // contract compliance separately — a non-compliant output is a real,
          // recorded finding, not a run-level crash.
          record.schemaCompliant = false;
          record.schemaErrors = [{ path: schemaError.path, message: schemaError.message }];
        } else {
          throw new Error(`output failed ${ex.task} contract at ${schemaError.path}: ${schemaError.message}`);
        }
      } else {
        record.schemaCompliant = true;
      }
      const postErrors = task.postValidate ? task.postValidate(result.output) : [];
      if (postErrors.length > 0) {
        if (backend === 'baseline') {
          record.contractErrors = (record.schemaErrors ?? []).concat(
            postErrors.map((m) => ({ path: '$', message: m })),
          );
          record.schemaCompliant = false;
        } else {
          throw new Error(`output failed ${ex.task} post-validation: ${postErrors.join('; ')}`);
        }
      }

      record.metrics = envelopeTaskShape(task)
        ? envelopeMetrics(result.output, ex.expectedOutput)
        : generativeMetrics(task, result.output, ex.expectedOutput);

      if (task.grounded) {
        const evidenceText = deriveEvidenceTextFor(ex.input);
        record.groundingReport = groundOutput(result.output, evidenceText ?? '', 'report').report;
      }

      record.ok = true;
    } catch (error) {
      record.error = error?.message ?? String(error);
    }
    record.metrics = record.metrics ?? { type: 'failure' };
    results.push(record);

    if (verbose) console.log(`${record.ok ? 'ok ' : 'FAIL'} ${ex.exampleId}${record.inference?.model ? ` (${record.inference.model})` : ''}`);
  }

  const report = await buildReport({ results, backend, runId, startedAt, dataset });
  printReport(report);

  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report written to ${out}`);
  }

  process.exitCode = report.totals.failed > 0 ? 1 : 0;
}

function deriveEvidenceTextFor(input) {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    return input.evidence
      .map((e) => (typeof e === 'string' ? e : [e?.source, e?.text, e?.url].filter(Boolean).join('\n')))
      .join('\n');
  }
  if (typeof input.websiteText === 'string' && input.websiteText.trim()) return input.websiteText;
  if (Array.isArray(input.brandEvidence) && input.brandEvidence.length > 0) {
    return input.brandEvidence
      .map((e) => (typeof e === 'string' ? e : [e?.source, e?.text, e?.url].filter(Boolean).join('\n')))
      .join('\n');
  }
  return null;
}

function envelopeTaskShape(task) {
  const contract = task.contract;
  return Boolean(
    contract?.properties
    && Object.values(contract.properties).some((s) => s?.properties && 'value' in s.properties),
  );
}

main().catch((error) => {
  console.error(`run.js: ${error.message}`);
  process.exit(2);
});