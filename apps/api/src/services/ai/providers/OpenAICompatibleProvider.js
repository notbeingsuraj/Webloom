import { AIProvider } from '../AIProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../AIError.js';

/**
 * Shared implementation for any provider exposing OpenAI's
 * `POST {baseUrl}/chat/completions` contract.
 *
 * Covers OpenRouter, Ollama, LM Studio, vLLM, llama.cpp and anything else that
 * honours the same shape. Nothing here is specific to one vendor.
 */
export class OpenAICompatibleProvider extends AIProvider {
  get baseUrl() {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  get requiresApiKey() {
    return this.config.requiresApiKey !== false;
  }

  chatUrl() {
    return `${this.baseUrl}/chat/completions`;
  }

  authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    // Local servers usually run keyless; only send Authorization when a key
    // exists so we never send "Bearer undefined".
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }
    return headers;
  }

  isConfigured() {
    if (!this.config.enabled) return false;
    if (!this.config.model) return false;
    if (this.requiresApiKey && !this.config.apiKey) return false;
    return Boolean(this.baseUrl);
  }

  /**
   * Build the request body. Subclasses override to add vendor headers or to
   * translate structured-output requests the local model may not support.
   */
  buildBody({ model, systemPrompt, prompt, temperature, maxTokens, responseFormat }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };
    if (responseFormat) body.response_format = responseFormat;
    return body;
  }

  /**
   * Pull text out of an OpenAI-shaped envelope.
   *
   * Some reasoning models return their answer in `reasoning_content` when
   * `content` is empty. That is a real vendor quirk, so it is handled here
   * explicitly instead of via a regex over arbitrary text.
   */
  extractContent(message) {
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) return content;

    // Some gateways return content as an array of parts.
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .join('')
        .trim();
      if (joined) return joined;
    }

    const reasoning = message?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim()) return reasoning;

    return null;
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
        message: `${this.label} is not configured`,
      });
    }

    const startedAt = Date.now();
    const { data, latencyMs } = await this.request({
      method: 'POST',
      url: this.chatUrl(),
      headers: this.authHeaders(),
      // timeoutMs is clamped by the chain to what is left of the total budget.
      timeoutMs: timeoutMs || this.timeoutMs,
      body: this.buildBody({ model, systemPrompt, prompt, temperature, maxTokens, responseFormat }),
      providerErrorContext: { model },
    });

    const message = data?.choices?.[0]?.message;
    const content = this.extractContent(message);

    if (!content) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.INVALID_RESPONSE,
        provider: this.name,
        model: data?.model || model,
        message: `${this.label} returned an empty response`,
        latencyMs,
      });
    }

    return {
      content,
      provider: this.name,
      model: data?.model || model,
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? null,
        completionTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
      latencyMs: latencyMs ?? (Date.now() - startedAt),
      finishReason: data?.choices?.[0]?.finish_reason ?? null,
    };
  }
}

export default OpenAICompatibleProvider;
