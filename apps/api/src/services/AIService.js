import { config } from '../config/env.js';
import { createProviderChain } from './ai/AIProviderFactory.js';
import { AIError, AIAllProvidersFailedError, AI_ERROR_CATEGORY, sanitizeSecretText, parseAffordableMaxTokens } from './ai/AIError.js';
import { validateStructuredOutput } from './ai/AIResponseValidator.js';
import aiHealthService from './ai/AIHealthService.js';

/**
 * The single AI entry point for all of Webloom.
 *
 * Responsibilities:
 *   - own the ordered provider chain (primary -> secondary -> fallback)
 *   - enforce a hard timeout and bounded retries
 *   - classify failures and decide retry vs. fall through
 *   - run the structured-output pipeline
 *   - emit observability events
 *
 * Responsibilities it does NOT have: knowing vendor names, HTTP shapes, or
 * which provider actually answered. Callers get one normalized result and one
 * normalized error.
 *
 * PERFORMANCE: providers are tried strictly in order and only after the
 * previous one has actually failed. On the happy path exactly one provider is
 * called. There is no "call everyone and compare" mode — that would triple
 * cost and latency for no benefit.
 */

// Task-type -> operation name, used to pick per-operation model overrides.
const OPERATION_FOR_TASK = {
  fast: 'extraction',
  reasoning: 'brand',
  coding: 'extraction',
  copywriting: 'extraction',
  vision: 'extraction',
  brand: 'brand',
  audit: 'audit',
  extraction: 'extraction',
  default: 'extraction',
};

/**
 * Map the legacy `model: 'reasoning'` task hint that 14 call sites still pass
 * onto a concrete operation, then onto whatever each provider is configured
 * with. Legacy single-model env overrides still win, so a deployment that set
 * AI_PRIMARY_MODEL keeps using it.
 */
function resolveOperation(modelHint, operationOverride) {
  if (operationOverride) return operationOverride;
  return OPERATION_FOR_TASK[modelHint] || 'extraction';
}

class AIService {
  constructor() {
    // Providers are rebuilt when the config object identity changes, so tests
    // and config reloads take effect without a restart.
    this._chain = null;
    this._chainConfigRef = null;
    this.telemetry = [];
  }

  get aiConfig() {
    return config.ai;
  }

  /**
   * Ordered provider chain, rebuilt if config changed.
   *
   * The cache only re-checks the identity of the `providers` object, so it
   * cannot see in-place mutations of a provider's fields. Anything that
   * rewrites provider settings at runtime must call invalidateChain().
   */
  getChain() {
    if (this._chain && this._chainConfigRef === this.aiConfig.providers) {
      return this._chain;
    }
    this._chain = createProviderChain(this.aiConfig);
    this._chainConfigRef = this.aiConfig.providers;
    return this._chain;
  }

