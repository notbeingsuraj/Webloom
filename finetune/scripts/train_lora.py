#!/usr/bin/env python3
"""
Webloom AI v0.1 controlled fine-tune.

Trains a LoRA/QLoRA adapter on the baseline foundation model using the
datasets/manifest.json TRAIN + VALIDATION splits only. The holdout split is
never loaded: a hard guard inside this script re-verifies every formatted
training row against the manifest and aborts (exit 2) on any leak.

Run (GPU):
  python finetune/scripts/train_lora.py --config finetune/configs/webloom-v0.1.json

Dry-run (pipeline check, tiny model + steps, no training claims):
  python finetune/scripts/train_lora.py --config finetune/configs/webloom-v0.1.json \
      --dry-run --model Qwen/Qwen2.5-0.5B-Instruct

Hardware note: QLoRA (4-bit) and paged_adamw_8bit require a CUDA GPU and
bitsandbytes. On CPU/MPS the script auto-degrades to 16-bit LoRA with
adamw_torch and records the deviation in the experiment manifest rather than
wasting resources on an unusable configuration.
"""

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

DEVIATIONS = []


def git_head(root):
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        short = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() or None, short.stdout.strip() or None
    except Exception:
        return None, None


def config_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _business(ex):
    inp = ex.get("input") or {}
    for key in (
        ("rawBusinessData", "name"), ("profile", "businessName"), ("profile", "name"),
        ("brandDna", "businessIdentity", "name"), ("websiteAnalysis", "businessIdentity", "name"),
        ("rawBusinessData", "businessName"),
    ):
        node = inp
        ok = True
        for part in key:
            if not isinstance(node, dict) or part not in node:
                ok = False
                break
            node = node[part]
        if ok and isinstance(node, str) and node.strip():
            return node.strip()
    return None


def load_origin_index(manifest):
    ids = {"train": set(), "validation": set(), "holdout": set()}
    businesses = {"train": set(), "validation": set(), "holdout": set()}
    by_id = {}
    for entry in manifest["datasets"]:
        path = REPO_ROOT / "datasets" / entry["path"]
        if not path.exists():
            continue
        split = entry["split"]
        for line in path.read_text().splitlines():
            if not line:
                continue
            ex = json.loads(line)
            eid = ex.get("exampleId")
            if not eid:
                raise SystemExit(f"guard: row in {entry['path']} has no exampleId")
            ids[split].add(eid)
            b = _business(ex)
            if b:
                businesses[split].add(b)
            by_id[eid] = {"split": split, "business": b}
    return ids, businesses, by_id


def guard_holdout(format_root):
    manifest_path = REPO_ROOT / "datasets" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    ids, businesses, by_id = load_origin_index(manifest)
    errors = []

    for a, b in (("train", "validation"), ("train", "holdout"), ("validation", "holdout")):
        overlap = ids[a] & ids[b]
        for eid in sorted(overlap):
            errors.append(f"origin exampleId overlap {eid} in {a} and {b}")

    if not format_root.exists():
        errors.append(f"format root missing: {format_root}")
        print_guard = True
    else:
        for dataset_dir in sorted(format_root.iterdir()):
            if not dataset_dir.is_dir():
                continue
            for filename in ("train.jsonl", "validation.jsonl"):
                file = dataset_dir / filename
                if not file.exists():
                    continue
                exp_split = filename.split(".")[0]
                for line in file.read_text().splitlines():
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        errors.append(f"malformed JSON in {file}")
                        continue
                    origin = by_id.get(row.get("exampleId"))
                    if origin is None:
                        errors.append(f"formatted row {row.get('exampleId')} in {file} not in manifest")
                        continue
                    if origin["split"] == "holdout":
                        errors.append(f"HOLDOUT LEAK: {row.get('exampleId')} in {file}")
                    if origin["split"] not in ("train", "validation"):
                        errors.append(f"row {row.get('exampleId')} split {origin['split']} not train/validation")
                    if (row.get("meta") or {}).get("split") != exp_split:
                        errors.append(f"row {row.get('exampleId')} meta.split != {exp_split}")
                    if origin["business"] and origin["business"] in businesses["holdout"]:
                        errors.append(f"HOLDOUT BUSINESS LEAK: {origin['business']} in {file}")

    if errors:
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        raise SystemExit(2)
    print("holdout guard PASS (python): train/validation rows contain no holdout ids or businesses")
    return {k: len(v) for k, v in ids.items()}, {k: len(v) for k, v in businesses.items()}


def hardware_report():
    import torch
    info = {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu": platform.processor() or platform.machine(),
        "cores": (os.cpu_count() or 0),
        "memoryGb": round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9, 1) if hasattr(os, "sysconf") else None,
        "cuda": torch.cuda.is_available(),
        "deviceName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "cudaCores": torch.cuda.get_device_capability(0) if torch.cuda.is_available() else None,
        "mps": getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available(),
    }
    print("hardware:", json.dumps(info, indent=2))
    return info


def choose_device(requested, torch):
    if requested == "auto":
        if torch.cuda.is_available():
            return "cuda"
        getattr(torch.backends, "mps", None)
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    return requested


