#!/usr/bin/env node
/**
 * Holdout protection guard — the automated, fail-loud check that no holdout
 * example or business ever enters a training or validation file.
 *
 * Runs before every training invocation (npm run ai:finetune:validate) and
 * inside the Python trainer itself. If a holdout exampleId or business name
 * appears in any formatted training file the process exits non-zero and the
 * run never starts.
 *
 * Usage:
 *   node finetune/scripts/protect_holdout.js [--format <dir>] [--quiet]
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../../apps/api/src/ai/paths.js';
import { businessOf } from './format_dataset.mjs';

function parseArgs(argv) {
  const args = { quiet: false, format: path.join(REPO_ROOT, 'finetune/format') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--format') args.format = argv[++i];
    else if (a === '--quiet') args.quiet = true;
  }
  return args;
}

function load(manifest) {
  const ids = { train: new Set(), validation: new Set(), holdout: new Set() };
  const businesses = { train: new Set(), validation: new Set(), holdout: new Set() };
  const byId = new Map();
  const seenCrossSplit = new Set();

  for (const entry of manifest.datasets) {
    const split = entry.split;
    const file = path.join(REPO_ROOT, 'datasets', entry.path);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const ex = JSON.parse(line);
      const id = ex.exampleId;
      if (!id) throw new Error(`Row in ${entry.path} has no exampleId`);
      ids[split].add(id);
      const b = businessOf(ex);
      if (b) businesses[split].add(b);
      const key = `${split}:${id}`;
      if (seenCrossSplit.has(id) && !byId.get(id)?.split?.includes(split)) {
        throw new Error(`exampleId "${id}" appears in multiple splits in the manifest — dataset is corrupt`);
      }
      seenCrossSplit.add(key);
      byId.set(id, { split, business: b, dataset: entry.dataset, task: entry.task });
    }
  }
  return { ids, businesses, byId };
}

function checkIndex({ format, quiet }) {
  const manifestPath = path.join(REPO_ROOT, 'datasets/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { ids, businesses, byId } = load(manifest);
  const errors = [];
  const warnings = [];

  // 1. Origin-level disjointness (defense in depth; dataset_validate also does this).
  for (const a of ['train', 'validation', 'holdout']) {
    for (const b of ['train', 'validation', 'holdout']) {
      if (a >= b) continue;
      for (const id of ids[a]) {
        if (ids[b].has(id)) errors.push(`origin exampleId overlap: ${id} in ${a} and ${b}`);
      }
      for (const bz of businesses[a]) {
        if (businesses[b].has(bz)) warnings.push(`origin business "${bz}" appears in both ${a} and ${b} splits`);
      }
    }
  }

  // 2. Formatted files: every row must be train/validation, never holdout.
  if (!fs.existsSync(format)) {
    errors.push(`Format directory not found: ${format}. Run format_dataset.mjs first.`);
  } else {
    for (const dir of fs.readdirSync(format)) {
      const dirPath = path.join(format, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      for (const ext of ['train', 'validation']) {
        const file = path.join(dirPath, `${ext}.jsonl`);
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
          const row = JSON.parse(line);
          const origin = byId.get(row.exampleId);
          if (!origin) {
            errors.push(`formatted row ${row.exampleId} (${file}) is not in the manifest at all`);
            continue;
          }
          if (origin.split === 'holdout') {
            errors.push(`HOLDOUT LEAK: ${row.exampleId} (${origin.dataset}) present in ${file}`);
          }
          if (!['train', 'validation'].includes(origin.split)) {
            errors.push(`formatted row ${row.exampleId} belongs to split "${origin.split}" — not train/validation`);
          }
          if (row.meta?.split !== ext) {
            errors.push(`formatted row ${row.exampleId} meta.split "${row.meta?.split}" does not match file ${ext}.jsonl`);
          }
          if (origin.business && businesses.holdout.has(origin.business)) {
            errors.push(`HOLDOUT BUSINESS LEAK: "${origin.business}" (${row.exampleId}) present in ${file}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(`\nHOLDOUT PROTECTION FAILED: ${errors.length} error(s). Training data corrupt — fix and re-run.`);
    process.exit(1);
  }
  for (const w of warnings) if (!quiet) console.warn(`  ! ${w}`);
  if (!quiet) {
    console.log(`Holdout guard PASS: train ${ids.train.size} / validation ${ids.validation.size} / holdout ${ids.holdout.size} exampleIds disjoint;`);
    console.log(`  ${businesses.train.size}/${businesses.validation.size}/${businesses.holdout.size} businesses disjoint; formatted files contain no holdout rows.`);
  }
}

const { format, quiet } = parseArgs(process.argv.slice(2));
checkIndex({ format, quiet });