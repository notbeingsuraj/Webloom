/**
 * AIModelProvider — the provider-agnostic interface for the Webloom AI layer.
 *
 * Webloom must not depend on one inference provider. Every task in the layer
 * talks to this interface; concrete providers adapt an external LLM chain, a
 * local foundation model, a future Webloom fine-tuned model, or a
 * deterministic fallback.
 *
 * This is deliberately *not* a replacement for services/ai/AIProvider.js:
 * that class is the HTTP transport for a single vendor. AIModelProvider sits
 * one level up — it owns task semantics (extract/classify/analyze) and returns
 * a normalized result, and its implementations may internally use the existing
 * AIService chain with all its retries and fallbacks.
 *
 * Normalized result shape returned by run()/generate()/extract()/classify()/analyze():
 *   {
 *     value,   // parsed object when a schema was supplied, else raw string
 *     raw,     // raw model text
 *     provider,// provider name that served the request
 *     model,   // model id that served the request
 *     usage,   // { promptTokens, completionTokens, totalTokens } | null
 *     latencyMs
 *   }
 */

export class AIModelProvider {
  /** Stable provider name used in provenance and benchmark records. */
  get name() {
    throw new Error('AIModelProvider.name must be implemented');
  }

  /** 'baseline' | 'webloom' | 'external' | 'fallback' */
  get type() {
    return 'external';
  }

  /** Whether this provider can serve requests with the current configuration. */
  isConfigured() {
    return true;
  }

  /**
   * Low-level completion. Implementations MUST validate schema-constrained
   * output before returning and MUST NOT invent values on failure — throw a
   * typed error and let the caller decide.
   *
   * @param {object} request
   * @param {string} request.prompt
   * @param {string|null} [request.systemPrompt]
   * @param {object|boolean|null} [request.schema]
   * @param {number} [request.temperature]
   * @param {number} [request.maxTokens]
   * @param {string} [request.operation]
   * @returns {Promise<{value:any, raw:string, provider:string, model:string|null, usage:object|null, latencyMs:number|null}>}
   */
  // eslint-disable-next-line no-unused-vars
  async run(request) {
    throw new Error('AIModelProvider.run must be implemented');
  }

  /** Free-form generation. */
  async generate(input, options = {}) {
    return this.run({ prompt: toPrompt(input), ...options });
  }

  /** Schema-constrained extraction. */
  async extract(input, schema, options = {}) {
    return this.run({ prompt: toPrompt(input), schema, operation: 'extraction', ...options });
  }

  /** Classification (also schema-constrained; classification is structured by design). */
  async classify(input, schema, options = {}) {
    return this.run({ prompt: toPrompt(input), schema, operation: 'classification', ...options });
  }

  /** Analysis / reasoning over supplied context. */
  async analyze(input, schema, options = {}) {
    return this.run({ prompt: toPrompt(input), schema, operation: 'analysis', ...options });
  }
}

/** Accept a string prompt or any JSON-serializable object. */
export function toPrompt(input) {
  if (typeof input === 'string') return input;
  if (input == null) throw new Error('AIModelProvider input must be a string or object');
  return JSON.stringify(input, null, 2);
}

export default AIModelProvider;
