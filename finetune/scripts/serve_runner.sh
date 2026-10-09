#!/usr/bin/env bash
# Serves the selected Webloom AI v0.1 checkpoint through the bundled
# OpenAI-compatible shim so the existing provider stack can invoke it:
#   LOCAL_AI_BASE_URL=http://127.0.0.1:8090/v1 LOCAL_AI_MODEL=<served-id> ...
# Explicit, local-only, no data leaves the machine. Ctrl-C to stop.
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=python3
if [ -x "finetune/.venv/bin/python" ]; then PY="finetune/.venv/bin/python"; fi
exec "$PY" finetune/scripts/serve_model.py \
  --config finetune/configs/webloom-v0.1.json "$@"
