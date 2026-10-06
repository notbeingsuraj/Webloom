import { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
import { getActiveModel, getModel } from '../modelRegistry.js';

/**
 * WebloomFineTunedModelProvider — serves requests through a fine-tuned model
 * recorded in the registry (models/registry.json).
 *
 * Default behaviour: the *active production model* only. Until a fine-tuned
 * Webloom model is trained, registered, and marked active-production, this
 * provider reports itself unconfigured and the auto chain skips it.
 *
 * Opt-in targeting (evaluation of a candidate that is NOT promoted): pass
 * { modelId } in the constructor. The provider then serves that registry
 * record so a candidate can be benchmarked without ever becoming the default.
 * This is how eval/run.js --backend webloom evaluates `webloom-ai-v0.1.0`
 * against the untouched holdout.
 *
 * The adapter reuses the same OpenAI-compatible inference backend as the
 * foundation model because a LoRA/QLoRA adapter is served through that server.
 */
export class WebloomFineTunedModelProvider extends LocalFoundationModelProvider {
  constructor({ model = null, timeoutMs = null, modelId = null } = {}) {
    super({ model, timeoutMs });
    this._registryModel = null;
    this._optInModelId = modelId;
  }

  get name() {
    return 'webloom-finetuned';
  }

  get type() {
    return 'webloom';
  }

  _active() {
    if (this._registryModel) return this._registryModel;
    this._registryModel = this._optInModelId ? getModel(this._optInModelId) : getActiveModel('production');
    return this._registryModel;
  }

  get model() {
    if (this._modelOverride) return this._modelOverride;
    const active = this._active();
    return active?.servingModel || active?.foundationModel || null;
  }

  /** Registry id of the model that would serve, for provenance. */
  get modelId() {
    return this._active()?.id ?? null;
  }

  isConfigured() {
    const active = this._active();
    if (!active) return false;
    if (this._optInModelId) {
      // Explicit opt-in: candidates and active models are both valid targets.
      if (active.status !== 'candidate' && active.status !== 'active-production') return false;
    } else if (active.status !== 'active-production') {
      return false;
    }
    return super.isConfigured();
  }
}

export default WebloomFineTunedModelProvider;
