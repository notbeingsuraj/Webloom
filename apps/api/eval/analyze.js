/**
 * Failure analysis for the AI baseline benchmark.
 *
 * Consumes one or more persisted benchmark reports (eval/run.js --out) and
 * emits the Phase-2 artifacts:
 *
 *   baseline/model.json    baseline model identity + run metadata
 *   baseline/metrics.json  honest aggregate numbers (value F1, schema
 *                          compliance, grounding, calibration)
 *   baseline/failures.json every classified failure, with taxonomy labels
 *   baseline/analysis.json category tallies + observed patterns
 *   baseline/report.md     human-readable summary of all of the above
 *
 * Classification taxonomy (see docs/ai/failure-analysis.md):
 *   FORMAT_ERROR            no parseable JSON payload at all
 *   SCHEMA_ERROR            parseable JSON that fails the task contract
 *   EXTRACTION_ERROR        wrong or missing field value on envelope tasks
 *   HALLUCINATION           a value asserted where the gold expects UNKNOWN
 *   ENTITY_RESOLUTION_ERROR wrong canonical form for an entity field
 *   EVIDENCE_ERROR          grounding flagged an unsupported claim
 *   CONFIDENCE_ERROR        high confidence paired with wrong values
 *   CLASSIFICATION_ERROR    misclassification on classification.enum fields
 *   UNKNOWN_HANDLING_ERROR  model failed to abstain / drifted vocabulary
 *
 * Pure functions, no network. Run: node eval/analyze.js --reports f1 f2 --out baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/ai/paths.js';
import { calibrationReport } from '../src/ai/confidence.js';
import { loadRegistry } from '../src/ai/modelRegistry.js';

const BAND_CUTPOINTS = Object.freeze({ HIGH: 0.85, MEDIUM: 0.65, LOW: 0.4 });

function classifyExampleError(message) {
  const m = message ?? '';
  if (/no parseable JSON|unusable output|malformed/i.test(m)) {
    return ['FORMAT_ERROR', 'model returned no usable JSON payload'];
  }
  if (/post-validation|contract|schema|required|non-empty array/i.test(m)) {
    const detail = [];
    for (const item of m.matchAll(/([\w.]+\s+(?:is|must|requires)[^;.]+)/g)) detail.push(item[1].trim());
    return ['SCHEMA_ERROR', detail.length ? detail.join('; ') : m.slice(0, 200)];
  }
  return ['OTHER', m.slice(0, 200)];
}

function classifyEnvelope(record, expectedValued) {
  const cats = [];
  const detail = [];
  const per = record.metrics?.per ?? [];
  let halluc = 0;
  let wrong = 0;
  let missed = 0;
  let entity = 0;
  for (const f of per) {
    if (!f.expectedValued && f.predictedValued) {
      halluc += 1;
      detail.push(`hallucinated ${f.field}` + (f.predicted ? ` = ${clip(String(f.predicted))}` : ''));
    } else if (f.expectedValued && f.predictedValued && !f.correct) {
      wrong += 1;
      if (/name|category|business_type|phone|website|email|city|state|coordinates|full_address|postal_code/i.test(f.field)) {
        entity += 1;
      }
      detail.push(`wrong ${f.field}: got ${clip(String(f.predicted))} expected ${clip(String(f.expected))}`);
    } else if (f.expectedValued && !f.predictedValued) {
      missed += 1;
      detail.push(`missed ${f.field} (expected ${clip(String(f.expected))})`);
    }
  }
  if (halluc > 0) cats.push(['HALLUCINATION', `${halluc} value(s) fabricated where gold expects UNKNOWN`]);
  if (entity > 0) cats.push(['ENTITY_RESOLUTION_ERROR', `${entity} entity value(s) in wrong canonical form`]);
  if (wrong - entity > 0) cats.push(['EXTRACTION_ERROR', `${wrong - entity} wrong field value(s)`]);
  if (missed > 0) cats.push(['EXTRACTION_ERROR', `${missed} expected field(s) left UNKNOWN`]);
  return { cats, detail };
}

function clip(s, n = 80) {
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
}

function classifyExample(record) {
  if (!record.ok) {
    const [category, description] = classifyExampleError(record.error);
    const errors = record.schemaErrors ?? [];
    let severity = 'HIGH';
    if (category === 'FORMAT_ERROR') severity = 'CRITICAL';
    return {
      exampleId: record.exampleId,
      task: record.task,
      ok: false,
      severity,
      categories: [category],
      description,
      error: String(record.error).slice(0, 300),
      schemaErrors: errors,
      shape: record.failure?.shape ?? null,
      capturedKeys: record.failure?.parsed ? Object.keys(record.failure.parsed) : null,
    };
  }

  const cats = [];
  const detail = [];
  const per = record.metrics?.per ?? [];

  if (record.metrics?.type === 'envelope') {
    const { cats: c, detail: d } = classifyEnvelope(record, record.metrics?.expectedValued ?? 0);
    cats.push(...c);
    detail.push(...d);
  } else {
    const cov = record.metrics?.coverage;
    if (typeof cov === 'number' && cov < 0.9) {
      cats.push(['SCHEMA_ERROR', `generative output missing required structure (key coverage ${cov})`]);
    }
  }

  const grounding = record.groundingReport ?? null;
  if (grounding && grounding.unsupported > 0) {
    cats.push(['EVIDENCE_ERROR', `${grounding.unsupported} unsupported AI claim(s) not found in source evidence`]);
  }

  if (!record.schemaCompliant) {
    cats.push(['SCHEMA_ERROR', record.schemaErrors?.[0]?.message ?? 'output failed task contract']);
    detail.push(...(record.schemaErrors ?? []).map((e) => `${e.path}: ${e.message}`));
  }

  // confidence calibration: flag overconfidence when confident-but-wrong.
  const pairs = record.metrics?.calibrationPairs ?? [];
  const wrongConfident = pairs.filter((p) => p.correct === false && p.confidence >= BAND_CUTPOINTS.HIGH && p.confidence <= 1);
  if (wrongConfident.length > 0) {
    for (const wc of wrongConfident.slice(0, 8)) {
      const f = per.find((f2) => f2.predictedValued && !f2.correct && typeof f2.predicted?.confidence === 'undefined');
    }
    cats.push(['CONFIDENCE_ERROR', `${wrongConfident.length} wrong value(s) asserted at high confidence >= 0.85`]);
  }

  const unique = new Map();
  for (const [cat, desc] of cats) unique.set(cat, desc);

  const drift = vocabDrift(record);
  if (drift) unique.set('UNKNOWN_HANDLING_ERROR', drift);

  const severity = unique.has('HALLUCINATION') || unique.has('EVIDENCE_ERROR')
    ? 'CRITICAL'
    : unique.has('SCHEMA_ERROR') ? 'HIGH'
      : unique.has('EXTRACTION_ERROR') ? 'MEDIUM'
        : 'LOW';

  return {
    exampleId: record.exampleId,
    task: record.task,
    ok: true,
    severity,
    categories: [...unique.keys()],
    fieldDetail: detail.slice(0, 60),
    schemaCompliant: record.schemaCompliant !== false,
    grounding: grounding
      ? { grounded: grounding.grounded, unsupported: grounding.unsupported, unverifiable: grounding.unverifiable }
      : null,
  };
}

const RE_VOCAB_DRIFT = /(provenance|status)[^:]*:\s*value not in enum/i;

function vocabDrift(record) {
  const errors = [
    ...(record.schemaErrors ?? []),
    ...(record.contractErrors ?? []),
  ];
  if (errors.length === 0) return null;
  const hits = [];
  for (const e of errors) {
    const m = RE_VOCAB_DRIFT.exec(e.path + ' ' + e.message);
    if (m) hits.push(`${m[1]}:${e.path}`);
  }
  if (hits.length === 0) return null;
  return `invented status/provenance vocabulary not in the task enum (${hits.join(', ')})`;
}

function envelopeAggregates(results) {
  const groups = {};
  for (const r of results) {
    if (r.metrics?.type !== 'envelope') continue;
    const g = groups[r.task] ?? (groups[r.task] = {
      examples: 0, ok: 0, fields: 0, expectedValued: 0, tp: 0, fp: 0, fn: 0, tn: 0, pairs: [],
    });
    g.examples += 1;
    if (r.ok) g.ok += 1;
    g.fields += r.metrics.fields;
    g.expectedValued += r.metrics.expectedValued;
    g.tp += r.metrics.tp;
    g.fp += r.metrics.fp;
    g.fn += r.metrics.fn;
    g.tn += r.metrics.tn;
    g.pairs.push(...(r.metrics.calibrationPairs ?? []));
  }
  return groups;
}

function aggregateSchemaCompliance(results) {
  const total = results.length;
  const ok = results.filter((r) => r.schemaCompliant === true).length;
  const rawConsumable = results.filter((r) => {
    const shape = r.inference?.shape ?? r.failure?.shape ?? null;
    return shape && shape.rawConsumable === true;
  }).length;
  return {
    total,
    schemaCompliant: ok,
    schemaCompliancePct: total ? Math.round((ok / total) * 10000) / 100 : 0,
    rawConsumable,
    rawConsumablePct: total ? Math.round((rawConsumable / total) * 10000) / 100 : 0,
  };
}

function aggregateGrounding(results) {
  let grounded = 0;
  let unsupported = 0;
  let unverifiable = 0;
  let tasks = 0;
  for (const r of results) {
    const g = r.groundingReport;
    if (!g) continue;
    tasks += 1;
    grounded += g.grounded;
    unsupported += g.unsupported;
    unverifiable += g.unverifiable;
  }
  return { tasks, grounded, unsupported, unverifiable };
}

function main() {
  const args = process.argv.slice(2);
  const reports = [];
  let out = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--reports') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) reports.push(args[++i]);
    } else if (args[i] === '--out') {
      out = args[++i];
    } else if (args[i] === '--help') {
      console.log('Usage: node eval/analyze.js --reports <report.json> [...] --out <dir>');
      process.exit(0);
    }
  }
  if (reports.length === 0 || !out) {
    console.error('Usage: node eval/analyze.js --reports <report.json> [...] --out <dir>');
    process.exit(1);
  }

  const results = [];
  for (const f of reports) {
    const report = JSON.parse(fs.readFileSync(f, 'utf8'));
    results.push(...report.results);
  }

  const failures = results.map(classifyExample).filter((f) => f.ok === false || f.categories.length > 0);

  const envelope = envelopeAggregates(results);
  const compliance = aggregateSchemaCompliance(results);
  const grounding = aggregateGrounding(results);

  const allPairs = [];
  for (const g of Object.values(envelope)) allPairs.push(...g.pairs);
  const calibration = calibrationReport(allPairs);

  const categoryCounts = {};
  for (const f of failures) {
    for (const cat of f.categories) categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const summary = {
    analysedAt: new Date().toISOString(),
    examples: {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      pctOk: results.length ? Math.round((results.filter((r) => r.ok).length / results.length) * 10000) / 100 : 0,
      avgLatencyMs: results.length
        ? Math.round(results.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / results.length)
        : 0,
    },
    schemaCompliance: compliance,
    grounding,
    envelopeByTask: Object.fromEntries(
      Object.entries(envelope).map(([task, g]) => {
        const precision = g.tp + g.fp > 0 ? g.tp / (g.tp + g.fp) : 1;
        const recall = g.tp + g.fn > 0 ? g.tp / (g.tp + g.fn) : 1;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return [task, {
          examples: g.examples,
          ok: g.ok,
          fields: g.fields,
          expectedValued: g.expectedValued,
          tp: g.tp, fp: g.fp, fn: g.fn, tn: g.tn,
          precision: Number(precision.toFixed(4)),
          recall: Number(recall.toFixed(4)),
          f1: Number(f1.toFixed(4)),
        }];
      }),
    ),
    calibration: {
      count: calibration.count,
      accuracy: calibration.accuracy,
      ece: calibration.ece,
      brier: calibration.brier,
      meanConfidence: calibration.meanConfidence,
      falseConfidenceRate: calibration.falseConfidenceRate,
    },
    categoryCounts,
  };

  const usedReports = reports.map((f) => path.basename(f));
  const modelId = loadRegistry()?.active?.baseline ?? null;

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify({
    modelId,
    backend: process.env.AI_BASELINE_PROVIDER || 'local',
    servingModel: process.env.AI_BASELINE_MODEL || 'active-baseline-serving-model',
    format: process.env.AI_BASELINE_FORMAT || 'none',
    sourceReports: usedReports,
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(out, 'failures.json'), JSON.stringify(failures, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(out, 'analysis.json'), JSON.stringify({ categoryCounts, envelopeByTask: summary.envelopeByTask }, null, 2) + '\n', 'utf8');

  writeMarkdownReport(out, summary, failures);

  console.log(`analysed ${results.length} example(s) (${summary.examples.ok} ok, ${summary.examples.failed} failed)`);
  console.log(`wrote ${out}/model.json, metrics.json, failures.json, analysis.json, report.md`);
}

function writeMarkdownReport(out, summary, failures) {
  const md = [
    '# AI Baseline Benchmark — Report',
    '',
    `_${summary.analysedAt}_`,
    '',
    '## Snapshot',
    '',
    `- Examples: **${summary.examples.ok}/${summary.examples.total} ok** (${summary.examples.pctOk}%), ${summary.examples.failed} failed`,
    `- Average latency: ${summary.examples.avgLatencyMs}ms/example`,
    '',
    '## Schema compliance',
    '',
    `- Contract-compliant: **${summary.schemaCompliance.schemaCompliant}/${summary.schemaCompliance.total}** (${summary.schemaCompliance.schemaCompliancePct}%)`,
    `- Raw (unrepaired) consumer-ready: **${summary.schemaCompliance.rawConsumable}/${summary.schemaCompliance.total}** (${summary.schemaCompliance.rawConsumablePct}%)`,
    '',
    '## Grounding (grounded tasks)',
    '',
    `- checked across ${summary.grounding.tasks} task output(s): grounded ${summary.grounding.grounded}, unsupported ${summary.grounding.unsupported}, unverifiable ${summary.grounding.unverifiable}`,
    '',
    '## Value-level accuracy',
    '',
    '| task | examples | ok | precision | recall | f1 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const [task, g] of Object.entries(summary.envelopeByTask)) {
    md.push(`| ${task} | ${g.examples} | ${g.ok}/${g.examples} | ${g.precision} | ${g.recall} | ${g.f1} |`);
  }
  md.push(
    '',
    '## Calibration',
    '',
    `- ${summary.calibration.count} confidence pair(s); accuracy ${summary.calibration.accuracy}; ECE ${summary.calibration.ece}; Brier ${summary.calibration.brier}`,
    `- mean confidence ${summary.calibration.meanConfidence}; false-confidence rate ${summary.calibration.falseConfidenceRate}`,
    '',
    '## Failure categories',
    '',
    '| category | count |',
    '| --- | --- |',
  );
  for (const [cat, count] of Object.entries(summary.categoryCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${cat} | ${count} |`);
  }
  md.push('', '## Failures');
  if (failures.length === 0) md.push('_none recorded_');
  for (const f of failures.slice(0, 60)) {
    md.push(
      `- **${f.exampleId}** (${f.task}) [${f.severity}] ${f.categories.join(', ')}`,
      ...(f.description ? [`  - ${f.description}`] : []),
      ...(f.fieldDetail ?? []).slice(0, 12).map((d) => `  - ${d}`),
      ...(f.error ? [`  - error: ${f.error}`] : []),
    );
  }

  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n') + '\n', 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(REPO_ROOT, 'apps/api/eval/analyze.js')) {
  main();
}

export { classifyExample, envelopeAggregates, aggregateSchemaCompliance, aggregateGrounding };