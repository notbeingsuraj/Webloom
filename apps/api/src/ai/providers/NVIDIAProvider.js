/**
 * NVIDIA NIM Provider — Nemotron 3 Ultra and other NVIDIA models.
 *
 * OpenAI-compatible API at https://integrate.api.nvidia.com/v1
 * Nemotron 3 Ultra does NOT support native structured output.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class NVIDIAProvider extends OpenAICompatibleProvider {
  constructor({ model = null, timeoutMs = null, apiKey = null, baseUrl = null, reasoningModel = null } = {}) {
    super({
      name: 'nvidia',
      config: {
        enabled: true,
        apiKey,
        model: model ?? 'nvidia/nemotron-3-ultra-550b-a55b',
        baseUrl: baseUrl ?? 'https://integrate.api.nvidia.com/v1',
        timeoutMs: timeoutMs ?? 60000,
        requiresApiKey: true,
        operationModels: {
          reasoning: reasoningModel ?? 'nvidia/nemotron-3-ultra-550b-a55b',
        },
      },
      defaultTimeoutMs: timeoutMs ?? 60000,
      probeMaxTokens: 6000,
    });
  }

  get label() {
    return 'NVIDIA NIM';
  }

  get type() {
    return 'nvidia';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  }

  chatUrl() {
    return `${this.baseUrl}/chat/completions`;
  }

  authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  isConfigured() {
    return Boolean(this.config.enabled && this.config.apiKey && this.config.model && this.baseUrl);
  }

  getCapabilities() {
    return [
      'business_research',
      'competitor_analysis',
      'trend_classification',
      'report_generation',
      // Nemotron does NOT support structured output natively
    ];
  }

  getModel(operation) {
    // Nemotron 3 Ultra for reasoning tasks
    if (operation === 'brand' || operation === 'audit' || operation === 'reasoning') {
      return this.config.model || 'nvidia/nemotron-3-ultra-550b-a55b';
    }
    // Default
    return this.config.model || 'nvidia/nemotron-3-ultra-550b-a55b';
  }

  /**
   * NVIDIA NIM reports model unavailability as 404 with specific message.
   * Also handles rate limits and quota errors.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    // Model not available
    if (status === 404 || /no endpoints found|model .* not found|is not available/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `NVIDIA model "${this.getModel('default')}" is unavailable: ${message}`,
        cause: error,
      });
    }

    // Rate limit
    if (status === 429) {
      return new AIError({
        category: AI_ERROR_CATEGORY.RATE_LIMITED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `NVIDIA rate limit: ${message}`,
        cause: error,
      });
    }

    // Quota / billing
    if (status === 402 || /billing|credit balance|insufficient funds|payment|upgrade your plan/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `NVIDIA quota exhausted: ${message}`,
        cause: error,
      });
    }

    // Auth failure
    if (status === 401 || status === 403) {
      return new AIError({
        category: AI_ERROR_CATEGORY.AUTHENTICATION,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `NVIDIA authentication failed: ${message}`,
        cause: error,
      });
    }

    return null; // Let base class handle
  }

  /**
   * NVIDIA doesn't support structured output natively.
   * Override complete to handle response_format gracefully.
   */
  async complete(options) {
    // NVIDIA Nemotron doesn't support response_format
    // Remove responseFormat for Nemotron models
    const isNemotron = (options.model ?? this.getModel('default')).includes('nemotron');

    if (isNemotron && options.responseFormat) {
      if (options.debug) {
        console.warn('[NVIDIAProvider] Nemotron does not support response_format; removing');
      }
      options = { ...options, responseFormat: null };
    }

    return super.complete(options);
  }

  async runHealthCheck() {
    // NVIDIA health check with minimal tokens
    try {
      const response = await this.complete({
        model: this.getModel('default'),
        prompt: 'ping',
        maxTokens: 5,
        temperature: 0,
        timeoutMs: 10000,
      });

      return {
        provider: this.name,
        model: this.getModel('default'),
        configured: this.isConfigured(),
        reachable: true,
        authenticated: true,
        usable: true,
        detail: 'ok',
        latencyMs: 0,
      };
    } catch (error) {
      const aiError = error; // Assuming AIError
      return {
        provider: this.name,
        model: this.getModel('default'),
        configured: this.isConfigured(),
        reachable: aiError.httpStatus !== 0 && aiError.httpStatus !== 401 && aiError.httpStatus !== 403,
        authenticated: aiError.httpStatus !== 401 && aiError.httpStatus !== 403,
        usable: false,
        detail: aiError.safeMessage ?? error.message,
        latencyMs: aiError.latencyMs ?? null,
      };
    }
  }
}

export default NVIDIAProvider;