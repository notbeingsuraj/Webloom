import { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
import { getActiveModel } from '../modelRegistry.js';

/**
 * WebloomFineTunedModelProvider — serves requests through the *active
 * production model* recorded in the model registry (models/registry.json).
 *
 * Until a fine-tuned Webloom model is trained, registered, and marked
 * active-production, this provider reports itself unconfigured and the auto
 * chain simply skips it. It reuses the local OpenAI-compatible backend
 * because a LoRA/QLoRA adapter is served through the same inference server
 * as the foundation model.
 */
export class WebloomFineTunedModelProvider extends LocalFoundationModelProvider {
  constructor({ model = null, timeoutMs = null } = {}) {
    super({ model, timeoutMs });
    this._registryModel = null;
  }

  get name() {
    return 'webloom-finetuned';
  }

  get type() {
    return 'webloom';
  }

  _active() {
    if (this._registryModel) return this._registryModel;
    this._registryModel = getActiveModel('production');
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
    if (!active || active.status !== 'active-production') return false;
    return super.isConfigured();
  }
}

export default WebloomFineTunedModelProvider;
