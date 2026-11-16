/**
 * Hugging Face Inference Provider — Serverless API and Dedicated Endpoints.
 *
 * Supports both free serverless inference (30K tokens/month) and paid dedicated endpoints.
 * OpenAI-compatible API at https://api-inference.huggingface.co
 */

import { OpenAICompatibleProvider } from '../../services/ai/providers/OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  get label() {
    return 'Hugging Face';
  }

  get name() {
    return 'huggingface';
  }

  get type() {
    return 'huggingface';
  }

  get requiresApiKey() {
    return true;
  }

  get baseUrl() {
    return (this.config.baseUrl || 'https://api-inference.huggingface.co').replace(/\/+$/, '');
  }

  chatUrl() {
    // Serverless uses /models/{model}/chat/completions
    // Dedicated endpoints use /chat/completions
    if (this.config.endpointUrl) {
      return `${this.config.endpointUrl}/chat/completions`;
    }
    return `${this.baseUrl}/models/${this.config.model}/chat/completions`;
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
      'entity_resolution',
      'review_analysis',
      'sentiment_classification',
      'structured_output',
      // Reasoning capabilities depend on model
    ];
  }

  getModel(operation) {
    return this.config.model;
  }

  /**
   * Hugging Face error normalization.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    // Model loading / not found
    if (status === 404 || /model .* not found|repository not found|is not available/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Hugging Face model "${this.getModel('default')}" not found: ${message}`,
        cause: error,
      });
    }

    // Model loading (503 on serverless)
    if (status === 503 || /model is currently loading|currently loading|loading the model/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Hugging Face model is loading: ${message}`,
        cause: error,
        retryable: true,
      });
    }

    // Rate limit
    if (status === 429) {
      return new AIError({
        category: AI_ERROR_CATEGORY.RATE_LIMITED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Hugging Face rate limit: ${message}`,
        cause: error,
      });
    }

    // Quota
    if (status === 402 || /quota|billing|credit|payment/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Hugging Face quota exhausted: ${message}`,
        cause: error,
      });
    }

    // Auth
    if (status === 401 || status === 403) {
      return new AIError({
        category: AI_ERROR_CATEGORY.AUTHENTICATION,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Hugging Face authentication failed: ${message}`,
        cause: error,
      });
    }

    // Model too large for serverless
    if (status === 413 || /too large|payload too large|model too large/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `Model too large for serverless inference. Use a dedicated endpoint.`,
        cause: error,
      });
    }

    return null;
  }

  /**
   * Build body for HF Inference API (handles both serverless and dedicated).
   */
  buildBody({ model, systemPrompt, prompt, temperature, maxTokens, responseFormat }) {
    const isDedicated = Boolean(this.config.endpointUrl);

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const body = {
      model: isDedicated ? undefined : model, // Dedicated endpoints don't need model in body
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    // For serverless, add model parameter
    if (!isDedicated) {
      body.model = model;
    }

    return body;
  }

  chatUrl() {
    if (this.config.endpointUrl) {
      return `${this.config.endpointUrl.replace(/\/+$/, '')}/chat/completions`;
    }
    return `${this.baseUrl}/models/${this.config.model}/chat/completions`;
  }

  /**
   * Extract content from HF response (handles both formats).
   */
  extractContent(message) {
    // Standard OpenAI format
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) return content;

    // HF sometimes returns array of parts
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .join('')
        .trim();
      if (joined) return joined;
    }

    // Some models return generated_text
    if (message?.generated_text) {
      if (typeof message.generated_text === 'string') return message.generated_text.trim();
      if (Array.isArray(message.generated_text)) {
        return message.generated_text.map(p => typeof p === 'string' ? p : p?.text || '').join('').trim();
      }
    }

    return null;
  }

  async complete(options) {
    // HF serverless can have cold starts - increase timeout
    const timeoutMs = options.timeoutMs ?? this.timeoutMs ?? 60000;

    try {
      return await super.complete({ ...options, timeoutMs });
    } catch (error) {
      // Handle model loading error specifically
      if (error.httpStatus === 503 || /loading/i.test(error.message)) {
        // Throw with more context
        throw error;
      }
      throw error;
    }
  }

  async runHealthCheck() {
    // Health check for HF - use minimal tokens
    try {
      const response = await this.complete({
        model: this.getModel('default'),
        prompt: 'ping',
        maxTokens: 5,
        temperature: 0,
        timeoutMs: 30000, // Longer for potential cold start
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

export default HuggingFaceProvider;