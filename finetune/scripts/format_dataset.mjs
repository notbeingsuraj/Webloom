#!/usr/bin/env node
/**
 * Format curated dataset examples into chat-format training rows.
 *
 * Reads datasets/manifest.json (train splits only), builds each example's
 * user turn from the pinned task prompt builder, and writes versioned
 * JSONL under finetune/format/. Never touches holdout.
 *
 * Usage:
 *   node finetune/scripts/format_dataset.mjs [--task <taskId>] [--out <dir>] [--verbose]
 *
 * Row shape:
 *   { exampleId, task, promptVersion, datasetVersion,
 *     messages: [{role:'user', content}, {role:'assistant', content}] }
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../apps/api/src/ai/paths.js';
import { getTask } from '../../apps/api/src/ai/tasks.js';
import { PROMPT_VERSION } from '../../apps/api/src/ai/prompts/index.js';

function parseArgs(argv) {
  const args = { task: 'all', verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--verbose') args.verbose = true;
  }
  return args;
}

const SYSTEM_PROMPT = 'You are Webloom AI, an agent that extracts business information, reasons about evidence, and generates strategies. Return ONLY valid JSON.';

function main() {
  const { task, out = path.join(REPO_ROOT, 'finetune/format'), verbose } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
  const entries = manifest.datasets.filter((e) => e.split === 'train');

  let total = 0;
  const summary = [];

  for (const entry of entries) {
    const datasetTasks = entry.task.split(',');
    if (task !== 'all' && !datasetTasks.includes(task)) continue;

    const file = path.join(REPO_ROOT, 'datasets', entry.path);
    const rows = [];
    const datasetOut = path.join(out, `${entry.dataset}@${entry.version}`);

    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const ex = JSON.parse(line);
      const exTask = getTask(ex.task);
      const userContent = exTask.buildPrompt(ex.input ?? {});
      const row = {
        exampleId: ex.exampleId,
        task: ex.task,
        promptVersion: ex.promptVersion ?? PROMPT_VERSION,
        datasetVersion: ex.datasetVersion,
        source: ex.source?.type ?? null,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
          { role: 'assistant', content: JSON.stringify(ex.expectedOutput) },
        ],
      };
      rows.push(row);
      total += 1;
      if (verbose) console.log(`  row ${ex.exampleId} (${ex.task})`);
    }

    fs.mkdirSync(datasetOut, { recursive: true });
    const outFile = path.join(datasetOut, 'train.jsonl');
    fs.writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    summary.push({ dataset: entry.dataset, version: entry.version, task: entry.task, rows: rows.length, file: outFile });
  }

  for (const s of summary) console.log(`${s.dataset}@${s.version} [${s.task}]: ${s.rows} rows → ${s.file}`);
  console.log(`Formatted ${total} training rows. Holdout untouched.`);
  if (total === 0) throw new Error('No training rows formatted — check --task and manifest train entries');
}

main();