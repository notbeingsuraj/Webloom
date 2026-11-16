/**
 * Quota Manager — Manages monthly AI spending budgets per provider.
 *
 * Tracks usage, enforces limits, and provides alerts at configurable thresholds.
 */

import { config } from '../config/env.js';

export class QuotaManager {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = new Map(); // provider -> quota state
    this._alerts = { warned: new Set(), critical: new Set() };

    // Default budgets from config
    this._defaultMonthlyBudgetUSD = options.monthlyBudgetUSD ?? 50;
    this._providerBudgets = options.providerBudgets ?? {}; // { provider: budgetUSD }
    this._alertThreshold = options.alertThreshold ?? 0.80;
    this._criticalThreshold = options.criticalThreshold ?? 0.95;
    this._disableAtLimit = options.disableAtLimit ?? true;
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Initialize or get quota state for a provider.
   */
  async _getState(provider) {
    const redis = await this._getRedis();
    const key = `quota:provider:${provider}`;

    if (redis) {
      try {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          // Check if we need to reset for new month
          if (this._shouldReset(parsed.lastReset)) {
            return this._initialState(provider);
          }
          return parsed;
        }
      } catch (error) {
        console.warn(`[QuotaManager] Redis get failed for ${provider}:`, error.message);
      }
    }

    const state = this._inMemory.get(provider);
    if (state && this._shouldReset(state.lastReset)) {
      return this._initialState(provider);
    }
    return state ?? this._initialState(provider);
  }

  _initialState(provider) {
    return {
      provider,
      monthlyBudgetUSD: this._providerBudgets[provider] ?? this._defaultMonthlyBudgetUSD,
      currentUsageUSD: 0,
      dailyUsageUSD: 0,
      requestsThisMonth: 0,
      tokensThisMonth: 0,
      lastReset: Date.now(),
      lastDailyReset: Date.now(),
      alerted: false,
      criticalAlerted: false,
    };
  }

  _shouldReset(lastReset) {
    const last = new Date(lastReset);
    const now = new Date();
    return last.getMonth() !== now.getMonth() || last.getFullYear() !== now.getFullYear();
  }

  async _save(provider, state) {
    const redis = await this._getRedis();
    const key = `quota:provider:${provider}`;

    if (redis) {
      try {
        await redis.set(key, JSON.stringify(state), { EX: 86400 * 32 }); // 32 days TTL
        return;
      } catch (error) {
        console.warn(`[QuotaManager] Redis set failed for ${provider}:`, error.message);
      }
    }

    this._inMemory.set(provider, state);
  }

  /**
   * Check if a provider can afford an estimated cost.
   */
  async canAfford(provider, estimatedTokens, model, modelRegistry) {
    const state = await this._getState(provider);
    const estimatedCost = modelRegistry ? modelRegistry.estimateCost(model, estimatedTokens * 0.5, estimatedTokens * 0.5) : 0;

    if (state.monthlyBudgetUSD <= 0) {
      return { allowed: true, reason: 'no_budget_set', estimatedCost, remaining: Infinity };
    }

    const projectedUsage = state.currentUsageUSD + estimatedCost;

    if (projectedUsage > state.monthlyBudgetUSD) {
      return {
        allowed: false,
        reason: 'budget_exceeded',
        estimatedCost,
        remaining: Math.max(0, state.monthlyBudgetUSD - state.currentUsageUSD),
        budget: state.monthlyBudgetUSD,
      };
    }

    return {
      allowed: true,
      estimatedCost,
      remaining: state.monthlyBudgetUSD - projectedUsage,
      budget: state.monthlyBudgetUSD,
    };
  }

  /**
   * Record usage after a successful request.
   */
  async recordUsage(provider, tokens, costUSD, model) {
    const state = await this._getState(provider);
    const now = Date.now();

    // Check for monthly reset
    if (this._shouldReset(state.lastReset)) {
      state.currentUsageUSD = 0;
      state.dailyUsageUSD = 0;
      state.requestsThisMonth = 0;
      state.tokensThisMonth = 0;
      state.lastReset = now;
      state.alerted = false;
      state.criticalAlerted = false;
    }

    // Check for daily reset
    const lastDaily = new Date(state.lastDailyReset);
    const nowDate = new Date(now);
    if (lastDaily.getDate() !== nowDate.getDate() || lastDaily.getMonth() !== nowDate.getMonth()) {
      state.dailyUsageUSD = 0;
      state.lastDailyReset = now;
    }

    state.currentUsageUSD += costUSD;
    state.dailyUsageUSD += costUSD;
    state.requestsThisMonth += 1;
    state.tokensThisMonth += tokens;

    // Check alert thresholds
    const usagePercent = state.monthlyBudgetUSD > 0 ? state.currentUsageUSD / state.monthlyBudgetUSD : 0;

    if (usagePercent >= 0.95 && !state.criticalAlerted) {
      state.criticalAlerted = true;
      this._emitAlert('critical', provider, usagePercent, state);
    } else if (usagePercent >= 0.80 && !state.alerted) {
      state.alerted = true;
      this._emitAlert('warning', provider, usagePercent, state);
    }

    await this._save(provider, state);
    return state;
  }

  _emitAlert(level, provider, usagePercent, state) {
    const message = `${level.toUpperCase()}: Provider ${provider} at ${Math.round(usagePercent * 100)}% of monthly budget ($${state.currentUsageUSD.toFixed(2)}/$${state.monthlyBudgetUSD})`;
    console.warn(`[QuotaManager] ${message}`);
    // Could emit to external alerting system here
  }

  async getRemainingBudget(provider) {
    const state = await this._getState(provider);
    return {
      budgetUSD: state.monthlyBudgetUSD,
      usedUSD: state.currentUsageUSD,
      remainingUSD: Math.max(0, state.monthlyBudgetUSD - state.currentUsageUSD),
      usedPercent: state.monthlyBudgetUSD > 0 ? state.currentUsageUSD / state.monthlyBudgetUSD : 0,
      requestsThisMonth: state.requestsThisMonth ?? 0,
      tokensThisMonth: state.tokensThisMonth ?? 0,
      dailyUsedUSD: state.dailyUsageUSD ?? 0,
    };
  }

  async getAllQuotas() {
    const results = {};
    // Get from memory
    for (const [provider, state] of this._inMemory) {
      results[provider] = await this.getRemainingBudget(provider);
    }
    // Could also scan Redis keys
    return results;
  }

  async resetMonthly() {
    const now = Date.now();
    for (const [provider, state] of this._inMemory) {
      const lastReset = new Date(state.lastReset);
      const nowDate = new Date(now);
      if (lastReset.getMonth() !== nowDate.getMonth() || lastReset.getFullYear() !== nowDate.getFullYear()) {
        state.currentUsageUSD = 0;
        state.dailyUsageUSD = 0;
        state.requestsThisMonth = 0;
        state.tokensThisMonth = 0;
        state.lastReset = now;
        state.alerted = false;
        state.criticalAlerted = false;
        await this._save(provider, state);
      }
    }
  }

  async disableProvider(provider) {
    const state = await this._getState(provider);
    state.monthlyBudgetUSD = 0;
    await this._save(provider, state);
  }

  async enableProvider(provider, budgetUSD) {
    const state = await this._getState(provider);
    state.monthlyBudgetUSD = budgetUSD ?? this._defaultMonthlyBudgetUSD;
    await this._save(provider, state);
  }

  async setProviderBudget(provider, budgetUSD) {
    const state = await this._getState(provider);
    state.monthlyBudgetUSD = budgetUSD;
    await this._save(provider, state);
  }
}

export default QuotaManager;