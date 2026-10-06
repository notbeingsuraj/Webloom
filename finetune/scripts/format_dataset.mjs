#!/usr/bin/env node
/**
 * Format curated dataset examples into chat-format training rows.
 *
 * Reads datasets/manifest.json and builds each example's user turn from the
 * pinned task prompt builder, writing versioned JSONL under finetune/format/.
 * Formats the TRAIN and VALIDATION splits (training mixes them; holdout is
 * never formatted and never referenced).
 *
 * Usage:
 *   node finetune/scripts/format_dataset.mjs [--task <taskId>] [--out <dir>]
 *       [--splits train,validation] [--verbose]
 *
 * Row shape:
 *   { exampleId, task, promptVersion, datasetVersion, source,
 *     split, meta, messages:[{role:'user'},{role:'assistant'}] }
 *
 * meta preserves the provenance-relevant facts the gold answer implies:
 *   evidence, provenanceSources, confidence, uncertainty,
 *   failureCategories (baseline failures keyed by exampleId), annotation.
 * These are kept out of the chat payload so the model trains on the task, not
 * on our bookkeeping, while remaining available for analysis and HITL review.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../../apps/api/src/ai/paths.js';
import { getTask } from '../../apps/api/src/ai/tasks.js';
import { PROMPT_VERSION } from '../../apps/api/src/ai/prompts/index.js';

function parseArgs(argv) {
  const args = { task: 'all', verbose: false, splits: 'train,validation' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--splits') args.splits = argv[++i];
    else if (a === '--verbose') args.verbose = true;
  }
  return args;
}

const SYSTEM_PROMPT = 'You are Webloom AI, an agent that extracts business information, reasons about evidence, and generates strategies. Return ONLY valid JSON.';

/** Best-effort business identity for overlap protection. Returns null when no
 *  recognizable name field exists. */
export function businessOf(ex) {
  const inp = ex?.input ?? {};
  const candidates = [
    inp?.rawBusinessData?.name,
    inp?.profile?.businessName,
    inp?.profile?.name,
    inp?.brandDna?.businessIdentity?.name,
    inp?.websiteAnalysis?.businessIdentity?.name,
    inp?.rawBusinessData?.businessName,
  ];
  const found = candidates.find((c) => typeof c === 'string' && c.trim().length > 0);
  return found ? found.trim() : null;
}

function evidenceSources(ex) {
  const raw = ex?.evidence ?? [];
  const sources = new Set();
  for (const piece of raw) {
    if (piece?.source) sources.add(piece.source);
  }
  return [...sources].sort();
}

function metaFor(ex, split, failuresByExampleId) {
  const rawEvidence = Array.isArray(ex?.evidence) ? ex.evidence : [];
  const annotation = ex?.annotation ?? null;
  return {
    split,
    sourceType: ex?.source?.type ?? null,
    evidence: rawEvidence.map((p) => ({
      source: p?.source ?? null,
      text: (p?.text ?? '').slice(0, 240),
      url: p?.url ?? null,
    })),
    provenanceSources: evidenceSources(ex),
    // Confidence/uncertainty live in the runtime envelope, not the gold rows;
    // recorded as null rather than fabricated. They are measured at inference.
    confidence: null,
    uncertainty: null,
    failureCategories: failuresByExampleId?.get(ex?.exampleId) ?? [],
    annotation: annotation
      ? { status: annotation.status ?? null, qualityScore: annotation.qualityScore ?? null, annotatedBy: annotation.annotatedBy ?? null }
      : null,
  };
}

function loadFailureCategories() {
  const file = path.join(REPO_ROOT, 'baseline/failures.json');
  if (!fs.existsSync(file)) return new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Map(rows.map((r) => [r.exampleId, r.categories ?? []]));
  } catch {
    return new Map();
  }
}

function main() {
  const { task, out = path.join(REPO_ROOT, 'finetune/format'), verbose, splits = 'train,validation' } = parseArgs(process.argv.slice(2));
  const allowed = new Set(splits.split(',').map((s) => s.trim()).filter(Boolean));
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
  const failures = loadFailureCategories();

  let totalTrain = 0;
  for (const split of ['train', 'validation']) {
    if (!allowed.has(split)) continue;
    const entries = manifest.datasets.filter((e) => e.split === split);
    if (entries.length === 0) continue;
    if (verbose) console.log(`[${split}] ${entries.length} dataset entries`);
    let count = 0;
    for (const entry of entries) {
      const datasetTasks = entry.task.split(',');
      if (task !== 'all' && !datasetTasks.includes(task)) continue;
      const file = path.join(REPO_ROOT, 'datasets', entry.path);
      if (!fs.existsSync(file)) continue;
      const datasetOut = path.join(out, `${entry.dataset}@${entry.version}`);
      const outFile = path.join(datasetOut, `${split}.jsonl`);
      const chunk = [];
      for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
        const ex = JSON.parse(line);
        const exTask = getTask(ex.task);
        chunk.push({
          exampleId: ex.exampleId,
          task: ex.task,
          promptVersion: ex.promptVersion ?? PROMPT_VERSION,
          datasetVersion: ex.datasetVersion,
          source: ex.source?.type ?? null,
          split,
          meta: metaFor(ex, split, failures),
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: exTask.buildPrompt(ex.input ?? {}) },
            { role: 'assistant', content: JSON.stringify(ex.expectedOutput) },
          ],
        });
        count += 1;
        if (verbose) console.log(`  ${split} row ${ex.exampleId} (${ex.task})`);
      }
      fs.mkdirSync(datasetOut, { recursive: true });
      fs.writeFileSync(outFile, chunk.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
      console.log(`Formatted ${chunk.length} ${split} rows → ${outFile}`);
    }
    if (split === 'train') totalTrain = count;
  }
  if (totalTrain === 0) throw new Error('No training rows formatted — check --task and manifest train entries');
  console.log('Done. Holdout split never formatted; manifest rules.holdoutNeverTrained=true');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();