  /** Drop cached providers so the next call re-reads provider settings. */
  invalidateChain() {
    this._chain = null;
    this._chainConfigRef = null;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Delay before retrying a provider.
   *
   * Two different failures need two different waits:
   *  - 5xx / connection blips clear in milliseconds, so a short backoff keeps
   *    the user-facing latency low.
   *  - a rate limit is a *quota window*, not a blip. Retrying a per-minute
   *    limit after 250ms just burns the second attempt, so these wait longer
   *    and honour the provider's own Retry-After when one is sent.
   *
   * Jitter keeps concurrent requests from re-colliding on the same window.
   */
  backoffMs(error, retryCount) {
    if (error.retryAfterMs !== null && error.retryAfterMs !== undefined) {
      return Math.max(0, Math.min(error.retryAfterMs, this.aiConfig.timeoutMs));
    }
    if (error.category === AI_ERROR_CATEGORY.RATE_LIMITED) {
      const base = Math.min(1000 * 2 ** retryCount, 5000);
      return base + Math.floor(Math.random() * 250);
    }
    return Math.min(250 * 2 ** retryCount, 1000);
  }

  /**
   * Build the OpenAI-style `response_format` for a structured request.
   * `schema: true` means "give me JSON, shape unspecified"; an object means a
   * declared JSON Schema.
   */
  buildResponseFormat(schema) {
    if (!schema) return null;
    if (schema === true) return { type: 'json_object' };

    if (typeof schema === 'object' && schema.type === 'object') {
      return {
        type: 'json_schema',
        json_schema: {
          name: schema.title || 'AIResponse',
          strict: true,
          schema,
        },
      };
    }
    return { type: 'json_object' };
  }

  /**
   * Generate an AI completion.
   *
   * @param {object} options
   * @param {string}  options.prompt
   * @param {string} [options.model]        legacy task hint: fast|reasoning|coding|copywriting|vision
   * @param {boolean|object} [options.schema] true, or a JSON Schema
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens]
   * @param {string} [options.systemPrompt]
   * @param {string} [options.operation]    explicit operation name for model routing
   * @returns {Promise<any>} parsed object when `schema` is set, else raw string.
   *   Structured results carry a non-enumerable `__ai` provenance property.
   */
  async generate({
    prompt,
    model = 'fast',
    schema = null,
    temperature = 0.7,
    maxTokens = 4000,
    systemPrompt = null,
    operation = null,
  }) {
    if (!prompt || typeof prompt !== 'string') {
      throw new AIError({
        category: AI_ERROR_CATEGORY.REQUEST_INVALID,
        message: 'AI generate() requires a non-empty prompt string.',
      });
    }

    const chain = this.getChain();
    const opName = resolveOperation(model, operation);
    const responseFormat = this.buildResponseFormat(schema);

    if (chain.length === 0) {
      throw new AIAllProvidersFailedError({
        operation: opName,
        attempts: [],
        message: 'No AI providers are configured. Set OPENROUTER_API_KEY, GEMINI_API_KEY, or LOCAL_AI_BASE_URL.',
      });
    }

    const attempts = [];
    const startedAt = Date.now();
    // One wall-clock budget for the entire chain: every provider, every retry.
    const deadline = startedAt + (this.aiConfig.maxTotalMs || this.aiConfig.timeoutMs);
    let fallbackCount = 0;

    for (let index = 0; index < chain.length; index += 1) {
      const provider = chain[index];

      // Deterministic skip: an unconfigured provider is reported and stepped
      // over rather than attempted and failed.
      if (!provider.isConfigured()) {
        attempts.push({
          provider: provider.name,
          model: null,
          error: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
          httpStatus: null,
          retryCount: 0,
          latencyMs: 0,
          safeMessage: `${provider.label} is not configured`,
        });
        continue;
      }

      const targetModel = this.resolveModelFor(provider, opName);
      let attemptIndex = 0;
      const maxAttempts = Math.max(1, (this.aiConfig.maxRetries ?? 1) + 1);
      // A credit-limited provider can be told to shrink the request, which is
      // a re-dispatch rather than a retry, so it gets its own attempt budget.
      const maxTokenDowngrades = Math.max(0, this.aiConfig.maxTokenDowngrades ?? 1);
      let extraAttemptsUsed = 0;
      let lastError = null;
      // Per-provider, not per-call: the clamp must not leak to the next provider
      // in the chain, which has its own balance and its own limits.
      let effectiveMaxTokens = maxTokens;

      while (attemptIndex < maxAttempts + extraAttemptsUsed) {
        attemptIndex += 1;
        const retryCount = attemptIndex - 1;

        if (this.aiConfig.debugBusinessAnalysis) {
          // Prompt content is deliberately NOT logged: these prompts contain
          // business data.
          console.log(
            `[AI] operation=${opName} provider=${provider.name} model=${targetModel} `
            + `attempt=${attemptIndex} promptChars=${prompt.length}`,
          );
        }

        // Whatever is left of the total budget, capped by the provider's own
        // ceiling. A slow provider must not be able to consume the whole
        // budget and leave the fallbacks no room to run.
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          lastError = new AIError({
            category: AI_ERROR_CATEGORY.TIMEOUT,
            provider: provider.name,
            model: targetModel,
            message: `Total AI budget of ${this.aiConfig.maxTotalMs}ms exhausted before trying ${provider.label}`,
            retryCount,
          });
          attempts.push({
            provider: provider.name,
            model: targetModel,
            error: lastError.category,
            httpStatus: null,
            retryCount,
            latencyMs: 0,
            safeMessage: lastError.safeMessage,
          });
          break;
        }

        try {
          const response = await provider.complete({
            model: targetModel,
            systemPrompt,
            prompt,
            temperature,
            maxTokens: effectiveMaxTokens,
            responseFormat,
            timeoutMs: Math.min(provider.timeoutMs, remainingMs),
          });

          // A response cut off mid-answer is not a schema problem. Some models
          // still emit well-formed JSON when truncated, so the payload can pass
          // every structural check while silently missing most of its fields —
          // which then surfaces downstream as a baffling "Missing required
          // field" far from the cause. Stop it here, where the reason is known.
          if (response.finishReason === 'length') {
            throw new AIError({
              category: AI_ERROR_CATEGORY.QUOTA_EXHAUSTED,
              provider: provider.name,
              model: response.model || targetModel,
              httpStatus: null,
              message:
                `${provider.label} truncated the response at ${effectiveMaxTokens} tokens `
                + '(finish_reason=length) before completing it. Raise the max_tokens budget '
                + 'for this operation or use a provider with more headroom.',
              latencyMs: response.latencyMs,
            });
          }

          const result = responseFormat
            ? validateStructuredOutput(response.content, schema, {
              provider: provider.name,
              model: response.model,
            })
            : response.content;

          this.record({
            operation: opName,
            provider: provider.name,
            model: response.model || targetModel,
            latencyMs: response.latencyMs,
            success: true,
            retryCount,
            fallbackCount,
            status: 'success',
          });

          // Record the serving attempt too, so the trail is a complete account
          // of the request rather than only its failures.
          attempts.push({
            provider: provider.name,
            model: response.model || targetModel,
            error: null,
            httpStatus: response.status ?? 200,
            retryCount,
            latencyMs: response.latencyMs,
            safeMessage: null,
          });

          return this.attachProvenance(result, {
            provider: provider.name,
            model: response.model || targetModel,
            usage: response.usage,
            latencyMs: response.latencyMs,
            finishReason: response.finishReason,
            operation: opName,
            // Who actually served this, and what had to fail first. Without the
            // trail, a value produced by a fallback provider is
            // indistinguishable from one the primary produced.
            fallbackCount,
            attempts: attempts.map((a) => ({
              provider: a.provider,
              model: a.model,
              success: a.error === null || a.error === undefined,
              error: a.error ?? null,
              httpStatus: a.httpStatus ?? null,
              retryCount: a.retryCount ?? 0,
            })),
          });
        } catch (error) {
          const aiError = AIError.from(error, { provider: provider.name, model: targetModel });
          lastError = aiError;

          attempts.push({
            provider: provider.name,
            model: targetModel,
            error: aiError.category,
            httpStatus: aiError.httpStatus,
            retryCount,
            latencyMs: aiError.latencyMs,
            safeMessage: aiError.safeMessage,
          });

          this.record({
            operation: opName,
            provider: provider.name,
            model: targetModel,
            latencyMs: aiError.latencyMs,
            success: false,
            retryCount,
            fallbackCount,
            status: 'failure',
            category: aiError.category,
            httpStatus: aiError.httpStatus,
          });

          // Credit pre-flight rejection. OpenRouter states the exact remedy —
          // "you requested up to N tokens, but can only afford M" — and M is
          // enough to serve smaller operations on a nearly-empty balance.
          // Re-dispatching at M recovers those without a new key or a top-up.
          // This is deliberately not a `retry`: nothing failed transiently, the
          // request was simply too large for the current balance.
          const affordable = aiError.httpStatus === 402
            ? parseAffordableMaxTokens(aiError)
            : null;
          if (affordable && effectiveMaxTokens > affordable && extraAttemptsUsed < maxTokenDowngrades) {
            extraAttemptsUsed += 1;
            // The provider computes "can only afford N" *before* reserving the
            // cost of requests already in flight, so re-requesting exactly N
            // 402s again. Back off a margin rather than rediscovering that.
            const clamped = Math.max(1, Math.floor(affordable * 0.9));
            this.record({
              operation: opName,
              provider: provider.name,
              model: targetModel,
              latencyMs: null,
              success: false,
              retryCount,
              fallbackCount,
              status: 'downgrade',
              category: aiError.category,
              httpStatus: aiError.httpStatus,
              maxTokens: clamped,
            });
            effectiveMaxTokens = clamped;
            continue;
          }

          const canRetry = aiError.retryable && attemptIndex < maxAttempts;
          if (canRetry) {
            const wait = this.backoffMs(aiError, retryCount);
            // Never sleep past the total budget; there would be no time left
            // for the retry, let alone the remaining providers.
            if (Date.now() + wait >= deadline) break;
            await this.sleep(wait);
            continue;
          }
          break;
        }
      }

      // This provider is finished. Decide whether the next one is worth trying.
      if (!lastError?.shouldFallback) {
        if (attempts.length === 1) throw lastError;
        throw new AIAllProvidersFailedError({
          operation: opName,
          attempts,
          message: lastError?.safeMessage,
        });
      }

      if (index < chain.length - 1) {
        fallbackCount += 1;
        this.record({
          operation: opName,
          provider: chain[index + 1].name,
          model: null,
          latencyMs: null,
          success: false,
          retryCount: 0,
          fallbackCount,
          status: 'fallback',
          reason: lastError.category,
          from: provider.name,
        });
      }
    }

    throw new AIAllProvidersFailedError({
      operation: opName,
      attempts,
      message: attempts.length
        ? `All AI providers failed for "${opName}" after ${Date.now() - startedAt}ms.`
        : `No AI provider is usable for "${opName}".`,
    });
  }

