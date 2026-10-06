import { ExternalLLMProvider } from './ExternalLLMProvider.js';
import { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
import { WebloomFineTunedModelProvider } from './WebloomFineTunedModelProvider.js';
import { BaselineProvider } from './BaselineProvider.js';
import { FallbackProvider } from './FallbackProvider.js';

export { AIModelProvider, toPrompt } from './AIModelProvider.js';
export { ExternalLLMProvider } from './ExternalLLMProvider.js';
export { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
export { WebloomFineTunedModelProvider } from './WebloomFineTunedModelProvider.js';
export { BaselineProvider } from './BaselineProvider.js';
export { FallbackProvider } from './FallbackProvider.js';

export const PROVIDER_NAMES = Object.freeze([
  'auto', 'webloom', 'external', 'local-foundation', 'baseline', 'fallback',
]);

/**
 * Create a provider by well-known name.
 *
 * @param {string} name 'webloom'|'external'|'local-foundation'|'baseline'|'fallback'
 * @param {object} [deps] { aiService } injection seam for tests
 */
export function createProvider(name, deps = {}) {
  switch (name) {
    case 'external':
      return new ExternalLLMProvider({ aiService: deps.aiService ?? null });
    case 'local-foundation':
      return new LocalFoundationModelProvider({ model: deps.model ?? null, timeoutMs: deps.timeoutMs ?? null });
    case 'webloom':
      return new WebloomFineTunedModelProvider({ model: deps.model ?? null, timeoutMs: deps.timeoutMs ?? null });
    case 'baseline':
      return new BaselineProvider({ model: deps.model ?? null, timeoutMs: deps.timeoutMs ?? null });
    case 'fallback':
      return new FallbackProvider();
    default:
      throw new Error(`Unknown AI provider "${name}". Known: ${PROVIDER_NAMES.join(', ')}`);
  }
}

/**
 * Resolve a provider spec into an ordered list of configured providers.
 *
 * 'auto' → Webloom production model (when registered) → external chain.
 * The deterministic FallbackProvider is appended only when `includeFallback`
 * is true (WebloomAI asks for it when the caller opted into UNKNOWN results).
 *
 * @param {string|string[]} spec
 * @param {object} [deps]
 * @param {boolean} [includeFallback]
 * @returns {AIModelProvider[]}
 */
export function resolveProviders(spec = 'auto', deps = {}, includeFallback = false) {
  const names = Array.isArray(spec) ? spec : [spec];
  const resolved = [];

  for (const name of names) {
    if (name === 'auto') {
      const webloom = createProvider('webloom', deps);
      if (webloom.isConfigured()) resolved.push(webloom);
      resolved.push(createProvider('external', deps));
      continue;
    }
    const provider = createProvider(name, deps);
    if (provider.isConfigured() || name === 'fallback') resolved.push(provider);
  }

  if (includeFallback && !resolved.some((p) => p.name === 'fallback')) {
    resolved.push(createProvider('fallback', deps));
  }

  // De-duplicate by name, preserving order.
  const seen = new Set();
  return resolved.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}
