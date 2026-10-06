import fs from 'node:fs';
import path from 'node:path';
import { DATASETS_DIR, REPO_ROOT } from '../src/ai/paths.js';
import { recordCorrection, listCorrections } from '../src/ai/hitl/correctionStore.js';

/**
 * Promote the failures captured by the baseline benchmark (baseline/failures.json)
 * into the human-in-the-loop correction store (datasets/corrections/), using the
 * holdout gold as the curator's corrected value.
 *
 * Corrections are deduplicated on (taskId, exampleId, fieldPath) and marked
 * source 'evaluation' so downstream dataset builders can consume them via
 * correctionsToExampleDrafts().
 *
 * Run: node eval/record_baseline_corrections.js
 */

const NOTE = 'Recorded from baseline benchmark failures (see baseline/failures.json and baseline/analysis.json).';

function holdoutGoldByTask() {
  const index = new Map();
  for (const file of fs.readdirSync(path.join(DATASETS_DIR, 'evaluation/holdout/v0.1.0'))) {
    const lines = fs.readFileSync(path.join(DATASETS_DIR, 'evaluation/holdout/v0.1.0', file), 'utf8')
      .split('\n').filter(Boolean);
    for (const line of lines) {
      const ex = JSON.parse(line);
      index.set(ex.exampleId, ex);
    }
  }
  return index;
}

const GENERATIVE_REASON = {
  'brand.dna': 'incorrect_dna',
  'website.analysis': 'incorrect_analysis',
  'strategy.website': 'incorrect_strategy',
  'strategy.landing_page': 'incorrect_strategy',
};

function extractExtractionFields(note) {
  const matches = [...note.matchAll(/(missed|wrong|hallucinated)\s+([a-zA-Z_.]+)/g)];
  return matches.map((m) => ({ action: m[1], fieldPath: m[2] }));
}

export function deriveCorrections(failures, gold) {
  const corrections = [];
  for (const failure of failures) {
    const goldEx = gold.get(failure.exampleId);
    const sourceSnapshot = goldEx?.input ?? null;
    const evidenceItems = goldEx?.evidence ?? [];

    if (failure.task === 'extraction.business_profile') {
      for (const detail of failure.fieldDetail ?? []) {
        for (const { action, fieldPath } of extractExtractionFields(detail)) {
          if (!goldEx?.expectedOutput?.[fieldPath]) continue;
          const reason = action === 'hallucinated' ? 'hallucination' : action === 'missed' ? 'missing_information' : 'wrong_extraction';
          corrections.push({ taskId: failure.task, exampleId: failure.exampleId, fieldPath, reason, correctedValue: goldEx.expectedOutput[fieldPath], sourceSnapshot, evidenceItems });
        }
      }
      continue;
    }

    const reason = GENERATIVE_REASON[failure.task];
    if (!reason) continue;
    const fieldOffsets = {
      'brand.dna': ['conversionStrategy', 'services', 'audience'],
      'strategy.website': ['primaryCTA', 'pages', 'homepageSections', 'conversionStrategy'],
      'strategy.landing_page': ['pageTitle', 'primaryCTA', 'sections'],
      'website.analysis': ['websiteExists', 'categories', 'overallScore'],
    }[failure.task] ?? [];
    for (const fieldPath of fieldOffsets) {
      const v = goldEx?.expectedOutput?.[fieldPath];
      if (v === undefined) continue;
      corrections.push({ taskId: failure.task, exampleId: failure.exampleId, fieldPath, reason, correctedValue: v, sourceSnapshot, evidenceItems });
    }
  }
  return corrections;
}

export function recordBaselineCorrections() {
  const failuresFile = path.join(REPO_ROOT, 'baseline/failures.json');
  if (!fs.existsSync(failuresFile)) {
    console.log('No baseline/failures.json — nothing to record.');
    return { recorded: 0, skipped: 0 };
  }
  const failures = JSON.parse(fs.readFileSync(failuresFile, 'utf8'));
  const gold = holdoutGoldByTask();
  const corrections = deriveCorrections(failures, gold);

  const existing = listCorrections();
  const seen = new Set(existing.map((c) => `${c.taskId}|${c.exampleId}|${c.fieldPath}`));
  let recorded = 0;
  let skipped = 0;

  for (const correction of corrections) {
    const key = `${correction.taskId}|${correction.exampleId}|${correction.fieldPath ?? ''}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    recordCorrection({
      taskId: correction.taskId,
      exampleId: correction.exampleId,
      fieldPath: correction.fieldPath,
      originalValue: null,
      correctedValue: correction.correctedValue,
      reason: correction.reason,
      correctedBy: 'webloom-curator',
      source: 'evaluation',
      inputSnapshot: correction.sourceSnapshot,
      evidence: correction.evidenceItems,
      notes: NOTE,
    });
    seen.add(key);
    recorded += 1;
  }

  console.log(`Baseline corrections: ${recorded} recorded, ${skipped} skipped (duplicate), ${corrections.length} derived`);
  return { recorded, skipped, derived: corrections.length };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.join(REPO_ROOT, 'apps/api/eval/record_baseline_corrections.js');
if (isCli) {
  recordBaselineCorrections();
}

export default { recordBaselineCorrections, deriveCorrections };