  /**
   * Resolve the model a given provider should use for an operation, honouring
   * the legacy AI_PRIMARY_MODEL / AI_FALLBACK_MODEL overrides.
   */
  resolveModelFor(provider, operation) {
    if (provider.name === this.aiConfig.primaryProvider && this.aiConfig.primaryModel) {
      return this.aiConfig.primaryModel;
    }
    if (provider.name === this.aiConfig.fallbackProvider && this.aiConfig.fallbackModel) {
      return this.aiConfig.fallbackModel;
    }
    return provider.getModel(operation);
  }

  /**
   * Attach provenance to a structured result without changing its shape.
   *
   * Non-enumerable on purpose: these objects are spread into API responses and
   * persisted, and an enumerable __ai key would leak into both the frontend
   * contract and the database.
   */
  attachProvenance(result, meta) {
    if (!result || typeof result !== 'object') return result;
    try {
      Object.defineProperty(result, '__ai', {
        value: Object.freeze({
          generatedByAI: true,
          provider: meta.provider,
          model: meta.model,
          usage: meta.usage ?? null,
          latencyMs: meta.latencyMs ?? null,
          finishReason: meta.finishReason ?? null,
          operation: meta.operation,
          fallbackCount: meta.fallbackCount ?? 0,
          attempts: Object.freeze([...(meta.attempts ?? [])]),
        }),
        enumerable: false,
        writable: false,
        configurable: false,
      });
    } catch {
      // Frozen/sealed result: provenance is best-effort, never fatal.
    }
    return result;
  }

