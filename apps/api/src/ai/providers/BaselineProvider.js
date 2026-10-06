import { AIModelProvider } from './AIModelProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';
import { repairForContract } from './baselineRepair.js';
import AIServiceSingleton from '../../services/AIService.js';
import { config } from '../../config/env.js';
import { getActiveModel } from '../modelRegistry.js';

const FORMAT_ALIASES = Object.freeze({
  json_object: 'json_object',
  json_schema: 'json_schema',
  none: null,
});

/**
 * BaselineProvider — pins every request to ONE fixed foundation model: the
 * model registered as active-baseline in models/registry.json.
 *
 * Baseline semantics are deliberately stricter than production:
 *  - no ordered provider chain, no cross-vendor fallback — one backend named
 *    by AI_BASELINE_PROVIDER ('local' | 'openrouter');
 *  - one attempt; a failure is recorded, never silently masked;
 *  - the serving model is pinned explicitly, so "the baseline ran on model X"
 *    is always reproducible.
 *
 * This is what makes eval/run.js --backend baseline trustworthy: the numbers
 * describe the model, not whichever vendor happened to answer.
 */
export class BaselineProvider extends AIModelProvider {
  constructor({ model = null, timeoutMs = null } = {}) {
    super();
    this._modelOverride = model;
    this._timeoutMs = timeoutMs;
    this._backend = null;
    this._lastShape = null;
  }

  get name() {
    return 'baseline';
  }

  get type() {
    return 'baseline';
  }

  _backendName() {
    const name = config.ai.baseline?.provider || 'local';
    if (name !== 'local' && name !== 'openrouter') {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: 'baseline',
        message: `AI_BASELINE_PROVIDER must be "local" or "openrouter", got "${name}".`,
      });
    }
    return name;
  }

  _activeBaseline() {
    return getActiveModel('baseline') ?? null;
  }

  /** Serving model: AI_BASELINE_MODEL, else constructor override, else active
   *  baseline record (whose servingModel is the local serving slug). */
  get model() {
    if (config.ai.baseline?.model) return config.ai.baseline.model;
    if (this._modelOverride) return this._modelOverride;
    const active = this._activeBaseline();
    return active?.servingModel || active?.foundationModel || null;
  }

  get modelId() {
    return this._activeBaseline()?.id ?? null;
  }

  isConfigured() {
    const backendName = this._backendName();
    const backend = config.ai.providers?.[backendName];
    if (!backend) return false;
    if (backendName === 'openrouter') {
      if (!backend.enabled || !backend.apiKey) return false;
    } else {
      // 'local' (Ollama etc.) is a bonus: enabled-by-configured.
      if (!backend.baseUrl) return false;
    }
    return Boolean(this.model);
  }

  _responseFormat(schema) {
    const format = config.ai.baseline?.format ?? 'json_object';
    if (!schema || format === 'none') return null;
    if (format === 'json_object') return { type: 'json_object' };
    const built = AIServiceSingleton.buildResponseFormat(schema);
    return built?.type === 'json_schema' ? { type: 'json_schema', json_schema: built.json_schema } : { type: 'json_object' };
  }

  async _getProvider() {
    if (this._backend) return this._backend;
    const { createProvider } = await import('../../services/ai/AIProviderFactory.js');
    const backendName = this._backendName();
    const backendConfig = {
      ...config.ai.providers?.[backendName],
      // Pin the model: the baseline must run on exactly the registered model.
      model: this.model,
    };
    this._backend = createProvider(backendName, backendConfig, config.ai.timeoutMs, config.ai.probeMaxTokens);
    return this._backend;
  }

  async run(request) {
    if (!this.isConfigured()) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: 'baseline',
        message: `${this._backendName()} baseline is not configured. Set AI_BASELINE_PROVIDER + AI_BASELINE_MODEL (or serve the active baseline via a configured backend).`,
      });
    }

    const model = this.model;
    if (!model) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: 'baseline',
        message: 'No baseline model set. Register + activate a baseline model, or set AI_BASELINE_MODEL.',
      });
    }

    const provider = await this._getProvider();
    const responseFormat = this._responseFormat(request.schema ?? null);
    const startedAt = Date.now();

    let response;
    try {
      response = await provider.complete({
        model,
        systemPrompt: request.systemPrompt ?? null,
        prompt: request.prompt,
        temperature: request.temperature ?? 0.3,
        maxTokens: request.maxTokens ?? 4000,
        responseFormat,
        timeoutMs: this._timeoutMs ?? provider.timeoutMs,
      });
    } catch (error) {
      throw AIError.from(error, { provider: 'baseline', model });
    }

    if (response.finishReason === 'length') {
      throw new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: 'baseline',
        model,
        message: `Baseline model truncated the response at ${request.maxTokens ?? 4000} tokens before completing it.`,
        latencyMs: response.latencyMs,
      });
    }

    const out = request.schema
      ? (() => {
          const attempt = repairForContract(response.content, request.schema, { provider: 'baseline', model: response.model || model });
          if (attempt === null) {
            throw new AIError({
              category: AI_ERROR_CATEGORY.INVALID_RESPONSE,
              provider: 'baseline',
              model: response.model || model,
              message: 'Baseline output contained no parseable JSON payload.',
              latencyMs: response.latencyMs,
            });
          }
          // Baseline instrumentation: return the recovered value even when it
          // fails the contract (consumed=false). The benchmark measures value
          // accuracy and schema compliance SEPARATELY, so a non-compliant but
          // information-bearing output must reach the metrics stage rather than
          // vanish into the fallback chain. Only unparseable output throws.
          this._lastShape = {
            consumed: attempt.consumed,
            rawConsumable: attempt.rawConsumable,
            repaired: attempt.repaired ?? false,
            method: attempt.method ?? null,
            rawError: attempt.rawError ?? null,
            repairedError: attempt.repairedError ?? null,
          };
          return attempt.value;
        })()
      : response.content;

    return {
      value: out,
      raw: response.content,
      provider: this._backendName(),
      model: response.model || model,
      usage: response.usage ?? null,
      latencyMs: response.latencyMs ?? (Date.now() - startedAt),
      attempts: [],
      fallbackCount: 0,
      shape: this._lastShape,
    };
  }
}

export default BaselineProvider;