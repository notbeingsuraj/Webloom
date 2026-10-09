#!/usr/bin/env python3
"""
Select the best fine-tuned checkpoint for the Webloom AI v0.1 experiment.

Runs each saved checkpoint (LoRA adapter) through the VALIDATION split and
scores generated outputs on a composite of jsonValidity, fieldCoverage,
abstentionAccuracy, and hallucinationPenalty (weights from the experiment
config). The un-fine-tuned base model is scored on the same rows FIRST as a
control arm, so "the dataset improved the foundation model" is measured, not
assumed. The checkpoint with the highest composite wins; the ranking is
written to runs/<experiment>/evaluation.json and promoted into
finetune/experiments/<experiment>/ (committed).

This is a DEVELOPMENT ranking on the validation split. The decisive,
publishable comparison always comes from the untouched holdout via
eval/run.js --backend webloom (next phase).

Usage:
  finetune/.venv/bin/python finetune/scripts/select_checkpoint.py \
      --config finetune/configs/webloom-v0.1.json [--run <dir>] [--device auto] \
      [--max-new-tokens 2048] [--limit <n>] [--skip-generation]
"""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from train_lora import _mps_bf16_ok, build_loader_dirs, guard_holdout  # noqa: E402


def flatten_keys(obj, prefix="", depth=0):
    keys = []
    if depth > 3 or not isinstance(obj, dict):
        return keys
    for k, v in obj.items():
        keys.append(f"{prefix}{k}")
        if isinstance(v, dict):
            keys.extend(flatten_keys(v, f"{prefix}{k}.", depth + 1))
    return keys


def row_gold(row):
    assistant = row["messages"][-1]["content"]
    return json.loads(assistant)


def parse_json(text):
    try:
        return json.loads(text)
    except Exception:
        pass
    try:
        start = text.index("{")
        end = text.rindex("}")
        return json.loads(text[start:end + 1])
    except Exception:
        return None


def _walk_values(obj, prefix=""):
    out = {}
    if not isinstance(obj, dict):
        return out
    for k, v in obj.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            if "value" in v:
                out[key] = v.get("value")
            else:
                out.update(_walk_values(v, f"{key}."))
        else:
            out[key] = v
    return out


def score_rows(model, tokenizer, rows, device, max_new_tokens, max_prompt_len, arm):
    """Greedy generation for every validation row, scored against gold."""
    import torch
    results = []
    for idx, row in enumerate(rows):
        messages = row["messages"]
        system = messages[0]["content"] if messages and messages[0]["role"] == "system" else None
        user = messages[-2]["content"]
        conversation = ([{"role": "system", "content": system}] if system else [])
        conversation.append({"role": "user", "content": user})
        prompt = tokenizer.apply_chat_template(conversation, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=max_prompt_len)
        if device != "cpu":
            inputs = {k: v.to(device) for k, v in inputs.items()}
        started = time.time()
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                pad_token_id=tokenizer.pad_token_id,
                do_sample=False,
            )
        text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        latency_ms = round((time.time() - started) * 1000)

        gold = row_gold(row)
        parsed = parse_json(text)
        gold_keys = set(flatten_keys(gold))
        pred_keys = set(flatten_keys(parsed)) if isinstance(parsed, dict) else set()
        gold_should_be_unknown = {k for k, v in _walk_values(gold).items() if v is None}
        pred_has = _walk_values(parsed) if isinstance(parsed, dict) else {}
        abstained = sum(1 for k in gold_should_be_unknown if k not in pred_has or pred_has.get(k) in (None, "", []))
        coverage = len(gold_keys & pred_keys) / len(gold_keys) if gold_keys else 1.0
        invented = len(pred_keys - gold_keys)
        results.append({
            "arm": arm,
            "row": idx,
            "exampleId": row.get("exampleId"),
            "task": row.get("task"),
            "parseable": parsed is not None,
            "coverage": round(coverage, 4),
            "abstained": round(abstained / len(gold_should_be_unknown), 4) if gold_should_be_unknown else 1.0,
            "inventedLabelCount": invented,
            "goldUnknownFields": len(gold_should_be_unknown),
            "latencyMs": latency_ms,
            "raw": text,
        })
        print(f"    {arm} row {idx + 1}/{len(rows)} ({row.get('task')}): "
              f"json={'ok' if parsed is not None else 'FAIL'} coverage={results[-1]['coverage']} "
              f"abstain={results[-1]['abstained']} invented={invented} ({latency_ms} ms)")
    return results


