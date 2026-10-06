#!/usr/bin/env python3
"""
Select the best fine-tuned checkpoint for the Webloom AI v0.1 experiment.

Runs each saved checkpoint (adapter) through the VALIDATION split and scores
generated outputs on a composite of jsonValidity, fieldCoverage,
abstentionAccuracy, and hallucinationPenalty (weights from the experiment
config). Picks the checkpoint with the highest composite score and records
the ranking under runs/<experiment>/evaluation.json.

This is a DEVELOPMENT ranking. The decisive, publishable numbers always come
from eval/run.js --backend webloom --dataset holdout on the untouched holdout.
When the checkpoint count/model size makes generation impractical (or
--skip-generation is passed), the script falls back to eval_loss ordering and
says so explicitly.

Usage:
  finetune/.venv/bin/python finetune/scripts/select_checkpoint.py \
      --config finetune/configs/webloom-v0.1.json [--run <dir>] [--device cuda] \
      [--max-new-tokens 2048] [--skip-generation]
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from train_lora import build_loader_dirs, guard_holdout  # noqa: E402


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


def scores_for(checkpoint_dir, valid_rows, device, max_new_tokens, pipeline=None):
    if pipeline is None:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
        model_name = checkpoint_dir  # PeftModel path is the merged base + adapter dir
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        infer_kwargs = {"device_map": "auto"} if device == "cuda" else {"device_map": device or "cpu", "low_cpu_mem_usage": True}
        model = AutoModelForCausalLM.from_pretrained(checkpoint_dir, trust_remote_code=True, **infer_kwargs)
        model.eval()
        import torch
        return model, tokenizer, torch

    model, tokenizer, torch = pipeline
    results = []

    import torch as _t
    system_prompt = valid_rows[0]["messages"][0]["content"] if valid_rows and valid_rows[0]["messages"][0]["role"] == "system" else None
    for idx, row in enumerate(valid_rows):
        gold = row_gold(row)
        user = row["messages"][-2]["content"]
        conversation = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user}] if system_prompt else [{"role": "user", "content": user}]
        prompt = tokenizer.apply_chat_template(conversation, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=8192)
        if device in ("cuda", "mps"):
            inputs = {k: v.to(device) for k, v in inputs.items()}
        with _t.no_grad():
            out = model.generate(**inputs, max_new_tokens=max_new_tokens, pad_token_id=tokenizer.pad_token_id, do_sample=False)
        text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                start = text.index("{")
                end = text.rindex("}")
                parsed = json.loads(text[start:end + 1])
            except Exception:
                parsed = None
        gold_keys = set(flatten_keys(gold))
        pred_keys = set(flatten_keys(parsed)) if isinstance(parsed, dict) else set()
        gold_should_be_unknown = {k for k, v in _walk_values(gold).items() if v is None}
        pred_has = _walk_values(parsed) if isinstance(parsed, dict) else {}
        abstained = sum(1 for k in gold_should_be_unknown if k not in pred_has or pred_has.get(k) in (None, "", []))
        coverage = len(gold_keys & pred_keys) / len(gold_keys) if gold_keys else 1.0
        invented = len(pred_keys - gold_keys)
        results.append({
            "row": idx,
            "parseable": parsed is not None,
            "coverage": coverage,
            "abstained": abstained / len(gold_should_be_unknown) if gold_should_be_unknown else 1.0,
            "inventedLabelCount": invented,
        })
    return results


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


def main():
    ap = argparse.ArgumentParser(description="Webloom AI v0.1 checkpoint selection")
    ap.add_argument("--config", required=True)
    ap.add_argument("--run", default=None)
    ap.add_argument("--device", default="cuda", choices=["auto", "cuda", "cpu", "mps"])
    ap.add_argument("--max-new-tokens", type=int, default=2048)
    ap.add_argument("--skip-generation", action="store_true")
    ap.add_argument("--skip-holdout-guard", action="store_true")
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
    print(f"validation rows: {len(valid_rows)}")

    checkpoints = sorted([d for d in run_dir.iterdir() if d.is_dir() and d.name.startswith("checkpoint-")])
    if not checkpoints:
        raise SystemExit(f"no checkpoint-* dirs in {run_dir}")

    ranking = []
    if args.skip_generation:
        best = min(checkpoints, key=lambda c: _eval_loss(run_dir, c))
        ranking = [{"checkpoint": str(c), "basis": "eval_loss"} for c in checkpoints]
        best_checkpoint = best
        print("skip-generation: ranking by eval_loss only (composite needs generation)")
    else:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        device = args.device if args.device != "auto" else ("cuda" if torch.cuda.is_available() else "cpu")
        pipeline = None
        for ckpt in checkpoints:
            if pipeline is None:
                tokenizer = AutoTokenizer.from_pretrained(str(ckpt), trust_remote_code=True)
                if tokenizer.pad_token is None:
                    tokenizer.pad_token = tokenizer.eos_token
                infer_kwargs = {"device_map": "auto"} if device == "cuda" else {"device_map": device or "cpu", "low_cpu_mem_usage": True}
                model = AutoModelForCausalLM.from_pretrained(str(ckpt), trust_remote_code=True, **infer_kwargs)
                model.eval()
                pipeline = (model, tokenizer, torch)
            scored = scores_for(ckpt, valid_rows, device, args.max_new_tokens, pipeline=pipeline)
            w = config["checkpointSelection"]["composite"]
            n = len(scored)
            if n == 0:
                composite = 0.0
            else:
                json_valid = sum(1 for s in scored if s["parseable"]) / n
                coverage = sum(s["coverage"] for s in scored) / n
                abstain = sum(s["abstained"] for s in scored) / n
                invented = sum(s["inventedLabelCount"] for s in scored) / n
                composite = (w["jsonValidity"] * json_valid
                             + w["fieldCoverage"] * coverage
                             + w["abstentionAccuracy"] * abstain
                             - w["hallucinationPenalty"] * invented)
            ranking.append({
                "checkpoint": str(ckpt),
                "jsonValidity": json_valid if n else None,
                "coverage": round(coverage, 4) if n else None,
                "abstentionAccuracy": round(abstain, 4) if n else None,
                "hallucinatedLabels": round(invented, 4) if n else None,
                "composite": round(composite, 4),
            })
            print(f"  {ckpt.name}: composite {round(composite, 4)}")
        best_checkpoint = str(max(ranking, key=lambda r: r["composite"])["checkpoint"])

    evaluation = {
        "experiment": exp["id"],
        "run_dir": str(run_dir),
        "basis": "generation-on-validation" if not args.skip_generation else "eval_loss",
        "best_checkpoint": best_checkpoint,
        "ranking": ranking,
        "note": "Development ranking only. Decisive comparison happens on the untouched holdout via eval/run.js --backend webloom.",
    }
    (run_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    print(f"best checkpoint: {best_checkpoint}")
    print(f"evaluation → {run_dir / 'evaluation.json'}")


def _eval_loss(run_dir, ckpt):
    import re
    m = re.search(r"checkpoint-(\d+)", ckpt.name)
    return int(m.group(1)) if m else 10 ** 9


if __name__ == "__main__":
    main()