# Webloom Fine-Tuning

This directory prepares and runs the fine-tuning experiments that produce a
Webloom model. Nothing here trains without an explicit command, and nothing
here spends money unless a cloud GPU is explicitly authorized.

## Pipeline

```
datasets/ (train + validation splits, versioned)
   │   npm run ai:dataset:format
   ▼
finetune/format/<dataset>@<version>/train.jsonl · validation.jsonl
   │   (chat rows; meta carries evidence, provenanceSources, failureCategories)
   │   npm run ai:finetune:validate  →  holdout guard + format (fail-loud)
   ▼
finetune/configs/webloom-v0.1.json        (single pinned experiment config)
   │   npm run ai:finetune  →  scripts/train_lora.py (QLoRA → LoRA fallback)
   ▼
finetune/runs/webloom-v0.1/               (checkpoints, metrics.jsonl, manifest.json)
   │   npm run ai:finetune:evaluate → scripts/select_checkpoint.py (validation)
   ▼
register → models/registry.json  (type "webloom", status configured → candidate)
   │   npm run ai:model:load  →  adapter serving health-check
   ▼
benchmark holdout (eval/run.js --backend webloom --model webloom-ai-v0.1.0)
   → compare vs baseline → promote to active-production only when proven better
```

## Rules

1. **Train + validation are formatted; holdout never is.** Formatting reads
   `datasets/manifest.json` and only touches `split: train|validation`. The
   holdout split is the only benchmark split. `scripts/protect_holdout.mjs`
   re-verifies every formatted row's exampleId and business against the
   manifest and exits non-zero on any leak — it runs before every training
   start (`ai:finetune:validate`) and again inside `train_lora.py`.
2. **Prompts are pinned.** The formatted user turn uses the exact task
   prompt builder (`apps/api/src/ai/prompts`), so what we train on is
   byte-identical in structure to what the app serves. `promptVersion` is
   recorded per row.
3. **Every row is traceable.** `exampleId`, `task`, `datasetVersion`, and a
   `meta` block (evidence, provenanceSources, baseline failureCategories,
   annotation, split) travel into the formatted file. Confidence/uncertainty
   are runtime measurements and are recorded as `null` here rather than
   fabricated.
4. **One config, versioned.** `configs/webloom-v0.1.json` is the single
   source of truth: experiment metadata, data, LoRA, quantization, training,
   tokenizer, checkpoint selection, and environment requirements. Register
   the exact values you train with into the model registry entry.

## Commands (from apps/api)

| command                  | purpose                                                  |
|--------------------------|----------------------------------------------------------|
| `ai:dataset:format`      | (re)build `finetune/format/*/train|validation.jsonl`     |
| `ai:finetune:validate`   | holdout guard + format — must pass before training       |
| `ai:finetune`            | run the pinned experiment (explicit; never in tests)     |
| `ai:finetune:evaluate`   | rank checkpoints on validation, pick best                |
| `ai:model:load`          | registry resolution + adapter serving health-check       |

Dry-run the full Python pipeline without training claims:
`bash finetune/scripts/train_runner.sh --dry-run --model Qwen/Qwen2.5-0.5B-Instruct`

## Environment

`requirements.txt` is the Python contract (torch, transformers, peft,
accelerate, datasets, sentencepiece; bitsandbytes is CUDA-only). Create the
venv, which is gitignored:

```
python3 -m venv finetune/.venv
finetune/.venv/bin/pip install -r finetune/requirements.txt
```

On CPU/MPS the trainer auto-degrades QLoRA → 16-bit LoRA and
`paged_adamw_8bit` → `adamw_torch`, recording the deviation in the experiment
manifest instead of wasting resources.

## Cost / hardware reality

The pinned experiment (`Qwen/Qwen2.5-7B-Instruct`, QLoRA 4-bit) needs a CUDA
GPU with ≥16 GB VRAM. The trainer runs it; deployment is the same
`VLLM`/llama.cpp OpenAI-compatible server used by the baseline. No cloud GPU
is launched without explicit authorization.