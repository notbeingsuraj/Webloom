/**
 * Together AI Provider — Open-weight model hosting with competitive pricing.
 *
 * OpenAI-compatible API at https://api.together.xyz/v1
 * Supports Qwen, Mistral, Llama, DeepSeek, and other open-weight models.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class TogetherAIProvider extends OpenAICompatibleProvider {
  get label() {
    return 'Together AI';
  }

  get name() {
    return 'together';
  }

  get type() {
    return 'together';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://api.together.xyz/v1').replace(/\/+$/, '');
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
    const model = this.config.model;

    // Use larger models for reasoning tasks
    if (operation === 'brand' || operation === 'audit' || operation === 'reasoning') {
      return this.config.reasoningModel || 'meta-llama/Meta-Llama-3.1-70B-Instruct';
    }

    return model;
  }

  /**
   * Together AI error normalization.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    if (status === 404 || /model .* not found|no endpoints found/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Together AI model "${this.getModel('default')}" unavailable: ${message}`,
        cause: error,
      });
    }

    if (status === 429) {
      return new AIError({
        category: AI_ERROR_CATEGORY.RATE_LIMITED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Together AI rate limit: ${message}`,
        cause: error,
      });
    }

    if (status === 402 || /billing|credit|payment|insufficient funds/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Together AI quota exhausted: ${message}`,
        cause: error,
      });
    }

    if (status === 401 || status === 403) {
      return new AIError({
        category: AI_ERROR_CATEGORY.AUTHENTICATION,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Together AI authentication failed: ${message}`,
        cause: error,
      });
    }

    return null;
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

export default TogetherAIProvider;