/**
 * Circuit Breaker — Prevents cascade failures by stopping requests to failing providers.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery) → CLOSED
 * Supports Redis-backed state for serverless/Vercel deployments.
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = new Map(); // provider -> circuit state
    this._failureThreshold = options.failureThreshold ?? 5;
    this._successThreshold = options.successThreshold ?? 2;
    this._timeout = options.timeout ?? 60000; // ms before HALF_OPEN probe
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  async _getState(provider) {
    const redis = await this._getRedis();
    const key = `circuit:provider:${provider}`;

    if (redis) {
      try {
        const data = await redis.get(key);
        if (data) return JSON.parse(data);
      } catch (error) {
        console.warn(`[CircuitBreaker] Redis get failed for ${provider}:`, error.message);
      }
    }

    return this._inMemory.get(provider) ?? this._defaultState();
  }

  _defaultState() {
    return {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      nextProbeAt: null,
    };
  }

  async _save(provider, state) {
    const redis = await this._getRedis();
    const key = `circuit:provider:${provider}`;

    if (redis) {
      try {
        await redis.set(key, JSON.stringify(state), { EX: 86400 }); // 24h TTL
        return;
      } catch (error) {
        console.warn(`[CircuitBreaker] Redis set failed for ${provider}:`, error.message);
      }
    }

    this._inMemory.set(provider, state);
  }

  /**
   * Execute an operation with circuit breaker protection.
   */
  async execute(provider, operation) {
    const state = await this._getState(provider);

    // Check circuit state
    if (state.state === 'OPEN') {
      if (state.nextProbeAt && Date.now() >= state.nextProbeAt) {
        // Transition to HALF_OPEN for probe
        state.state = 'HALF_OPEN';
        state.successes = 0;
        await this._save(provider, state);
      } else {
        throw new Error(`Circuit breaker OPEN for ${provider}. Next probe at ${state.nextProbeAt ? new Date(state.nextProbeAt).toISOString() : 'unknown'}`);
      }
    }

    try {
      const result = await operation();
      await this.recordSuccess(provider);
      return result;
    } catch (error) {
      await this.recordFailure(provider);
      throw error;
    }
  }

  async recordSuccess(provider) {
    const state = await this._getState(provider);
    state.successes += 1;
    state.lastSuccess = Date.now();
    state.failures = 0; // Reset failure count on success

    if (state.state === 'HALF_OPEN') {
      if (state.successes >= 2) {
        state.state = 'CLOSED';
        state.failures = 0;
        state.successes = 0;
      }
    } else if (state.state === 'CLOSED') {
      state.failures = 0; // Reset on success
    }

    await this._save(provider, state);
  }

  async recordFailure(provider) {
    const state = await this._getState(provider);
    state.failures += 1;
    state.lastFailure = Date.now();
    state.successes = 0; // Reset success count on failure

    if (state.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN goes back to OPEN
      state.state = 'OPEN';
      state.nextProbeAt = Date.now() + 60000; // 1 minute
    } else if (state.state === 'CLOSED' && state.failures >= 5) {
      state.state = 'OPEN';
      state.nextProbeAt = Date.now() + 60000; // 1 minute before probe
    }

    await this._save(provider, state);
  }

  async getState(provider) {
    return this._getState(provider);
  }

  async isOpen(provider) {
    const state = await this._getState(provider);
    return state.state === 'OPEN';
  }

  async isHalfOpen(provider) {
    const state = await this._getState(provider);
    return state.state === 'HALF_OPEN';
  }

  async isClosed(provider) {
    const state = await this._getState(provider);
    return state.state === 'CLOSED';
  }

  async reset(provider) {
    const state = {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      nextProbeAt: null,
    };
    await this._save(provider, state);
    return state;
  }

  async forceOpen(provider) {
    const state = await this._getState(provider);
    state.state = 'OPEN';
    state.nextProbeAt = Date.now() + 60000;
    await this._save(provider, state);
  }

  async forceClose(provider) {
    const state = await this._getState(provider);
    state.state = 'CLOSED';
    state.failures = 0;
    state.successes = 0;
    await this._save(provider, state);
  }

  async _save(provider, state) {
    const redis = await this._getRedis();
    const key = `circuit:provider:${provider}`;

    if (redis) {
      try {
        await redis.set(key, JSON.stringify(state), { EX: 86400 });
        return;
      } catch (error) {
        console.warn(`[CircuitBreaker] Redis set failed for ${provider}:`, error.message);
      }
    }

    this._inMemory.set(provider, state);
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }
}

export default CircuitBreaker;