import axios from 'axios';
import { config } from '../config/env.js';

export const PROVIDER_ERROR_CATEGORIES = Object.freeze({
  AUTHENTICATION: 'AUTHENTICATION',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
});

/**
 * AI Service - Unified interface for AI model interactions via OmniRoute
 *
 * This service provides a single abstraction layer for all AI calls,
 * allowing easy model switching and routing.
 */

class AIService {
  constructor() {
    this.client = axios.create({
      baseURL: config.omniroute.baseUrl,
      // AI calls (brand DNA, digital audit, re-research) are long-running
      // reasoning tasks — they need a much larger budget than the 15s
      // extraction timeout. Coupling them previously forced every enrichment
      // to degrade on slow (but healthy) gateway routes.
      timeout: config.ai.timeout,
      headers: {
        'Authorization': `Bearer ${config.omniroute.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  sanitizeSecretText(value) {
    if (typeof value !== 'string') return '';

    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/Authorization\s*:\s*Bearer\s*[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [REDACTED]')
      .replace(/api[_-]?key\s*[:=]\s*['\"]?[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
      .replace(/x-api-key\s*[:=]\s*['\"]?[A-Za-z0-9._-]+/gi, 'x-api-key=[REDACTED]')
      .replace(/sk-[A-Za-z0-9]{8,}/gi, '[REDACTED]')
      .replace(/cookie\s*[:=]\s*[^;\n]+/gi, 'cookie=[REDACTED]')
      .replace(/set-cookie\s*[:=]\s*[^;\n]+/gi, 'set-cookie=[REDACTED]');
  }

  classifyProviderError({ status, message, errorCode = null }) {
    const text = String(message || '').toLowerCase();

    if (status === 401 || /unauthorized|invalid api key|invalid_api_key|authentication|auth failed/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.AUTHENTICATION;
    }

    if (status === 429 || /rate[_ -]?limit|too many requests|429/i.test(text)) {
      if (/quota|exhausted|limit reached|limit exceeded|reset after|all .* accounts have exhausted/i.test(text)) {
        return PROVIDER_ERROR_CATEGORIES.QUOTA_EXHAUSTED;
      }
      return PROVIDER_ERROR_CATEGORIES.RATE_LIMITED;
    }

    if (status === 402 || /billing|payment|insufficient funds|insufficient_funds/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE;
    }

    if (status === 500 || status === 502 || status === 503 || status === 504 || /upstream|provider unavailable|temporar|gateway|service unavailable|bad gateway|server error/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE;
    }

    if (status === 403 || /forbidden|access denied|blocked|denied/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.AUTHENTICATION;
    }

    if (status === 408 || /timeout|timed out|etimedout|esockettimedout/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.TIMEOUT;
    }

    if (/empty response|invalid json|malformed json|json parse|returned invalid/i.test(text)) {
      return PROVIDER_ERROR_CATEGORIES.INVALID_RESPONSE;
    }

    if (errorCode) {
      const normalizedCode = String(errorCode).toLowerCase();
      if (normalizedCode.includes('quota')) return PROVIDER_ERROR_CATEGORIES.QUOTA_EXHAUSTED;
      if (normalizedCode.includes('timeout')) return PROVIDER_ERROR_CATEGORIES.TIMEOUT;
    }

    return PROVIDER_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE;
  }

  normalizeProviderError({ status = null, message = '', model = null, provider = 'omniroute', retryAttempted = false, retryCount = 0, latencyMs = null, errorCode = null } = {}) {
    const safeMessage = this.sanitizeSecretText(message || 'AI provider request failed.');
    const category = this.classifyProviderError({ status, message: safeMessage, errorCode });

    return {
      category,
      provider,
      model: model || 'unknown',
      httpStatus: status ?? null,
      retryAttempted,
      retryCount,
      latencyMs,
      safeMessage: safeMessage || 'AI provider request failed.',
      success: false,
      errorCode: errorCode || null,
    };
  }

  shouldFallbackForError(error) {
    if (!error) return false;
    const category = error.category || error.providerError?.category || this.classifyProviderError({
      status: error.status ?? error.response?.status ?? null,
      message: error.providerError?.safeMessage || error.message || '',
      errorCode: error.code || error.providerError?.errorCode || null,
    });

    // Auth failures will never succeed on a fallback model — the request is
    // rejected at the gateway, not by the model. Fail fast instead of burning
    // time on the fallback (which hits the same gateway + key).
    if (category === PROVIDER_ERROR_CATEGORIES.AUTHENTICATION) return false;
    if (category === PROVIDER_ERROR_CATEGORIES.INVALID_RESPONSE) return false;
    if (category === PROVIDER_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE) return true;
    if (category === PROVIDER_ERROR_CATEGORIES.RATE_LIMITED) return true;
    if (category === PROVIDER_ERROR_CATEGORIES.QUOTA_EXHAUSTED) return true;
    if (category === PROVIDER_ERROR_CATEGORIES.TIMEOUT) return true;
    return false;
  }

  buildAggregateProviderError({ primaryError, fallbackError, primaryModel, fallbackModel, retryCount = 0 }) {
    const primaryFailure = primaryError?.providerError || this.normalizeProviderError({
      status: primaryError?.status ?? null,
      message: primaryError?.message || 'Primary provider request failed.',
      model: primaryModel,
      provider: 'omniroute',
      retryAttempted: Boolean(primaryError?.retryAttempted),
      retryCount,
      latencyMs: primaryError?.latencyMs ?? null,
      errorCode: primaryError?.code || primaryError?.providerError?.errorCode || null,
    });
    const fallbackFailure = fallbackError?.providerError || this.normalizeProviderError({
      status: fallbackError?.status ?? null,
      message: fallbackError?.message || 'Fallback provider request failed.',
      model: fallbackModel,
      provider: 'omniroute',
      retryAttempted: Boolean(fallbackError?.retryAttempted),
      retryCount,
      latencyMs: fallbackError?.latencyMs ?? null,
      errorCode: fallbackError?.code || fallbackError?.providerError?.errorCode || null,
    });

    const safeMessage = this.sanitizeSecretText(
      fallbackError?.providerError?.safeMessage ||
      fallbackError?.safeMessage ||
      primaryError?.providerError?.safeMessage ||
      primaryError?.safeMessage ||
      'AI provider request failed.'
    );

    const aggregate = new Error(safeMessage);
    aggregate.providerError = {
      category: fallbackFailure.category || primaryFailure.category || PROVIDER_ERROR_CATEGORIES.PROVIDER_UNAVAILABLE,
      provider: 'omniroute',
      model: primaryModel,
      fallbackModel: fallbackModel || null,
      primaryModel,
      fallbackModelUsed: Boolean(fallbackModel),
      primaryFailureCategory: primaryFailure.category,
      fallbackFailureCategory: fallbackFailure.category,
      primaryHttpStatus: primaryFailure.httpStatus ?? null,
      fallbackHttpStatus: fallbackFailure.httpStatus ?? null,
      retryCount,
      safeMessage,
      primarySafeMessage: primaryFailure.safeMessage,
      fallbackSafeMessage: fallbackFailure.safeMessage,
      finalFailure: fallbackFailure,
      primaryFailure,
    };
    aggregate.category = aggregate.providerError.category;
    aggregate.safeMessage = safeMessage;
    aggregate.retryCount = retryCount;
    aggregate.primaryModel = primaryModel;
    aggregate.fallbackModel = fallbackModel || null;
    return aggregate;
  }

  getProviderDiagnostics({ gateway = config.omniroute.baseUrl, model = null, providerError = null, retryCount = 0, latencyMs = null, success = false } = {}) {
    return {
      gateway,
      model: model || config.omniroute.models.fast,
      providerErrorCategory: providerError?.category || null,
      httpStatus: providerError?.httpStatus ?? null,
      retryCount,
      latencyMs: latencyMs ?? null,
      success,
    };
  }

  /**
   * Generate AI completion
   * @param {Object} options - Generation options
   * @param {string} options.prompt - The prompt to send
   * @param {string} options.model - Model to use (fast, reasoning, coding, copywriting)
   * @param {Object} options.schema - Optional JSON schema for structured output
   * @param {number} options.temperature - Temperature (0-2)
   * @param {number} options.maxTokens - Max tokens to generate
   */
  async _sendRequestWithModel({ prompt, model, schema, temperature, maxTokens, systemPrompt }) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    if (schema) {
      if (typeof schema === 'object' && schema !== null && schema.type === 'object') {
        payload.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'LandingPageSpec',
            strict: true,
            schema,
          }
        };
      } else {
        payload.response_format = { type: 'json_object' };
      }
    }

    const response = await this.client.post('/chat/completions', payload);
    const message = response.data?.choices?.[0]?.message;
    let content = message?.content;

    if ((!content || !content.trim()) && message?.reasoning_content) {
      const reasoning = message.reasoning_content;
      const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }

    if (typeof content !== 'string' || !content.trim()) {
      const invalidResponseError = new Error('AI provider returned an empty response');
      invalidResponseError.providerError = this.normalizeProviderError({
        status: null,
        message: invalidResponseError.message,
        model,
        provider: 'omniroute',
        retryAttempted: false,
        retryCount: 0,
        latencyMs: null,
        errorCode: 'INVALID_RESPONSE',
      });
      invalidResponseError.category = invalidResponseError.providerError.category;
      throw invalidResponseError;
    }

    if (schema) {
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch (e) {
        const malformedError = new Error('AI returned invalid JSON');
        malformedError.providerError = this.normalizeProviderError({
          status: null,
          message: malformedError.message,
          model,
          provider: 'omniroute',
          retryAttempted: false,
          retryCount: 0,
          latencyMs: null,
          errorCode: 'INVALID_RESPONSE',
        });
        malformedError.category = malformedError.providerError.category;
        throw malformedError;
      }
    }

    return content;
  }

  async generate({ prompt, model = 'fast', schema = null, temperature = 0.7, maxTokens = 4000, systemPrompt = null }) {
    if (!config.omniroute.apiKey) throw new Error('Missing OMNIROUTE_API_KEY');

    const primaryModel = this.selectModel(model);
    const fallbackModel = this.getFallbackModel(primaryModel);
    const maxAttempts = Math.max(1, Number(config.extraction.maxRetries || 2) + 1);
    const retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);

    const runWithModel = async ({ modelName, isFallback = false }) => {
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startedAt = Date.now();
        try {
          if (config.debugBusinessAnalysis) {
            console.log('[AI] Provider: OmniRoute');
            console.log('[AI] Model:', modelName);
            console.log('[AI] Prompt Data Size:', prompt.length);
          }

          return await this._sendRequestWithModel({
            prompt,
            model: modelName,
            schema,
            temperature,
            maxTokens,
            systemPrompt,
          });
        } catch (error) {
          lastError = error;
          const status = error.response?.status ?? error.status ?? null;
          const bodyMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
          const sanitizedMessage = this.sanitizeSecretText(String(bodyMessage || error.message || 'AI provider request failed.'));
          const providerError = this.normalizeProviderError({
            status,
            message: sanitizedMessage,
            model: modelName,
            provider: 'omniroute',
            retryAttempted: attempt > 1,
            retryCount: Math.max(0, attempt - 1),
            latencyMs: Date.now() - startedAt,
            errorCode: error?.code || null,
          });

          error.providerError = providerError;
          error.status = status;
          error.category = providerError.category;
          error.retryAttempted = attempt > 1 || providerError.retryAttempted;
          error.retryCount = Math.max(providerError.retryCount, attempt - 1);
          error.latencyMs = Date.now() - startedAt;
          error.safeMessage = providerError.safeMessage;

          // Auth failures (401/403/invalid key) are deterministic — retrying
          // cannot fix them and only delays the caller (15s+ per attempt).
          // Fail fast so the pipeline degrades immediately instead of hanging.
          if (providerError.category === PROVIDER_ERROR_CATEGORIES.AUTHENTICATION) {
            throw error;
          }

          if (status && retryableStatusCodes.has(Number(status)) && attempt < maxAttempts) {
            const delayMs = 500 * Math.pow(2, attempt - 1);
            await this.sleep(delayMs);
            continue;
          }

          if (providerError.category === PROVIDER_ERROR_CATEGORIES.TIMEOUT && attempt < maxAttempts) {
            const delayMs = 500 * Math.pow(2, attempt - 1);
            await this.sleep(delayMs);
            continue;
          }

          if (providerError.category === PROVIDER_ERROR_CATEGORIES.RATE_LIMITED && attempt < maxAttempts) {
            const delayMs = 500 * Math.pow(2, attempt - 1);
            await this.sleep(delayMs);
            continue;
          }

          if (providerError.category === PROVIDER_ERROR_CATEGORIES.QUOTA_EXHAUSTED && attempt < maxAttempts) {
            const delayMs = 500 * Math.pow(2, attempt - 1);
            await this.sleep(delayMs);
            continue;
          }

          throw error;
        }
      }

      const finalError = new Error(lastError?.providerError?.safeMessage || 'AI generation failed.');
      finalError.providerError = lastError?.providerError || this.normalizeProviderError({
        status: null,
        message: 'AI generation failed.',
        model: modelName,
        provider: 'omniroute',
        retryAttempted: false,
        retryCount: 0,
        latencyMs: null,
        errorCode: 'UNKNOWN_ERROR',
      });
      throw finalError;
    };

    try {
      return await runWithModel({ modelName: primaryModel, isFallback: false });
    } catch (primaryError) {
      if (!fallbackModel || !this.shouldFallbackForError(primaryError)) {
        throw primaryError;
      }

      try {
        return await runWithModel({ modelName: fallbackModel, isFallback: true });
      } catch (fallbackError) {
        throw this.buildAggregateProviderError({
          primaryError,
          fallbackError,
          primaryModel,
          fallbackModel,
          retryCount: Math.max(primaryError?.retryCount || 0, fallbackError?.retryCount || 0),
        });
      }
    }
  }

  /**
   * Select appropriate model based on task type
   */
  selectModel(taskType) {
    if (config.ai?.primaryModel) {
      return config.ai.primaryModel;
    }
    return config.omniroute.models[taskType] || config.omniroute.models.fast;
  }

  getFallbackModel(primaryModel) {
    if (config.ai?.fallbackModel) {
      return config.ai.fallbackModel;
    }
    // Robust default: if the primary is a heavy reasoning model, fall back to
    // the fast combo (always present in the OmniRoute catalog). If the primary
    // is already fast, there is no meaningful fallback.
    if (primaryModel && primaryModel.includes('fast')) return null;
    return config.omniroute.models.fast || 'auto/best-fast';
  }

  /**
   * Probe the OmniRoute gateway at startup (non-fatal).
   * Verifies the gateway is reachable and the configured API key is accepted,
   * so config drift (rotated key, wrong port, gateway down) is visible
   * immediately instead of surfacing as slow per-request timeouts.
   * @returns {Promise<{ok: boolean, statusCode: number|null, message: string, modelCount: number}>}
   */
  async probeGateway() {
    const gateway = config.omniroute.baseUrl;
    try {
      const resp = await this.client.get('/models', { timeout: 5000 });
      const models = resp.data?.data || [];
      return {
        ok: true,
        statusCode: resp.status,
        message: `OmniRoute gateway reachable (${models.length} models available)`,
        modelCount: models.length,
      };
    } catch (error) {
      const status = error?.response?.status ?? error?.status ?? null;
      const category = this.classifyProviderError({
        status,
        message: error?.message || '',
        errorCode: error?.code || null,
      });
      return {
        ok: false,
        statusCode: status,
        message: status === 401 || status === 403
          ? `OmniRoute gateway rejected the API key (HTTP ${status}) — check OMNIROUTE_API_KEY`
          : `OmniRoute gateway unreachable at ${gateway}: ${error?.message || 'unknown error'}`,
        modelCount: 0,
        category,
      };
    }
  }

  /**
   * Log AI call for observability
   */
  async logAICall({ requestId, businessId, model, promptVersion, tokens, latency, error = null }) {
    // In production, this would log to a proper observability system.
    return { requestId, businessId, model, promptVersion, tokens, latency, error };
  }
}

export { AIService };
export default new AIService();
