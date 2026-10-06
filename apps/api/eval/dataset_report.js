import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, DATASETS_DIR } from '../src/ai/paths.js';
import { loadExamples, businessName, validateDatasets } from './dataset_validate.js';

/**
 * Dataset quality report.
 *
 * Computes per-split counts, task balance, coverage of the failure categories
 * observed in the baseline benchmark (baseline/analysis.json), UNKNOWN-abstention
 * coverage, and a composite quality score. Writes docs/ai/dataset-quality.md.
 *
 * Run: node eval/dataset_report.js
 */

function failureCoverage(examples) {
  const training = examples.filter((e) => e.split === 'train');
  const ids = new Set(training.map((e) => e.exampleId));

  const hasField = (ex, pathPrefix) => Object.keys(ex.expectedOutput || {}).some((k) => k.startsWith(pathPrefix));
  const anyUnknown = (ex) => {
    if (!ex.expectedOutput || typeof ex.expectedOutput !== 'object') return false;
    return Object.values(ex.expectedOutput).some((v) => v && typeof v === 'object' && v.value === null);
  };
  const isEmpty = (ex, prop) => {
    const v = ex.expectedOutput?.[prop];
    return Array.isArray(v) && v.length === 0;
  };

  const categories = {
    'schema-nested-generative': {
      description: 'Nested generative structure (brand.dna / strategy) that the baseline flattened or envelope-wrapped',
      coveredBy: training.filter((e) => ['brand.dna', 'strategy.website', 'strategy.landing_page'].includes(e.task)),
    },
    'category-list': {
      description: 'identity.categories as a list (baseline collapsed to a single value)',
      coveredBy: training.filter((e) => hasField(e, 'identity.categories')),
    },
    'hours-as-string': {
      description: 'hours expressed as a plain string (baseline schema drift)',
      coveredBy: training.filter((e) => typeof e.expectedOutput?.hours?.value === 'string'),
    },
    'unknown-abstention': {
      description: 'Sparse evidence with honest UNKNOWN envelopes (baseline invented values)',
      coveredBy: training.filter((e) => anyUnknown(e)),
    },
    'website-exists-false': {
      description: 'websiteExists=false audits (baseline missed or invented a site)',
      coveredBy: training.filter((e) => e.task === 'website.analysis' && e.expectedOutput?.websiteExists === false),
    },
    'provenance-enum-discipline': {
      description: 'Grounding-consistent provenance on every valued field',
      coveredBy: training.filter((e) => e.task === 'extraction.business_profile'),
    },
  };

  return Object.fromEntries(
    Object.entries(categories).map(([name, spec]) => [
      name,
      { description: spec.description, examples: spec.coveredBy.map((e) => e.exampleId), count: spec.coveredBy.length },
    ]),
  );
}

function computeQuality(examples) {
  const training = examples.filter((e) => e.split === 'train');
  const validation = examples.filter((e) => e.split === 'validation');
  const holdout = examples.filter((e) => e.split === 'holdout');

  const validationResult = validateDatasets();
  const contractCompliance = validationResult.ok ? 1 : 0;

  const groundedTasks = examples.filter((e) => ['extraction.business_profile'].includes(e.task));
  let groundedFields = 0;
  let unsupportedFields = 0;
  for (const ex of groundedTasks) {
    for (const node of Object.values(ex.expectedOutput || {})) {
      if (node && typeof node === 'object' && 'value' in node && node.value !== null) {
        groundedFields += 1;
        if ((node.evidence ?? []).length === 0 || !node.evidence?.[0]?.text) unsupportedFields += 1;
      }
    }
  }
  const grounding = groundedFields ? 1 - unsupportedFields / groundedFields : 1;

  const withEvidence = examples.filter((e) => Array.isArray(e.evidence) && e.evidence.length > 0);
  const evidence = withEvidence.length / examples.length;

  const unknownExample = examples.filter((e) => {
    if (!e.expectedOutput || typeof e.expectedOutput !== 'object') return false;
    return Object.values(e.expectedOutput).some((v) => v && typeof v === 'object' && v.value === null);
  });
  const unknownUse = unknownExample.length / examples.length;
  const unknownTarget = Math.min(1, unknownUse / 0.25);

  const perTask = {};
  for (const ex of training) perTask[ex.task] = (perTask[ex.task] ?? 0) + 1;
  const counts = Object.values(perTask);
  const balance = counts.length ? 1 - (Math.max(...counts) - Math.min(...counts)) / counts.reduce((a, b) => a + b, 0) : 1;

  const coverage = failureCoverage(examples);
  const coveredCategories = Object.values(coverage).filter((c) => c.count > 0).length;
  const failureCoverageScore = coveredCategories / Object.keys(coverage).length;

  const splitting = validation.length > 0 && holdout.length > 0 ? 1 : 0.5;

  const scores = { contractCompliance, grounding, evidence, unknownAbstention: unknownTarget, taskBalance: balance, failureCoverage: failureCoverageScore, splitCoverage: splitting };
  const weights = { contractCompliance: 0.3, grounding: 0.2, evidence: 0.1, unknownAbstention: 0.1, taskBalance: 0.1, failureCoverage: 0.1, splitCoverage: 0.1 };

  let quality = 0;
  for (const [k, w] of Object.entries(weights)) quality += scores[k] * w;
  quality = Math.round(quality * 1000) / 1000;

  return { quality, scores, weights, counts: { training: training.length, validation: validation.length, holdout: holdout.length }, perTask, coverage, businesses: new Set(examples.map(businessName).filter(Boolean)).size };
}

