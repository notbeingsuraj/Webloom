import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { LocalProvider } from './providers/LocalProvider.js';
import { MercuryProvider } from '../../ai/providers/MercuryProvider.js';
import { NVIDIAProvider } from '../../ai/providers/NVIDIAProvider.js';
import { DeepSeekProvider } from '../../ai/providers/DeepSeekProvider.js';
import { TogetherAIProvider } from '../../ai/providers/TogetherAIProvider.js';
import { FireworksAIProvider } from '../../ai/providers/FireworksAIProvider.js';
import { HuggingFaceProvider } from '../../ai/providers/HuggingFaceProvider.js';
import { SelfHostedProvider } from '../../ai/providers/SelfHostedProvider.js';
import { AIError, AI_ERROR_CATEGORY } from './AIError.js';

/**
 * Builds the ordered provider chain from one config source.
 *
 * Provider names are declared once, in config. No other module names a vendor.
 */
const REGISTRY = {
  openrouter: OpenRouterProvider,
  gemini: GeminiProvider,
  local: LocalProvider,
  mercury: MercuryProvider,
  nvidia: NVIDIAProvider,
  deepseek: DeepSeekProvider,
  together: TogetherAIProvider,
  fireworks: FireworksAIProvider,
  huggingface: HuggingFaceProvider,
  selfhosted: SelfHostedProvider,
};

export const KNOWN_PROVIDERS = Object.freeze(Object.keys(REGISTRY));

/**
 * Ordered, de-duplicated list of configured providers.
 * Unconfigured providers are kept in the list (not filtered out) so the chain
 * can report "openrouter: CONFIGURATION_ERROR" instead of silently pretending
 * it does not exist.
 */
export function resolveProviderOrder(aiConfig) {
  const order = [
    aiConfig.primaryProvider,
    aiConfig.secondaryProvider,
    aiConfig.fallbackProvider,
  ];

  const seen = new Set();
  return order.filter((name) => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function createProvider(name, providerConfig, defaultTimeoutMs, probeMaxTokens) {
  const ProviderClass = REGISTRY[name];
  if (!ProviderClass) {
    throw new AIError({
      category: AI_ERROR_CATEGORY.CONFIGURATION_ERROR,
      provider: name,
      message: `Unknown AI provider "${name}". Known providers: ${KNOWN_PROVIDERS.join(', ')}.`,
    });
  }
  // Providers expect MercuryProvider format: { model, timeoutMs, apiKey, baseUrl, ... }
  return new ProviderClass({
    model: providerConfig.model,
    timeoutMs: providerConfig.timeoutMs ?? defaultTimeoutMs,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    reasoningModel: providerConfig.operationModels?.reasoning,
  });
}

/**
 * Instantiate the full chain.
 * @returns {Array<import('./AIProvider.js').AIProvider>}
 */
export function createProviderChain(aiConfig) {
  return resolveProviderOrder(aiConfig).map((name) => createProvider(
    name,
    aiConfig.providers?.[name] || {},
    aiConfig.timeoutMs,
    aiConfig.probeMaxTokens,
  ));
}

export default { createProvider, createProviderChain, resolveProviderOrder, KNOWN_PROVIDERS };
