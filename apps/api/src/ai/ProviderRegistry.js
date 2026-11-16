/**
 * Provider Registry — Central registry for all AI providers.
 *
 * Manages provider lifecycle, health, capabilities, and configuration.
 * Providers are registered once and can be queried by capability, health, or name.
 */

import { createProvider } from './providers/index.js';
import { config } from '../config/env.js';

class ProviderRegistry {
  constructor() {
    this._providers = new Map();
    this._initialized = false;
    this._configRef = null;
  }

  /**
   * Initialize the registry with providers from config.
   * Called once at startup or when config changes.
   */
  initialize() {
    if (this._initialized && this._configRef === config.ai.providers) {
      return;
    }

    this._providers.clear();

    const providerConfigs = config.ai.providers || {};
    const chainOrder = [
      config.ai.primaryProvider,
      config.ai.secondaryProvider,
      config.ai.fallbackProvider,
    ].filter(Boolean);

    // Register providers in chain order
    for (const name of chainOrder) {
      const providerConfig = providerConfigs[name];
      if (!providerConfig) continue;

      try {
        const provider = createProvider(name, { ...providerConfig, name });
        if (provider) {
          this._providers.set(name, {
            instance: provider,
            config: providerConfig,
            name,
            priority: chainOrder.indexOf(name),
          });
        }
      } catch (error) {
        console.warn(`[ProviderRegistry] Failed to create provider "${name}":`, error.message);
      }
    }

    this._initialized = true;
    this._configRef = config.ai.providers;
  }

  /**
   * Register a provider manually (for testing or dynamic registration).
   */
  register(name, providerInstance, config = {}) {
    this._providers.set(name, {
      instance: providerInstance,
      config,
      name,
      priority: this._providers.size,
    });
  }

  /**
   * Get a provider by name.
   */
  get(name) {
    this.initialize();
    const entry = this._providers.get(name);
    return entry?.instance ?? null;
  }

  /**
   * Get all registered providers.
   */
  getAll() {
    this.initialize();
    return Array.from(this._providers.entries()).map(([name, entry]) => ({
      name,
      instance: entry.instance,
      config: entry.config,
      priority: entry.priority,
    }));
  }

  /**
   * Get providers that support a specific capability.
   */
  getByCapability(capability) {
    this.initialize();
    const providers = [];
    for (const [name, entry] of this._providers) {
      const caps = entry.instance.getCapabilities?.() ?? [];
      if (caps.includes(capability)) {
        providers.push({
          name,
          instance: entry.instance,
          priority: entry.priority,
        });
      }
    }
    // Sort by priority (lower = higher priority)
    return providers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get healthy providers for a capability.
   */
  async getHealthyForCapability(capability, healthMonitor) {
    const candidates = this.getByCapability(capability);
    const healthy = [];

    for (const { name, instance, priority } of candidates) {
      const health = await healthMonitor.getHealth(name);
      if (health.usable === true) {
        healthy.push({ name, instance: instance, priority, health });
      }
    }

    return healthy.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the provider chain in priority order.
   */
  getChain() {
    this.initialize();
    return this.getAll()
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.instance);
  }

  /**
   * Check if a provider is configured.
   */
  isConfigured(name) {
    this.initialize();
    const entry = this._providers.get(name);
    return entry?.instance?.isConfigured?.() ?? false;
  }

  /**
   * Invalidate cache (for config reload).
   */
  invalidate() {
    this._initialized = false;
    this._configRef = null;
  }

  /**
   * Get provider metadata for health endpoint.
   */
  getMetadata() {
    this.initialize();
    const metadata = {};
    for (const [name, entry] of this._providers) {
      metadata[name] = {
        name: entry.instance.name,
        label: entry.instance.label,
        type: entry.instance.type,
        configured: entry.instance.isConfigured?.() ?? false,
        model: entry.instance.getModel?.('default') ?? null,
        capabilities: entry.instance.getCapabilities?.() ?? [],
        priority: entry.priority,
      };
    }
    return metadata;
  }
}

export default new ProviderRegistry();