# Webloom AI — Evaluation

The benchmark measures whether a model can do Webloom's jobs without
fabricating facts, and whether its self-reported confidence means what it
says. Only holdout data is used to judge models.

## Runner

```
cd apps/api
node eval/run.js --backend <echo|fallback|baseline|live> [--dataset holdout|train]
                 [--task <taskId>] [--max <n>] [--out <report.json>] [--verbose]
                 [--grounding enforce|raw]
```

npm alias: `npm run benchmark:ai` (echo + fallback), `npm run ai:benchmark:<backend>`.

### Backends

| backend | what runs | when to use |
|---------|-----------|-------------|
| `echo` | returns expected outputs verbatim | harness sanity; pins the perfect-score ceiling |
| `fallback` | real task layer, deterministic UNKNOWN envelopes | harness + layer sanity; envelope tasks only |
| `baseline` | registered baseline model through the provider gateway (`AI_BASELINE_*`) | real baseline numbers — explicit opt-in |
| `live` | production chain `auto` (webloom → external) | real production numbers — explicit opt-in |

Only `baseline` and `live` numbers may inform promotion decisions. `echo` and
`fallback` are test harnesses.

`--grounding enforce` (default) hard-fails rows with unsupported claims and
records every field verdict in `groundingReport`; `--grounding raw` records
unsupported claims per row without failing. See
[baseline-benchmark](baseline-benchmark.md) for the baseline's grounded
63 / unsupported 0 / unverifiable 37 outcome.

## Metrics

### Envelope tasks (extraction, classification)

Per-field, over the union of predicted and expected fields:

- **TP** predicted valued and equivalent to expected
- **FP** predicted valued but wrong (wrong value, or value where expected is null → hallucination)
- **FN** expected valued but predicted empty (miss/under-extraction)
- **TN** both empty (correct abstention)
- **precision / recall / F1**, **hallucinationRate = FP/(TP+FP)**, **missRate = FN/(TP+FN)**, **abstentionAccuracy = TN/(FP+TN)**, **statusAccuracy**

Value equivalence is normalized: case/whitespace-insensitive strings,
order-insensitive lists, and phone/coordinates compared by digits so
`(415) 487-2600` matches `+14154872600`.

### Generative tasks (brand.dna, strategy.*)

- **Contract compliance** (JSON Schema) and **post-validation** — hard gates;
  a row that fails either is a failure.
- **Key coverage** — fraction of the expected output's top-level keys present.
- website.analysis adds **overallScore MAE** and **category score MAE** vs the
  reference, plus `websiteExists` match.

### Calibration (baseline + live only)

For every valued field, collect `{confidence, correct}` pairs and run
`confidence.calibrationReport` → ECE, Brier, accuracy, mean confidence,
false-confidence rate (conf ≥ 0.85 but wrong). If a model says 0.90 and is
right 75% of the time, its confidence is not calibrated and it must not be
promoted past the confidence gate.

## Modeling the gate

The promotion thresholds are in `docs/ai/model-spec.md`. Relevance warning
(genuine, not cargo cult): at `hallucinationRate ≤ 0.02` you need on the order
of a few thousand field decisions to observe a hallucination with confidence;
the v0.1.0 seed holdout (~30 field decisions per extraction example) cannot
resolve that gate. Therefore: treat threshold #2 as **required** but not yet
resolvable — Phase 2 dataset sizing (≥ 1,200 examples) is what makes it
decidable. Until then, promotion decisions for real models must rely on
holdout F1 + ECE + adversarial abstention probes.

## Recording results

`recordBenchmark(modelId, reportId, metrics)` (see `modelRegistry.js`) appends
a benchmark run to the model's `benchmarks[]` so a future evaluator can
compare old and new without re-running. Compare with `compareModels(a, b)`.

## Analysis and dataset tooling

```
node eval/analyze.js --reports <reports.json...> --out baseline
# → baseline/{model,metrics,failures,analysis,report}.md   (failure taxonomy + aggregates)

npm run ai:dataset:validate    # structure + contract + grounding + leakage gate (FAILs on any error)
npm run ai:dataset:report      # quality score → docs/ai/dataset-quality.md (gate ≥ 0.85)
npm run ai:corrections:baseline# promote baseline failures → HITL correction store (idempotent)
```

Failure taxonomy shells in `eval/analyze.js`; the observed baseline
distribution and root causes are documented in
[failure-analysis](failure-analysis.md).

## Standard runs

```
# Harness sanity (must be green in CI before any real run)
npm run benchmark:ai                        # echo and fallback on holdout

# Real baseline through the provider gateway (AI_BASELINE_PROVIDER/MODEL/FORMAT)
npm run ai:benchmark:baseline -- --out eval/reports/baseline-holdout.json

# Production stack
npm run ai:benchmark:live -- --out eval/reports/live-holdout.json
```