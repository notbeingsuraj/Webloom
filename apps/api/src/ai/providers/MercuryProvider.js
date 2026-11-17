/**
 * Mercury 3 Provider — Inception Labs Mercury 3 API provider.
 *
 * Official API: https://api.inceptionlabs.ai/v1
 * Model: mercury-3
 * OpenAI-compatible API with structured output support.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class MercuryProvider extends OpenAICompatibleProvider {
  constructor(options = {}) {
    // Support both legacy format (model, timeoutMs, apiKey, baseUrl) and new AIProvider format (name, config, defaultTimeoutMs, probeMaxTokens)
    const isNewFormat = options.name !== undefined || options.config !== undefined;
    
    let name, config, defaultTimeoutMs, probeMaxTokens;
    
    if (isNewFormat) {
      // New AIProvider format
      name = options.name || 'mercury';
      config = options.config || {};
      defaultTimeoutMs = options.defaultTimeoutMs || 30000;
      probeMaxTokens = options.probeMaxTokens || 6000;
    } else {
      // Legacy format (model, timeoutMs, apiKey, baseUrl)
      name = 'mercury';
      const { model = null, timeoutMs = null, apiKey = null, baseUrl = null } = options;
      config = {
        enabled: true,
        apiKey,
        model: model ?? 'mercury-3',
        baseUrl: baseUrl ?? 'https://api.inceptionlabs.ai/v1',
        timeoutMs: timeoutMs ?? 30000,
        requiresApiKey: true,
      };
      defaultTimeoutMs = timeoutMs ?? 30000;
      probeMaxTokens = 6000;
    }
    
    super({ name, config, defaultTimeoutMs, probeMaxTokens });
  }

  get label() {
    return 'Mercury 3';
  }

  get type() {
    return 'mercury';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://api.inceptionlabs.ai/v1').replace(/\/+$/, '');
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
      'business_extraction',
      'business_research',
      'entity_resolution',
      'review_analysis',
      'sentiment_classification',
      'competitor_analysis',
      'trend_classification',
      'report_generation',
      'structured_output',
    ];
  }

  getModel(operation) {
    // Mercury 3 for all operations
    return this.config.model || 'mercury-3';
  }

  /**
   * Mercury 3 supports native structured output via response_format.
   * Override normalizeError to handle Mercury-specific errors.
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
        message: `Mercury model "${this.getModel('default')}" is unavailable: ${message}`,
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
        message: `Mercury rate limit: ${message}`,
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
        message: `Mercury quota exhausted: ${message}`,
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
        message: `Mercury authentication failed: ${message}`,
        cause: error,
      });
    }

    // Provider unavailable
    if (status >= 500) {
      return new AIError({
        category: AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Mercury provider unavailable: ${message}`,
        cause: error,
      });
    }

    return null; // Let base class handle
  }

  /**
   * Mercury supports native structured output via response_format.
   * No need to override complete() since OpenAICompatibleProvider handles it.
   */
  getCapabilities() {
    return [
      'business_extraction',
      'business_research',
      'entity_resolution',
      'review_analysis',
      'sentiment_classification',
      'competitor_analysis',
      'trend_classification',
      'report_generation',
      'structured_output',
    ];
  }

  getModel(operation) {
    // Mercury 3 for all operations
    return this.config.model || 'mercury-3';
  }

  async runHealthCheck() {
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
      const aiError = error;
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

export default MercuryProvider;