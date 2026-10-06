import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, DATASETS_DIR } from '../src/ai/paths.js';
import { getContract } from '../src/ai/contracts/index.js';
import { getTask } from '../src/ai/tasks.js';
import { validateSchema } from '../src/services/ai/AIResponseValidator.js';
import { groundOutput } from '../src/ai/grounding.js';
import { unknownEnvelope } from '../src/ai/contracts/common.js';
import { PROVENANCE_KINDS, FIELD_STATUSES } from '../src/ai/contracts/common.js';

/**
 * Dataset validator — stricter companion to test_ai_datasets.js.
 *
 * Re-runs the structural/contract/grounding checks AND adds gates that MUST
 * fail the build (exit code 1):
 *   - leakage: a business or example id present in more than one split
 *     (train / validation / holdout) fails validation immediately
 *   - globally unique example ids across every split
 *   - evidence required on every example (manifest rule evidenceRequired)
 *   - well-formed UNKNOWN envelopes: value:null must come with
 *     provenance 'unknown', status 'missing', confidence 0, empty evidence,
 *     and a valued field must never ship with provenance 'unknown'
 *
 * Run: node eval/dataset_validate.js [--json]
 */

const SPLITS = ['train', 'validation', 'holdout'];

export function loadExamples() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, 'manifest.json'), 'utf8'));
  const all = [];
  for (const entry of manifest.datasets) {
    const file = path.join(DATASETS_DIR, entry.path);
    if (!fs.existsSync(file)) {
      throw new Error(`Manifest entry missing file: ${entry.path}`);
    }
    const examples = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch (error) {
          throw new Error(`${entry.path}:${i + 1} invalid JSON: ${error.message}`);
        }
      });
    if (examples.length !== entry.examples) {
      throw new Error(`Manifest count mismatch for ${entry.path}: ${examples.length} != ${entry.examples}`);
    }
    all.push(...examples.map((ex) => ({ ...ex, manifestEntry: entry, file })));
  }
  return all;
}

export function deriveEvidenceText(input) {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    return input.evidence.map((e) => (typeof e === 'string' ? e : [e?.source, e?.text, e?.url].filter(Boolean).join('\n'))).join('\n');
  }
  if (typeof input.websiteText === 'string' && input.websiteText.trim()) return input.websiteText;
  return null;
}

export function businessName(example) {
  const input = example.input || {};
  return input.rawBusinessData?.name ?? input.profile?.name ?? null;
}

