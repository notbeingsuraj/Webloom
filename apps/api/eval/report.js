/**
 * Report formatting for the Webloom AI benchmark.
 *
 * Aggregates per-example metrics into per-task tables and a single JSON report
 * that can be recorded against a model in models/registry.json via
 * src/ai/modelRegistry.js recordBenchmark().
 */

const renderTable = (rows) => {
  const pad = (s, w) => String(s == null ? '' : s).padEnd(w);
  const widths = rows[0] ? rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i] == null ? '' : r[i]).length))) : [];
  const line = (r) => `  ${r.map((c, i) => pad(c, widths[i])).join('  ')}`;
  return rows.map((r, i) => `${i === 1 ? '  ' + '-'.repeat(widths.reduce((a, w) => a + w + 2, 0) - 2) : ''}${line(r)}`).join('\n');
};

function round(n, places = 4) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function aggregateFieldMetrics(perExample) {
  const keys = ['tp', 'fp', 'fn', 'tn', 'fields', 'expectedValued'];
  const sums = {};
  for (const k of keys) sums[k] = perExample.reduce((a, ex) => a + (ex.metrics?.[k] || 0), 0);
  const precision = sums.tp + sums.fp > 0 ? sums.tp / (sums.tp + sums.fp) : 1;
  const recall = sums.tp + sums.fn > 0 ? sums.tp / (sums.tp + sums.fn) : 1;
  return {
    ...sums,
    precision: round(precision),
    recall: round(recall),
    f1: round(precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0),
    hallucinationRate: round(sums.tp + sums.fp > 0 ? sums.fp / (sums.tp + sums.fp) : 0),
    missRate: round(sums.tp + sums.fn > 0 ? sums.fn / (sums.tp + sums.fn) : 0),
  };
}

/**
 * @param {object} opts
 * @param {object[]} opts.results  per-example {exampleId, task, backend, ok, error, output, metrics, latencyMs}
 * @returns {Promise<object>} report object
 */
export async function buildReport({ results, backend, runId, startedAt, dataset = 'holdout' }) {
  const tasks = [...new Set(results.map((r) => r.task))].sort();
  const perTask = {};

  for (const taskId of tasks) {
    const taskResults = results.filter((r) => r.task === taskId);
    const succeeded = taskResults.filter((r) => r.ok);
    const skipped = taskResults.filter((r) => r.skipped).length;
    const envelope = taskResults.some((r) => r.metrics?.type === 'envelope');
    const tableRows = [['example', 'outcome', 'fields', 'expected', 'tp', 'fp', 'fn', 'tn', 'f1', 'halluc']];

    for (const r of taskResults) {
      if (!r.ok) {
        tableRows.push([r.exampleId, r.skipped ? 'SKIP' : `FAIL ${r.error}`, '', '', '', '', '', '', '', '']);
        continue;
      }
      const m = r.metrics;
      if (m.type === 'envelope') {
        tableRows.push([
          r.exampleId, 'ok', m.fields, m.expectedValued, m.tp, m.fp, m.fn, m.tn, m.f1, m.hallucinationRate,
        ]);
      } else if (m.type === 'generative') {
        tableRows.push([r.exampleId, 'ok', `${m.requiredKeys}/${m.keys}`, '', '', '', '', '', m.coverage, '']);
      } else {
        tableRows.push([r.exampleId, 'ok', '', '', '', '', '', '', '', '']);
      }
    }

    let summary = { examples: taskResults.length, succeeded: succeeded.length, skipped, failed: taskResults.length - succeeded.length - skipped };
    if (succeeded.length > 0 && taskResults.some((r) => r.metrics?.type === 'envelope')) {
      summary = { ...summary, envelope: aggregateFieldMetrics(taskResults.filter((r) => r.metrics?.type === 'envelope')) };
    }
    if (succeeded.length > 0 && taskResults.some((r) => r.metrics?.type === 'generative')) {
      const cov = taskResults.filter((r) => r.metrics?.type === 'generative' && r.ok)
        .map((r) => r.metrics.coverage || 0);
      summary.genericCoverage = round(cov.reduce((a, b) => a + b, 0) / (cov.length || 1));
      const sd = taskResults.map((r) => r.metrics?.scoreDelta).filter(Boolean);
      if (sd.length) {
        summary.overallScoreMAE = round(sd.reduce((a, b) => a + (b.overallMAE || 0), 0) / sd.length);
        summary.categoryScoreMAE = round(sd.reduce((a, b) => a + (b.categoryMAE || 0), 0) / sd.length);
      }
    }

    perTask[taskId] = { summary, table: tableRows };
  }

  const okCount = results.filter((r) => r.ok).length;
  const report = {
    runId,
    dataset,
    backend,
    startedAt,
    generatedAt: new Date().toISOString(),
    model: {
      provider: results.find((r) => r.inference?.provider)?.inference?.provider ?? backend,
      model: results.find((r) => r.inference?.model)?.inference?.model ?? null,
    },
    totals: {
      examples: results.length,
      ok: okCount,
      failed: results.length - okCount - results.filter((r) => r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      pctOk: round((okCount / results.length) * 100, 2),
      attempts: results.reduce((a, r) => a + (r.attempts || 0), 0),
      avgLatencyMs: round(results.reduce((a, r) => a + (r.latencyMs || 0), 0) / Math.max(results.length, 1), 2),
    },
    perTask,
    results,
  };

  return report;
}

/** Print a human summary of a report. */
export function printReport(report) {
  console.log(`\nBenchmark ${report.runId}  [${report.backend} · ${report.dataset}]`);
  const { examples, ok, failed } = report.totals;
  console.log(`Examples: ${ok}/${examples} ok  (${report.totals.pctOk}%)  avg ${report.totals.avgLatencyMs}ms`);
  const totalSkipped = report.results.filter((r) => r.skipped).length;
  if (totalSkipped > 0) console.log(`Skipped: ${totalSkipped} (fallback backend cannot serve generative tasks)`);
  for (const [taskId, { summary, table }] of Object.entries(report.perTask)) {
    console.log(`\n${taskId}  (${summary.examples} examples, ${summary.succeeded} ok)`);
    console.log(renderTable(table));
    if (summary.envelope) {
      const e = summary.envelope;
      console.log(`    precision ${e.precision} · recall ${e.recall} · f1 ${e.f1} · hallucinationRate ${e.hallucinationRate} · missRate ${e.missRate}`);
    }
    if (summary.genericCoverage != null) console.log(`    keyCoverage ${summary.genericCoverage}`);
    if (summary.overallScoreMAE != null) console.log(`    overallScoreMAE ${summary.overallScoreMAE} · categoryScoreMAE ${summary.categoryScoreMAE}`);
  }
}

export default { buildReport, printReport };