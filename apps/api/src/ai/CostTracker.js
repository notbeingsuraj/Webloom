/**
 * Cost Tracker — Tracks AI spending per request, provider, capability, and time period.
 *
 * Provides real-time cost monitoring, projections, and budget enforcement support.
 */

import { config } from '../config/env.js';

export class CostTracker {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = []; // Ring buffer of recent records
    this._maxRecords = options.maxRecords ?? 10000;

    // Aggregated metrics
    this._daily = new Map();      // YYYY-MM-DD -> { cost, tokens, requests, failures }
    this._monthly = new Map();    // YYYY-MM -> { cost, tokens, requests, failures }
    this._byCapability = new Map(); // capability -> { cost, tokens, requests }
    this._byProvider = new Map();   // provider -> { cost, tokens, requests }
    this._byModel = new Map();      // model -> { cost, tokens, requests }

    // Monthly budget from config
    this._monthlyBudgetUSD = options.monthlyBudgetUSD ?? 50;
    this._providerBudgets = options.providerBudgets ?? {};
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Record a completed AI request.
   */
  record(record) {
    const {
      provider,
      model,
      capability,
      promptTokens = 0,
      completionTokens = 0,
      totalTokens = promptTokens + completionTokens,
      costUSD = 0,
      latencyMs = 0,
      success = true,
      timestamp = Date.now(),
    } = record;

    const recordEntry = {
      timestamp,
      provider,
      model,
      capability,
      promptTokens,
      completionTokens,
      totalTokens,
      costUSD,
      latencyMs,
      success,
    };

    // Add to ring buffer
    this._inMemory.push(recordEntry);
    if (this._inMemory.length > this._maxRecords) {
      this._inMemory.shift();
    }

    // Update aggregates
    this._updateAggregates(recordEntry);

    // Persist to Redis if available (async, fire-and-forget)
    this._persistAsync(recordEntry);

    return recordEntry;
  }

  _updateAggregates(entry) {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const month = date.slice(0, 7);
    const capability = entry.capability ?? 'unknown';
    const provider = entry.provider ?? 'unknown';
    const model = entry.model ?? 'unknown';

    // Daily
    this._inc(this._daily, date, entry);
    // Monthly
    this._inc(this._monthly, month, entry);
    // By capability
    this._inc(this._byCapability, capability, entry);
    // By provider
    this._inc(this._byProvider, provider, entry);
    // By model
    this._inc(this._byModel, model, entry);
  }

  _inc(map, key, entry) {
    const existing = map.get(key) ?? { cost: 0, tokens: 0, requests: 0, failures: 0 };
    existing.cost += entry.costUSD;
    existing.tokens += entry.totalTokens;
    existing.requests += 1;
    if (!entry.success) existing.failures += 1;
    map.set(key, existing);
  }

  async _persistAsync(entry) {
    // Fire-and-forget persistence to Redis
    const redis = await this._getRedis();
    if (!redis) return;

    const key = `cost:record:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    try {
      await redis.set(key, JSON.stringify(entry), { EX: 86400 * 7 }); // 7 days
    } catch (error) {
      // Silent fail - persistence is best effort
    }
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Get cost summary for a period.
   */
  getSummary(period = 'monthly') {
    const map = period === 'daily' ? this._daily : this._monthly;
    return Object.fromEntries(map);
  }

  /**
   * Get cost breakdown by capability.
   */
  getByCapability() {
    return Object.fromEntries(this._byCapability);
  }

  /**
   * Get cost breakdown by provider.
   */
  getByProvider() {
    return Object.fromEntries(this._byProvider);
  }

  /**
   * Get cost breakdown by model.
   */
  getByModel() {
    return Object.fromEntries(this._byModel);
  }

  /**
   * Get current month projection.
   */
  getProjection() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const current = this._monthly.get(currentMonth) ?? { cost: 0, requests: 0 };
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    if (dayOfMonth === 0) return { current: 0, projected: 0, dailyAverage: 0 };

    const dailyAverage = current.cost / dayOfMonth;
    const projected = dailyAverage * daysInMonth;

    return {
      current: current.cost,
      projected,
      dailyAverage,
      daysElapsed: dayOfMonth,
      daysInMonth,
      requestsThisMonth: current.requests,
    };
  }

  /**
   * Get cost breakdown for a specific capability.
   */
  getCapabilityBreakdown(capability) {
    return this._byCapability.get(capability) ?? { cost: 0, tokens: 0, requests: 0, failures: 0 };
  }

  /**
   * Get cost breakdown for a specific provider.
   */
  getProviderBreakdown(provider) {
    return this._byProvider.get(provider) ?? { cost: 0, tokens: 0, requests: 0, failures: 0 };
  }

  /**
   * Get cost per successful request for a capability.
   */
  getCostPerSuccess(capability) {
    const data = this._byCapability.get(capability);
    if (!data || data.requests === 0) return 0;
    const successes = data.requests - (data.failures ?? 0);
    return successes > 0 ? data.cost / successes : 0;
  }

  /**
   * Check if monthly budget is at risk.
   */
  isBudgetAtRisk(threshold = 0.8) {
    const projection = this.getProjection();
    return projection.projected > this._monthlyBudgetUSD * threshold;
  }

  /**
   * Get budget status.
   */
  getBudgetStatus() {
    const projection = this.getProjection();
    return {
      budgetUSD: this._monthlyBudgetUSD,
      currentUSD: projection.current,
      projectedUSD: projection.projected,
      remainingUSD: Math.max(0, this._monthlyBudgetUSD - projection.projected),
      usedPercent: projection.projected / this._monthlyBudgetUSD,
      dailyAverage: projection.dailyAverage,
      daysRemaining: projection.daysInMonth - projection.daysElapsed,
      atRisk: this.isBudgetAtRisk(),
    };
  }

  /**
   * Get daily cost trend for the last N days.
   */
  getDailyTrend(days = 30) {
    const trend = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      const data = this._daily.get(key) ?? { cost: 0, requests: 0 };
      trend.push({ date: key, cost: data.cost, requests: data.requests });
    }

    return trend;
  }

  /**
   * Clear old records (cleanup).
   */
  cleanup(maxAgeDays = 30) {
    const cutoff = Date.now() - maxAgeDays * 86400000;

    // Clean ring buffer
    this._inMemory = this._inMemory.filter(r => r.timestamp > cutoff);

    // Clean aggregates
    const cutoffDate = new Date(cutoff).toISOString().split('T')[0];
    for (const [key] of this._daily) {
      if (key < cutoffDate) this._daily.delete(key);
    }
    for (const [key] of this._monthly) {
      if (key < new Date(cutoff).toISOString().slice(0, 7)) this._monthly.delete(key);
    }
  }
}

export default CostTracker;