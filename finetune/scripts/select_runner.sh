#!/usr/bin/env bash
# Selects the best Webloom AI v0.1 checkpoint on the VALIDATION split.
# Requires a finished training run (finetune/runs/webloom-v0.1) and a device
# that can run generation (default CUDA; --device cpu works for small models).
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=python3
if [ -x "finetune/.venv/bin/python" ]; then PY="finetune/.venv/bin/python"; fi
exec "$PY" finetune/scripts/select_checkpoint.py \
  --config finetune/configs/webloom-v0.1.json "$@"