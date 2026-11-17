/**
 * Capability Router — Routes AI requests to the optimal provider/model
 * based on capability, cost, health, latency, and free-tier availability.
 */

import { config } from '../config/env.js';
import ModelRegistry, { estimateCost, getModelsByCapability, getFreeTierModels } from './ModelRegistry.js';
import ProviderRegistry from './ProviderRegistry.js';
import { ProviderHealthMonitor } from './ProviderHealthMonitor.js';
import { QuotaManager } from './QuotaManager.js';

export const CAPABILITIES = Object.freeze([
  'business_extraction',
  'business_research',
  'entity_resolution',
  'review_analysis',
  'sentiment_classification',
  'competitor_analysis',
  'trend_classification',
  'report_generation',
  'structured_output',
]);

const DEFAULT_POLICIES = {
  business_extraction: {
    primary: 'mercury:mercury-3',
    secondary: 'deepseek:deepseek-chat',
    tertiary: 'together:meta-llama/Meta-Llama-3.1-70B-Instruct',
    fallback: 'local:llama3.1:8b',
    maxTokens: 2000,
    maxCostUSD: 0.001,
    maxLatencyMs: 5000,
    preferFree: true,
    requiresStructuredOutput: true,
  },
  business_research: {
    primary: 'mercury:mercury-3',
    secondary: 'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    tertiary: 'deepseek:deepseek-reasoner',
    fallback: 'deepseek:deepseek-chat',
    maxTokens: 6000,
    maxCostUSD: 0.010,
    maxLatencyMs: 30000,
    preferFree: false,
    requiresStructuredOutput: false,
  },
  entity_resolution: {
    primary: 'mercury:mercury-3',
    secondary: 'deepseek:deepseek-chat',
    tertiary: 'together:meta-llama/Meta-Llama-3.1-70B-Instruct',
    fallback: 'local:llama3.1:8b',
    maxTokens: 1000,
    maxCostUSD: 0.0005,
    maxLatencyMs: 3000,
    preferFree: true,
    requiresStructuredOutput: true,
  },
  review_analysis: {
    primary: 'mercury:mercury-3',
    secondary: 'deepseek:deepseek-chat',
    tertiary: 'together:meta-llama/Meta-Llama-3.1-8B-Instruct',
    fallback: 'local:llama3.1:8b',
    maxTokens: 1500,
    maxCostUSD: 0.001,
    maxLatencyMs: 5000,
    preferFree: true,
    requiresStructuredOutput: true,
  },
  sentiment_classification: {
    primary: 'mercury:mercury-3',
    secondary: 'deepseek:deepseek-chat',
    tertiary: 'together:meta-llama/Meta-Llama-3.1-8B-Instruct',
    fallback: 'local:llama3.1:8b',
    maxTokens: 500,
    maxCostUSD: 0.0003,
    maxLatencyMs: 2000,
    preferFree: true,
    requiresStructuredOutput: true,
  },
  competitor_analysis: {
    primary: 'mercury:mercury-3',
    secondary: 'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    tertiary: 'deepseek:deepseek-reasoner',
    fallback: 'deepseek:deepseek-chat',
    maxTokens: 4000,
    maxCostUSD: 0.005,
    maxLatencyMs: 20000,
    preferFree: false,
    requiresStructuredOutput: false,
  },
  trend_classification: {
    primary: 'mercury:mercury-3',
    secondary: 'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    tertiary: 'deepseek:deepseek-reasoner',
    fallback: 'deepseek:deepseek-chat',
    maxTokens: 3000,
    maxCostUSD: 0.003,
    maxLatencyMs: 15000,
    preferFree: false,
    requiresStructuredOutput: false,
  },
  report_generation: {
    primary: 'mercury:mercury-3',
    secondary: 'nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    tertiary: 'deepseek:deepseek-chat',
    fallback: 'deterministic',
    maxTokens: 8000,
    maxCostUSD: 0.020,
    maxLatencyMs: 45000,
    preferFree: false,
    requiresStructuredOutput: true,
  },
  structured_output: {
    primary: 'mercury:mercury-3',
    secondary: 'deepseek:deepseek-chat',
    tertiary: 'together:meta-llama/Meta-Llama-3.1-70B-Instruct',
    fallback: 'json_repair',
    maxTokens: 2000,
    maxCostUSD: 0.001,
    maxLatencyMs: 5000,
    preferFree: true,
    requiresStructuredOutput: true,
  },
};

