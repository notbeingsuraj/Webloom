import { AIError, AI_ERROR_CATEGORY, parseAffordableMaxTokens } from './AIError.js';
import { getHttpClient } from './httpClient.js';

/**
 * Abstract AI provider.
 *
 * Every provider speaks OpenAI-shaped chat at heart, but transport details
 * (auth header, endpoint, response envelope) are subclassed. The contract the
 * rest of the chain depends on is deliberately small:
 *
 *   isConfigured()            -> boolean
 *   getModel(operation)       -> string|null
 *   complete({...})           -> NormalizedResponse
 *   checkHealth()             -> ProviderHealth
 *
 * NormalizedResponse:
 *   { content, provider, model, usage, latencyMs, finishReason }
 */
export class AIProvider {
  /**
   * @param {object} options
   * @param {string} options.name      provider id used in config + telemetry
   * @param {object} options.config    provider slice of config.ai.providers
   * @param {number} options.defaultTimeoutMs
   * @param {number} [options.probeMaxTokens] chain-wide health probe ceiling
   */
  constructor({ name, config = {}, defaultTimeoutMs = 30000, probeMaxTokens = null }) {
    this.name = name;
    this.config = config;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.chainProbeMaxTokens = probeMaxTokens;
  }

  get label() {
    return this.name;
  }

  isConfigured() {
    return Boolean(this.config.enabled && this.config.model);
  }

  /**
   * Resolve the model for an operation. Supports per-operation overrides
   * (OPENROUTER_BRAND_MODEL etc.) layered over the provider default, so the
   * architecture starts simple but does not need a rewrite to get expensive
   * operations onto a stronger model.
   */
  getModel(operation = 'default') {
    const perOperation = this.config.operationModels?.[operation];
    if (perOperation) return perOperation;
    return this.config.model || null;
  }

  get timeoutMs() {
    return this.config.timeoutMs || this.defaultTimeoutMs;
  }

  /**
   * Completion ceiling the health probe asks for.
   *
   * `usable` must mean one thing: "this provider can serve the heaviest
   * operation Webloom asks it to run". A probe sized to 1 token proved only
   * that the key parses, so an account with $0 left reported "ok" while brand
   * DNA failed with HTTP 402. A probe sized to the heaviest real workload
   * makes the answer mean what an operator assumes it means.
   *
   * Cost is unchanged either way: providers bill tokens actually generated,
   * and the probe stops after "ping" no matter how large the ceiling offered.
   * Overridable for deployments with a different heaviest operation.
   */
  get probeMaxTokens() {
    return this.config.probeMaxTokens || this.chainProbeMaxTokens || 6000;
  }

  // eslint-disable-next-line no-unused-vars
  async complete(_options) {
    throw new AIError({
      category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
      provider: this.name,
      message: `Provider "${this.name}" does not implement complete().`,
    });
  }

  // eslint-disable-next-line no-unused-vars
  async checkHealth() {
    return {
      provider: this.name,
      configured: this.isConfigured(),
      reachable: false,
      authenticated: false,
      usable: false,
      detail: 'not implemented',
    };
  }

