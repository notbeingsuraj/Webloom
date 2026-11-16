/**
 * Provider Health Monitor — Tracks provider health, latency, errors, and cooldowns.
 *
 * Supports both in-memory (development) and Redis-backed (production/Vercel) state.
 */

import { config } from '../config/env.js';

const DEFAULT_COOLDOWN_BASE_MS = 30000;
const DEFAULT_COOLDOWN_MAX_MS = 600000;
const DEFAULT_COOLDOWN_MULTIPLIER = 2;

export class ProviderHealthMonitor {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = new Map(); // provider -> health state
    this._cooldownBaseMs = options.cooldownBaseMs ?? DEFAULT_COOLDOWN_BASE_MS;
    this._cooldownMaxMs = options.cooldownMaxMs ?? DEFAULT_COOLDOWN_MAX_MS;
    this._cooldownMultiplier = options.cooldownMultiplier ?? DEFAULT_COOLDOWN_MULTIPLIER;
    this._failureThreshold = options.failureThreshold ?? 5;
    this._successThreshold = options.successThreshold ?? 2;
    this._circuitTimeout = options.circuitTimeout ?? 60000;
    this._latencyWindow = options.latencyWindow ?? 100; // track last N latencies
    this._failureWindow = options.failureWindow ?? 100; // track last N requests
  }

  /**
   * Get Redis client (lazy initialization).
   */
  async _getRedis() {
    if (!this._redis) return null;

    // If redis is a factory function, call it
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Get health state for a provider (from Redis or memory).
   */
  async getHealth(provider) {
    const redis = await this._getRedis();
    const key = `health:provider:${provider}`;

    if (redis) {
      try {
        const data = await redis.get(key);
        if (data) return JSON.parse(data);
      } catch (error) {
        console.warn(`[HealthMonitor] Redis get failed for ${provider}:`, error.message);
      }
    }

    return this._inMemory.get(provider) ?? this._defaultHealth(provider);
  }

  /**
   * Record a successful request.
   */
  async recordSuccess(provider, latencyMs) {
    const health = await this.getHealth(provider);
    const now = Date.now();

    health.consecutiveFailures = 0;
    health.lastSuccess = now;
    health.totalRequests += 1;
    health.successfulRequests += 1;

    // Update latency tracking
    health.latencies = health.latencies ?? [];
    health.latencies.push(latencyMs);
    if (health.latencies.length > 100) health.latencies.shift();

    // Update latency percentiles
    health.latencyP50Ms = this._percentile(health.latencies, 50);
    health.latencyP95Ms = this._percentile(health.latencies, 95);
    health.latencyP99Ms = this._percentile(health.latencies, 99);

    // Failure rate
    health.failureRate = health.totalRequests > 0
      ? (health.totalRequests - health.successfulRequests) / health.totalRequests
      : 0;

    // Circuit breaker: move from HALF_OPEN to CLOSED on success
    if (health.circuitState === 'HALF_OPEN') {
      health.circuitSuccesses = (health.circuitSuccesses ?? 0) + 1;
      if (health.circuitSuccesses >= 2) {
        health.circuitState = 'CLOSED';
        health.circuitFailures = 0;
        health.circuitSuccesses = 0;
      }
    }

    await this._save(provider, health);
    return health;
  }

  /**
   * Record a failed request.
   */
  async recordFailure(provider, error) {
    const health = await this.getHealth(provider);
    const now = Date.now();

    health.consecutiveFailures += 1;
    health.lastFailure = now;
    health.totalRequests += 1;
    health.lastError = {
      category: error?.category ?? 'UNKNOWN',
      message: error?.safeMessage ?? error?.message ?? 'Unknown error',
      httpStatus: error?.httpStatus ?? null,
      timestamp: now,
    };

    // Failure rate
    health.failureRate = health.totalRequests > 0
      ? (health.totalRequests - health.successfulRequests) / health.totalRequests
      : 0;

    // Cooldown logic
    if (health.consecutiveFailures >= this._failureThreshold) {
      const cooldownMs = Math.min(
        this._cooldownBaseMs * Math.pow(this._cooldownMultiplier, health.consecutiveFailures - this._failureThreshold),
        this._cooldownMaxMs
      );
      health.cooldownUntil = now + cooldownMs;
      health.cooldownRemaining = cooldownMs;
    }

    // Circuit breaker: OPEN after threshold failures
    if (health.circuitState !== 'OPEN') {
      health.circuitFailures = (health.circuitFailures ?? 0) + 1;
      if (health.circuitFailures >= this._failureThreshold) {
        health.circuitState = 'OPEN';
        health.circuitOpenedAt = now;
      }
    }

    await this._save(provider, health);
    return health;
  }

  /**
   * Get cooldown remaining for a provider.
   */
  async getCooldownRemaining(provider) {
    const health = await this.getHealth(provider);
    if (!health.cooldownUntil) return 0;
    return Math.max(0, health.cooldownUntil - Date.now());
  }

  /**
   * Check if provider is in cooldown.
   */
  async isInCooldown(provider) {
    const remaining = await this.getCooldownRemaining(provider);
    return remaining > 0;
  }

  /**
   * Check if provider circuit is open.
   */
  async isCircuitOpen(provider) {
    const health = await this.getHealth(provider);
    return health.circuitState === 'OPEN';
  }

  /**
   * Get circuit breaker state.
   */
  async getCircuitState(provider) {
    const health = await this.getHealth(provider);
    return {
      state: health.circuitState ?? 'CLOSED',
      failures: health.circuitFailures ?? 0,
      successes: health.circuitSuccesses ?? 0,
      openedAt: health.circuitOpenedAt ?? null,
    };
  }

  /**
   * Manually reset a provider's health (for testing or manual recovery).
   */
  async reset(provider) {
    const health = this._defaultHealth(provider);
    await this._save(provider, health);
    return health;
  }

  /**
   * Get health for all known providers.
   */
  async getAllHealth() {
    const providers = new Set([
      ...this._inMemory.keys(),
      // Could also fetch from Redis keys pattern
    ]);

    const results = {};
    for (const provider of providers) {
      results[provider] = await this.getHealth(provider);
    }
    return results;
  }

  /**
   * Get cooldown remaining in seconds (for health endpoint).
   */
  async getCooldownRemainingSeconds(provider) {
    const ms = await this.getCooldownRemaining(provider);
    return Math.ceil(ms / 1000);
  }

  /**
   * Get latency percentiles.
   */
  async getLatencyPercentiles(provider) {
    const health = await this.getHealth(provider);
    return {
      p50: health.latencyP50Ms ?? null,
      p95: health.latencyP95Ms ?? null,
      p99: health.latencyP99Ms ?? null,
    };
  }

  /**
   * Get failure rate.
   */
  async getFailureRate(provider) {
    const health = await this.getHealth(provider);
    return health.failureRate ?? 0;
  }

  /**
   * Check if provider is healthy (usable).
   */
  async isHealthy(provider) {
    const health = await this.getHealth(provider);
    return health.usable === true;
  }

  /**
   * Get detailed health summary for /health/ai endpoint.
   */
  async getDetailedHealth(provider) {
    const health = await this.getHealth(provider);
    const cooldownRemaining = await this.getCooldownRemainingSeconds(provider);
    const circuit = await this.getCircuitState(provider);
    const latency = await this.getLatencyPercentiles(provider);
    const failureRate = await this.getFailureRate(provider);

    return {
      provider,
      configured: health.configured,
      reachable: health.reachable,
      authenticated: health.authenticated,
      usable: health.usable,
      detail: health.detail,
      model: health.model,
      latencyP50Ms: latency.p50,
      latencyP95Ms: latency.p95,
      latencyP99Ms: latency.p99,
      failureRate,
      cooldownRemainingSeconds: cooldownRemaining,
      circuitState: circuit.state,
      circuitFailures: circuit.failures,
      circuitOpenedAt: circuit.openedAt,
      lastSuccess: health.lastSuccess ? new Date(health.lastSuccess).toISOString() : null,
      lastFailure: health.lastFailure ? new Date(health.lastFailure).toISOString() : null,
      lastError: health.lastError,
      totalRequests: health.totalRequests,
      successfulRequests: health.successfulRequests,
      consecutiveFailures: health.consecutiveFailures,
      checkedAt: new Date().toISOString(),
    };
  }

  _defaultHealth(provider) {
    return {
      provider,
      configured: false,
      reachable: null,
      authenticated: null,
      usable: null,
      detail: 'not_checked',
      model: null,
      consecutiveFailures: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failureRate: 0,
      latencies: [],
      latencyP50Ms: null,
      latencyP95Ms: null,
      latencyP99Ms: null,
      failureRate: 0,
      circuitState: 'CLOSED',
      circuitFailures: 0,
      circuitSuccesses: 0,
      circuitOpenedAt: null,
      cooldownUntil: null,
      cooldownRemaining: 0,
      lastSuccess: null,
      lastFailure: null,
      lastError: null,
      detail: 'not_checked',
    };
  }

  _percentile(arr, p) {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  async _save(provider, health) {
    const key = `health:provider:${provider}`;

    const redis = await this._getRedis();
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(health), { EX: 3600 }); // 1 hour TTL
        return;
      } catch (error) {
        console.warn(`[HealthMonitor] Redis set failed for ${provider}:`, error.message);
      }
    }

    this._inMemory.set(provider, health);
  }
}

export default ProviderHealthMonitor;