export function reportChecks(examples) {
  const errors = [];
  const warnings = [];
  let checks = 0;

  const ok = (cond, message) => {
    checks += 1;
    if (!cond) errors.push(message);
    return !!cond;
  };

  for (const ex of examples) {
    ok(['train', 'validation', 'holdout'].includes(ex.split), `${ex.exampleId}: split "${ex.split}" is invalid`);
    ok(ex.input && typeof ex.input === 'object', `${ex.exampleId}: input must be an object`);
    if (ex.input) {
      const task = getTask(ex.task);
      const evidenceText = deriveEvidenceText(ex.input);
      const hasLocalEvidence = !!evidenceText;

      if (task.grounded) {
        ok(hasLocalEvidence, `${ex.exampleId}: grounded task ${ex.task} needs evidence`);
        if (hasLocalEvidence) {
          const { report } = groundOutput(ex.expectedOutput, evidenceText, 'report');
          checks += 1;
          const unsupported = report.fields.filter((f) => f.verdict === 'unsupported');
          ok(
            unsupported.length === 0,
            `${ex.exampleId}: expected ${unsupported.length} unsupported field(s): ${unsupported.map((f) => f.fieldPath).join(', ')}`,
          );
        }
      }
    }

    const envelope = (fieldPath, node) => {
      checks += 1;
      if (typeof node !== 'object' || node === null) {
        ok(false, `${ex.exampleId}.${fieldPath}: expected an envelope object`);
        return;
      }
      const labelled = `${ex.exampleId}.${fieldPath}`;
      if (node.value === null) {
        const expected = unknownEnvelope();
        const problems = [];
        if (node.provenance !== expected.provenance) problems.push(`provenance should be 'unknown'`);
        if (node.status !== expected.status) problems.push(`status should be 'missing'`);
        if (node.confidence !== expected.confidence) problems.push('confidence should be 0');
        if (Array.isArray(node.evidence) && node.evidence.length) problems.push('evidence must be empty');
        ok(problems.length === 0, `${labelled}: malformed UNKNOWN envelope — ${problems.join('; ')}`);
      } else {
        const problems = [];
        if (node.provenance === 'unknown') problems.push(`valued field has provenance 'unknown'`);
        if (!PROVENANCE_KINDS.includes(node.provenance)) problems.push(`provenance "${node.provenance}" not in vocabulary`);
        if (!FIELD_STATUSES.includes(node.status)) problems.push(`status "${node.status}" not in vocabulary`);
        if (typeof node.confidence !== 'number' || node.confidence <= 0) problems.push('confidence must be > 0 when valued');
        ok(problems.length === 0, `${labelled}: malformed valued envelope — ${problems.join('; ')}`);
      }
    };

    if (ex.expectedOutput && typeof ex.expectedOutput === 'object') {
      const contract = getContract(ex.task);
      const isEnvelopeTask = Object.keys(contract.properties).every((p) => p.includes('.') || p === 'hours' || p === 'social_links');
      if (isEnvelopeTask) {
        for (const [fieldPath, node] of Object.entries(ex.expectedOutput)) envelope(fieldPath, node);
      }
    }
  }

  const ids = new Map();
  for (const ex of examples) {
    const prev = ids.get(ex.exampleId);
    if (prev) errors.push(`duplicate exampleId "${ex.exampleId}" in ${prev.file} and ${ex.file}`);
    ids.set(ex.exampleId, ex);
  }

  const businessBySplit = new Map();
  for (const ex of examples) {
    const name = businessName(ex);
    if (!name) {
      warnings.push(`${ex.exampleId}: no business name derivable (rawBusinessData.name / profile.name)`);
      continue;
    }
    const entry = businessBySplit.get(name) ?? { splits: new Set(), ids: [] };
    entry.splits.add(ex.split);
    entry.ids.push(ex.exampleId);
    businessBySplit.set(name, entry);
  }
  checks += 1;
  for (const [name, entry] of businessBySplit) {
    if (entry.splits.size > 1) {
      errors.push(`LEAKAGE: business "${name}" appears in multiple splits (${[...entry.splits].join(', ')}) — examples ${entry.ids.join(', ')}`);
    }
  }

  checks += 1;
  const missingEvidence = examples.filter((ex) => !Array.isArray(ex.evidence) || ex.evidence.length === 0);
  if (missingEvidence.length) {
    errors.push(`evidence required on every example: ${missingEvidence.map((e) => e.exampleId).join(', ')}`);
  }

  return { errors, warnings, checks };
}

export function validateDatasets() {
  const examples = loadExamples();
  const { errors, warnings, checks } = reportChecks(examples);
  const summary = { checked: checks, errors: errors.length, warnings: warnings.length, examples: examples.length };
  for (const w of warnings) console.warn(`  ! ${w}`);
  for (const e of errors) console.error(`  \u2717 ${e}`);
  console.log(`\nAI dataset validation: ${examples.length} examples, ${checks} checks, ${errors.length} errors, ${warnings.length} warnings`);
  return { ok: errors.length === 0, summary, examples };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.join(REPO_ROOT, 'apps/api/eval/dataset_validate.js');
if (isCli) {
  const { ok, summary } = validateDatasets();
  if (process.argv.includes('--json')) console.log(JSON.stringify(summary));
  process.exit(ok ? 0 : 1);
}

export default { validateDatasets, loadExamples, deriveEvidenceText, businessName, reportChecks };