def summarize(scores, weights):
    n = len(scores)
    if n == 0:
        return {"jsonValidity": None, "coverage": None, "abstentionAccuracy": None,
                "hallucinatedLabels": None, "composite": 0.0, "rows": 0}
    json_valid = sum(1 for s in scores if s["parseable"]) / n
    coverage = sum(s["coverage"] for s in scores) / n
    abstain = sum(s["abstained"] for s in scores) / n
    invented = sum(s["inventedLabelCount"] for s in scores) / n
    composite = (weights["jsonValidity"] * json_valid
                 + weights["fieldCoverage"] * coverage
                 + weights["abstentionAccuracy"] * abstain
                 - weights["hallucinationPenalty"] * invented)
    return {
        "jsonValidity": round(json_valid, 4),
        "coverage": round(coverage, 4),
        "abstentionAccuracy": round(abstain, 4),
        "hallucinatedLabels": round(invented, 4),
        "composite": round(composite, 4),
        "rows": n,
    }


def resolve_device(requested):
    import torch
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def eval_dtype(device):
    import torch
    if device == "cuda":
        cap = torch.cuda.get_device_capability(0)
        return torch.bfloat16 if cap and cap[0] >= 8 else torch.float16
    if device == "mps":
        return torch.bfloat16 if _mps_bf16_ok() else torch.float16
    return torch.float32


def eval_loss_by_checkpoint(run_dir, checkpoints):
    """Map checkpoint-<step> → eval_loss from training metrics.jsonl."""
    metrics_file = run_dir / "metrics.jsonl"
    losses = {}
    if metrics_file.exists():
        for line in metrics_file.read_text().splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if "eval_loss" in rec and "step" in rec:
                losses[int(rec["step"])] = rec["eval_loss"]
    out = {}
    for ckpt in checkpoints:
        m = re_search(ckpt.name)
        if m is not None:
            out[str(ckpt)] = losses.get(m)
    return out


def re_search(name):
    import re
    m = re.search(r"checkpoint-(\d+)", name)
    return int(m.group(1)) if m else None


def load_adapter(model, adapter_dir, name, first):
    from peft import PeftModel
    if first:
        return PeftModel.from_pretrained(model, str(adapter_dir), adapter_name=name, is_trainable=False)
    model.load_adapter(str(adapter_dir), adapter_name=name)
    model.set_adapter(name)
    return model


