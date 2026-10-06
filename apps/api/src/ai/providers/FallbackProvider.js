import { AIModelProvider } from './AIModelProvider.js';
import { unknownEnvelope } from '../contracts/common.js';
import { AIError, AI_ERROR_CATEGORY } from '../../services/ai/AIError.js';

/**
 * FallbackProvider — the deterministic last resort.
 *
 * It performs no inference. For envelope-shaped contracts (every top-level
 * property is a { value, confidence, provenance, status } field envelope) it
 * returns UNKNOWN envelopes: the honest answer when no model is available.
 * For generative contracts it cannot fabricate a Business DNA or a website
 * strategy, so it throws — callers treat that as a hard failure.
 *
 * This provider is what makes "return UNKNOWN rather than guess" an
 * architectural guarantee instead of a prompt instruction.
 */
export class FallbackProvider extends AIModelProvider {
  get name() {
    return 'fallback';
  }

  get type() {
    return 'fallback';
  }

  isConfigured() {
    return true;
  }

  async run(request) {
    const schema = request.schema;
    const isEnvelopeContract = schema
      && typeof schema === 'object'
      && schema.type === 'object'
      && schema.properties
      && Object.values(schema.properties).every(
        (p) => p && typeof p === 'object' && p.type === 'object' && p.properties && 'value' in p.properties,
      );

    if (!isEnvelopeContract) {
      throw new AIError({
        category: AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED,
        provider: 'fallback',
        message: `Fallback provider cannot serve non-envelope task with schema "${schema?.title || 'unknown'}".`,
      });
    }

    const value = {};
    for (const key of Object.keys(schema.properties)) {
      value[key] = unknownEnvelope();
    }

    return {
      value,
      raw: JSON.stringify(value),
      provider: 'fallback',
      model: 'deterministic-unknown',
      usage: null,
      latencyMs: 0,
      attempts: [],
      fallbackCount: 0,
    };
  }
}

export default FallbackProvider;
