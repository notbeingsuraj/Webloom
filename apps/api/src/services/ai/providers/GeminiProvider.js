import { AIProvider } from '../AIProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../AIError.js';

/**
 * Google Gemini — secondary provider.
 *
 * Gemini does NOT speak the OpenAI chat contract natively; it uses
 * `generateContent` with a `contents`/`systemInstruction` envelope. It sits
 * behind the same AIProvider interface and is normalized into the same
 * response shape, so nothing above the chain can tell which vendor answered.
 *
 * Structured output uses `responseMimeType: application/json` plus
 * `responseSchema`, which is Gemini's own spelling of the same idea.
 */
export class GeminiProvider extends AIProvider {
  get label() {
    return 'Gemini';
  }

  get baseUrl() {
    // Accept either the bare host or a full /v1beta path and normalize.
    const configured = (this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/+$/, '');
    return configured.endsWith('/v1beta') ? configured : `${configured}/v1beta`;
  }

  isConfigured() {
    return Boolean(this.config.enabled && this.config.apiKey && this.config.model);
  }

  chatUrl() {
    return `${this.baseUrl}/models/${this.getModel('default')}:generateContent`;
  }

  authHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  /**
   * Gemini accepts the key either as a query parameter or an x-goog-api-key
   * header. The header is used so the key never lands in a URL that could be
   * captured in a proxy log or an error message.
   *
   * maxOutputTokens mirrors AIProvider.probeAuth: ask for a realistic ceiling,
   * not 1, so a key that is valid but out of free-tier quota is reported as
   * unusable rather than healthy.
   */
  probeAuth() {
    return this.request({
      method: 'POST',
      url: this.chatUrl(),
      headers: { ...this.authHeaders(), 'x-goog-api-key': this.config.apiKey },
      timeoutMs: Math.min(this.timeoutMs, 15000),
      body: {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: this.probeMaxTokens },
      },
      providerErrorContext: { model: this.getModel('default') },
    });
  }

  buildBody({ model, systemPrompt, prompt, temperature, maxTokens, responseFormat }) {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    if (responseFormat?.type === 'json_object' || responseFormat?.type === 'json_schema') {
      body.generationConfig.responseMimeType = 'application/json';
      const schema = responseFormat?.type === 'json_schema'
        ? responseFormat.json_schema?.schema
        : null;
      // Gemini rejects non-trivial JSON Schema (additionalProperties,
      // $ref, union types), so only forward a schema it can express.
      if (schema && isGeminiCompatibleSchema(schema)) {
        body.generationConfig.responseSchema = schema;
      }
    }

    return body;
  }

  async complete({
    model,
    systemPrompt,
    prompt,
    temperature = 0.7,
    maxTokens = 4000,
    responseFormat = null,
    timeoutMs = null,
  }) {
    if (!this.isConfigured()) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model,
        message: 'Gemini is not configured',
      });
    }

    const targetModel = model || this.getModel('default');
    const url = `${this.baseUrl}/models/${targetModel}:generateContent`;

    const { data, latencyMs } = await this.request({
      method: 'POST',
      url,
      headers: { ...this.authHeaders(), 'x-goog-api-key': this.config.apiKey },
      // Clamped by the chain to the remaining total budget.
      timeoutMs: timeoutMs || this.timeoutMs,
      body: this.buildBody({ model: targetModel, systemPrompt, prompt, temperature, maxTokens, responseFormat }),
      providerErrorContext: { model: targetModel },
    });

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const content = parts.map((p) => p?.text || '').join('').trim();

    if (!content) {
      // A candidate blocked by a safety filter is not a malformed response —
      // it is a refusal, and retrying another provider is reasonable.
      const blocked = candidate?.finishReason || data?.promptFeedback?.blockReason;
      throw new AIError({
        category: AI_ERROR_CATEGORY.INVALID_RESPONSE,
        provider: this.name,
        model: data?.modelVersion || targetModel,
        message: blocked
          ? `Gemini returned no content (finishReason: ${blocked})`
          : 'Gemini returned an empty response',
        latencyMs,
      });
    }

    return {
      content,
      provider: this.name,
      model: data?.modelVersion || targetModel,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
        completionTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: data?.usageMetadata?.totalTokenCount ?? null,
      },
      latencyMs,
      finishReason: candidate?.finishReason ?? null,
    };
  }

  /**
   * Gemini reports a wrong/decommissioned model as a 404 whose body says so in
   * plain English — e.g. a model retired for newer accounts still appears in
   * `GET /v1beta/models`, so "it was in the list" is not proof it works.
   *
   * Classified as CONFIGURATION_ERROR on purpose: retrying cannot help, and
   * falling back would hide a permanently broken provider behind a working one.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';
    const body = typeof error?.response?.data === 'string' ? error.response.data : '';

    const looksLikeModelProblem =
      /no longer available to new users/i.test(`${message} ${body}`)
      || (/is not found for api version/i.test(`${message} ${body}`))
      || (/models\/[^ ]+ is not found/i.test(`${message} ${body}`));

    if ((status === 404 || looksLikeModelProblem) && looksLikeModelProblem) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message:
          `Gemini model "${this.getModel('default')}" cannot be used with this API key. `
          + 'List the models this key can actually call with '
          + 'GET https://generativelanguage.googleapis.com/v1beta/models, then set GEMINI_MODEL '
          + 'to one of them. Retrying will not help.',
        cause: error,
      });
    }
    return null;
  }
}

/**
 * Gemini's responseSchema accepts a narrow OpenAPI subset. Forwarding a schema
 * containing keywords it rejects causes a hard 400, which would turn a working
 * provider into a dead one. Anything we cannot vouch for is simply not sent —
 * responseMimeType alone still constrains the output to JSON.
 */
function isGeminiCompatibleSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 12) return false;

  const unsupported = ['$ref', '$schema', 'additionalProperties', 'oneOf', 'anyOf', 'allOf', 'not', 'patternProperties', 'definitions', '$defs'];
  if (unsupported.some((key) => key in schema)) return false;

  if (schema.type && !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(schema.type)) {
    return false;
  }

  for (const sub of Object.values(schema.properties || {})) {
    if (!isGeminiCompatibleSchema(sub, depth + 1)) return false;
  }
  if (schema.items && !isGeminiCompatibleSchema(schema.items, depth + 1)) return false;

  return true;
}

export default GeminiProvider;
