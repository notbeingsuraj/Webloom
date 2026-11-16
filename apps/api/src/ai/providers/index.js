import { ExternalLLMProvider } from './ExternalLLMProvider.js';
import { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
import { WebloomFineTunedModelProvider } from './WebloomFineTunedModelProvider.js';
import { BaselineProvider } from './BaselineProvider.js';
import { FallbackProvider } from './FallbackProvider.js';
import { NVIDIAProvider } from './NVIDIAProvider.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { HuggingFaceProvider } from './HuggingFaceProvider.js';
import { TogetherAIProvider } from './TogetherAIProvider.js';
import { FireworksAIProvider } from './FireworksAIProvider.js';
import { SelfHostedProvider } from './SelfHostedProvider.js';

export { AIModelProvider, toPrompt } from './AIModelProvider.js';
export { ExternalLLMProvider } from './ExternalLLMProvider.js';
export { LocalFoundationModelProvider } from './LocalFoundationModelProvider.js';
export { WebloomFineTunedModelProvider } from './WebloomFineTunedModelProvider.js';
export { BaselineProvider } from './BaselineProvider.js';
export { FallbackProvider } from './FallbackProvider.js';
export { NVIDIAProvider } from './NVIDIAProvider.js';
export { DeepSeekProvider } from './DeepSeekProvider.js';
export { HuggingFaceProvider } from './HuggingFaceProvider.js';
export { TogetherAIProvider } from './TogetherAIProvider.js';
export { FireworksAIProvider } from './FireworksAIProvider.js';
export { SelfHostedProvider } from './SelfHostedProvider.js';

export const PROVIDER_NAMES = Object.freeze([
  'auto', 'webloom', 'external', 'local-foundation', 'baseline', 'fallback',
  'nvidia', 'deepseek', 'huggingface', 'together', 'fireworks', 'selfhosted',
]);

/**
 * Create a provider by well-known name.
 *
 * @param {string} name 'webloom'|'external'|'local-foundation'|'baseline'|'fallback'|'nvidia'|'deepseek'|'huggingface'|'together'|'fireworks'|'selfhosted'
 * @param {object} [deps] { aiService } injection seam for tests
 */
export function createProvider(name, deps = {}) {
  switch (name) {
    case 'external':
      return new ExternalLLMProvider({ aiService: deps.aiService ?? null });
    case 'local-foundation':
      return new LocalFoundationModelProvider({ model: deps.model ?? null, timeoutMs: deps.timeoutMs ?? null });
    case 'webloom':
      return new WebloomFineTunedModelProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        modelId: deps.modelId ?? null,
      });
    case 'baseline':
      return new BaselineProvider({ model: deps.model ?? null, timeoutMs: deps.timeoutMs ?? null });
    case 'fallback':
      return new FallbackProvider();
    case 'nvidia':
      return new NVIDIAProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
      });
    case 'deepseek':
      return new DeepSeekProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
        reasoningModel: deps.reasoningModel ?? null,
      });
    case 'huggingface':
      return new HuggingFaceProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
        endpointUrl: deps.endpointUrl ?? null,
      });
    case 'together':
      return new TogetherAIProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
        reasoningModel: deps.reasoningModel ?? null,
      });
    case 'fireworks':
      return new FireworksAIProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
        reasoningModel: deps.reasoningModel ?? null,
      });
    case 'selfhosted':
      return new SelfHostedProvider({
        model: deps.model ?? null,
        timeoutMs: deps.timeoutMs ?? null,
        apiKey: deps.apiKey ?? null,
        baseUrl: deps.baseUrl ?? null,
        label: deps.label ?? null,
        requiresApiKey: deps.requiresApiKey ?? null,
      });
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

export function getProviderCapabilities(name) {
  const capabilities = {
    nvidia: ['business_research', 'competitor_analysis', 'trend_classification', 'report_generation'],
    deepseek: ['business_extraction', 'business_research', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'structured_output', 'report_generation'],
    huggingface: ['business_extraction', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'structured_output'],
    together: ['business_extraction', 'business_research', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'competitor_analysis', 'trend_classification', 'report_generation', 'structured_output'],
    fireworks: ['business_extraction', 'business_research', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'competitor_analysis', 'trend_classification', 'report_generation', 'structured_output'],
    selfhosted: ['business_extraction', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'structured_output'],
    external: ['business_extraction', 'business_research', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'competitor_analysis', 'trend_classification', 'report_generation', 'structured_output'],
    webloom: ['business_extraction', 'business_research', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'competitor_analysis', 'trend_classification', 'report_generation', 'structured_output'],
    'local-foundation': ['business_extraction', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'structured_output'],
    baseline: ['business_extraction', 'entity_resolution', 'review_analysis', 'sentiment_classification', 'structured_output'],
    fallback: [],
  };
  return capabilities[name] ?? [];
}