  /** Bounded in-memory telemetry ring, for tests and diagnostics. */
  record(event) {
    this.telemetry.push({ at: new Date().toISOString(), ...event });
    if (this.telemetry.length > 200) this.telemetry.shift();
    if (config.debugBusinessAnalysis) {
      const parts = [
        `[AI] operation=${event.operation}`,
        `provider=${event.provider}`,
        event.model ? `model=${event.model}` : null,
        event.latencyMs != null ? `latency=${event.latencyMs}ms` : null,
        `status=${event.status}`,
        event.category ? `category=${event.category}` : null,
        event.retryCount ? `retries=${event.retryCount}` : null,
        event.fallbackCount ? `fallbacks=${event.fallbackCount}` : null,
        event.reason ? `reason=${event.reason}` : null,
        event.from ? `from=${event.from}` : null,
        event.maxTokens ? `maxTokens=${event.maxTokens}` : null,
      ].filter(Boolean);
      console.log(parts.join(' '));
    }
  }

  getTelemetry() {
    return [...this.telemetry];
  }

  /**
   * Non-secret description of the configured chain, for API payloads and logs.
   * `gateway` is retained as a key for response-shape compatibility and is
   * always null: Webloom talks to providers directly, there is no gateway.
   */
  getChainSummary() {
    return {
      gateway: null,
      primary: this.aiConfig.primaryProvider,
      secondary: this.aiConfig.secondaryProvider,
      fallback: this.aiConfig.fallbackProvider,
      providers: this.getChain().map((p) => ({
        name: p.name,
        label: p.label,
        configured: p.isConfigured(),
        model: p.getModel('default') || null,
      })),
    };
  }

  // ---- Backwards-compatible surface used across Webloom ----

  classifyProviderError(error) {
    return AIError.from(error).category;
  }

  sanitizeSecretText(value) {
    return sanitizeSecretText(value);
  }

  shouldFallbackForError(error) {
    return AIError.from(error).shouldFallback;
  }

  getProviderDiagnostics({ provider = null, model = null, providerError = null, retryCount = 0, latencyMs = null, success = false } = {}) {
    return {
      provider: provider || this.aiConfig.primaryProvider,
      model,
      providerErrorCategory: providerError?.category || null,
      httpStatus: providerError?.httpStatus ?? null,
      retryCount,
      latencyMs: latencyMs ?? null,
      success,
    };
  }

  /** Delegates to AIHealthService; kept here so callers have one import. */
  async getAIHealth(options = {}) {
    return aiHealthService.getHealth(options);
  }

  async logAICall({ requestId, businessId, model, promptVersion, tokens, latency, error = null }) {
    this.record({
      operation: promptVersion || 'unknown',
      provider: this.aiConfig.primaryProvider,
      model,
      latencyMs: latency,
      success: !error,
      retryCount: 0,
      fallbackCount: 0,
      status: error ? 'failure' : 'success',
      detail: error ? String(error).slice(0, 200) : null,
    });
    return { requestId, businessId, model, promptVersion, tokens, latency, error };
  }
}

export { AIService, AI_ERROR_CATEGORY, AIError };
export default new AIService();
