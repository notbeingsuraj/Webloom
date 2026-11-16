/**
 * AI Execution Logger — Structured logging for every AI request.
 *
 * Provides consistent, queryable logs for debugging, auditing, and monitoring.
 */

import { sanitizeSecretText } from '../services/ai/AIError.js';

export class AIExecutionLogger {
  constructor(options = {}) {
    this._redis = options.redis ?? null;
    this._inMemory = []; // Ring buffer
    this._maxRecords = options.maxRecords ?? 5000;
    this._logLevel = options.logLevel ?? 'info'; // debug, info, warn, error
  }

  async _getRedis() {
    if (!this._redis) return null;
    if (typeof this._redis === 'function') {
      this._redis = await this._redis();
    }
    return this._redis;
  }

  /**
   * Log an AI execution.
   */
  log(record) {
    const entry = {
      timestamp: new Date().toISOString(),
      requestId: record.requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      capability: record.capability ?? 'unknown',
      provider: record.provider ?? 'unknown',
      model: record.model ?? 'unknown',
      operation: record.operation ?? null,
      promptChars: record.promptChars ?? 0,
      promptTokens: record.promptTokens ?? 0,
      completionTokens: record.completionTokens ?? 0,
      totalTokens: record.totalTokens ?? 0,
      costUSD: record.costUSD ?? 0,
      latencyMs: record.latencyMs ?? 0,
      success: record.success ?? false,
      error: record.error ? this._sanitizeError(record.error) : null,
      fallbackCount: record.fallbackCount ?? 0,
      attempts: record.attempts?.map(a => this._sanitizeAttempt(a)) ?? [],
      grounding: record.grounding ?? null,
      confidence: record.confidence ?? null,
      metadata: record.metadata ?? {},
    };

    // Add to ring buffer
    this._inMemory.push(entry);
    if (this._inMemory.length > this._maxRecords) {
      this._inMemory.shift();
    }

    // Log to console based on level
    this._consoleLog(entry);

    // Persist to Redis (async, fire-and-forget)
    this._persistAsync(entry);

    return entry;
  }

  _sanitizeError(error) {
    if (!error) return null;
    return {
      category: error.category ?? 'UNKNOWN',
      message: error.safeMessage ?? error.message ?? 'Unknown error',
      httpStatus: error.httpStatus ?? null,
      provider: error.provider ?? null,
      model: error.model ?? null,
    };
  }

  _sanitizeAttempt(attempt) {
    return {
      provider: attempt.provider,
      model: attempt.model,
      success: attempt.error === null || attempt.error === undefined,
      error: attempt.error ?? null,
      httpStatus: attempt.httpStatus ?? null,
      retryCount: attempt.retryCount ?? 0,
      latencyMs: attempt.latencyMs ?? 0,
    };
  }

  _consoleLog(entry) {
    const level = entry.success ? 'info' : 'error';
    const parts = [
      `[AI] capability=${entry.capability}`,
      `provider=${entry.provider}`,
      `model=${entry.model}`,
      `latency=${entry.latencyMs}ms`,
      `tokens=${entry.totalTokens}`,
      `cost=$${entry.costUSD.toFixed(6)}`,
      `status=${entry.success ? 'success' : 'failure'}`,
      entry.fallbackCount ? `fallbacks=${entry.fallbackCount}` : null,
      entry.error ? `error=${entry.error.category}` : null,
    ].filter(Boolean);

    const message = parts.join(' ');

    if (level === 'error') {
      console.error(message);
    } else if (this._logLevel === 'debug') {
      console.log(message);
    }
  }

  async _persistAsync(entry) {
    const redis = await this._getRedis();
    if (!redis) return;

    const key = `ai:log:${entry.requestId}`;
    try {
      await redis.set(key, JSON.stringify(entry), { EX: 86400 * 7 }); // 7 days
    } catch (error) {
      // Silent fail
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
   * Get recent logs.
   */
  getRecent(limit = 100) {
    return this._inMemory.slice(-limit).reverse();
  }

  /**
   * Get logs for a specific capability.
   */
  getByCapability(capability, limit = 50) {
    return this._inMemory
      .filter(e => e.capability === capability)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get logs for a specific provider.
   */
  getByProvider(provider, limit = 50) {
    return this._inMemory
      .filter(e => e.provider === provider)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get error logs only.
   */
  getErrors(limit = 50) {
    return this._inMemory
      .filter(e => !e.success)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get statistics.
   */
  getStats() {
    const total = this._inMemory.length;
    const successful = this._inMemory.filter(e => e.success).length;
    const failed = total - successful;
    const totalCost = this._inMemory.reduce((sum, e) => sum + (e.costUSD ?? 0), 0);
    const totalTokens = this._inMemory.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
    const avgLatency = total > 0
      ? this._inMemory.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0) / total
      : 0;

    return {
      totalRequests: total,
      successful,
      failed,
      successRate: total > 0 ? successful / total : 0,
      totalCostUSD: totalCost,
      totalTokens,
      avgLatencyMs: Math.round(avgLatency),
      avgCostPerRequest: total > 0 ? totalCost / total : 0,
    };
  }

  /**
   * Get logs by time range.
   */
  getByTimeRange(startMs, endMs) {
    return this._inMemory.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
  }

  /**
   * Clear logs (for testing).
   */
  clear() {
    this._inMemory = [];
  }
}

export default AIExecutionLogger;