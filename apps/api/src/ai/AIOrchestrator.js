/**
 * AI Orchestrator — Central capability-based AI orchestration layer.
 *
 * This is the main entry point for all AI operations in Webloom.
 * It coordinates providers, routing, health, quotas, costs, and fallbacks.
 */

import ModelRegistry from './ModelRegistry.js';
import ProviderRegistry from './ProviderRegistry.js';
import CapabilityRouter from './CapabilityRouter.js';
import { ProviderHealthMonitor } from './ProviderHealthMonitor.js';
import { QuotaManager } from './QuotaManager.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RetryController } from './RetryController.js';
import { OutputValidator } from './OutputValidator.js';
import { CostTracker } from './CostTracker.js';
import { AIExecutionLogger } from './AIExecutionLogger.js';
import { FallbackController } from './FallbackController.js';
import { CacheManager } from './CacheManager.js';
import { config } from '../config/env.js';

export class AIOrchestrator {
  constructor(options = {}) {
    // Core registries - use options or create defaults
    this._modelRegistry = options.modelRegistry ?? null;
    this._providerRegistry = options.providerRegistry ?? null;
    this._capabilityRouter = options.capabilityRouter ?? null;
    this._healthMonitor = options.healthMonitor ?? null;
    this._quotaManager = options.quotaManager ?? null;
    this._circuitBreaker = options.circuitBreaker ?? null;
    this._retryController = options.retryController ?? null;
    this._outputValidator = options.outputValidator ?? null;
    this._costTracker = options.costTracker ?? null;
    this._executionLogger = options.executionLogger ?? null;
    this._fallbackController = options.fallbackController ?? null;
    this._cacheManager = options.cacheManager ?? null;

    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    
    // Dynamic imports to avoid require() in ESM
    const { default: ModelRegistry } = await import('./ModelRegistry.js');
    const { default: ProviderRegistry } = await import('./ProviderRegistry.js');
    const { default: CapabilityRouter } = await import('./CapabilityRouter.js');
    const { default: ProviderHealthMonitor } = await import('./ProviderHealthMonitor.js');
    const { default: QuotaManager } = await import('./QuotaManager.js');
    const { default: CircuitBreaker } = await import('./CircuitBreaker.js');
    const { default: RetryController } = await import('./RetryController.js');
    const { default: OutputValidator } = await import('./OutputValidator.js');
    const { default: CostTracker } = await import('./CostTracker.js');
    const { default: AIExecutionLogger } = await import('./AIExecutionLogger.js');
    const { default: FallbackController } = await import('./FallbackController.js');
    const { default: CacheManager } = await import('./CacheManager.js');

    // Core registries
    // ModelRegistry is an object with functions, not a class
    this._modelRegistry = this._modelRegistry ?? ModelRegistry;
    // ProviderRegistry is exported as a singleton instance
    this._providerRegistry = this._providerRegistry ?? ProviderRegistry;
    this._capabilityRouter = this._capabilityRouter ?? new CapabilityRouter({
      modelRegistry: this._modelRegistry,
      providerRegistry: this._providerRegistry,
    });

    // Resilience components
    this._healthMonitor = this._healthMonitor ?? new ProviderHealthMonitor();
    this._quotaManager = this._quotaManager ?? new QuotaManager();
    this._circuitBreaker = this._circuitBreaker ?? new CircuitBreaker();
    this._retryController = this._retryController ?? new RetryController();

    // Validation & quality
    this._outputValidator = this._outputValidator ?? new OutputValidator();

    // Observability & cost
    this._costTracker = this._costTracker ?? new CostTracker();
    this._executionLogger = this._executionLogger ?? new AIExecutionLogger();

    // Fallback & caching
    this._fallbackController = this._fallbackController ?? new FallbackController({
      capabilityRouter: this._capabilityRouter,
    });
    this._cacheManager = this._cacheManager ?? new CacheManager();

    // Wire up dependencies
    this._capabilityRouter.setDependencies({
      modelRegistry: this._modelRegistry,
      providerRegistry: this._providerRegistry,
      healthMonitor: this._healthMonitor,
      quotaManager: this._quotaManager,
    });

    this._fallbackController.setDependencies({
      capabilityRouter: this._capabilityRouter,
    });

    // Initialize provider registry
    this._providerRegistry.initialize();

    this._initialized = true;
  
  // Config
  this._config = config;
  this._requestId = 0;
}

