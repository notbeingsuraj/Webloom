# Webloom AI — Baseline Benchmark v0.1.0

A measured, honest starting point for the **Qwen/Qwen2.5-7B-Instruct** baseline
before any prompt optimization, repair-tuning, or fine-tuning. The baseline is
the registered foundation model `webloom-ai-baseline-0.1.0` (see
`models/registry.json`), served through the app's existing provider gateway
(`AI_BASELINE_PROVIDER=openrouter`).

## Why a baseline

Everything Webloom's AI layer claims must have a number attached. The baseline
run records what an **unmodified, generic 7B model** can do on Webloom's exact
contracts and holdout, so every later improvement (prompts, repair, fine-tune)
is measured against the same task set and scoring code.

## Configuration

`apps/api/.env` (git-ignored):

```
AI_BASELINE_PROVIDER=openrouter
AI_BASELINE_MODEL=qwen/qwen-2.5-7b-instruct
AI_BASELINE_FORMAT=none
```

A deliberate choice: `AI_BASELINE_FORMAT=none`. Forcing structured output
(`json_object`) over OpenRouter made Qwen collapse the flat 20-field extraction
bag into a single envelope — a *degraded* schema most of the time. With
`none`, the model emits its natural flat JSON and the repair layer handles the
rough edges (see [failure-analysis](failure-analysis.md)).

## Methodology

- Two runs over the v0.1.0 corpus as it stood at benchmark time:
  - **holdout** `evaluation/holdout/v0.1.0/*` — 6 examples
  - **train** `datasets/*/v0.1.0/train.jsonl` — 9 examples
- Backend: `eval/run.js --backend baseline --grounding enforce`, contract
  failures recorded (not thrown) via the `{result}`/`{error, failure}` runner
  contract in `eval/backends.js`.
- Analysis: `eval/analyze.js` → `baseline/{model,metrics,failures,analysis,report}.md`.

> The corrected examples added during the dataset pass (see
> [dataset-v0.1](dataset-v0.1.md)) came **after** this run and are **not**
> included in these numbers. The holdout is frozen and unchanged.

## Results (15 examples)

### Overall

| metric | value |
|---|---|
| examples | 15 (5 holdout ok, 5 train ok) |
| **ok** | **10 (66.67%)** |
| schema-compliant | 0 / 15 (0%) |
| raw consumer-ready | 0 / 15 (0%) |
| failed rows | 5 (all generative tasks failed post-validation) |
| avg latency | ~7.8 s / example |

### Extraction value quality

`extraction.business_profile` (envelope task, 5 examples, 100 field decisions):

| metric | value |
|---|---|
| precision | 0.8571 |
| recall | 0.8182 |
| **F1** | **0.8372** |
| TP / FP / FN / TN | 54 / 9 / 12 / 25 |

### Grounding (enforce mode)

| verdict | count |
|---|---|
| grounded | 63 |
| unsupported | 0 |
| unverifiable | 37 |

Zero unsupported claims: when the model declined to answer or stuck to evidence,
it stayed honest. The failure mode is **getting the shape wrong**, not inventing
facts at the value level.

### Calibration (63 valued-field confidence pairs)

| metric | value |
|---|---|
| accuracy | 0.8571 |
| ECE | 0.1333 |
| Brier | 0.1314 |
| mean confidence | 0.9905 |
| false-confidence rate (≥0.85 but wrong) | 0.127 |

The model is severely **over-confident**: mean confidence ≈ 0.99 while accuracy
is 0.86. This is the core calibration problem the Phase 2 confidence work must
fix before any promotion gate that uses self-reported confidence.

## Failure categories

| category | count |
|---|---|
| SCHEMA_ERROR | 15 |
| EXTRACTION_ERROR | 5 |
| CONFIDENCE_ERROR | 4 |
| HALLUCINATION | 2 |

Every category is analyzed in [failure-analysis](failure-analysis.md) together
with the data and tooling responses.

## Reproduce

```
cd apps/api
npm run ai:benchmark:baseline -- --dataset holdout --grounding enforce --out /tmp/baseline_holdout.json
npm run ai:benchmark:baseline -- --dataset train   --grounding enforce --out /tmp/baseline_train.json
node eval/analyze.js --reports /tmp/baseline_holdout.json /tmp/baseline_train.json --out baseline
node eval/record_baseline_corrections.js       # promote failures → HITL store
```

Artifacts persist in `baseline/` (model.json, metrics.json, failures.json,
analysis.json, report.md); raw example-level reports are in
`eval/reports/baseline-*.json`.