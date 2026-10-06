/**
 * Test env for AI foundation/eval tests.
 *
 * ESM evaluates imports before any module-scope statements in the importing
 * file, so `process.env` assignments placed above `import` lines are too late
 * for modules that compute paths/constants at import time (paths.js,
 * modelRegistry.js). Importing this module FIRST guarantees the environment is
 * in place before anything else loads.
 *
 * Redirects the model registry and correction store to per-process temp files
 * so tests never touch the real models/registry.json or datasets/corrections/.
 */

import os from 'node:os';
import path from 'node:path';

process.env.WEBLOOM_MODELS_DIR = path.join(os.tmpdir(), `webloom-models-${process.pid}`);
process.env.WEBLOOM_MODEL_REGISTRY = path.join(os.tmpdir(), `webloom-registry-${process.pid}.json`);
process.env.WEBLOOM_CORRECTIONS_FILE = path.join(os.tmpdir(), `webloom-corrections-${process.pid}.jsonl`);