/**
 * Scraping Job Manager — Orchestrates scraping jobs with persistence, retries, and lifecycle management.
 * 
 * Integrates with GoogleMapsScraperAdapter and provides:
 * - Job submission and tracking
 * - Persistent job state (using existing Redis or in-memory fallback)
 * - Retry logic with exponential backoff
 * - Job cancellation
 * - Progress tracking
 * - Partial result persistence
 */

import { randomUUID } from 'crypto';
import GoogleMapsScraperAdapter from './GoogleMapsScraperAdapter.js';
import { SCRAPING_JOB_STATUS, SCRAPING_ERROR_CODES, ScrapingError, ScrapingJobError } from './ScrapingErrors.js';
import { config } from '../config/env.js';

// Try to use Redis for persistence, fall back to in-memory
let RedisClient = null;
try {
  RedisClient = await import('ioredis');
} catch {
  // Redis not available, will use in-memory store
}

const JOB_TTL_SECONDS = 86400 * 7; // 7 days
const MAX_RETRIES = parseInt(process.env.GOOGLE_MAPS_SCRAPER_JOB_RETRIES || '2', 10);
const RETRY_BASE_DELAY_MS = 5000;

export class ScrapingJobManager {
  constructor(options = {}) {
    this.adapter = options.adapter || new GoogleMapsScraperAdapter();
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
    
    // Initialize Redis if available
    this._redis = null;
    this._memoryStore = new Map(); // Fallback in-memory store
    this._initRedis();
  }

  async _initRedis() {
    if (RedisClient && config?.redis?.url) {
      try {
        this._redis = new RedisClient.default(config.redis.url);
        this._redis.on('error', (err) => {
          console.warn('[ScrapingJobManager] Redis connection error, falling back to memory:', err.message);
          this._redis = null;
        });
        await this._redis.ping();
        console.log('[ScrapingJobManager] Redis connected for job persistence');
      } catch (error) {
        console.warn('[ScrapingJobManager] Redis unavailable, using in-memory store:', error.message);
        this._redis = null;
      }
    }
  }

  /**
   * Submit a new scraping job.
   * 
   * @param {Object} input - Job input
   * @param {string[]} input.queries - Search queries or URLs
   * @param {Object} [input.config] - Scraper config overrides
   * @param {Object} [input.metadata] - Additional metadata
   * @returns {Promise<Object>} Created job { jobId, status }
   */
  async submitJob(input) {
    const jobId = this._generateJobId();
    const now = new Date().toISOString();
    
    const job = {
      jobId,
      status: SCRAPING_JOB_STATUS.PENDING,
      queries: input.queries,
      config: input.config || {},
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      maxRetries: this.maxRetries,
      progress: 0,
      totalPlaces: 0,
      completedPlaces: 0,
      failedPlaces: 0,
      error: null,
      results: null,
      scraperJobId: null,
    };
    
    await this._saveJob(job);
    return { jobId, status: job.status };
  }

  /**
   * Get job by ID.
   * 
   * @param {string} jobId 
   * @returns {Promise<Object|null>} Job or null if not found
   */
  async getJob(jobId) {
    return await this._loadJob(jobId);
  }

  /**
   * Start job execution (transitions to QUEUED/SCRAPING).
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Updated job
   */
  async startJob(jobId) {
    const job = await this._loadJob(jobId);
    if (!job) {
      throw new ScrapingJobError('Job not found', SCRAPING_ERROR_CODES.JOB_NOT_FOUND, jobId);
    }
    
    if (job.status !== SCRAPING_JOB_STATUS.PENDING && job.status !== SCRAPING_JOB_STATUS.RETRYING) {
      throw new ScrapingJobError(`Cannot start job in status: ${job.status}`, SCRAPING_ERROR_CODES.JOB_ALREADY_COMPLETED, jobId);
    }
    
    job.status = SCRAPING_JOB_STATUS.QUEUED;
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    await this._saveJob(job);
    
    // Execute asynchronously
    this._executeJob(jobId).catch(err => {
      console.error(`[ScrapingJobManager] Job ${jobId} execution failed:`, err);
    });
    
    return job;
  }

  /**
   * Execute the scraping job.
   * @private
   */
  async _executeJob(jobId) {
    const job = await this._loadJob(jobId);
    if (!job) return;
    
    try {
      job.status = SCRAPING_JOB_STATUS.SCRAPING;
      job.updatedAt = new Date().toISOString();
      await this._saveJob(job);
      
      // Submit to scraper
      const scraperResponse = await this.adapter.submitJob({
        queries: job.queries,
        config: job.config,
      });
      
      job.scraperJobId = scraperResponse.jobId;
      job.status = SCRAPING_JOB_STATUS.SCRAPING;
      job.updatedAt = new Date().toISOString();
      await this._saveJob(job);
      
      // Poll for completion
      const results = await this.adapter.waitForCompletion(scraperResponse.jobId, {
        pollIntervalMs: 5000,
        maxWaitMs: this.adapter.timeoutMs,
        onProgress: (scraperJob) => {
          this._updateJobProgress(jobId, scraperJob);
        },
      });
      
      // Normalize results
      job.status = SCRAPING_JOB_STATUS.NORMALIZING;
      job.updatedAt = new Date().toISOString();
      await this._saveJob(job);
      
      // Results are already normalized by adapter
      job.results = results;
      job.totalPlaces = results.totalCount;
      job.completedPlaces = results.businesses.length;
      job.status = SCRAPING_JOB_STATUS.COMPLETED;
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;
      job.progress = 100;
      await this._saveJob(job);
      
    } catch (error) {
      await this._handleJobError(jobId, error);
    }
  }

