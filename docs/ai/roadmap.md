# Webloom AI — Roadmap

## Phase 1 — Foundation (this phase) ✅

Shipped and testable:

- **AI task layer** — 7 contracted tasks, versioned prompts, provider
  abstraction (webloom → external → fallback), UNKNOWN-envelope discipline.
- **Hallucination guard** — snippet grounding core + enforcement wired into the
  legacy fallback extractor (config-flagged, default on), verified against
  p18 / quality_boundary / benchmark v2.
- **Confidence** — bands + offline calibration (ECE/Brier/false-confidence).
- **Model versioning** — `models/registry.json` + registry API, baseline
  registered (`webloom-ai-baseline-0.1.0`, Qwen2.5-7B-Instruct, configured).
- **Datasets** — seed v0.1.0 train/holdout + versioned manifest, governance
  tests (grounding self-check, disjointness, contract conformance).
- **Evaluation harness** — echo / fallback / baseline / live backends,
  field-level metrics, calibration, reports (CI-safe echo+fallback runs).
- **Fine-tuning prep** — format script + configs (lora/train/tokenizer).
- **HITL** — correction store feeding dataset drafts.

## Phase 2 — Data + guard hardening

1. **Collect and curate** the real training dataset (target: 1,200+ extraction
   examples across industry cohorts, 100+ per generative task, holdout ≥ 15%,
   never-seen businesses, adversarial abstention cases).
2. **Wire HITL corrections** into curation workflow; promote correction drafts
   to train splits.
3. **Close residual hallucination gaps** (tracked in
   hallucination-prevention.md):
   - snippet-ground each reputation review quote + per-review confidence gate;
   - migrate `inferred` → `ai_generated` provenance labeling with
     `test_quality_boundary.js` updated in the same commit;
   - persist rejected-claim evidence for HITL learning.
4. **Expand calibration** — run baseline benchmark at dataset-scale; publish
   the baseline's ECE/hallucination ceiling for the gate.

## Phase 3 — First fine-tune

1. Run baseline holdout benchmark (`npm run ai:benchmark:baseline`).
2. Format v0.2.0, train LoRA/QLoRA on Qwen2.5-7B-Instruct.
3. Register candidate; benchmark identical holdout; run promotion gate from
   `docs/ai/model-spec.md` (F1 ≥ 0.90, hallucination ≤ 0.02, ECE ≤ 0.08,
   beat baseline, no-fabrication ablation).
4. Promote to `active-production`; external chain demoted to fallback.

## Phase 4 — Production & loop

1. Route live tasks through the webloom provider with grounding on.
2. Record production-level accuracy + correction flow; feed back into dataset.
3. Consider per-task specialized models only after cohort-level failure
   analysis; keep registry + benchmark discipline.

## Explicitly out-of-scope for Phase 1

- Actually training a model (no weights, no external spend).
- Rewriting `AIService.js` or the existing extractor internals.
- Changing the `inferred` provenance label.
- Live baseline benchmarks without an explicit opt-in run.