  /**
   * HTTP with a hard per-request timeout. Every provider call goes through
   * here so a hung socket can never outlive the caller's budget.
   */
  async request({ method = 'POST', url, body, headers = {}, timeoutMs, providerErrorContext = {} }) {
    const timeout = timeoutMs || this.timeoutMs;
    const startedAt = Date.now();

    try {
      const response = await getHttpClient()({
        method,
        url,
        data: body,
        headers,
        timeout,
        // A model that starts streaming prose and then stalls must still fail
        // at the deadline, not at axios' default socket behavior.
        transitional: { silentJSONParsing: true, forcedJSONParsing: true },
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      // Do not rely solely on the transport to reject non-2xx: an injected or
      // swapped transport can hand back a 429 as if it were a success, which
      // would be misreported downstream as "the model returned nothing".
      const responseStatus = response?.status;
      if (typeof responseStatus === 'number'
        && !(responseStatus >= 200 && responseStatus < 300)) {
        const statusError = new Error(`Request failed with status code ${responseStatus}`);
        statusError.response = {
          status: responseStatus,
          data: response.data,
          headers: response.headers,
        };
        statusError.status = responseStatus;
        throw statusError;
      }

      return { data: response.data, status: response.status, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const httpStatus = error?.response?.status ?? error?.status ?? null;

      // ECONNABORTED is axios' timeout signal; surface it as a timeout so the
      // chain applies timeout policy rather than "unavailable".
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        throw new AIError({
          category: AI_ERROR_CATEGORY.TIMEOUT,
          provider: this.name,
          message: `Request to ${this.name} exceeded ${timeout}ms`,
          latencyMs: Date.now() - startedAt,
          cause: error,
          ...providerErrorContext,
        });
      }

      const aiError = AIError.from(error, {
        provider: this.name,
        latencyMs: Date.now() - startedAt,
        httpStatus,
        ...providerErrorContext,
      });
      // Fall back to the classified AIError, never the raw axios error, so
      // callers always get .category/.httpStatus/.providerError.
      throw this.normalizeError(aiError) || aiError;
    }
  }

  /**
   * Provider-specific error refinement hook.
   *
   * Runs inside `request()`, so it applies to completions, auth probes and
   * health checks alike. Return a new AIError to re-classify, or null to keep
   * the generic classification.
   *
   * This is where a vendor's "your model is retired" 404 becomes a
   * CONFIGURATION_ERROR instead of a retryable outage: retrying a permanent
   * problem wastes the budget and hides a dead provider behind a live one.
   */
  // eslint-disable-next-line no-unused-vars
  normalizeError(_error) {
    return null;
  }

  /**
   * Cheapest possible authenticated round-trip: proves the key is accepted and
   * the configured model is actually routable. A catalog listing proves
   * neither — OpenRouter's /models is public, which is exactly how a dead key
   * previously looked healthy at boot.
   *
   * max_tokens is deliberately NOT 1. Credit-billed providers pre-check the
   * *requested* ceiling against the remaining balance and reject the request
   * with HTTP 402 before it reaches a model, but they bill actual usage. So a
   * 1-token probe passes on an account that cannot fund a single real request:
   * health reported "ok" while every call 402'd. Asking for a realistic ceiling
   * exercises that pre-flight check and still costs ~one token, because the
   * model stops after "ping" regardless of the ceiling it was offered.
   */
  async probeAuth() {
    return this.request({
      method: 'POST',
      url: this.chatUrl(),
      headers: this.authHeaders(),
      timeoutMs: Math.min(this.timeoutMs, 15000),
      body: {
        model: this.getModel('default'),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: this.probeMaxTokens,
        stream: false,
      },
      providerErrorContext: { model: this.getModel('default') },
    });
  }

  chatUrl() {
    throw new AIError({
      category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
      provider: this.name,
      message: `Provider "${this.name}" does not implement chatUrl().`,
    });
  }

  authHeaders() {
    return {};
  }

  /**
   * Shared health probe. `configured` is reported independently of `reachable`
   * and `authenticated` so a missing key is never displayed as healthy.
   */
  async runHealthCheck() {
    const configured = this.isConfigured();
    const base = {
      provider: this.name,
      model: this.getModel('default') || null,
      configured,
      reachable: false,
      authenticated: false,
      usable: false,
      detail: null,
    };

    if (!configured) {
      return { ...base, detail: this.config.enabled ? 'no model configured' : 'disabled' };
    }

    try {
      await this.probeAuth();
      return { ...base, reachable: true, authenticated: true, usable: true, detail: 'ok' };
    } catch (error) {
      const aiError = AIError.from(error, { provider: this.name });
      const category = aiError.category;

      // A missing config category means we never left the process.
      if (category === AI_ERROR_CATEGORY.CONFIGURATION_ERROR) {
        return { ...base, detail: category };
      }

      // No HTTP status + connection-level failure => the host never answered.
      const reachedHost = aiError.httpStatus !== null && aiError.httpStatus !== undefined
        ? true
        : category !== AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE;

      // Anything the host actually answered means the key got past auth. A 400
      // "model not found" is a config problem, not a credentials problem.
      const authenticated = reachedHost && category !== AI_ERROR_CATEGORY.AUTHENTICATION;

      // A provider whose quota or credit is gone is the failure most often
      // misread as "the key is wrong". Say which one it is, and report the
      // ceiling the account can still fund so the remedy is obvious.
      const detail = (category === AI_ERROR_CATEGORY.QUOTA_EXHAUSTED && authenticated)
        ? 'QUOTA_EXHAUSTED (key accepted, account out of credit/quota)'
        : category;

      return {
        ...base,
        reachable: reachedHost,
        authenticated,
        usable: false,
        detail,
        ...(aiError.httpStatus === 402
          ? { affordableMaxTokens: parseAffordableMaxTokens(aiError) }
          : {}),
      };
    }
  }
}

export default AIProvider;
