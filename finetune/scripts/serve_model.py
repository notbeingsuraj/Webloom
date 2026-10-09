#!/usr/bin/env python3
"""
Local OpenAI-compatible server for Webloom AI v0.1.

Serves the base model + a LoRA adapter (merged in-process) over
POST /v1/chat/completions so the EXISTING Webloom provider stack
(LocalFoundationModelProvider / WebloomFineTunedModelProvider, configured via
LOCAL_AI_BASE_URL) can invoke the candidate with zero application changes.
Provider-agnostic: vLLM / llama.cpp / MLX can replace this shim at any time —
the contract is the OpenAI chat-completions shape, not this script.

  python finetune/scripts/serve_model.py --config finetune/configs/webloom-v0.1.json \
      [--adapter finetune/runs/webloom-v0.1/checkpoint-32] [--port 8090] [--device auto]

Behaviour notes:
  - greedy when temperature == 0, otherwise seeded sampling (seed from the
    experiment config) so benchmark runs stay reproducible.
  - `response_format` is accepted and ignored: the model was trained to emit
    bare JSON, and every Webloom output is re-validated by the application's
    own validation layer regardless of what the server promises.
  - loads nothing from the holdout; serving is model-only.
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

_model = None
_tokenizer = None
_served_id = "unknown"
_device = "cpu"
_max_prompt_len = 8192
_seed = 17
_lock = threading.Lock()


def load_model(args):
    global _model, _tokenizer, _served_id, _device, _max_prompt_len, _seed

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    config = json.loads(Path(args.config).read_text()) if Path(args.config).exists() else {}
    base = args.base or config.get("experiment", {}).get("foundationModel")
    if not base:
        raise SystemExit("no base model: pass --base or use a config with experiment.foundationModel")
    tok_src = config.get("tokenizer", {}).get("source") or base
    _max_prompt_len = config.get("data", {}).get("maxSeqLength", 8192)
    _seed = config.get("training", {}).get("seed", 17)

    if args.device == "auto":
        if torch.cuda.is_available():
            _device = "cuda"
        elif torch.backends.mps.is_available():
            _device = "mps"
        else:
            _device = "cpu"
    else:
        _device = args.device
    dtype = torch.float32 if _device == "cpu" else torch.bfloat16

    adapter = args.adapter
    if not adapter and args.run_dir:
        # Fall back to the selection result, then to the last checkpoint.
        run = Path(args.run_dir)
        evaluation = run / "evaluation.json"
        if evaluation.exists():
            best = json.loads(evaluation.read_text()).get("best_checkpoint")
            if best and Path(best).exists():
                adapter = best
        if not adapter:
            ckpts = sorted(run.glob("checkpoint-*"))
            if ckpts:
                adapter = str(ckpts[-1])

    print(f"serving base={base} adapter={adapter or 'none'} device={_device} dtype={dtype}", flush=True)
    _tokenizer = AutoTokenizer.from_pretrained(tok_src, trust_remote_code=True)
    if _tokenizer.pad_token is None:
        _tokenizer.pad_token = _tokenizer.eos_token
    _model = AutoModelForCausalLM.from_pretrained(base, dtype=dtype, trust_remote_code=True)
    if adapter:
        from peft import PeftModel
        _model = PeftModel.from_pretrained(_model, adapter, is_trainable=False)
        _model = _model.merge_and_unload()
        _served_id = args.served_id or f"{Path(adapter).name}-merged"
    else:
        _served_id = args.served_id or base.replace("/", "-").lower()
    _model.to(_device)
    _model.eval()
    print(f"ready: serving as '{_served_id}'", flush=True)


def generate(messages, max_tokens, temperature):
    import torch
    prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=_max_prompt_len)
    if _device != "cpu":
        inputs = {k: v.to(_device) for k, v in inputs.items()}
    with _lock:
        if temperature and temperature > 0:
            torch.manual_seed(_seed)
            with torch.no_grad():
                out = _model.generate(
                    **inputs, max_new_tokens=max_tokens, do_sample=True,
                    temperature=temperature, pad_token_id=_tokenizer.pad_token_id,
                )
        else:
            with torch.no_grad():
                out = _model.generate(
                    **inputs, max_new_tokens=max_tokens, do_sample=False,
                    pad_token_id=_tokenizer.pad_token_id,
                )
        text = _tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    prompt_tokens = int(inputs["input_ids"].shape[1])
    completion_tokens = int(out[0].shape[0]) - prompt_tokens
    return text, prompt_tokens, completion_tokens


class Handler(BaseHTTPRequestHandler):
    server_version = "WebloomServe/0.1"

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *log_args):
        sys.stderr.write("[serve] %s - %s\n" % (self.address_string(), fmt % log_args))

    def do_GET(self):
        if self.path in ("/health", "/v1/health"):
            self._json(200, {"status": "ok", "model": _served_id})
        elif self.path.rstrip("/").endswith("/models"):
            self._json(200, {
                "object": "list",
                "data": [{"id": _served_id, "object": "model", "owned_by": "webloom"}],
            })
        else:
            self._json(404, {"error": {"message": f"unknown path {self.path}"}})

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/chat/completions"):
            self._json(404, {"error": {"message": f"unknown path {self.path}"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:
            self._json(400, {"error": {"message": f"invalid JSON body: {exc}"}})
            return

        messages = req.get("messages") or []
        if not messages:
            self._json(400, {"error": {"message": "messages[] required"}})
            return
        max_tokens = int(req.get("max_tokens") or 2048)
        max_tokens = max(1, min(max_tokens, 8192))
        temperature = float(req.get("temperature") or 0.0)

        started = time.time()
        try:
            text, prompt_tokens, completion_tokens = generate(messages, max_tokens, temperature)
        except Exception as exc:
            self._json(500, {"error": {"message": f"generation failed: {exc}"}})
            return
        self._json(200, {
            "id": f"chatcmpl-webloom-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": req.get("model") or _served_id,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "latency_ms": round((time.time() - started) * 1000),
        })


def main():
    ap = argparse.ArgumentParser(description="Serve Webloom AI v0.1 over the OpenAI chat-completions contract")
    ap.add_argument("--config", default=str(REPO_ROOT / "finetune/configs/webloom-v0.1.json"))
    ap.add_argument("--base", default=None, help="override base model id")
    ap.add_argument("--adapter", default=None, help="LoRA adapter dir (default: best checkpoint from the run)")
    ap.add_argument("--run-dir", default=str(REPO_ROOT / "finetune/runs/webloom-v0.1"))
    ap.add_argument("--served-id", default=None, help="model id reported to clients")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu", "mps"])
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8090)
    args = ap.parse_args()

    load_model(args)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"listening on http://{args.host}:{args.port}/v1 (POST /v1/chat/completions)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")


if __name__ == "__main__":
    main()
