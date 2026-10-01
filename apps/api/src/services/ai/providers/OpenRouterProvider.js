import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
import { AIError, AI_ERROR_CATEGORY } from '../AIError.js';

/**
 * OpenRouter — primary provider.
 *
 * OpenAI-compatible, plus two vendor-specific requirements:
 *  - attribution headers, which OpenRouter requires for free/router models;
 *  - structured output, which it exposes as standard `response_format`.
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  get label() {
    return 'OpenRouter';
  }

  get requiresApiKey() {
    return true;
  }

  authHeaders() {
    return {
      ...super.authHeaders(),
      // Required by OpenRouter for free-model attribution.
      'HTTP-Referer': this.config.appUrl || 'https://webloom.dev',
      'X-Title': this.config.appName || 'Webloom',
    };
  }

  /**
   * OpenRouter reports model availability as a 404-ish error naming the model.
   * Surface that as a configuration error (do not retry, do not treat the key
   * as bad) so the operator sees the actual problem.
   *
   * Applied by AIProvider.request(), so it covers the health probe too.
   */
  normalizeError(error) {
    const status = error?.httpStatus ?? error?.response?.status ?? null;
    const message = error?.message || '';

    if (status === 404 || /no endpoints found|model .* not found|is not available/i.test(message)) {
      return new AIError({
        category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
        provider: this.name,
        model: this.getModel('default'),
        httpStatus: status,
        message: `OpenRouter model "${this.getModel('default')}" is unavailable: ${message}`,
        cause: error,
      });
    }
    return null;
  }
}

export default OpenRouterProvider;