function renderReport() {
  const examples = loadExamples();
  const { quality, scores, counts, perTask, coverage, businesses } = computeQuality(examples);

  const lines = [];
  lines.push('# Dataset Quality — v0.1.0');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`node eval/dataset_report.js\`.`);
  lines.push('');
  lines.push(`## Composite quality score: **${quality.toFixed(3)}**`);
  lines.push('');
  lines.push('| Dimension | Score | Weight |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Contract + validation compliance | ${scores.contractCompliance.toFixed(3)} | 0.30 |`);
  lines.push(`| Gold self-grounding (extraction) | ${scores.grounding.toFixed(3)} | 0.20 |`);
  lines.push(`| Evidence presence | ${scores.evidence.toFixed(3)} | 0.10 |`);
  lines.push(`| UNKNOWN abstention coverage | ${scores.unknownAbstention.toFixed(3)} | 0.10 |`);
  lines.push(`| Task balance (train) | ${scores.taskBalance.toFixed(3)} | 0.10 |`);
  lines.push(`| Failure-category coverage | ${scores.failureCoverage.toFixed(3)} | 0.10 |`);
  lines.push(`| Split coverage (val + holdout) | ${scores.splitCoverage.toFixed(3)} | 0.10 |`);
  lines.push('');
  lines.push(`## Scale`);
  lines.push('');
  lines.push(`- Training examples: **${counts.training}**`);
  lines.push(`- Validation examples: **${counts.validation}**`);
  lines.push(`- Holdout examples: **${counts.holdout}**`);
  lines.push(`- Distinct businesses: **${businesses}**`);
  lines.push('');
  lines.push('| Task | Train | Validation | Holdout |');
  lines.push('| --- | --- | --- | --- |');
  const tasks = [...new Set(examples.map((e) => e.task))].sort();
  for (const task of tasks) {
    const row = (s) => examples.filter((e) => e.task === task && e.split === s).length;
    lines.push(`| ${task} | ${row('train')} | ${row('validation')} | ${row('holdout')} |`);
  }
  lines.push('');
  lines.push(`## Failure-category coverage (baseline → train)`);
  lines.push('');
  for (const [name, cat] of Object.entries(coverage)) {
    lines.push(`- **${name}** — ${cat.description}: ${cat.examples.length ? cat.examples.join(', ') : '—'}`);
  }
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  lines.push('- `node eval/dataset_validate.js` must exit 0 (leakage FAILs, malformed UNKNOWN envelopes FAIL, ungrounded gold FAIL).');
  lines.push('- Holdout v0.1.0 is frozen; training additions are corrections promoted from the baseline benchmark.');
  lines.push('');
  lines.push('Regenerate this report with `npm run ai:dataset:report`.');

  return lines.join('\n');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.join(REPO_ROOT, 'apps/api/eval/dataset_report.js');
if (isCli) {
  const dir = path.join(REPO_ROOT, 'docs/ai');
  fs.mkdirSync(dir, { recursive: true });
  const markdown = renderReport();
  fs.writeFileSync(path.join(dir, 'dataset-quality.md'), `${markdown}\n`, 'utf8');
  const { quality, scores, counts } = computeQuality(loadExamples());
  console.log(`Dataset report: quality=${quality.toFixed(3)} — ${counts.training} train / ${counts.validation} validation / ${counts.holdout} holdout`);
  if (quality < 0.85) {
    console.error(`Quality gate not met (${quality.toFixed(3)} < 0.85)`);
    process.exit(1);
  }
}

export { computeQuality, renderReport };
export default { computeQuality, renderReport };