  /**
   * Update job progress from scraper polling.
   * @private
   */
  async _updateJobProgress(jobId, scraperJob) {
    const job = await this._loadJob(jobId);
    if (!job) return;
    
    job.progress = scraperJob.progress || 0;
    job.totalPlaces = scraperJob.totalPlaces || 0;
    job.completedPlaces = scraperJob.completedPlaces || 0;
    job.failedPlaces = scraperJob.failedPlaces || 0;
    job.updatedAt = new Date().toISOString();
    await this._saveJob(job);
  }

  /**
   * Handle job execution error with retry logic.
   * @private
   */
  async _handleJobError(jobId, error) {
    const job = await this._loadJob(jobId);
    if (!job) return;
    
    const scrapingError = ScrapingError.fromApiError(error, { jobId });
    
    // Check if we should retry
    const isRetryable = this._isRetryableError(scrapingError.code);
    const canRetry = job.attempts < job.maxRetries && isRetryable;
    
    if (canRetry) {
      job.status = SCRAPING_JOB_STATUS.RETRYING;
      job.error = scrapingError.toJSON();
      job.updatedAt = new Date().toISOString();
      await this._saveJob(job);
      
      // Exponential backoff
      const delay = this.retryBaseDelayMs * Math.pow(2, job.attempts - 1);
      await this._sleep(delay);
      
      // Retry
      return this._executeJob(jobId);
    }
    
    // No more retries or non-retryable error
    job.status = SCRAPING_JOB_STATUS.FAILED;
    job.error = scrapingError.toJSON();
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    await this._saveJob(job);
  }

  /**
   * Check if error code is retryable.
   * @private
   */
  _isRetryableError(code) {
    const retryableCodes = [
      SCRAPING_ERROR_CODES.SCRAPER_UNREACHABLE,
      SCRAPING_ERROR_CODES.CONNECTION_TIMEOUT,
      SCRAPING_ERROR_CODES.CONNECTION_REFUSED,
      SCRAPING_ERROR_CODES.API_ERROR,
      SCRAPING_ERROR_CODES.RATE_LIMITED,
      SCRAPING_ERROR_CODES.WORKER_CRASHED,
      SCRAPING_ERROR_CODES.WORKER_BUSY,
      SCRAPING_ERROR_CODES.JOB_TIMEOUT,
    ];
    return retryableCodes.includes(code);
  }

  /**
   * Cancel a job.
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelJob(jobId) {
    const job = await this._loadJob(jobId);
    if (!job) {
      throw new ScrapingJobError('Job not found', SCRAPING_ERROR_CODES.JOB_NOT_FOUND, jobId);
    }
    
    if (job.status === SCRAPING_JOB_STATUS.COMPLETED || 
        job.status === SCRAPING_JOB_STATUS.FAILED ||
        job.status === SCRAPING_JOB_STATUS.CANCELLED) {
      throw new ScrapingJobError(`Cannot cancel job in status: ${job.status}`, SCRAPING_ERROR_CODES.JOB_ALREADY_COMPLETED, jobId);
    }
    
    // Cancel scraper job if exists
    if (job.scraperJobId) {
      try {
        await this.adapter.cancelJob(job.scraperJobId);
      } catch (error) {
        console.warn(`[ScrapingJobManager] Failed to cancel scraper job ${job.scraperJobId}:`, error.message);
      }
    }
    
    job.status = SCRAPING_JOB_STATUS.CANCELLED;
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    await this._saveJob(job);
    
    return { jobId, status: job.status };
  }

  /**
   * Retry a failed job.
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Retried job
   */
  async retryJob(jobId) {
    const job = await this._loadJob(jobId);
    if (!job) {
      throw new ScrapingJobError('Job not found', SCRAPING_ERROR_CODES.JOB_NOT_FOUND, jobId);
    }
    
    if (job.status !== SCRAPING_JOB_STATUS.FAILED) {
      throw new ScrapingJobError(`Can only retry failed jobs, current status: ${job.status}`, SCRAPING_ERROR_CODES.INVALID_CONFIG, jobId);
    }
    
    // Reset for retry
    job.status = SCRAPING_JOB_STATUS.RETRYING;
    job.error = null;
    job.updatedAt = new Date().toISOString();
    job.attempts = 0;
    await this._saveJob(job);
    
    return this.startJob(jobId);
  }