  /**
   * Main execution method — routes request to optimal provider.
   */
  async execute(capability, input, options = {}) {
    await this._ensureInitialized();
    const requestId = `req_${Date.now()}_${++this._requestId}`;
    const startedAt = Date.now();

    // Check cache first
    const cacheKey = {
      capability,
      prompt: input.prompt ?? JSON.stringify(input),
      model: options.model,
      temperature: options.temperature ?? 0,
      schema: options.schema,
    };

    const cached = await this._cacheManager.get(cacheKey);
    if (cached) {
      return this._wrapResult(cached.value, {
        ...cached,
        requestId,
        cached: true,
        latencyMs: Date.now() - startedAt,
      });
    }

    // Select best provider
    const selection = await this._capabilityRouter.selectBest(capability, {
      preferredProvider: options.preferredProvider,
      preferFree: options.preferFree,
      maxCost: options.maxCost,
      maxLatency: options.maxLatency,
    });

    if (!selection) {
      throw new Error(`No suitable provider found for capability: ${capability}`);
    }

    // Execute with full resilience
    const result = await this._executeWithResilience({
      requestId,
      capability,
      input,
      selection,
      options,
      startedAt,
    });

    // Cache if appropriate
    if (selection.provider !== 'deterministic' && selection.provider !== 'json_repair') {
      const cacheParams = {
        capability,
        prompt: input.prompt ?? JSON.stringify(input),
        model: selection.model,
        temperature: options.temperature ?? 0,
        schema: options.schema,
      };
      await this._cacheManager.set(cacheParams, result.output);
    }

    return this._wrapResult(result.output, {
      requestId,
      capability,
      provider: selection.provider,
      model: selection.model,
      latencyMs: Date.now() - startedAt,
      tokens: result.tokens,
      costUSD: result.costUSD,
      fallbackCount: result.fallbackCount,
      attempts: result.attempts,
      grounding: result.grounding,
      confidence: result.confidence,
      cached: false,
    });
  }

