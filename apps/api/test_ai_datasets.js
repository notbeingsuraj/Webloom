/**
 * AI dataset integrity tests.
 *
 * Verifies that every dataset file registered in datasets/manifest.json:
 *   - parses as JSONL and has the documented example count
 *   - carries the documented example fields
 *   - has globally unique example ids (train + holdout)
 *   - has expectedOutput that satisfies its task contract and post-validation
 *   - for envelope tasks: every valued expected field is evidence-grounded
 *     against the example's own input evidence ("gold" means derivable)
 *   - train/holdout are disjoint (no shared example ids, no shared businesses)
 *
 * Run: node test_ai_datasets.js
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './src/ai/paths.js';
import { getContract } from './src/ai/contracts/index.js';
import { getTask } from './src/ai/tasks.js';
import { validateSchema } from './src/services/ai/AIResponseValidator.js';
import { groundOutput } from './src/ai/grounding.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${error.message}`);
    console.error(`  \u2717 ${name}`);
  }
}

function readJsonLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1} is not valid JSON: ${error.message}`);
      }
    });
}

function deriveEvidenceText(input) {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    return input.evidence
      .map((e) => (typeof e === 'string' ? e : [e?.source, e?.text, e?.url].filter(Boolean).join('\n')))
      .join('\n');
  }
  if (typeof input.websiteText === 'string' && input.websiteText.trim()) return input.websiteText;
  return null;
}

function businessName(example) {
  const input = example.input || {};
  return input.rawBusinessData?.name ?? input.profile?.name ?? null;
}

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'datasets/manifest.json'), 'utf8'));
assert.ok(Array.isArray(manifest.datasets) && manifest.datasets.length > 0, 'manifest has datasets');

const all = [];

for (const entry of manifest.datasets) {
  const file = path.join(REPO_ROOT, 'datasets', entry.path);
  check(`manifest path exists: ${entry.path}`, () => assert.ok(fs.existsSync(file), `missing ${file}`));

  const examples = readJsonLines(file);
  check(`example count matches manifest: ${entry.path}`, () =>
    assert.equal(examples.length, entry.examples, `expected ${entry.examples}, got ${examples.length}`));

  const requiredKeys = ['exampleId', 'task', 'datasetVersion', 'split', 'input', 'expectedOutput', 'evidence', 'source', 'annotation', 'promptVersion'];

  examples.forEach((ex, index) => {
    check(`${entry.path}:${index + 1} required fields`, () => {
      for (const key of requiredKeys) assert.ok(key in ex, `missing ${key}`);
      assert.equal(ex.split, entry.split, 'split mismatch');
      assert.equal(ex.datasetVersion, entry.version, 'version mismatch');
      const entryTasks = new Set(entry.task.split(','));
      assert.ok(entryTasks.has(ex.task), `task ${ex.task} not covered by manifest entry ${entry.task}`);
      assert.equal(typeof ex.promptVersion, 'string', 'promptVersion present');
    });

    const task = getTask(ex.task);
    check(`${ex.exampleId} expectedOutput satisfies ${ex.task} contract`, () => {
      const error = validateSchema(ex.expectedOutput, task.contract);
      assert.equal(error, null, error ? `at ${error.path}: ${error.message}` : '');
    });

    check(`${ex.exampleId} expectedOutput passes post-validation`, () => {
      const errors = task.postValidate(ex.expectedOutput);
      assert.deepEqual(errors, [], errors.join('; '));
    });

    if (task.grounded) {
      check(`${ex.exampleId} expectedOutput is self-grounded`, () => {
        const evidenceText = deriveEvidenceText(ex.input);
        assert.ok(evidenceText, 'example input must provide evidence or websiteText');
        const { report } = groundOutput(ex.expectedOutput, evidenceText, 'report');
        const unsupported = report.fields.filter((f) => f.verdict === 'unsupported');
        assert.deepEqual(
          unsupported.map((f) => f.fieldPath),
          [],
          `unsupported expected fields: ${unsupported.map((f) => `${f.fieldPath} (${f.reason})`).join(', ')}`,
        );
      });
    }
  });

  all.push(...examples.map((ex) => ({ ...ex, file })));
}

check('example ids are globally unique', () => {
  const ids = all.map((ex) => ex.exampleId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate example ids: ${dupes.join(', ')}`);
});

check('train and holdout are disjoint', () => {
  const trainIds = new Set(all.filter((ex) => ex.split === 'train').map((ex) => ex.exampleId));
  const holdoutIds = all.filter((ex) => ex.split === 'holdout').map((ex) => ex.exampleId);
  const overlaps = holdoutIds.filter((id) => trainIds.has(id));
  assert.deepEqual(overlaps, [], `example ids shared between train and holdout: ${overlaps.join(', ')}`);

  const trainBusinesses = new Set(all.filter((ex) => ex.split === 'train').map(businessName).filter(Boolean));
  const shared = all.filter((ex) => ex.split === 'holdout').map(businessName).filter((name) => name && trainBusinesses.has(name));
  assert.deepEqual(shared, [], `businesses shared between train and holdout: ${shared.join(', ')}`);
});

check('every annotated example declares quality >= 0.5 for gold', () => {
  for (const ex of all) {
    if (ex.annotation?.status === 'gold') {
      assert.ok(ex.annotation.qualityScore >= 0.5, `${ex.exampleId} gold annotation needs qualityScore >= 0.5`);
    }
  }
});

console.log(`\nAI dataset integrity: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}