/**
 * Self-Hosted Provider — Generic OpenAI-compatible adapter for local/private inference.
 *
 * Works with: Ollama, LM Studio, vLLM, TGI, llama.cpp, and any OpenAI-compatible server.
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class SelfHostedProvider extends OpenAICompatibleProvider {
  get label() {
    return this.config.label || 'Self-Hosted';
  }

  get name() {
    return 'selfhosted';
  }

  get type() {
    return 'selfhosted';
  }

  get requiresApiKey() {
    return this.config.requiresApiKey === true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
  }

  chatUrl() {
    return `${this.baseUrl}/chat/completions`;
  }

  authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  isConfigured() {
    if (!this.config.enabled) return false;
    if (!this.config.model) return false;
    return Boolean(this.baseUrl);
  }

  getCapabilities() {
    // Capabilities depend on the loaded model
    return [
      'business_extraction',
      'entity_resolution',
      'review_analysis',
      'sentiment_classification',
      'structured_output',
      // Reasoning depends on model
    ];
  }

  getModel(operation) {
    return this.config.model;
  }

  /**
   * Self-hosted servers often reject response_format.
   * Retry once without it, then rely on OutputValidator for JSON repair.
   */
  async complete(options) {
    try {
      return await super.complete(options);
    } catch (error) {
      const rejectedStructuredOutput =
        error?.httpStatus === 400 &&
        /response_format|json_schema|not supported|unsupported.*(format|schema)/i.test(
          error?.safeMessage || error?.message || ''
        );

      if (!rejectedStructuredOutput) throw error;

      if (options.debug) {
        console.warn(`[SelfHostedProvider] ${this.label} rejected response_format; retrying without it`);
      }

      return super.complete({ ...options, responseFormat: null });
    }
  }

  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    if (status === 404 || /model .* not found|no endpoints found|not found/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Self-hosted model "${this.getModel('default')}" not found: ${message}`,
        cause: error,
      });
    }

    if (status === 429) {
      return new AIError({
        category: AI_ERROR_CATEGORY.RATE_LIMITED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Self-hosted rate limit: ${message}`,
        cause: error,
      });
    }

    if (status === 401 || status === 403) {
      return new AIError({
        category: AI_ERROR_CATEGORY.AUTHENTICATION,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Self-hosted authentication failed: ${message}`,
        cause: error,
      });
    }

    // Connection refused / server down
    if (
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNRESET' ||
      /connection refused|connection reset|socket hang up|network error|fetch failed/i.test(message)
    ) {
      return new AIError({
        category: AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: null,
        message: `Self-hosted server unreachable: ${message}`,
        cause: error,
      });
    }

    return null;
  }

  /**
   * Health check with model discovery.
   */
  async runHealthCheck() {
    const health = await super.runHealthCheck();

    // Try to discover available models
    if (health.usable) {
      try {
        const models = await this.getAvailableModels();
        if (models.length > 0) {
          health.availableModels = models;
          health.detail = `ok (${models.length} models available)`;
        }
      } catch (e) {
        // Non-fatal
      }
    }

    return health;
  }

  /**
   * Discover available models from /v1/models endpoint.
   */
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/v1.*$/, '')}/v1/models`, {
        headers: this.authHeaders(),
        timeout: 5000,
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.data?.map(m => m.id) ?? [];
    } catch (error) {
      return [];
    }
  }

  async runHealthCheck() {
    try {
      const response = await this.complete({
        model: this.getModel('default'),
        prompt: 'ping',
        maxTokens: 5,
        temperature: 0,
        timeoutMs: 15000, // Longer for local
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

export default SelfHostedProvider;