  /**
   * Execute with full resilience: retries, fallbacks, circuit breakers, quotas.
   */
  async _executeWithResilience({ requestId, capability, input, selection, options, startedAt }) {
    const {
      provider,
      model,
      instance,
      isDeterministic,
      estimatedCost,
      maxTokens,
      requiresStructuredOutput,
    } = selection;

    // Deterministic fallback
    if (isDeterministic) {
      return this._executeDeterministic(capability, input, options);
    }

    // Track fallback chain
    const attemptedProviders = new Set();
    let fallbackCount = 0;
    let currentProvider = provider;
    let currentModel = model;
    let currentInstance = instance;
    let lastError = null;
    const attempts = [];

    while (true) {
      const attemptStartedAt = Date.now();
      attemptedProviders.add(currentProvider);

      // Check quota
      const quotaCheck = await this._quotaManager.canAfford(currentProvider, maxTokens, currentModel, this._modelRegistry);
      if (!quotaCheck.allowed) {
        lastError = new Error(`Quota exceeded for ${currentProvider}`);
        attempts.push(this._makeAttemptRecord(currentProvider, currentModel, lastError, 0));
        const fallback = await this._tryFallback(capability, attemptedProviders, fallbackCount);
        if (!fallback) break;
        currentProvider = fallback.provider;
        currentModel = fallback.model;
        currentInstance = fallback.instance;
        fallbackCount++;
        continue;
      }

      // Check circuit breaker
      if (await this._circuitBreaker.isOpen(currentProvider)) {
        lastError = new Error(`Circuit breaker OPEN for ${currentProvider}`);
        attempts.push(this._makeAttemptRecord(currentProvider, currentModel, lastError, 0));
        const fallback = await this._tryFallback(capability, attemptedProviders, fallbackCount);
        if (!fallback) break;
        currentProvider = fallback.provider;
        currentModel = fallback.model;
        currentInstance = fallback.instance;
        fallbackCount++;
        continue;
      }

      // Check cooldown
      const cooldown = await this._healthMonitor.getCooldownRemaining(currentProvider);
      if (cooldown > 0) {
        lastError = new Error(`Provider ${currentProvider} in cooldown`);
        attempts.push(this._makeAttemptRecord(currentProvider, currentModel, lastError, 0));
        const fallback = await this._tryFallback(capability, attemptedProviders, fallbackCount);
        if (!fallback) break;
        currentProvider = fallback.provider;
        currentModel = fallback.model;
        currentInstance = fallback.instance;
        fallbackCount++;
        continue;
      }

      // Execute with retry
      try {
        const result = await this._executeWithRetry({
          provider: currentProvider,
          model: currentModel,
          instance: currentInstance,
          capability,
          input,
          options,
          maxTokens,
          requiresStructuredOutput,
        });

        // Success - record metrics
        const latencyMs = Date.now() - attemptStartedAt;
        await this._healthMonitor.recordSuccess(currentProvider, latencyMs);
        await this._circuitBreaker.recordSuccess(currentProvider);
        await this._quotaManager.recordUsage(currentProvider, result.tokens?.total ?? 0, result.costUSD ?? 0);

        // Log execution
        this._executionLogger.log({
          requestId: `req_${Date.now()}`,
          capability,
          provider: currentProvider,
          model: currentModel,
          promptChars: input.prompt?.length ?? JSON.stringify(input).length,
          promptTokens: result.tokens?.prompt ?? 0,
          completionTokens: result.tokens?.completion ?? 0,
          totalTokens: result.tokens?.total ?? 0,
          costUSD: result.costUSD ?? 0,
          latencyMs,
          success: true,
          fallbackCount,
          attempts,
          grounding: result.grounding,
          confidence: result.confidence,
        });

        // Record cost
        this._costTracker.record({
          provider: currentProvider,
          model: currentModel,
          capability,
          promptTokens: result.tokens?.prompt ?? 0,
          completionTokens: result.tokens?.completion ?? 0,
          totalTokens: result.tokens?.total ?? 0,
          costUSD: result.costUSD ?? 0,
          latencyMs,
          success: true,
        });

        return {
          output: result.output,
          tokens: result.tokens,
          costUSD: result.costUSD,
          latencyMs,
          fallbackCount,
          attempts,
          grounding: result.grounding,
          confidence: result.confidence,
        };
      } catch (error) {
        const latencyMs = Date.now() - attemptStartedAt;
        const aiError = error; // Already an AIError from _executeWithRetry

        // Record failure
        await this._healthMonitor.recordFailure(currentProvider, aiError);
        await this._circuitBreaker.recordFailure(currentProvider);
        attempts.push(this._makeAttemptRecord(currentProvider, currentModel, aiError, aiError.retryCount ?? 0));

        // Log failure
        this._executionLogger.log({
          requestId: `req_${Date.now()}`,
          capability,
          provider: currentProvider,
          model: currentModel,
          latencyMs,
          success: false,
          error: aiError,
          fallbackCount,
          attempts,
        });

        // Record cost (failed attempt)
        this._costTracker.record({
          provider: currentProvider,
          model: currentModel,
          capability,
          costUSD: 0,
          latencyMs,
          success: false,
        });

        // Try fallback
        const fallback = await this._tryFallback(capability, attemptedProviders, fallbackCount);
        if (!fallback) {
          // All fallbacks exhausted - return deterministic fallback
          return this._executeDeterministic(capability, input, options);
        }

        currentProvider = fallback.provider;
        currentModel = fallback.model;
        currentInstance = fallback.instance;
        fallbackCount++;
      }
    }

    // Should not reach here
    throw new Error(`All providers failed for capability: ${capability}`);
  }

  async _executeWithRetry({ provider, model, instance, capability, input, options, maxTokens, requiresStructuredOutput }) {
    const deadline = Date.now() + (this._config.ai?.maxTotalMs ?? 90000);

    return this._retryController.executeWithRetry(async () => {
      // Check deadline
      if (Date.now() >= deadline) {
        throw new Error('Total AI budget exhausted');
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error('No time remaining for AI request');
      }

      const response = await instance.complete({
        model,
        systemPrompt: options.systemPrompt ?? null,
        prompt: input.prompt ?? JSON.stringify(input),
        temperature: options.temperature ?? 0.3,
        maxTokens: Math.min(maxTokens ?? 4000, 8192),
        responseFormat: options.schema ? { type: 'json_schema', json_schema: { name: 'AIResponse', strict: true, schema: options.schema } } : null,
        timeoutMs: Math.min(instance.timeoutMs ?? 30000, remainingMs),
      });

      // Check for truncation
      if (response.finishReason === 'length') {
        throw new Error(`Response truncated at ${maxTokens} tokens`);
      }

      let output = response.content;

      // Validate structured output
      if (requiresStructuredOutput && options.schema) {
        const validation = await this._outputValidator.validateAndRepair(output, options.schema, {
          provider,
          model,
        });
        output = validation.output;
      }

      return {
        output,
        tokens: response.usage,
        costUSD: this._estimateCost(provider, model, response.usage),
        latencyMs: response.latencyMs,
        grounding: response.grounding,
        confidence: response.confidence,
      };
    }, {
      deadline,
      maxAttempts: 2,
      retryableCategories: new Set(['RATE_LIMITED', 'TIMEOUT', 'PROVIDER_UNAVAILABLE']),
      onRetry: async (retryCount, error, waitMs) => {
        console.log(`[AI] Retry ${retryCount} for ${provider} after ${waitMs}ms: ${error.safeMessage}`);
      },
    });
  }