def build_loader_dirs(format_root):
    train = []
    valid = []
    for dataset_dir in sorted(format_root.iterdir()):
        if not dataset_dir.is_dir():
            continue
        tr = dataset_dir / "train.jsonl"
        va = dataset_dir / "validation.jsonl"
        for stub, sink in ((tr, train), (va, valid)):
            if stub.exists():
                sink.append(stub)
    return train, valid


def tokenize_examples(stubs, tokenizer, max_seq):
    rows = []
    for stub in stubs:
        for line in stub.read_text().splitlines():
            if not line:
                continue
            row = json.loads(line)
            conversation = row["messages"]
            prompt = tokenizer.apply_chat_template(
                conversation[:-1], tokenize=False, add_generation_prompt=True
            )
            full = tokenizer.apply_chat_template(
                conversation, tokenize=False, add_generation_prompt=False
            )
            p_ids = tokenizer(prompt, truncation=True, max_length=max_seq).input_ids
            f_ids = tokenizer(full, truncation=True, max_length=max_seq).input_ids
            if len(p_ids) >= len(f_ids):
                labels = f_ids
            else:
                labels = [-100] * len(p_ids) + f_ids[len(p_ids):]
            if not labels:
                labels = f_ids
            rows.append({"input_ids": f_ids, "attention_mask": [1] * len(f_ids), "labels": labels})
    return rows


