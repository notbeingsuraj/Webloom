# Webloom AI Datasets

Training and evaluation data for the Webloom AI model. This directory is the
single source of truth for dataset versioning; the benchmark runner, the
dataset formatter, and future fine-tuning jobs all read from here.

## Layout

```
datasets/
├── manifest.json                     # authoritative index: task → version → split → file
├── extraction/v0.1.0/train.jsonl     # A. field extraction (+ evidence reasoning, classification)
├── business-dna/v0.1.0/train.jsonl   # D. Business DNA generation
├── website-analysis/v0.1.0/train.jsonl # E. website analysis
├── strategy/v0.1.0/train.jsonl       # F. website strategy + landing page spec
├── evaluation/
│   └── holdout/v0.1.0/               # NEVER used for training — benchmark only
│       ├── extraction.jsonl
│       ├── business-dna.jsonl
│       ├── website-analysis.jsonl
│       └── strategy.jsonl
└── corrections/                      # human-in-the-loop corrections (append-only JSONL)
    └── corrections.jsonl
```

## Rules

1. **Train and holdout are disjoint.** Different example ids, different
   businesses, no shared inputs. The holdout set is evaluated, never trained
   on, never tuned on.
2. **Every example is versioned.** Directory version (`v0.1.0`) + entry in
   `manifest.json`. Dataset versions are recorded against every model in
   `models/registry.json`.
3. **Every example carries evidence.** Expected outputs must be derivable
   from the `input` + `evidence` fields of the same example. An expected
   value that its own evidence does not support is a bug in the dataset.
4. **UNKNOWN is a valid expected output.** When the evidence does not
   support a field, the expected output is the UNKNOWN envelope
   (`value: null, confidence: 0, provenance: "unknown", status: "missing"`).
   Abstention is scored, not penalized.
5. **Seed data.** The `v0.1.0` examples are hand-authored seed data that
   validates the format and the harness. Phase 2 replaces/extends them with
   curated real-world captures.

## Example format

One JSON object per line:

```json
{
  "exampleId": "ext-tartine-001",
  "task": "extraction.business_profile",
  "datasetVersion": "v0.1.0",
  "split": "train",
  "input": { "rawBusinessData": {}, "websiteText": "", "evidence": [] },
  "expectedOutput": { "identity.name": { "value": "...", "confidence": 0.97, "provenance": "ai_generated", "status": "extracted", "evidence": [] } },
  "evidence": [],
  "source": { "type": "seed_annotation", "url": null, "retrievedAt": "2026-10-06" },
  "annotation": { "status": "gold", "qualityScore": 1.0, "annotatedBy": "webloom-seed" },
  "promptVersion": "webloom-tasks-v1"
}
```

`input` and `expectedOutput` shapes are defined per task by the contracts in
`apps/api/src/ai/contracts/` and the task registry in
`apps/api/src/ai/tasks.js`.
