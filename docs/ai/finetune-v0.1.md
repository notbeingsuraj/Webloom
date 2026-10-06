# Webloom AI v0.1 — Fine-Tune Experiment Report

Status: **FOUNDATION COMPLETE — TRAINING BLOCKED ON HARDWARE**

- Experiment id: `webloom-v0.1`
- Registry id: `webloom-ai-v0.1.0` (status `configured`)
- Date: 2026-10-06

## Objective

Run the first controlled fine-tuning experiment: a LoRA/QLoRA adapter over the
registered baseline foundation model (`Qwen/Qwen2.5-7B-Instruct`, Apache-2.0)
so that any improvement claim is a clean comparison against the preserved
baseline (`webloom-ai-baseline-0.1.0`) on the **untouched holdout**. The model
must learn Webloom's discipline: extract business facts grounded in evidence,
label UNKNOWN instead of guessing, and emit contract-compliant JSON.

## What is in place (this phase)

1. **Formatting (both splits)** — `finetune/scripts/format_dataset.mjs` now
   formats TRAIN **and** VALIDATION into `finetune/format/<dataset>@v0.1.0/`
   chat rows (14 train / 6 validation). Each row carries a `meta` block that
   preserves evidence, provenance sources, baseline failure categories, and the
   split — confidence/uncertainty stay `null` because they are runtime
   measurements, never fabricated.
2. **Automated holdout protection (fail-loud)** — `protect_holdout.mjs` (Node)
   and an independent Python re-implementation inside `train_lora.py` verify
   that no holdout exampleId or business name appears in any formatted
   training/validation file. Verified disjoint: 14/6/6 ids, 4/2/2 businesses.
   `ai:finetune:validate` gates every training start.
3. **Single pinned experiment config** — `finetune/configs/webloom-v0.1.json`
   replaces the three legacy files; it is the one source of truth for the
   experiment (data, LoRA, quantization, training, tokenizer, checkpoint
   selection, environment).
4. **Trainer** — `finetune/scripts/train_lora.py` runs the config end-to-end:
   QLoRA 4-bit when a CUDA GPU + bitsandbytes exist, graceful 16-bit LoRA
   otherwise (deviation recorded); writes checkpoints, `metrics.jsonl`, and an
   experiment `manifest.json` (commit, config hash, hardware, device, dtype,
   deviations).
5. **Checkpoint selection** — `finetune/scripts/select_checkpoint.py` scores
   checkpoints against the validation split (json validity, field coverage,
   abstention, hallucination penalty) → `evaluation.json`. Development ranking
   only; the holdout benchmark is decisive.
6. **Candidate registry entry** — `webloom-ai-v0.1.0` registered
   (`type: webloom`, `quantization: nf4-qlora`, `status: configured`,
   training/LoRA config pinned, holdout excluded from `datasetVersions`). The
   provider resolves it opt-in (`eval/run.js --backend webloom --model
   webloom-ai-v0.1.0`) **without** making it the default; auto/production
   still resolves to the baseline.
7. **Commands + tests** — `ai:dataset:format`, `ai:finetune:validate`,
   `ai:finetune`, `ai:finetune:evaluate`, `ai:model:load`; `test_ai_finetune.js`
   (18 checks) covers config validity, row/meta shape, holdout guard (clean +
   leak fail-loud), registry honesty, provider opt-in/unservable, command
   wiring. `npm run test:ai` = 263 checks green, plus full API suites green.

## Model

- Foundation: `Qwen/Qwen2.5-7B-Instruct` (same as baseline ⇒ clean comparison)
- Method: LoRA `r=8 α=16 dropout 0.05` on all projection matrices;
  QLoRA NF4 `double_quant`, compute dtype bf16 (Ampere+) / fp16 fallback
- Trainable params: ~0.1% of the 7B base (LoRA only)
- Inference backend: OpenAI-compatible server (vLLM/llama.cpp) serving
  base+adapter merged, via the local provider used for baselines
- License: Apache-2.0

## Dataset

- Source: `datasets/` v0.1.0 — extraction (4/2), business-dna (3/1),
  website-analysis (3/2), strategy (4/1 = train:14, validation:6, holdout:6)
- Train mix: TRAIN + VALIDATION (20 rows); holdout never formatted, never
  loaded, verified by two independent guards
- Prompts: `webloom-tasks-v1` pinned builders (byte-identical to serving)
- Envelope discipline preserved in labels (UNKNOWN for unsupported facts)

## Training

Not yet executed: **this machine cannot run the pinned 7B experiment** (Apple
M3, 8 GB unified memory, no CUDA, Python 3.13 with no ML stack, and PyPI
downloads currently ~14 KB/s — a torch install is impractical here).

Hardware requirement for the real run (authorized cloud GPU):
- GPU class: any CUDA card with ≥16 GB VRAM (e.g. RTX 4090 / L4 / A10G)
- VRAM: ~4–6 GB model weights (4-bit) + activations at batch 2 / seq 8192
- Runtime: ~30–90 minutes for 8 epochs over 20 rows (QLoRA), plus
  checkpoint-generation evaluation
- Cost range: $0.30–$3 on spot/reserved cloud GPU instances for the run
  (inference/eval extra). No pipeline code depends on a specific vendor.

## Validation

Checkpoint selection on the 6 validation rows (composite: jsonValidity 0.4,
fieldCoverage 0.3, abstentionAccuracy 0.2, hallucinationPenalty 0.1) with the
result written to `finetune/runs/webloom-v0.1/evaluation.json`.

Decisive comparison on the untouched holdout (6 rows, 15 examples) via
`eval/run.js --backend webloom --model webloom-ai-v0.1.0` vs the recorded
baseline benchmark, using `compareModels`. Promote to `active-production` only
when the model-spec gate passes (F1, hallucination rate ≤ baseline, ECE,
beat-baseline, no-fabrication ablation).

## Known issues / limitations

- Training itself is pending (hardware blocker). The candidate is `configured`,
  not `candidate`/`evaluated`, and no improvement is claimed.
- Dry-run plumbing was verified at the Node level and by Python compile; a full
  Python dry-run with a tiny model requires the ML venv on a machine with
  working PyPI access.
- `metricForBestModel: eval_loss` is the default; composite ranking via
  generation is activated on GPU machines.

## Next step

Get authorization for a small cloud GPU budget (≥16 GB VRAM), create the
Python venv there, run `ai:finetune`, `ai:finetune:evaluate`, benchmark the
holdout, then decide promotion vs another experiment (e.g. different seed,
more data) with no change to the production default until the gate passes.