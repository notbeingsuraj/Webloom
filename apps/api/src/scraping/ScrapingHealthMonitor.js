/**
 * Scraping Health Monitor — Monitors the health of the gosom/google-maps-scraper worker.
 * 
 * Tracks:
 * - Worker availability (REST API reachable)
 * - Job queue depth
 * - Success/failure rates
 * - Latency percentiles
 * - Resource utilization (CPU, memory)
 * - Circuit breaker state
 */

import GoogleMapsScraperAdapter from './GoogleMapsScraperAdapter.js';
import { SCRAPING_JOB_STATUS } from './ScrapingErrors.js';

const DEFAULT_CHECK_INTERVAL_MS = 60000; // 1 minute
const DEFAULT_HISTORY_SIZE = 100;

export class ScrapingHealthMonitor {
  constructor(options = {}) {
    this.adapter = options.adapter || new GoogleMapsScraperAdapter();
    this.checkIntervalMs = options.checkIntervalMs || DEFAULT_CHECK_INTERVAL_MS;
    this.historySize = options.historySize || DEFAULT_HISTORY_SIZE;
    
    this._healthHistory = [];
    this._jobMetrics = {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      totalLatencyMs: 0,
      latencies: [],
    };
    this._intervalId = null;
    this._circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      successCount: 0,
      lastFailure: null,
      nextAttempt: null,
    };
    this._circuitBreakerThreshold = 5;
    this._circuitBreakerTimeout = 60000; // 1 minute
  }

  /**
   * Start periodic health checks.
   */
  start() {
    if (this._intervalId) return;
    
    this._intervalId = setInterval(() => {
      this.checkHealth().catch(err => {
        console.error('[ScrapingHealthMonitor] Health check failed:', err.message);
      });
    }, this.checkIntervalMs);
    
    // Initial check
    this.checkHealth().catch(err => {
      console.error('[ScrapingHealthMonitor] Initial health check failed:', err.message);
    });
  }

  /**
   * Stop periodic health checks.
   */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Perform a health check.
   * 
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    const startedAt = Date.now();
    let health = {
      timestamp: new Date().toISOString(),
      healthy: false,
      reachable: false,
      authenticated: true, // No auth for scraper API
      usable: false,
      latencyMs: null,
      version: null,
      uptime: null,
      queueDepth: 0,
      activeJobs: 0,
      error: null,
      circuitBreaker: { ...this._circuitBreaker },
      metrics: this.getMetrics(),
    };
    
    try {
      const response = await this.adapter.healthCheck();
      health.latencyMs = Date.now() - startedAt;
      
      if (response.healthy) {
        health.healthy = true;
        health.reachable = true;
        health.usable = true;
        health.version = response.version;
        health.uptime = response.uptime;
        
        // Get queue metrics
        const jobs = await this.adapter.listJobs({ limit: 100 });
        health.queueDepth = jobs.filter(j => 
          j.status === SCRAPING_JOB_STATUS.PENDING || 
          j.status === SCRAPING_JOB_STATUS.QUEUED
        ).length;
        health.activeJobs = jobs.filter(j => 
          j.status === SCRAPING_JOB_STATUS.SCRAPING ||
          j.status === SCRAPING_JOB_STATUS.NORMALIZING
        ).length;
        
        // Record success for circuit breaker
        this._recordCircuitBreakerSuccess();
      } else {
        health.reachable = response.reachable !== false;
        health.error = response.error;
        this._recordCircuitBreakerFailure();
      }
    } catch (error) {
      health.latencyMs = Date.now() - startedAt;
      health.reachable = false;
      health.error = error.message;
      this._recordCircuitBreakerFailure();
    }
    
    // Record in history
    this._recordHealth(health);
    
    return health;
  }

  /**
   * Record a job completion for metrics.
   * 
   * @param {Object} result - Job result
   * @param {number} latencyMs - Job latency
   */
  recordJobCompletion(result, latencyMs) {
    this._jobMetrics.total++;
    this._jobMetrics.totalLatencyMs += latencyMs;
    this._jobMetrics.latencies.push(latencyMs);
    
    if (this._jobMetrics.latencies.length > this.historySize) {
      this._jobMetrics.latencies.shift();
    }
    
    if (result && result.businesses) {
      this._jobMetrics.completed++;
    } else {
      this._jobMetrics.failed++;
    }
  }

  /**
   * Record a job failure.
   */
  recordJobFailure() {
    this._jobMetrics.total++;
    this._jobMetrics.failed++;
  }

  /**
   * Record a job cancellation.
   */
  recordJobCancellation() {
    this._jobMetrics.total++;
    this._jobMetrics.cancelled++;
  }

  /**
   * Get current metrics.
   * 
   * @returns {Object} Metrics
   */
  getMetrics() {
    const latencies = this._jobMetrics.latencies;
    const sorted = [...latencies].sort((a, b) => a - b);
    
    const percentile = (p) => {
      if (sorted.length === 0) return null;
      const index = Math.ceil(p / 100 * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };
    
    return {
      totalJobs: this._jobMetrics.total,
      completedJobs: this._jobMetrics.completed,
      failedJobs: this._jobMetrics.failed,
      cancelledJobs: this._jobMetrics.cancelled,
      successRate: this._jobMetrics.total > 0 
        ? this._jobMetrics.completed / this._jobMetrics.total 
        : 0,
      averageLatencyMs: this._jobMetrics.total > 0
        ? Math.round(this._jobMetrics.totalLatencyMs / this._jobMetrics.total)
        : 0,
      latencyP50: percentile(50),
      latencyP90: percentile(90),
      latencyP95: percentile(95),
      latencyP99: percentile(99),
      historySize: latencies.length,
    };
  }

  /**
   * Get health history.
   * 
   * @param {number} [limit] - Number of entries to return
   * @returns {Array} Health history
   */
  getHistory(limit = 50) {
    return this._healthHistory.slice(-limit);
  }

  /**
   * Get circuit breaker state.
   * 
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerState() {
    return { ...this._circuitBreaker };
  }

  /**
   * Check if circuit breaker allows requests.
   * 
   * @returns {boolean} True if requests allowed
   */
  isAvailable() {
    if (this._circuitBreaker.state === 'OPEN') {
      if (this._circuitBreaker.nextAttempt && Date.now() >= this._circuitBreaker.nextAttempt) {
        this._circuitBreaker.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Record circuit breaker success.
   * @private
   */
  _recordCircuitBreakerSuccess() {
    this._circuitBreaker.successCount++;
    this._circuitBreaker.failureCount = 0;
    
    if (this._circuitBreaker.state === 'HALF_OPEN') {
      this._circuitBreaker.state = 'CLOSED';
    }
  }

  /**
   * Record circuit breaker failure.
   * @private
   */
  _recordCircuitBreakerFailure() {
    this._circuitBreaker.failureCount++;
    this._circuitBreaker.lastFailure = new Date().toISOString();
    this._circuitBreaker.successCount = 0;
    
    if (this._circuitBreaker.failureCount >= this._circuitBreakerThreshold) {
      this._circuitBreaker.state = 'OPEN';
      this._circuitBreaker.nextAttempt = Date.now() + this._circuitBreakerTimeout;
    }
  }

  /**
   * Record health check result in history.
   * @private
   */
  _recordHealth(health) {
    this._healthHistory.push(health);
    if (this._healthHistory.length > this.historySize) {
      this._healthHistory.shift();
    }
  }

  /**
   * Get uptime percentage over history.
   * 
   * @returns {number} Uptime percentage (0-100)
   */
  getUptimePercentage() {
    if (this._healthHistory.length === 0) return 100;
    
    const healthy = this._healthHistory.filter(h => h.healthy).length;
    return Math.round((healthy / this._healthHistory.length) * 100);
  }

  /**
   * Get detailed status for /health/scraping endpoint.
   * 
   * @returns {Promise<Object>} Detailed health status
   */
  async getDetailedStatus() {
    const health = await this.checkHealth();
    const metrics = this.getMetrics();
    
    return {
      status: health.healthy ? 'healthy' : 'degraded',
      timestamp: health.timestamp,
      scraper: {
        reachable: health.reachable,
        usable: health.usable,
        version: health.version,
        uptime: health.uptime,
        latencyMs: health.latencyMs,
        error: health.error,
      },
      queue: {
        depth: health.queueDepth,
        activeJobs: health.activeJobs,
      },
      circuitBreaker: health.circuitBreaker,
      metrics,
      uptimePercentage: this.getUptimePercentage(),
    };
  }

  /**
   * Cleanup.
   */
  destroy() {
    this.stop();
    this.adapter.destroy();
  }
}

export default ScrapingHealthMonitor;