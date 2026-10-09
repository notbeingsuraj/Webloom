# Webloom AI — Fine-Tuning

Goal: specialize the Apache-2.0 baseline into a Webloom model that extracts
business facts from evidence without fabricating, and generates strategies
inline with our discipline — while staying *smaller and cheaper* than calling
a frontier model for every business.

## Do / don't

**Do**

- Train on `split: "train"` + `split: "validation"` examples only (validation
  breads development/checkpoint selection; holdout stays untouched), using the
  pinned prompt builders so train-time prompts match serving prompts
  byte-for-byte.
- Ground the fine-tune dataset in `evidence[]`; the model must learn to cite
  before it learns to answer.
- Keep the envelope discipline in labels: an unsupported fact must be labeled
  UNKNOWN, not guessed.
- Run the automated holdout guard (`ai:finetune:validate`) before every
  training start; the guard and the trainer both fail loud on any leak.
- Re-benchmark the identical holdout after tuning and compare against the
  baseline via `compareModels`.

**Don't**

- Don't train on holdout. Ever. It is the only independent judge.
- Don't train on golden outputs that violate grounding (the dataset test
  enforces this; keep it in CI).
- Don't add factual domain knowledge absent from training inputs — that is how
  small models fabricate plausibly.
- Don't run training, or spend on cloud GPUs, without an explicit decision:
  `ai:finetune` is a deliberate command that never runs in the test suite and
  never executes without user authorization when it involves paid hardware.

## Steps

1. **Format dataset** → `npm run ai:dataset:format`
   Produces `finetune/format/<dataset>@<version>/{train,validation}.jsonl`,
   chat-format rows with pinned prompts, assistant labels, and a `meta` block
   carrying evidence / provenanceSources / baseline failureCategories.
2. **Verify + review formatted rows** → `npm run ai:finetune:validate` runs
   the holdout guard (fail-loud) and rebuilds the format. Human/CI spot-check
   the rows; the format is the interface.
3. **Configure** — `finetune/configs/webloom-v0.1.json` is the single pinned
   experiment config (experiment metadata, data, LoRA, quantization, training,
   tokenizer, checkpoint selection, environment). Defaults are conservative:
   `r=8`, `alpha=16`, dropout 0.05, LR 2e-4 cosine, 8 epochs, seed 17,
   `maxSeqLength=8192`, plain bf16 LoRA (QLoRA 4-bit is reserved for ≥7B bases
   on CUDA and is off for this experiment, with the rationale in the config).
4. **Train** (explicit command, never part of tests):

   ```
   npm run ai:finetune            # trains finetune/configs/webloom-v0.1.json
   bash finetune/scripts/train_runner.sh --dry-run --output-dir finetune/runs/dryrun  # plumbing check
   ```
   Writes checkpoints + `metrics.jsonl` + an experiment `manifest.json`
   (commit, config hash, seed, framework versions, hardware, device, dtype,
   split counts, deviations) into `finetune/runs/webloom-v0.1/`, then promotes
   the small reproducibility artifacts into `finetune/experiments/webloom-v0.1/`.
   Requires a Python ML venv per `finetune/requirements.txt`; the 1.5B base
   trains on CPU/MPS as well as CUDA, so no GPU is required for v0.1.
5. **Select checkpoint** → `npm run ai:finetune:evaluate` scores checkpoints
   on the validation split (json validity, field coverage, abstention,
   hallucination penalty) against an un-fine-tuned **base control arm** and
   records the ranking in `evaluation.json`. This is development ranking; the
   decisive numbers come from the holdout.
6. **Register** the produced adapter in `models/registry.json`:
   `type: "webloom"`, `foundationModel`, `trainingConfig`, `loraConfig`,
   `datasetVersions` pinned; status `candidate` (never `production` on day one).
   `npm run ai:finetune:register` builds the record from the experiment
   artifacts (no hand-typed metrics); `registerModel()` validates the shape and
   `npm run ai:model:load` is the serving health-check. `npm run ai:serve`
   starts the local OpenAI-compatible server (base + selected adapter merged).
7. **Benchmark** the holdout: `eval/run.js --backend baseline` (before) and
   `--backend webloom --model webloom-ai-v0.1.0` (after, opt-in candidate),
   then `recordBenchmark` both and `compareModels`. Promote to
   `active-production` only if the model-spec gate passes (F1, hallucination
   rate, ECE, beat-baseline, no-fabrication ablation). Baseline stays the
   default until the candidate provably wins.

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
  trained and on what. `finetune/runs/` and `finetune/.venv/` are gitignored
  (checkpoints, logs, and manifests never go in the repo).
- Pin the tokenizer/foundation to the foundation model recorded in
  `finetune/configs/webloom-v0.1.json` and the registry, or results shift with
  unrelated upstream changes.
- Hardware reality: the pinned v0.1 experiment uses `Qwen/Qwen2.5-1.5B-Instruct`
  bf16 LoRA (~3 GB weights) and runs on CPU/MPS/CUDA — no GPU required. A later
  confirmation run at `Qwen/Qwen2.5-7B-Instruct` QLoRA 4-bit needs a CUDA GPU
  with ≥16 GB VRAM (~4–6 GB model + LoRA + activations at batch 2 / seq 8192);
  that run must happen on explicitly authorized hardware. The trainer reports
  the exact limitation rather than forcing an unusable run.