def main():
    ap = argparse.ArgumentParser(description="Webloom AI v0.1 LoRA/QLoRA fine-tune")
    ap.add_argument("--config", required=True, help="path to experiment config JSON")
    ap.add_argument("--model", default=None, help="override foundation model (dry-run / small-scale)")
    ap.add_argument("--data-root", default="finetune/format", help="formatted training rows root")
    ap.add_argument("--output-dir", default=None, help="override output dir")
    ap.add_argument("--max-steps", type=int, default=None, help="cap steps (dry-run)")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu", "mps"])
    ap.add_argument("--dry-run", action="store_true", help="plumbing check: tiny steps, no training claims")
    ap.add_argument("--skip-holdout-guard", action="store_true", help="disables the guard (never use in production)")
    args = ap.parse_args()

    config = json.loads(Path(args.config).read_text())
    exp = config["experiment"]
    training = config["training"]
    lora_cfg = config["lora"]
    quant = config["quantization"]
    tok_cfg = config["tokenizer"]

    print(f"experiment: {exp['id']} → adapter {exp['registryModelId']} on {exp['foundationModel']}")

    format_root = (REPO_ROOT / args.data_root).resolve()
    if not args.skip_holdout_guard:
        guard_holdout(format_root)
    else:
        print("WARNING: holdout guard disabled by --skip-holdout-guard", file=sys.stderr)

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, DataCollatorForSeq2Seq
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    except ImportError as exc:
        raise SystemExit(f"ML stack missing ({exc.name}). Create the venv: python3 -m venv finetune/.venv && finetune/.venv/bin/pip install -r finetune/requirements.txt") from exc

    hardware = hardware_report()
    device = choose_device(args.device, torch)
    print(f"device: {device}")

    model_name = args.model or exp["foundationModel"]
    tokenizer_name = tok_cfg["source"] if args.model is None else model_name

    tokenizer = AutoTokenizer.from_pretrained(tokenizer_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = tok_cfg.get("paddingSide", "right")
    tokenizer.truncation_side = tok_cfg.get("truncationSide", "left")

    train_files, valid_files = build_loader_dirs(format_root)
    max_seq = config["data"]["maxSeqLength"]
    train_rows = tokenize_examples(train_files, tokenizer, max_seq)
    valid_rows = tokenize_examples(valid_files, tokenizer, max_seq)
    print(f"rows: train {len(train_rows)} / validation {len(valid_rows)}")

    quantize = quant.get("enabled", True) and device == "cuda"
    quantization_config = None
    if quantize and device == "cuda":
        try:
            import bitsandbytes  # noqa: F401
            from transformers import BitsAndBytesConfig
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type=quant.get("bnb4bitQuantType", "nf4"),
                bnb_4bit_compute_dtype=torch.bfloat16 if quant.get("bnb4bitComputeDtype") == "bf16" else torch.float16,
                bnb_4bit_use_double_quant=quant.get("bnb4bitUseDoubleQuant", True),
            )
            print("quantization: QLoRA 4-bit enabled (bitsandbytes + CUDA)")
        except ImportError:
            quantize = False
            quantization_config = None
            DEVIATIONS.append("bitsandbytes unavailable on this platform — QLoRA disabled")
            print("quantization: unavailable, falling back to 16-bit LoRA (deviation recorded)")
    else:
        DEVIATIONS.append(f"quantization skipped (enabled={quant.get('enabled')}, device={device})")
        print("quantization: off on non-CUDA device")

    dtype = None
    if device == "cuda":
        cap = torch.cuda.get_device_capability(0)
        if training.get("preferredDtype") == "bf16" and cap and cap[0] >= 8:
            dtype = torch.bfloat16
            print("dtype: bf16 (Ampere+)")
        else:
            dtype = torch.float16
            DEVIATIONS.append("fp16 used (GPU does not support bf16)")
            print("dtype: fp16")
    else:
        DEVIATIONS.append(f"16-bit compute on {device} (no bf16)")
        print("dtype: 16-bit CPU/MPS compute")

    kwargs = {}
    if device != "cpu" and device != "mps":
        kwargs["device_map"] = "auto"

    print(f"loading base model {model_name} …")
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=quantization_config,
        torch_dtype=dtype,
        trust_remote_code=True,
        use_cache=False if training.get("gradientCheckpointing") else True,
        **kwargs,
    )
    if quantize:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=training.get("gradientCheckpointing", True))

    lora = LoraConfig(
        r=lora_cfg["r"],
        lora_alpha=lora_cfg["loraAlpha"],
        lora_dropout=lora_cfg["loraDropout"],
        target_modules=lora_cfg["targetModules"],
        bias=lora_cfg.get("bias", "none"),
        task_type=lora_cfg["taskType"],
    )
    model = get_peft_model(model, lora)
    trainable, total = model.get_nb_trainable_parameters()
    print(f"LoRA trainable: {trainable:,} / {total:,} ({100 * trainable / total:.3f}%)")

    output_dir = (REPO_ROOT / (args.output_dir or training["outputDir"])).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    dry = args.dry_run
    max_steps = args.max_steps if args.max_steps is not None else (2 if dry else None)
    eval_steps = 2 if dry else training["evalSteps"]
    save_steps = 2 if dry else training["saveSteps"]

    expected_optimizer = training.get("optimizer", "paged_adamw_8bit")
    optimizer = expected_optimizer
    if expected_optimizer == "paged_adamw_8bit":
        try:
            import bitsandbytes  # noqa: F401
            if device != "cuda":
                raise ImportError
        except ImportError:
            optimizer = "adamw_torch"
            DEVIATIONS.append(f"optimizer paged_adamw_8bit unavailable → {optimizer}")

    train_args = TrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=training["perDeviceTrainBatchSize"],
        per_device_eval_batch_size=training.get("perDeviceEvalBatchSize", training["perDeviceTrainBatchSize"]),
        gradient_accumulation_steps=training["gradientAccumulationSteps"],
        learning_rate=training["learningRate"],
        lr_scheduler_type=training["lrSchedulerType"],
        warmup_ratio=training["warmupRatio"],
        num_train_epochs=training["numTrainEpochs"],
        max_steps=max_steps,
        optim=optimizer,
        bf16=(dtype == torch.bfloat16),
        fp16=(dtype == torch.float16),
        gradient_checkpointing=training.get("gradientCheckpointing", True),
        eval_strategy="steps" if valid_rows else "no",
        eval_steps=eval_steps,
        save_strategy="steps",
        save_steps=save_steps,
        load_best_model_at_end=bool(valid_rows),
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        logging_steps=training["loggingSteps"],
        report_to=training.get("reportTo", ["none"]),
        seed=training["seed"],
        dataloader_pin_memory=False,
    )

    collator = DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100)
    trainer = Trainer(
        model=model,
        args=train_args,
        train_dataset=train_rows,
        eval_dataset=valid_rows if valid_rows else None,
        tokenizer=tokenizer,
        data_collator=collator,
    )

    import time
    start_ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    trainer.train()
    end_ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    (output_dir / "metrics.jsonl").write_text(
        "\n".join(json.dumps(line) for line in trainer.state.log_history), encoding="utf-8"
    )

    commit, commit_short = git_head(REPO_ROOT)
    manifest = {
        "experiment": exp,
        "configFile": str(Path(args.config).resolve()),
        "configSha256": config_hash(args.config),
        "commit": commit,
        "commitShort": commit_short,
        "repoDirty": subprocess.run(["git", "-C", str(REPO_ROOT), "status", "--porcelain"], capture_output=True, text=True).stdout.strip() != "",
        "hardware": hardware,
        "device": device,
        "dtype": str(dtype),
        "quantization": {"enabled": quantize, "bits": 4 if quantize else None, "type": quant.get("bnb4bitQuantType") if quantize else None},
        "optimizer": optimizer,
        "model": model_name,
        "tokenizer": tokenizer_name,
        "maxSeqLength": max_seq,
        "data": {"train": len(train_rows), "validation": len(valid_rows)},
        "trainableParams": int(trainable),
        "totalParams": int(total),
        "dryRun": dry,
        "maxSteps": max_steps,
        "deviations": DEVIATIONS,
        "bestCheckpoint": getattr(trainer.state, "best_model_checkpoint", None),
        "startedAt": start_ts,
        "finishedAt": end_ts,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    print(f"experiment manifest → {output_dir / 'manifest.json'}")
    print("training complete." + (" (DRY RUN — no quality claims)" if dry else ""))

    if dry and valid_rows:
        print("dry-run validation pass complete.")


if __name__ == "__main__":
    main()