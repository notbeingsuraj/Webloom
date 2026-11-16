/**
 * Cache Manager — Caches deterministic AI results to reduce costs and latency.
 *
 * Only caches results that are safe to reuse: deterministic extractions,
 * classification with temperature=0, and schema-validated JSON.
 * Never caches reasoning tasks with temperature > 0.
 */

import { createHash } from 'node:crypto';

export class CacheManager {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = new Map(); // key -> { value, expiresAt, metadata }
    this._defaultTtlMs = options.defaultTtlMs ?? 3600000; // 1 hour
    this._maxMemoryEntries = options.maxMemoryEntries ?? 10000;
    this._enabled = options.enabled !== false;
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Generate a cache key from request parameters.
   */
  static generateKey(params) {
    const { capability, prompt, model, temperature = 0, schema, version = '1' } = params;
    const hasher = createHash('sha256');
    const data = JSON.stringify({ capability, prompt, model, temperature, schema, version });
    hasher.update(data);
    return `ai:cache:${capability}:${hasher.digest('hex').slice(0, 16)}`;
  }

  /**
   * Check if a result should be cached.
   */
  static isCacheable(params) {
    const { capability, temperature, responseFormat } = params;

    // Never cache if temperature > 0 (non-deterministic)
    if (temperature > 0) return false;

    // Only cache these capabilities
    const cacheableCapabilities = new Set([
      'business_extraction',
      'entity_resolution',
      'review_analysis',
      'sentiment_classification',
      'structured_output',
    ]);

    if (!cacheableCapabilities.has(capability)) return false;

    // Must have schema for validation
    if (!responseFormat) return false;

    return true;
  }

  /**
   * Get a cached value.
   */
  async get(params) {
    if (!this._enabled) return null;

    const key = CacheManager.generateKey(params);
    const redis = await this._getRedis();

    if (redis) {
      try {
        const data = await redis.get(params.key ?? CacheManager.generateKey(params));
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.expiresAt > Date.now()) {
            return { value: parsed.value, cached: true, cachedAt: parsed.cachedAt };
          }
        }
      } catch (error) {
        console.warn('[CacheManager] Redis get failed:', error.message);
      }
    }

    const entry = this._inMemory.get(params.key ?? CacheManager.generateKey(params));
    if (entry && entry.expiresAt > Date.now()) {
      return { value: entry.value, cached: true, cachedAt: entry.cachedAt };
    }

    return null;
  }

  /**
   * Set a cached value.
   */
  async set(params, value, ttlMs = null) {
    if (!this._enabled) return false;
    if (!CacheManager.isCacheable(params)) return false;

    const key = params.key ?? CacheManager.generateKey(params);
    const ttl = ttlMs ?? this._defaultTtlMs;
    const expiresAt = Date.now() + ttl;
    const cachedAt = Date.now();

    const entry = { value, expiresAt, cachedAt, capability: params.capability };

    const redis = await this._getRedis();
    if (redis) {
      try {
        await redis.set(params.key ?? CacheManager.generateKey(params), JSON.stringify(entry), {
          PX: ttl,
        });
        return true;
      } catch (error) {
        console.warn('[CacheManager] Redis set failed:', error.message);
      }
    }

    // Enforce memory limit
    if (this._inMemory.size >= this._maxMemoryEntries) {
      // Remove oldest entry
      const firstKey = this._inMemory.keys().next().value;
      if (firstKey) this._inMemory.delete(firstKey);
    }

    this._inMemory.set(params.key ?? CacheManager.generateKey(params), entry);
    return true;
  }

  /**
   * Invalidate a specific cache entry.
   */
  async invalidate(params) {
    const key = params.key ?? CacheManager.generateKey(params);
    const redis = await this._getRedis();

    if (redis) {
      try {
        await redis.del(key);
      } catch (error) {
        console.warn('[CacheManager] Redis del failed:', error.message);
      }
    }

    this._inMemory.delete(key);
  }

  /**
   * Invalidate all entries for a capability.
   */
  async invalidateCapability(capability) {
    const redis = await this._getRedis();

    // Invalidate in-memory entries
    for (const [key, entry] of this._inMemory) {
      if (entry.capability === capability) {
        this._inMemory.delete(key);
      }
    }

    // Redis pattern invalidation (if supported)
    if (redis) {
      try {
        const pattern = `ai:cache:${capability}:*`;
        // Note: Redis SCAN + DEL would be needed for production
        // This is a simplified version
        console.warn('[CacheManager] Pattern invalidation not fully implemented for Redis');
      } catch (error) {
        console.warn('[CacheManager] Redis pattern invalidation failed:', error.message);
      }
    }
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    return {
      memoryEntries: this._inMemory.size,
      maxMemoryEntries: this._maxMemoryEntries,
      enabled: this._enabled,
      hitRate: this._calculateHitRate(),
    };
  }

  _hitRate = 0;
  _hits = 0;
  _misses = 0;

  _recordHit() {
    this._hits++;
    this._hitRate = this._hits / (this._hits + this._misses);
  }

  _recordMiss() {
    this._misses++;
    this._hitRate = this._hits / (this._hits + this._misses);
  }

  _calculateHitRate() {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Clear all cache (for testing).
   */
  async clear() {
    this._inMemory.clear();
    const redis = await this._getRedis();
    if (redis) {
      try {
        // Would need SCAN + DEL for pattern
        console.warn('[CacheManager] Full clear not implemented for Redis');
      } catch (error) {
        console.warn('[CacheManager] Redis clear failed:', error.message);
      }
    }
  }
}

export default CacheManager;