import { AIModelProvider } from './AIModelProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';
import { validateStructuredOutput } from '../../services/ai/AIResponseValidator.js';
import AIServiceSingleton from '../../services/AIService.js';
import { config } from '../../config/env.js';

/**
 * LocalFoundationModelProvider — pins a request to the *local* inference
 * backend (Ollama / LM Studio / vLLM / llama.cpp via the OpenAI-compatible
 * LocalProvider) instead of the ordered external chain.
 *
 * Used by the baseline evaluation pipeline: a baseline must be one fixed
 * model, not whichever vendor happened to answer. Single attempt, no
 * cross-vendor fallback — if the local model cannot serve the request the
 * call fails, and the benchmark records that fact.
 */
export class LocalFoundationModelProvider extends AIModelProvider {
  constructor({ model = null, timeoutMs = null } = {}) {
    super();
    this._modelOverride = model;
    this._timeoutMs = timeoutMs;
    this._provider = null;
  }

  get name() {
    return 'local-foundation';
  }

  get type() {
    return 'baseline';
  }

  get model() {
    return this._modelOverride || config.ai.providers?.local?.model || null;
  }

  isConfigured() {
    const local = config.ai.providers?.local;
    return Boolean(local?.enabled && local.baseUrl);
  }

  async _getProvider() {
    if (this._provider) return this._provider;
    const { createProvider } = await import('../../services/ai/AIProviderFactory.js');
    const localConfig = config.ai.providers.local;
    this._provider = createProvider('local', localConfig, config.ai.timeoutMs, config.ai.probeMaxTokens);
    return this._provider;
  }

  async run(request) {
    if (!this.isConfigured()) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: 'local',
        message: 'Local foundation model is not configured. Set LOCAL_AI_BASE_URL (and LOCAL_AI_MODEL).',
      });
    }

    const provider = await this._getProvider();
    const model = this.model;
    if (!model) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: 'local',
        message: 'No local model configured. Set LOCAL_AI_MODEL.',
      });
    }

    const responseFormat = AIServiceSingleton.buildResponseFormat(request.schema ?? null);
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
      throw AIError.from(error, { provider: 'local', model });
    }

    if (response.finishReason === 'length') {
      throw new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: 'local',
        model,
        message: `Local model truncated the response at ${request.maxTokens ?? 4000} tokens before completing it.`,
        latencyMs: response.latencyMs,
      });
    }

    const value = responseFormat
      ? validateStructuredOutput(response.content, request.schema ?? null, { provider: 'local', model: response.model || model })
      : response.content;

    return {
      value,
      raw: response.content,
      provider: 'local',
      model: response.model || model,
      usage: response.usage ?? null,
      latencyMs: response.latencyMs ?? (Date.now() - startedAt),
      attempts: [],
      fallbackCount: 0,
    };
  }
}

export default LocalFoundationModelProvider;