def main():
    ap = argparse.ArgumentParser(description="Webloom AI v0.1 checkpoint selection")
    ap.add_argument("--config", required=True)
    ap.add_argument("--run", default=None)
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu", "mps"])
    ap.add_argument("--max-new-tokens", type=int, default=2048)
    ap.add_argument("--limit", type=int, default=None, help="score only the first N validation rows (smoke test)")
    ap.add_argument("--skip-generation", action="store_true")
    ap.add_argument("--skip-holdout-guard", action="store_true")
    ap.add_argument("--skip-control", action="store_true", help="skip the base-model control arm")
    args = ap.parse_args()

    config = json.loads(Path(args.config).read_text())
    exp = config["experiment"]
    run_dir = Path(args.run) if args.run else (REPO_ROOT / config["training"]["outputDir"])
    if not run_dir.exists():
        raise SystemExit(f"run dir missing: {run_dir}")

    format_root = (REPO_ROOT / config["data"]["formatRoot"]).resolve()
    if not args.skip_holdout_guard:
        guard_holdout(format_root)

    _, valid_stubs = build_loader_dirs(format_root)
    valid_rows = []
    for stub in valid_stubs:
        for line in stub.read_text().splitlines():
            if line:
                valid_rows.append(json.loads(line))
    if args.limit:
        valid_rows = valid_rows[: args.limit]
    print(f"validation rows: {len(valid_rows)}")

    checkpoints = sorted(
        [d for d in run_dir.iterdir() if d.is_dir() and d.name.startswith("checkpoint-")],
        key=lambda c: re_search(c.name) or 0,
    )
    if not checkpoints:
        raise SystemExit(f"no checkpoint-* dirs in {run_dir}")

    weights = config["checkpointSelection"]["composite"]
    ranking = []
    control = None
    generations = []

    if args.skip_generation:
        losses = eval_loss_by_checkpoint(run_dir, checkpoints)
        ranking = [
            {"checkpoint": str(c), "basis": "eval_loss", "evalLoss": losses.get(str(c))}
            for c in checkpoints
        ]
        best = min(
            [r for r in ranking if r["evalLoss"] is not None],
            key=lambda r: r["evalLoss"],
            default=None,
        )
        best_checkpoint = best["checkpoint"] if best else str(max(checkpoints, key=lambda c: re_search(c.name) or 0))
        print("skip-generation: ranking by eval_loss only (composite needs generation)")
    else:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        device = resolve_device(args.device)
        dtype = eval_dtype(device)
        base_name = exp["foundationModel"]
        tok_name = config["tokenizer"]["source"]
        max_prompt = config["data"]["maxSeqLength"]
        print(f"device: {device} | dtype: {dtype} | base: {base_name}")

        tokenizer = AutoTokenizer.from_pretrained(tok_name, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        print(f"loading base model {base_name} …")
        base_model = AutoModelForCausalLM.from_pretrained(base_name, dtype=dtype, trust_remote_code=True)
        base_model.to(device)
        base_model.eval()

        if not args.skip_control:
            print("control arm: base model (no adapter) on validation rows")
            control_scores = score_rows(base_model, tokenizer, valid_rows, device,
                                        args.max_new_tokens, max_prompt, "control-base")
            control = {"arm": "control-base", "model": base_name, **summarize(control_scores, weights)}
            generations.extend(control_scores)
            print(f"  control composite: {control['composite']}")

        model = base_model
        first_adapter = True
        for ckpt in checkpoints:
            is_adapter = (ckpt / "adapter_config.json").exists()
            if is_adapter:
                name = f"ckpt-{re_search(ckpt.name)}"
                model = load_adapter(model, ckpt, name, first_adapter)
                if first_adapter:
                    first_adapter = False
                model.set_adapter(name)
                model.to(device)
                arm = ckpt.name
            else:
                # A merged/full model checkpoint (not produced by this config,
                # but tolerated so selection never silently skips a directory).
                model = AutoModelForCausalLM.from_pretrained(str(ckpt), dtype=dtype, trust_remote_code=True)
                model.to(device)
                model.eval()
                arm = ckpt.name
            print(f"checkpoint {ckpt.name}:")
            scores = score_rows(model, tokenizer, valid_rows, device,
                                args.max_new_tokens, max_prompt, arm)
            generations.extend(scores)
            summary = summarize(scores, weights)
            ranking.append({"checkpoint": str(ckpt), "basis": "generation-on-validation", **summary})
            print(f"  composite {summary['composite']}")

        if not ranking:
            raise SystemExit("no checkpoints scored")
        best_checkpoint = str(max(ranking, key=lambda r: r["composite"])["checkpoint"])
        if device == "mps":
            torch.mps.empty_cache()

    evaluation = {
        "experiment": exp["id"],
        "run_dir": str(run_dir.relative_to(REPO_ROOT)) if str(run_dir).startswith(str(REPO_ROOT)) else str(run_dir),
        "basis": "eval_loss" if args.skip_generation else "generation-on-validation",
        "configSha256": __import__("hashlib").sha256(Path(args.config).read_bytes()).hexdigest(),
        "weights": weights,
        "validationRows": len(valid_rows),
        "control": control,
        "best_checkpoint": best_checkpoint,
        "ranking": ranking,
        "note": "Development ranking on the VALIDATION split only. The decisive baseline-vs-candidate "
                "comparison happens on the untouched holdout via eval/run.js --backend webloom.",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    (run_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2, default=str), encoding="utf-8")
    if generations:
        (run_dir / "validation-generations.jsonl").write_text(
            "\n".join(json.dumps(g, default=str) for g in generations) + "\n", encoding="utf-8")

    # Promote the small artifacts into finetune/experiments/ (committed).
    exp_dir = REPO_ROOT / "finetune" / "experiments" / exp["id"]
    exp_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(run_dir / "evaluation.json", exp_dir / "evaluation.json")
    if (run_dir / "validation-generations.jsonl").exists():
        shutil.copy(run_dir / "validation-generations.jsonl", exp_dir / "validation-generations.jsonl")

    print(f"best checkpoint: {best_checkpoint}")
    print(f"evaluation → {run_dir / 'evaluation.json'} (+ copied to {exp_dir})")


if __name__ == "__main__":
    main()
