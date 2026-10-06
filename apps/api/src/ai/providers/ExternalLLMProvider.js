import { AIModelProvider } from './AIModelProvider.js';

/**
 * ExternalLLMProvider — adapts Webloom's existing AIService chain
 * (primary → secondary → fallback, retries, budget, structured-output
 * validation, telemetry) to the AIModelProvider interface.
 *
 * This is the production default: all current provider behavior — including
 * cross-vendor fallback and the wall-clock budget — is preserved exactly.
 */
export class ExternalLLMProvider extends AIModelProvider {
  /**
   * @param {object} deps
   * @param {object} [deps.aiService] injectable AIService (defaults to singleton)
   */
  constructor({ aiService = null } = {}) {
    super();
    this._aiService = aiService;
  }

  get aiService() {
    if (this._aiService) return this._aiService;
    return null; // resolved lazily to avoid an import cycle in tests
  }

  get name() {
    return 'external-llm';
  }

  get type() {
    return 'external';
  }

  async _resolve() {
    if (this._aiService) return this._aiService;
    const mod = await import('../../services/AIService.js');
    this._aiService = mod.default;
    return this._aiService;
  }

  isConfigured() {
    // The chain itself decides which vendors are usable; an empty chain is
    // reported at request time by AIService with a typed error.
    return true;
  }

  async run(request) {
    const service = await this._resolve();
    const startedAt = Date.now();
    const value = await service.generate({
      prompt: request.prompt,
      model: request.model || 'reasoning',
      schema: request.schema ?? null,
      temperature: request.temperature ?? 0.3,
      maxTokens: request.maxTokens ?? 4000,
      systemPrompt: request.systemPrompt ?? null,
      operation: request.operation ?? null,
    });

    const meta = value && typeof value === 'object' ? value.__ai ?? null : null;
    return {
      value,
      raw: typeof value === 'string' ? value : JSON.stringify(value),
      provider: meta?.provider ?? 'unknown',
      model: meta?.model ?? null,
      usage: meta?.usage ?? null,
      latencyMs: meta?.latencyMs ?? (Date.now() - startedAt),
      attempts: meta?.attempts ?? [],
      fallbackCount: meta?.fallbackCount ?? 0,
    };
  }
}

export default ExternalLLMProvider;
