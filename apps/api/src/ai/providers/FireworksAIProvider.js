/**
 * Fireworks AI Provider — Fast inference for open-weight models.
 *
 * OpenAI-compatible API at https://api.fireworks.ai/inference/v1
 * Supports Llama, Mistral, Qwen, and other models with ultra-fast inference.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class FireworksAIProvider extends OpenAICompatibleProvider {
  get label() {
    return 'Fireworks AI';
  }

  get name() {
    return 'fireworks';
  }

  get type() {
    return 'fireworks';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://api.fireworks.ai/inference/v1').replace(/\/+$/, '');
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

    if (operation === 'brand' || operation === 'audit' || operation === 'reasoning') {
      return this.config.reasoningModel || 'accounts/fireworks/models/llama-v3p1-70b-instruct';
    }

    return model;
  }

  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    if (status === 404 || /model .* not found|no endpoints found/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Fireworks AI model "${this.getModel('default')}" unavailable: ${message}`,
        cause: error,
      });
    }

    if (status === 429) {
      return new AIError({
        category: AI_ERROR_CATEGORY.RATE_LIMITED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Fireworks AI rate limit: ${message}`,
        cause: error,
      });
    }

    if (status === 402 || /billing|credit|payment|insufficient funds/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Fireworks AI quota exhausted: ${message}`,
        cause: error,
      });
    }

    if (status === 401 || status === 403) {
      return new AIError({
        category: AI_ERROR_CATEGORY.AUTHENTICATION,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Fireworks AI authentication failed: ${message}`,
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

export default FireworksAIProvider;