  async _tryFallback(capability, attemptedProviders, fallbackCount) {
    const fallback = await this._fallbackController.selectFallback(
      Array.from(attemptedProviders).pop(),
      capability,
      { attemptedProviders: Array.from(attemptedProviders), fallbackCount }
    );

    if (!fallback || fallback.provider === 'deterministic') {
      return null;
    }

    const instance = this._providerRegistry.get(fallback.provider);
    if (!instance) return null;

    return {
      provider: fallback.provider,
      model: fallback.model,
      instance,
      fallbackDepth: fallback.fallbackDepth,
    };
  }

  _executeDeterministic(capability, input, options) {
    // Deterministic fallbacks for each capability
    const fallbacks = {
      business_extraction: () => this._deterministicExtraction(input),
      business_research: () => ({ summary: 'Research unavailable - using extracted facts only', facts: [] }),
      entity_resolution: () => ({ matches: [], method: 'exact_match' }),
      review_analysis: () => ({ sentiment: 'neutral', themes: [], method: 'rating_heuristic' }),
      sentiment_classification: () => ({ sentiment: 'neutral', confidence: 0.5, method: 'rating_heuristic' }),
      competitor_analysis: () => ({ competitors: [], method: 'template' }),
      trend_classification: () => ({ trends: [], method: 'template' }),
      report_generation: () => ({ report: 'Report generation unavailable - using extracted facts', method: 'template' }),
      structured_output: () => ({ output: null, method: 'json_repair_failed' }),
    };

    const fn = fallbacks[capability] ?? (() => ({ error: 'No deterministic fallback' }));
    return { output: fn(), tokens: { total: 0 }, costUSD: 0, latencyMs: 0, fallback: true };
  }

  _deterministicExtraction(input) {
    // Simple regex-based extraction for business info
    const html = input.html ?? input.prompt ?? '';
    const patterns = {
      name: /<title[^>]*>([^<]+)<\/title>/i,
      phone: /(?:tel:|phone[:\s]+)([+]?[\d\s\-\(\)]{10,})/i,
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      address: /(?:address|location)[:\s]+([^<\n]{10,100})/i,
    };

    const extracted = {};
    for (const [field, regex] of Object.entries(patterns)) {
      const match = html.match(regex);
      if (match) extracted[field] = match[1].trim();
    }

    return { extracted, method: 'regex_extraction', confidence: 0.3 };
  }

  _makeAttemptRecord(provider, model, error, retryCount) {
    return {
      provider,
      model,
      error: error?.message ?? String(error),
      category: error?.category ?? 'UNKNOWN',
      httpStatus: error?.httpStatus ?? null,
      retryCount,
      latencyMs: error?.latencyMs ?? 0,
      success: false,
    };
  }

  _estimateCost(provider, model, usage) {
    if (!usage) return 0;
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;
    return estimateCost(`${provider}:${model}`, promptTokens, completionTokens);
  }

  _wrapResult(output, metadata) {
    return {
      output,
      ...metadata,
    };
  }

  // Getters for components
  get modelRegistry() { return this._modelRegistry; }
  get providerRegistry() { return this._providerRegistry; }
  get capabilityRouter() { return this._capabilityRouter; }
  get healthMonitor() { return this._healthMonitor; }
  get quotaManager() { return this._quotaManager; }
  get circuitBreaker() { return this._circuitBreaker; }
  get retryController() { return this._retryController; }
  get outputValidator() { return this._outputValidator; }
  get costTracker() { return this._costTracker; }
  get executionLogger() { return this._executionLogger; }
  get fallbackController() { return this._fallbackController; }
  get cacheManager() { return this._cacheManager; }
}

export default AIOrchestrator;