class CapabilityRouter {
  constructor(options = {}) {
    this._policies = { ...DEFAULT_POLICIES, ...options.policies };
    this._modelRegistry = options.modelRegistry ?? null;
    this._providerRegistry = options.providerRegistry ?? null;
    this._healthMonitor = options.healthMonitor ?? null;
    this._quotaManager = options.quotaManager ?? null;
    this._config = config;
  }

  setDependencies({ modelRegistry, providerRegistry, healthMonitor, quotaManager }) {
    if (modelRegistry) this._modelRegistry = modelRegistry;
    if (providerRegistry) this._providerRegistry = providerRegistry;
    if (healthMonitor) this._healthMonitor = healthMonitor;
    if (quotaManager) this._quotaManager = quotaManager;
  }

  getPolicy(capability) {
    return this._policies[capability] ?? null;
  }

  setPolicy(capability, policy) {
    this._policies[capability] = { ...DEFAULT_POLICIES[capability], ...policy };
  }

  /**
   * Get the cost phase from config.
   */
  getCostPhase() {
    return this._config.ai?.costPhase || 'free';
  }

  /**
   * Get the base policy for a capability, adjusted for cost phase.
   */
  getEffectivePolicy(capability) {
    const basePolicy = this.getPolicy(capability);
    if (!basePolicy) return null;

    const phase = this.getCostPhase();

    if (phase === 'free') {
      return { ...basePolicy, preferFree: true, maxCostUSD: 0 };
    }
    if (phase === 'controlled') {
      return { ...basePolicy, preferFree: true, maxCostUSD: basePolicy.maxCostUSD * 0.5 };
    }
    return basePolicy; // production
  }

  /**
   * Resolve a provider:model string to actual provider and model.
   */
  resolveModel(modelSpec) {
    if (!modelSpec || !modelSpec.includes(':')) {
      return { provider: null, model: null };
    }
    const [provider, model] = modelSpec.split(':');
    return { provider, model };
  }

  /**
   * Get candidate providers for a capability, ordered by priority.
   */
  async getCandidates(capability, context = {}) {
    const policy = this.getEffectivePolicy(capability);
    if (!policy) return [];

    const candidates = [];
    const tiers = ['primary', 'secondary', 'tertiary', 'fallback'];

    for (const tier of tiers) {
      const modelSpec = policy[tier];
      if (!modelSpec) continue;

      if (modelSpec === 'deterministic' || modelSpec === 'json_repair') {
        candidates.push({
          tier,
          provider: modelSpec,
          model: modelSpec,
          isDeterministic: true,
        });
        continue;
      }

      const { provider, model } = this.resolveModel(modelSpec);
      if (!provider || !model) continue;

      // Get provider instance
      const providerInstance = this._providerRegistry?.get(provider);
      if (!providerInstance) continue;

      // Check if provider supports this capability
      const capabilities = providerInstance.getCapabilities?.() ?? [];
      if (!capabilities.includes(capability)) continue;

      // Estimate cost
      const estimatedCost = this.estimateCost(provider, model, policy.maxTokens);
      if (estimatedCost > policy.maxCostUSD) continue;

      // Check latency (if health monitor available)
      if (this._healthMonitor) {
        const health = await this._healthMonitor.getHealth(provider);
        if (health.latencyP50Ms && health.latencyP50Ms > policy.maxLatencyMs) continue;
      }

      candidates.push({
        tier,
        provider,
        model,
        instance: this._providerRegistry?.get(provider),
        estimatedCost,
        maxTokens: policy.maxTokens,
        requiresStructuredOutput: policy.requiresStructuredOutput,
      });
    }

    // Add free-tier models if preferFree
    const policy_preferFree = this.getEffectivePolicy(capability).preferFree;
    if (policy_preferFree) {
      const freeModels = this.getFreeTierCandidates(capability);
      for (const fm of freeModels) {
        if (!candidates.some(c => c.provider === fm.provider && c.model === fm.model)) {
          candidates.push({ ...fm, tier: 'free_tier', isFreeTier: true });
        }
      }
    }

    // Filter and sort candidates
    return this.filterAndSortCandidates(candidates, capability);
  }