  /**
   * List jobs with optional filters.
   * 
   * @param {Object} filters
   * @returns {Promise<Array>} Job list
   */
  async listJobs(filters = {}) {
    if (this._redis) {
      // Use Redis pattern matching for efficient listing
      const pattern = `scraping:job:*`;
      const keys = await this._redis.keys(pattern);
      const jobs = [];
      
      for (const key of keys) {
        const job = await this._redis.get(key);
        if (job) {
          const parsed = JSON.parse(job);
          if (this._matchesFilters(parsed, filters)) {
            jobs.push(this._summarizeJob(parsed));
          }
        }
      }
      
      // Sort by createdAt descending
      jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      if (filters.limit) {
        return jobs.slice(filters.offset || 0, (filters.offset || 0) + filters.limit);
      }
      return jobs;
    }
    
    // In-memory fallback
    let jobs = Array.from(this._memoryStore.values());
    jobs = jobs.filter(j => this._matchesFilters(j, filters));
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (filters.limit) {
      return jobs.slice(filters.offset || 0, (filters.offset || 0) + filters.limit);
    }
    return jobs.map(j => this._summarizeJob(j));
  }

  /**
   * Get job results (only for completed jobs).
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Job results
   */
  async getResults(jobId) {
    const job = await this._loadJob(jobId);
    if (!job) {
      throw new ScrapingJobError('Job not found', SCRAPING_ERROR_CODES.JOB_NOT_FOUND, jobId);
    }
    
    if (job.status !== SCRAPING_JOB_STATUS.COMPLETED) {
      throw new ScrapingJobError(`Results only available for completed jobs, current status: ${job.status}`, SCRAPING_ERROR_CODES.JOB_ALREADY_COMPLETED, jobId);
    }
    
    return job.results;
  }

  /**
   * Delete a job.
   * 
   * @param {string} jobId 
   * @returns {Promise<boolean>} Success
   */
  async deleteJob(jobId) {
    if (this._redis) {
      const result = await this._redis.del(`scraping:job:${jobId}`);
      return result > 0;
    }
    
    return this._memoryStore.delete(jobId);
  }

  /**
   * Cleanup old jobs.
   * 
   * @param {number} maxAgeMs - Maximum age in milliseconds
   * @returns {Promise<number>} Number of deleted jobs
   */
  async cleanup(maxAgeMs = JOB_TTL_SECONDS * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;
    
    if (this._redis) {
      const pattern = `scraping:job:*`;
      const keys = await this._redis.keys(pattern);
      
      for (const key of keys) {
        const job = await this._redis.get(key);
        if (job) {
          const parsed = JSON.parse(job);
          if (new Date(parsed.createdAt).getTime() < cutoff) {
            await this._redis.del(key);
            deleted++;
          }
        }
      }
    } else {
      for (const [jobId, job] of this._memoryStore.entries()) {
        if (new Date(job.createdAt).getTime() < cutoff) {
          this._memoryStore.delete(jobId);
          deleted++;
        }
      }
    }
    
    return deleted;
  }

  /**
   * Get job statistics.
   * 
   * @returns {Promise<Object>} Stats
   */
  async getStats() {
    const jobs = await this.listJobs({ limit: 10000 });
    
    const stats = {
      total: jobs.length,
      byStatus: {},
      totalPlaces: 0,
      completedPlaces: 0,
      failedPlaces: 0,
    };
    
    for (const job of jobs) {
      stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
      stats.totalPlaces += job.totalPlaces || 0;
      stats.completedPlaces += job.completedPlaces || 0;
      stats.failedPlaces += job.failedPlaces || 0;
    }
    
    return stats;
  }

  // Private storage methods
  
  async _saveJob(job) {
    const key = `scraping:job:${job.jobId}`;
    const value = JSON.stringify(job);
    
    if (this._redis) {
      await this._redis.setex(key, JOB_TTL_SECONDS, value);
    } else {
      this._memoryStore.set(job.jobId, job);
    }
  }

  async _loadJob(jobId) {
    const key = `scraping:job:${jobId}`;
    
    if (this._redis) {
      const value = await this._redis.get(key);
      return value ? JSON.parse(value) : null;
    }
    
    return this._memoryStore.get(jobId) || null;
  }

  _matchesFilters(job, filters) {
    if (filters.status && job.status !== filters.status) return false;
    if (filters.fromDate && new Date(job.createdAt) < new Date(filters.fromDate)) return false;
    if (filters.toDate && new Date(job.createdAt) > new Date(filters.toDate)) return false;
    return true;
  }

  _summarizeJob(job) {
    return {
      jobId: job.jobId,
      status: job.status,
      queries: job.queries,
      progress: job.progress,
      totalPlaces: job.totalPlaces,
      completedPlaces: job.completedPlaces,
      failedPlaces: job.failedPlaces,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      error: job.error ? { code: job.error.code, message: job.error.message } : null,
    };
  }

  _generateJobId() {
    return randomUUID();
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources.
   */
  async destroy() {
    if (this._redis) {
      await this._redis.quit();
      this._redis = null;
    }
    this._memoryStore.clear();
    this.adapter.destroy();
  }
}

export default ScrapingJobManager;