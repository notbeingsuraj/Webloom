# Webloom Fine-Tuning Prep

This directory is the bridge between the curated dataset (`../datasets/`) and a
fine-tuned Webloom model. Nothing here downloads weights, runs training, or
spends money — it prepares versioned, reviewable training artifacts.

## Pipeline

```
datasets/ (train splits, versioned)
   │   npm run ai:data:format
   ▼
finetune/format/<dataset>@<version>/train.jsonl      # chat-format examples (scripts/format_dataset.mjs)
   │  (review + validation by human/CI)
   ▼
finetune/configs/lora.json · train.json · tokenizer.json
   │
   ▼
train on baseline model (e.g. Qwen/Qwen2.5-7B-Instruct via LoRA/QLoRA)
   │
   ▼
register → models/registry.json  (type "webloom", hyperparams + dataset versions pinned)
   │
   ▼
benchmark holdout → compare vs baseline → promote to active-production
```

## Rules

1. **Only `split: "train"` examples are ever formatted for training.** Holdout
   stays untouched and is the only benchmark split. `format_dataset.js` reads
   `datasets/manifest.json` and refuses `split !== 'train'`.
2. **Prompts are pinned.** The formatted user turn uses the exact task prompt
   builder (`apps/api/src/ai/prompts`), so what we train on is byte-identical
   in structure to what the app serves. `promptVersion` is recorded per row.
3. **Every row is traceable.** `exampleId`, `task`, `datasetVersion`, and
   `source` travel into the formatted file so a row can be traced back to a
   human-labeled example or a production correction.

## Configs

- `configs/lora.json` — LoRA adapter hyperparameters (rank, alpha, dropout,
  target modules). Start small: rank 8, alpha 16.
- `configs/train.json` — SFTTrainer/hf-trainer style training arguments
  (batch size, LR, scheduler, epochs, eval strategy, seed).
- `configs/tokenizer.json` — tokenizer settings that must match the baseline
  foundation model (Qwen2.5 tokenizer, chat template).

These configs are documented defaults. Adjust them, review the diff, and pin
whatever you actually train with into the model registry entry.