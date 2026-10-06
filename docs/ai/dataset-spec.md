# Webloom AI — Dataset Specification

Layout, format, and governance of everything under `datasets/`.

## Layout

```
datasets/
├── manifest.json                     # authoritative index (task → version → split → file)
├── extraction/v0.1.0/train.jsonl     # extraction.business_profile train
├── business-dna/v0.1.0/train.jsonl   # brand.dna train
├── website-analysis/v0.1.0/train.jsonl  # website.analysis train
├── strategy/v0.1.0/train.jsonl       # strategy.website + strategy.landing_page train
├── evaluation/holdout/v0.1.0/        # holdout: extraction, business-dna, website-analysis, strategy (frozen)
├── evaluation/validation/v0.1.0/     # validation: same four task files, businesses disjoint from train + holdout
└── corrections/corrections.jsonl     # human-in-the-loop corrections (append-only; 22 recorded from baseline)
```

## Format

One JSON object per line (JSONL): git-friendly, diffable, mergeable.

```json
{
  "exampleId": "ext-tartine-001",
  "task": "extraction.business_profile",
  "datasetVersion": "v0.1.0",
  "split": "train",
  "input": { "rawBusinessData": {}, "websiteText": "", "evidence": [] },
  "expectedOutput": { "identity.name": { "value": "...", ... } },
  "evidence": [],
  "source": { "type": "seed_annotation", "url": null, "retrievedAt": "2026-10-06" },
  "annotation": { "status": "gold", "qualityScore": 1.0, "annotatedBy": "webloom-seed" },
  "promptVersion": "webloom-tasks-v1"
}
```

- `input` shape is task-specific and must be reproducible for inference; the
  benchmark passes `input` straight into `WebloomAI.run`.
- `expectedOutput` — for envelope tasks this is a full envelope object per
  field (including **UNKNOWN** envelopes: `value: null, confidence: 0,
  provenance: "unknown", status: "missing"`). For generative tasks it is the
  reference answer the reviewer accepted.
- `evidence` mirrors `input.evidence` for traceability.

## Governance rules (enforced by `apps/api/test_ai_datasets.js`)

1. **Holdout is never trained on.** Train and holdout are disjoint by
   exampleId *and* by business. `format_dataset.mjs` only consumes
   `split: "train"`.
2. **Every gold expected value must be derivable from the example's own input
   + evidence.** The dataset test runs grounding in `report` mode over every
   gold expected output and fails the suite on any `unsupported` field. An
   expected value its evidence cannot support is a bug in the dataset.
3. **UNKNOWN is a first-class expected output.** If the evidence does not
   support a field, the expected envelope is UNKNOWN. Scoring rewards correct
   abstention and penalizes fabrications.
4. **Versioning.** Directory `vX.Y.Z` + a manifest entry per split. Model
   registry entries pin the dataset versions a model was trained/evaluated on.
5. **Seed data disclaimer.** The v0.1.0 set is hand-authored seed data to
   validate format + harness and to support mock benchmarking. Phase 2
   replaces/augments it with curated real captures (production + HITL
   corrections). Seed examples are `source.type: "seed_annotation"`; corrected
   additions are `correction_foundation` / `curator_annotation`.

## Validation gates (`apps/api/eval/dataset_validate.js`)

`npm run ai:dataset:validate` re-runs the structural/contract/grounding checks
and adds gates that **fail the build** (exit 1):

- **Leakage** — a business or exampleId present in more than one split
  (train / validation / holdout) is a hard failure.
- **Global id uniqueness** across every split.
- **Evidence required** on every example (manifest rule `evidenceRequired`).
- **Well-formed UNKNOWN envelopes** — `value: null` must carry
  `provenance: "unknown"`, `status: "missing"`, `confidence: 0`, and empty
  evidence; a valued field may never ship with `provenance: "unknown"`.

Quality checks and a dataset report (`npm run ai:dataset:report`) write
`docs/ai/dataset-quality.md` and gate on a composite score ≥ 0.85.

## Generation strategy (Phase 2)

- **Production extraction outcomes** where the human verified the result →
  gold, via HITL (`apps/api/src/ai/hitl/correctionStore.js`).
- **Failures and corrections** — every human correction (`reason` ∈
  `wrong_extraction, missing_information, hallucination, ...`) becomes a draft
  example (`correctionsToExampleDrafts`) that curators promote into a versioned
  train split.
- **Synthetic negatives** — adversarial holdouts: evidence text with a
  plausible-but-false number/claim removed; the model must abstain.
- **Real business diversity** — target distribution across industries,
  presence/absence of website, evidence quality, non-US formats (phone, address,
  postal codes), ambiguity (conflicting phone between sources).

## Corrections store

`datasets/corrections/corrections.jsonl` (append-only) — schema in
`apps/api/src/ai/hitl/correctionStore.js`. Fields: `correctionId`, `taskId`,
`fieldPath`, `originalValue`, `correctedValue`, `reason`, `correctedBy`,
`source` (production/review/evaluation), `inputSnapshot`, `evidence`, `createdAt`.
Corrections never mutate data in place; they feed the review and dataset
pipeline.

## Sizing guidance

- v0.1.0 now: **14 train / 6 validation / 6 holdout** across tasks — a
  format + harness proof, plus the first baseline-failure coverage (see
  [dataset-v0.1](dataset-v0.1.md)).
- v0.2.0 (Phase 2 target): ≥ 200 extraction examples per industry cohort
  (~1,200+ total), ≥ 100 per generative task, holdout ≥ 15% with never-seen
  businesses. Enough to make the holdout gate statistically meaningful for
  hallucination rate (≈ 0.02 needs thousands of field decisions — see
  evaluation doc).