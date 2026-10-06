# Webloom AI — Model Specification

## Baseline model (registered)

| field | value |
|-------|-------|
| id | `webloom-ai-baseline-0.1.0` |
| type | `baseline` |
| foundation model | `Qwen/Qwen2.5-7B-Instruct` |
| license | Apache-2.0 |
| quantization | `Q4_K_M` (recommended for local serving) |
| serving | Ollama `qwen2.5:7b-instruct` (or any OpenAI-compatible local endpoint) |
| status | `configured` |
| prompt version | `webloom-tasks-v1` |

Registered in `models/registry.json`. The baseline is exactly what we benchmark
*against*: a capable, freely-licensed instruct model with no Webloom-specific
training. Any fine-tuned Webloom model must beat it on the holdout field-level
metrics, not merely match it.

## What the model is asked to do

Seven tasks, defined by contracts in `apps/api/src/ai/contracts/index.js` and
prompted by `apps/api/src/ai/prompts/index.js`:

- `extraction.business_profile` — grounded field extraction (envelope output)
- `evidence.reasoning` — verdicts per field claim against evidence
- `classification.business` — industry/segment/positioning (envelope output)
- `brand.dna` — Business DNA generation
- `website.analysis` — 11-category digital audit
- `strategy.website` — website strategy generation
- `strategy.landing_page` — landing page specification

Two of these (extraction, classification) are envelope-keyed and are scored
field-by-field; the rest are generative and scored on contract compliance,
key coverage, and score deltas.

## Why Qwen2.5-7B-Instruct as the baseline

- Apache-2.0 — no commercial-use or fine-tuning restrictions.
- 7B class runs in Q4 on a single consumer GPU or via Ollama on a laptop;
  Webloom is a sales-platform for small businesses, not an inference farm.
- Strong instruction-following and JSON adherence for its size; good enough to
  expose whether Webloom-specific behaviour actually improves with tuning.
- Local serving removes per-call API cost for benchmarking and for HITL data
  collection.

### Alternatives considered (documented, not acted on)

| model | license | verdict |
|-------|---------|---------|
| `Qwen/Qwen2.5-7B-Instruct` | Apache-2.0 | **chosen baseline** |
| `Llama-3.1-8B-Instruct` (Meta) | Llama 3.1 Community (attribution) | fine, but heavier EULA + attribution overhead for an internal tool; keep as candidate for later evaluation |
| `Mistral-7B-Instruct-v0.3` | Apache-2.0 | viable; slightly weaker JSON/instruction stability in our probes |
| `Phi-3-mini/medium-instruct` | MIT | too small for reliable multi-category audits with long evidence |
| OpenAI GPT-4o / Gemini / Claude | commercial | licensed as *external* chain providers for production, never as the fine-tuning baseline (no weight access) |

The decision rule for re-baselining later: pick the largest Apache-2.0 (or
similarly permissive) instruct model that runs acceptably on the serving
budget, and only after a head-to-head baseline-benchmark comparison.

## Acceptance thresholds (promotion gate)

A candidate Webloom model passes only if, on **holdout** (never train), across
the tasks it claims to serve:

1. Extracts ≥ 0.90 field F1 on `extraction.business_profile`.
2. Hallucination rate ≤ 0.02 on extraction (predicted valued fields whose
   expected value is null, plus grounded fields the evidence cannot support)
   — with grounding `enforce` active.
3. Abstention accuracy ≥ 0.85 (fields that should be empty are left empty).
4. ECE ≤ 0.08 on self-reported confidence for correct/wrong valued fields.
5. Generative tasks: 100% contract compliance + post-validation; key coverage
   ≥ 0.90; website.analysis overallScore MAE ≤ 1.0 vs reference.
6. **Strictly beats the baseline** on field F1 and hallucination rate on the
   same holdout (no regression on any other metric beyond a documented ±1%).
7. No factual fabrication introduced in adversarially-constructed holdouts
   (snipped evidence). Grounded snippets must be real occurrences.

Thresholds are tunable via the benchmark report config, but the *definition* of
the gate lives here. Numbers below gate → do not promote; investigate, tune,
or collect more data.

## Environments

| env | provider spec | notes |
|-----|---------------|-------|
| dev / local eval | `baseline` | Ollama qwen2.5:7b-instruct |
| staging | `baseline` then `webloom` after first tuning | compare side by side |
| production | `auto` (webloom → external fallback) | external chain is the safety net while the fine-tuned model earns trust |