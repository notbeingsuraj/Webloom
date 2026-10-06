import fs from 'node:fs';
import path from 'node:path';
import { MODEL_REGISTRY_FILE, MODELS_DIR } from './paths.js';
import { AI_MODEL_METADATA_SCHEMA } from './contracts/common.js';
import { validateSchema } from '../services/ai/AIResponseValidator.js';

/**
 * Model registry — versioning for every model Webloom evaluates or deploys.
 *
 * Rules encoded here:
 *  - Every model has a semver-style id (webloom-ai-x.y.z) and a metadata
 *    record: foundation model, dataset versions, training/LoRA config,
 *    benchmark results, known weaknesses.
 *  - A model is never replaced blindly: setActive() keeps the previous
 *    record intact and every benchmark run is appended, so Model A vs
 *    Model B comparisons remain possible forever.
 *  - Exactly one model is active for each role ('baseline', 'production').
 *
 * Storage: models/registry.json at the repository root, written atomically.
 */

const ROLE_TYPES = Object.freeze({ baseline: 'baseline', production: 'webloom' });

let cache = null;
let cacheMtimeMs = 0;

function ensureStore() {
  fs.mkdirSync(path.dirname(MODEL_REGISTRY_FILE), { recursive: true });
}

function readFile() {
  ensureStore();
  if (!fs.existsSync(MODEL_REGISTRY_FILE)) {
    return { schemaVersion: 1, active: { baseline: null, production: null }, models: [] };
  }
  const stat = fs.statSync(MODEL_REGISTRY_FILE);
  if (cache && cacheMtimeMs === stat.mtimeMs) return cache;
  const raw = fs.readFileSync(MODEL_REGISTRY_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  cache = parsed;
  cacheMtimeMs = stat.mtimeMs;
  return parsed;
}

function writeFile(registry) {
  ensureStore();
  const tmp = `${MODEL_REGISTRY_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, MODEL_REGISTRY_FILE);
  cache = null;
  cacheMtimeMs = 0;
}

/** Drop the in-memory cache (tests, long-running processes after external edits). */
export function reloadRegistry() {
  cache = null;
  cacheMtimeMs = 0;
}

export function loadRegistry() {
  const registry = readFile();
  if (!Array.isArray(registry.models)) registry.models = [];
  if (!registry.active) registry.active = { baseline: null, production: null };
  return registry;
}

/**
 * Register (or update) a model. Metadata is validated against
 * AI_MODEL_METADATA_SCHEMA before it is allowed into the registry.
 *
 * @returns {object} the stored metadata
 */
export function registerModel(metadata) {
  if (!metadata || typeof metadata !== 'object' || !metadata.id) {
    throw new Error('registerModel requires metadata with an id');
  }
  const record = {
    foundationModel: null,
    provider: null,
    servingModel: null,
    quantization: null,
    license: null,
    promptVersion: null,
    datasetVersions: {},
    trainingConfig: null,
    loraConfig: null,
    knownWeaknesses: [],
    benchmarks: [],
    status: 'configured',
    registeredAt: new Date().toISOString(),
    ...metadata,
  };

  const error = validateSchema(record, AI_MODEL_METADATA_SCHEMA);
  if (error) {
    throw new Error(`Invalid model metadata at ${error.path}: ${error.message}`);
  }

  const registry = loadRegistry();
  const existingIndex = registry.models.findIndex((m) => m.id === record.id);
  if (existingIndex >= 0) {
    record.benchmarks = registry.models[existingIndex].benchmarks || [];
    record.registeredAt = registry.models[existingIndex].registeredAt || record.registeredAt;
    registry.models[existingIndex] = record;
  } else {
    registry.models.push(record);
  }
  writeFile(registry);
  return record;
}

export function getModel(id) {
  return loadRegistry().models.find((m) => m.id === id) ?? null;
}

export function listModels() {
  return loadRegistry().models.map((m) => ({ ...m }));
}

/**
 * The model currently active for a role: 'baseline' or 'production'.
 */
export function getActiveModel(role) {
  const registry = loadRegistry();
  const id = registry.active?.[role] ?? null;
  if (!id) return null;
  return registry.models.find((m) => m.id === id) ?? null;
}

/**
 * Activate a registered model for a role. Throws if the model is unknown.
 * The previous model stays in the registry — activation is a pointer move.
 */
export function setActiveModel(role, id) {
  if (!ROLE_TYPES[role]) throw new Error(`Unknown registry role "${role}" (expected baseline|production)`);
  const registry = loadRegistry();
  if (id !== null && !registry.models.some((m) => m.id === id)) {
    throw new Error(`Cannot activate unknown model "${id}"`);
  }
  registry.active[role] = id;
  writeFile(registry);
  return id;
}

/**
 * Append a benchmark result to a model's record.
 *
 * @param {string} modelId
 * @param {object} record { runId, datasetVersion, split, tasks, backend, provider, metrics, runAt, promptVersion, inference }
 */
export function recordBenchmark(modelId, record) {
  const registry = loadRegistry();
  const model = registry.models.find((m) => m.id === modelId);
  if (!model) throw new Error(`Cannot record benchmark for unknown model "${modelId}"`);
  if (!Array.isArray(model.benchmarks)) model.benchmarks = [];
  const entry = { runAt: new Date().toISOString(), ...record };
  model.benchmarks.push(entry);
  if (model.status === 'configured') model.status = 'evaluated';
  writeFile(registry);
  return entry;
}

/**
 * Compare two models on shared (datasetVersion, split, task) benchmark runs.
 * Returns only the intersections — incomparable runs are reported as skipped.
 */
export function compareModels(idA, idB) {
  const a = getModel(idA);
  const b = getModel(idB);
  if (!a || !b) throw new Error('Both models must exist to compare');

  const key = (r) => `${r.datasetVersion}|${r.split}|${(r.tasks || []).join(',')}`;
  const bByKey = new Map((b.benchmarks || []).map((r) => [key(r), r]));

  const comparisons = [];
  for (const runA of a.benchmarks || []) {
    const runB = bByKey.get(key(runA));
    if (!runB) continue;
    const deltas = {};
    for (const [metric, valueA] of Object.entries(runA.metrics || {})) {
      const valueB = runB.metrics?.[metric];
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        deltas[metric] = { a: valueA, b: valueB, delta: round(valueB - valueA) };
      }
    }
    comparisons.push({ key: key(runA), runA: runA.runId ?? runA.runAt, runB: runB.runId ?? runB.runAt, deltas });
  }

  return {
    modelA: a.id,
    modelB: b.id,
    comparisons,
    skipped: (a.benchmarks || []).length - comparisons.length,
  };
}

/** Semver-ish bump used when cloning a model record for a new experiment. */
export function bumpVersion(version, part = 'minor') {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || ''));
  if (!m) throw new Error(`Not a semver x.y.z: ${version}`);
  const [, maj, min, pat] = m.map(Number);
  if (part === 'major') return `${maj + 1}.0.0`;
  if (part === 'patch') return `${maj}.${min}.${pat + 1}`;
  return `${maj}.${min + 1}.0`;
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

export default {
  loadRegistry,
  reloadRegistry,
  registerModel,
  getModel,
  listModels,
  getActiveModel,
  setActiveModel,
  recordBenchmark,
  compareModels,
  bumpVersion,
};
