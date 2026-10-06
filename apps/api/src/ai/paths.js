import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Filesystem locations for the Webloom AI foundation assets.
 *
 * Datasets, the model registry, and fine-tuning configs live at the repository
 * root (not inside apps/api) because they are workspace-level assets shared by
 * the API, the evaluation harness, and future training jobs.
 */

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

export const DATASETS_DIR = path.join(REPO_ROOT, 'datasets');
export const MODELS_DIR = process.env.WEBLOOM_MODELS_DIR ?? path.join(REPO_ROOT, 'models');
export const MODEL_REGISTRY_FILE = process.env.WEBLOOM_MODEL_REGISTRY
  ?? path.join(MODELS_DIR, 'registry.json');
export const FINETUNE_DIR = path.join(REPO_ROOT, 'finetune');

export default { REPO_ROOT, DATASETS_DIR, MODELS_DIR, MODEL_REGISTRY_FILE, FINETUNE_DIR };
