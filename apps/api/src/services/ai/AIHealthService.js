import { createProviderChain, resolveProviderOrder } from './AIProviderFactory.js';
import { config } from '../../config/env.js';

/**
 * AI provider health.
 *
 * Reports four distinct facts per provider, because conflating them is what
 * made failures invisible before:
 *
 *   configured    — required settings exist locally (no network)
 *   reachable     — the host answered us at all
 *   authenticated — the host accepted our credentials
 *   usable        — a real request against the configured model succeeded
 *
 * Results are cached because the check costs a (tiny) billable request per
 * provider, and /health/ai may be polled by a load balancer.
 */
export class AIHealthService {
  constructor({ ttlMs = 60000 } = {}) {
    this.ttlMs = ttlMs;
    this.cache = null;
    this.cachedAt = 0;
    this.inFlight = null;
  }

  invalidate() {
    this.cache = null;
    this.cachedAt = 0;
  }

  async getHealth({ force = false } = {}) {
    const fresh = this.cache
      && !force
      && (Date.now() - this.cachedAt) < this.ttlMs;

    if (fresh) return this.cache;
    // Collapse concurrent checks so a burst of health requests cannot fan out
    // into N probes.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.#probe()
      .then((result) => {
        this.cache = result;
        this.cachedAt = Date.now();
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  async #probe() {
    const aiConfig = config.ai;
    const order = resolveProviderOrder(aiConfig);
    const chain = createProviderChain(aiConfig);
    const verifyAuth = aiConfig.probeVerifyAuth !== false;

    const providers = {};
    await Promise.all(chain.map(async (provider) => {
      if (!verifyAuth) {
        // Without a probe we can only report local configuration truthfully.
        providers[provider.name] = {
          provider: provider.name,
          model: provider.getModel('default') || null,
          configured: provider.isConfigured(),
          reachable: null,
          authenticated: null,
          usable: null,
          detail: 'probe disabled',
        };
        return;
      }
      providers[provider.name] = await provider.runHealthCheck();
    }));

    const usable = Object.values(providers).filter((p) => p.usable === true);
    // A provider the operator never configured is not a problem. Only a
    // provider that IS configured and then fails counts as degradation —
    // otherwise running OpenRouter-only would permanently read "degraded",
    // which is crying wolf and gets ignored.
    const configuredButBroken = Object.values(providers)
      .filter((p) => p.configured && p.usable === false);

    let status;
    if (usable.length === 0) {
      status = order.length === 0 ? 'unconfigured' : 'unavailable';
    } else if (configuredButBroken.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      // How much of the intended chain is actually serving traffic.
      usableProviders: usable.map((p) => p.provider),
      configuredProviders: Object.values(providers).filter((p) => p.configured).map((p) => p.provider),
      checkedAt: new Date().toISOString(),
      chain: order,
      primary: aiConfig.primaryProvider,
      secondary: aiConfig.secondaryProvider,
      fallback: aiConfig.fallbackProvider,
      timeoutMs: aiConfig.timeoutMs,
      maxRetries: aiConfig.maxRetries,
      providers,
    };
  }
}

export default new AIHealthService();
