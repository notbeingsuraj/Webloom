import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { LocalProvider } from './providers/LocalProvider.js';
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
  return new ProviderClass({
    name,
    config: providerConfig,
    defaultTimeoutMs,
    probeMaxTokens,
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
