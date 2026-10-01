import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

/**
 * Local / self-hosted OpenAI-compatible provider — final fallback.
 *
 * Intentionally generic: no Ollama-specific paths, no `/api/generate`, no
 * assumption that a model is loaded. Works with Ollama, LM Studio, vLLM,
 * llama.cpp, LiteLLM and anything else that serves
 * `POST {baseUrl}/chat/completions`.
 *
 * Not a hard dependency: an absent local server degrades to "unavailable" and
 * the chain reports a structured failure rather than crashing a request.
 */
export class LocalProvider extends OpenAICompatibleProvider {
  get label() {
    return this.config.label || 'Local AI';
  }

  // Most local servers run keyless, so a missing key is not a misconfiguration.
  get requiresApiKey() {
    return this.config.requiresApiKey === true;
  }

  isConfigured() {
    if (!this.config.enabled) return false;
    if (!this.config.model) return false;
    return Boolean(this.config.baseUrl);
  }

  /**
   * Small local models frequently reject `response_format` outright rather
   * than ignoring it. Retry once without it, and lean on the shared structured
   * output pipeline to extract JSON from prose.
   */
  async complete(options) {
    try {
      return await super.complete(options);
    } catch (error) {
      const rejectedStructuredOutput =
        error?.httpStatus === 400
        && /response_format|json_schema|not supported|unsupported.*(format|schema)/i.test(
          error?.safeMessage || error?.message || '',
        );

      if (!rejectedStructuredOutput) throw error;

      if (options?.debug) {
        console.warn(`[AI] ${this.label} rejected response_format; retrying without it`);
      }
      return super.complete({ ...options, responseFormat: null });
    }
  }

  /**
   * A local server that is not running is the single most common case here, so
   * the health probe reports it as plainly unreachable rather than leaving the
   * generic `PROVIDER_UNAVAILABLE` category as the whole story.
   *
   * Overrides runHealthCheck(), which is the method AIHealthService actually
   * calls. The base class's `checkHealth()` hook is never invoked on the health
   * path, so overriding it here would have been dead code.
   */
  async runHealthCheck() {
    const health = await super.runHealthCheck();

    // A configured local provider that never got an HTTP status back did not
    // answer at all. An unconfigured one keeps its own precise reason.
    if (health.configured && health.usable === false && health.reachable === false) {
      return { ...health, detail: 'unreachable' };
    }

    return health;
  }
}

export default LocalProvider;
