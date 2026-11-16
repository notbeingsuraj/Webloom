/**
 * Fallback Controller — Manages intelligent fallback selection with loop prevention.
 *
 * Selects the best available fallback provider based on capability, health, cost, and latency.
 * Prevents fallback loops and tracks fallback depth.
 */

import { config } from '../config/env.js';

const MAX_FALLBACK_DEPTH = 3;

export class FallbackController {
  constructor(options = {}) {
    this._maxDepth = options.maxDepth ?? MAX_FALLBACK_DEPTH;
    this._providerRegistry = options.providerRegistry ?? null;
    this._healthMonitor = options.healthMonitor ?? null;
    this._quotaManager = options.quotaManager ?? null;
    this._capabilityRouter = options.capabilityRouter ?? null;
  }

  setDependencies({ providerRegistry, healthMonitor, quotaManager, capabilityRouter }) {
    if (providerRegistry) this._providerRegistry = providerRegistry;
    if (healthMonitor) this._healthMonitor = healthMonitor;
    if (quotaManager) this._quotaManager = quotaManager;
    if (capabilityRouter) this._capabilityRouter = capabilityRouter;
  }

  /**
   * Select the best fallback provider after a failure.
   */
  async selectFallback(failedProvider, capability, context = {}) {
    const attemptedProviders = new Set(context.attemptedProviders ?? []);
    attemptedProviders.add(failedProvider);

    const fallbackDepth = context.fallbackDepth ?? 0;
    if (fallbackDepth >= this._maxDepth) {
      return { provider: 'deterministic', model: 'deterministic', reason: 'max_fallback_depth' };
    }

    // Get candidates from capability router
    let candidates = [];
    if (this._capabilityRouter) {
      candidates = await this._capabilityRouter.getCandidates(capability, {
        ...context,
        attemptedProviders: Array.from(attemptedProviders),
      });
    } else if (this._providerRegistry) {
      // Fallback: use provider registry directly
      const candidates_raw = this._providerRegistry.getByCapability(capability);
      candidates = candidates_raw.map(c => ({
        provider: c.name,
        model: c.instance.getModel?.('default') ?? 'default',
        instance: c.instance,
      }));
    }

    // Filter out already attempted providers
    candidates = candidates.filter(c => !attemptedProviders.has(c.provider));

    // Filter by health
    if (this._healthMonitor) {
      const healthy = [];
      for (const candidate of candidates) {
        const health = await this._healthMonitor.getHealth(candidate.provider);
        if (health.usable === true && health.cooldownRemaining === 0) {
          healthy.push(candidate);
        }
      }
      candidates = healthy;
    }

    // Filter by quota
    if (this._quotaManager && this._modelRegistry) {
      const affordable = [];
      for (const candidate of candidates) {
        const quotaCheck = await this._quotaManager.canAfford(
          candidate.provider,
          candidate.maxTokens ?? 2000,
          candidate.model,
          this._modelRegistry
        );
        if (quotaCheck.allowed) {
          affordable.push(candidate);
        }
      }
      candidates = affordable;
    }

    // Select best candidate
    if (candidates.length === 0) {
      return { provider: 'deterministic', model: 'deterministic', reason: 'no_candidates' };
    }

    // Sort by: health, cost, latency
    candidates.sort((a, b) => {
      // Prefer non-deterministic
      if (a.isDeterministic && !b.isDeterministic) return 1;
      if (!a.isDeterministic && b.isDeterministic) return -1;

      // Then by cost
      return (a.estimatedCost ?? 0) - (b.estimatedCost ?? 0);
    });

    const selected = candidates[0];
    return {
      provider: selected.provider,
      model: selected.model,
      instance: selected.instance,
      fallbackDepth: fallbackDepth + 1,
      reason: selected.reason ?? 'fallback_selected',
    };
  }

  /**
   * Check if a fallback is possible.
   */
  async canFallback(failedProvider, capability, context = {}) {
    const attemptedProviders = new Set(context.attemptedProviders ?? []);
    attemptedProviders.add(failedProvider);

    const fallbackDepth = context.fallbackDepth ?? 0;
    if (fallbackDepth >= this._maxDepth) return false;

    if (this._capabilityRouter) {
      const candidates = await this._capabilityRouter.getCandidates(capability, {
        ...context,
        attemptedProviders: Array.from(attemptedProviders),
      });
      return candidates.length > 0;
    }

    return false;
  }

  /**
   * Record a fallback event for tracking.
   */
  recordFallback(fromProvider, toProvider, reason, capability) {
    // Could emit to metrics/logging system
    console.log(`[Fallback] ${capability}: ${fromProvider} -> ${toProvider} (${reason})`);
  }

  /**
   * Get deterministic fallback for a capability.
   */
  getDeterministicFallback(capability) {
    const fallbacks = {
      business_extraction: { provider: 'deterministic', model: 'regex_extraction', method: 'regex_based' },
      business_research: { provider: 'deterministic', model: 'template_facts', method: 'fact_template' },
      entity_resolution: { provider: 'deterministic', model: 'exact_match', method: 'exact_string_match' },
      review_analysis: { provider: 'deterministic', model: 'star_heuristic', method: 'rating_based' },
      sentiment_classification: { provider: 'deterministic', model: 'rating_heuristic', method: 'rating_threshold' },
      competitor_analysis: { provider: 'deterministic', model: 'template', method: 'fact_template' },
      trend_classification: { provider: 'deterministic', model: 'template', method: 'fact_template' },
      report_generation: { provider: 'deterministic', model: 'fact_template', method: 'fact_template' },
      structured_output: { provider: 'deterministic', model: 'json_repair', method: 'json_repair' },
    };

    return fallbacks[capability] ?? { provider: 'deterministic', model: 'unknown', method: 'none' };
  }
}

export default FallbackController;