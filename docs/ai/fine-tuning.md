# Webloom AI — Fine-Tuning

Goal: specialize the Apache-2.0 baseline into a Webloom model that extracts
business facts from evidence without fabricating, and generates strategies
inline with our discipline — while staying *smaller and cheaper* than calling
a frontier model for every business.

## Do / don't

**Do**

- Train on `split: "train"` examples only, using the pinned prompt builders so
  train-time prompts match serving prompts byte-for-byte.
- Ground the fine-tune dataset in `evidence[]`; the model must learn to cite
  before it learns to answer.
- Keep the envelope discipline in labels: an unsupported fact must be labeled
  UNKNOWN, not guessed.
- Re-benchmark the identical holdout after tuning and compare against the
  baseline via `compareModels`.

**Don't**

- Don't train on holdout. Ever. It is the only independent judge.
- Don't train on golden outputs that violate grounding (the dataset test
  enforces this; keep it in CI).
- Don't add factual domain knowledge absent from training inputs — that is how
  small models fabricate plausibly.

## Steps

1. **Format dataset** → `npm run ai:data:format`
   Produces `finetune/format/<dataset>@<version>/train.jsonl`, chat-format rows
   with pinned prompts and assistant labels.
2. **Review formatted rows** — human/CI spot-check; the format is the interface.
3. **Configure** — edit `finetune/configs/{lora,train,tokenizer}.json`.
   Defaults are conservative: `r=8`, `alpha=16`, dropout 0.05, LR 2e-4 cosine,
   10 epochs, `max_seq_length=8192`, QLoRA-capable optimizer.
4. **Train** (example, using `transformers` + `peft` + `trl`):

   ```
   python finetune/train.py \
     --model Qwen/Qwen2.5-7B-Instruct \
     --data finetune/format \
     --config finetune/configs/lora.json \
     --train-config finetune/configs/train.json \
     --output finetune/runs/webloom-v0.1.0
   ```
5. **Register** the produced adapter in `models/registry.json`:
   `type: "webloom"`, `foundationModel`, `trainingConfig`, `loraConfig`,
   `datasetVersions` pinned. `registerModel()` validates the shape.
6. **Benchmark** the holdout with `--backend baseline` (before) and
   `--backend webloom`/`live` (after), then `recordBenchmark` both. Promote
   only if the model-spec gate passes (F1, hallucination rate, ECE,
   beat-baseline, no-fabrication ablation).

## What a fine-tune is (and isn't) allowed to change

- **Allowed:** output formatting, citation discipline, envelope hygiene,
  abstention behaviour, task-specific structure adherence, cheaper
  extraction/classification.
- **Not allowed:** inventing services, prices, hours, awards, reviews,
  certifications, or history. The input + evidence are the only sources of
  truth; grounding enforcement stays ON in production regardless of how good
  the model looks.

## Basics of the loop

```
baseline benchmark ──┐
                     ▼
        curated dataset (holdout immune)
                     ▼
      fine-tune → candidate → holdout benchmark → gate?
        no ────────────────┘  yes → register active-production
                                               │
                    production corrections ────┘→ next dataset version
```

## Environment/versioning notes

- Training happens outside this repo (data + config live here; weights never
  get committed). The registry entry is the contract describing what was
  trained and on what.
- Pin the tokenizer/foundation to the same version recorded in
  `finetune/configs/tokenizer.json` and the registry, or results shift with
  unrelated upstream changes.