  getFreeTierCandidates(capability) {
    if (!this._modelRegistry) return [];

    const freeModels = this._modelRegistry.getFreeTierModels(capability);
    return freeModels.map(m => ({
      provider: m.provider,
      model: m.servingModel || m.id,
      instance: this._providerRegistry?.get(m.provider),
      isFreeTier: true,
      freeTierLimits: m.freeTierLimits,
    }));
  }

  async filterAndSortCandidates(candidates, capability) {
    const filtered = [];

    for (const candidate of candidates) {
      // Skip deterministic/fallback entries for health checks
      if (candidate.isDeterministic) {
        filtered.push(candidate);
        continue;
      }

      const { provider, instance } = candidate;
      if (!instance) continue;

      // Health check
      if (this._healthMonitor) {
        const health = await this._healthMonitor.getHealth(provider);
        if (health.usable !== true) continue;
        if (health.cooldownRemaining > 0) continue;
        if (health.circuitState === 'OPEN') continue;
      }

      // Quota check
      if (this._quotaManager) {
        const quotaCheck = this._quotaManager.canAfford(provider, candidate.maxTokens, candidate.model);
        if (!quotaCheck.allowed) continue;
      }

      // Provider must be configured
      if (!instance?.isConfigured?.()) continue;

      filtered.push(candidate);
    }

    // Sort by: tier priority, then cost, then latency
    const tierOrder = { primary: 0, secondary: 1, tertiary: 2, free_tier: 3, fallback: 4 };
    filtered.sort((a, b) => {
      const tierDiff = (tierOrder[a.tier] ?? 99) - (tierOrder[b.tier] ?? 99);
      if (tierDiff !== 0) return tierDiff;

      // Within same tier, prefer free tier
      if (a.isFreeTier && !b.isFreeTier) return -1;
      if (!a.isFreeTier && b.isFreeTier) return 1;

      // Then by cost
      return (a.estimatedCost ?? 0) - (b.estimatedCost ?? 0);
    });

    return filtered;
  }

  estimateCost(provider, model, maxTokens) {
    // Rough estimation: assume 50/50 prompt/completion split
    const promptTokens = Math.floor(maxTokens * 0.5);
    const completionTokens = Math.floor(maxTokens * 0.5);

    // Use ModelRegistry if available
    if (this._modelRegistry) {
      const modelId = `${provider}:${model}`;
      return this._modelRegistry.estimateCost(modelId, promptTokens, completionTokens);
    }

    // Fallback estimates
    const estimates = {
      'deepseek:deepseek-chat': 0.0002,
      'deepseek:deepseek-reasoner': 0.0008,
      'nvidia:nvidia/nemotron-3-ultra-550b-a55b': 0.008,
      'gemini:gemini-1.5-flash': 0,
      'gemini:gemini-1.5-pro': 0.001,
      'together:meta-llama/Meta-Llama-3.1-70B-Instruct': 0.0009,
      'together:meta-llama/Meta-Llama-3.1-8B-Instruct': 0.0001,
      'together:Qwen/Qwen3-235B-A22B': 0.002,
      'fireworks:accounts/fireworks/models/llama-v3p1-70b-instruct': 0.001,
      'local:llama3.1:8b': 0,
    };

    const key = `${provider}:${model}`;
    return estimates[key] ?? 0.001;
  }

  /**
   * Select the best candidate for a capability.
   */
  async selectBest(capability, context = {}) {
    const candidates = await this.getCandidates(capability, context);

    // Apply context overrides
    if (context.preferredProvider) {
      const preferred = candidates.find(c => c.provider === context.preferredProvider);
      if (preferred) return preferred;
    }

    if (context.preferFree) {
      const free = candidates.find(c => c.isFreeTier || c.tier === 'free_tier');
      if (free) return free;
    }

    if (candidates.length === 0) {
      // Check for deterministic fallback
      const policy = this.getEffectivePolicy(capability);
      if (policy.fallback === 'deterministic' || policy.fallback === 'json_repair') {
        return { provider: policy.fallback, model: policy.fallback, isDeterministic: true };
      }
      return null;
    }

    return candidates[0];
  }
}

export default CapabilityRouter;