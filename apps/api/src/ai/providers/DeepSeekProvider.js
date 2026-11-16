/**
 * DeepSeek Provider — DeepSeek V3 (chat) and R1 (reasoning).
 *
 * OpenAI-compatible API at https://api.deepseek.com
 * Supports native structured output via response_format.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  get label() {
    return 'DeepSeek';
  }

  get name() {
    return 'deepseek';
  }

  get type() {
    return 'deepseek';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
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
      'structured_output',
      'report_generation',
    ];
  }

  getModel(operation) {
    const model = this.config.model || 'deepseek-chat';

    // Use reasoning model for research/audit tasks
    if (operation === 'brand' || operation === 'audit' || operation === 'reasoning') {
      return this.config.reasoningModel || 'deepseek-reasoner';
    }

    return model;
  }

  /**
   * DeepSeek error normalization.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    // Model not found
    if (status === 404 || /model .* not found|no endpoints found|is not available/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `DeepSeek model "${this.getModel('default')}" is unavailable: ${message}`,
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
        message: `DeepSeek rate limit: ${message}`,
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
        message: `DeepSeek quota exhausted: ${message}`,
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
        message: `DeepSeek authentication failed: ${message}`,
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

export default DeepSeekProvider;