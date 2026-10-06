#!/usr/bin/env bash
# Runs the Webloom AI v0.1 LoRA/QLoRA fine-tune with the pinned experiment
# config. Uses finetune/.venv when present, else system python3. Training is
# an explicit, deliberate command — it is never part of the test suite.
# Usage: finetune/scripts/train_runner.sh [--dry-run] [--model <override>] ...
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=python3
if [ -x "finetune/.venv/bin/python" ]; then PY="finetune/.venv/bin/python"; fi
exec "$PY" finetune/scripts/train_lora.py \
  --config finetune/configs/webloom-v0.1.json "$@"