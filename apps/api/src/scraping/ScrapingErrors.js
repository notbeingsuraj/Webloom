/**
 * Scraping Error Types and Status Codes
 * 
 * Standardized error codes for the Google Maps scraping pipeline.
 * Used across adapter, job manager, normalizer, and health monitor.
 */

export const SCRAPING_JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  QUEUED: 'queued',
  SCRAPING: 'scraping',
  NORMALIZING: 'normalizing',
  ENRICHING: 'enriching',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PARTIAL: 'partial',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying',
});

export const SCRAPING_ERROR_CODES = Object.freeze({
  // Configuration errors
  SCRAPER_NOT_CONFIGURED: 'scraper_not_configured',
  INVALID_CONFIG: 'invalid_config',
  MISSING_QUERIES: 'missing_queries',
  
  // Network/connection errors
  SCRAPER_UNREACHABLE: 'scraper_unreachable',
  CONNECTION_TIMEOUT: 'connection_timeout',
  CONNECTION_REFUSED: 'connection_refused',
  
  // API errors
  API_ERROR: 'api_error',
  INVALID_RESPONSE: 'invalid_response',
  JOB_NOT_FOUND: 'job_not_found',
  JOB_ALREADY_COMPLETED: 'job_already_completed',
  
  // Job execution errors
  JOB_FAILED: 'job_failed',
  JOB_CANCELLED: 'job_cancelled',
  JOB_TIMEOUT: 'job_timeout',
  NO_RESULTS: 'no_results',
  
  // Validation errors
  INVALID_URL: 'invalid_url',
  INVALID_QUERY: 'invalid_query',
  EXCEEDS_LIMITS: 'exceeds_limits',
  
  // Rate limiting
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',
  
  // Data errors
  PARSE_ERROR: 'parse_error',
  NORMALIZATION_ERROR: 'normalization_error',
  DEDUPLICATION_ERROR: 'deduplication_error',
  
  // Worker errors
  WORKER_CRASHED: 'worker_crashed',
  WORKER_BUSY: 'worker_busy',
  WORKER_MAINTENANCE: 'worker_maintenance',
});

export class ScrapingError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ScrapingError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
  
  static fromApiError(error, context = {}) {
    if (error?.code) {
      return new ScrapingError(error.message, error.code, { ...context, ...error.details });
    }
    
    const message = error?.message || String(error);
    
    // Classify common error patterns
    if (message.includes('ECONNREFUSED') || message.includes('connection refused')) {
      return new ScrapingError('Scraper worker unreachable', SCRAPING_ERROR_CODES.CONNECTION_REFUSED, context);
    }
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return new ScrapingError('Scraper request timed out', SCRAPING_ERROR_CODES.CONNECTION_TIMEOUT, context);
    }
    if (message.includes('404') || message.includes('not found')) {
      return new ScrapingError('Job not found', SCRAPING_ERROR_CODES.JOB_NOT_FOUND, context);
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return new ScrapingError('Rate limited by scraper', SCRAPING_ERROR_CODES.RATE_LIMITED, context);
    }
    if (message.includes('500') || message.includes('503')) {
      return new ScrapingError('Scraper worker error', SCRAPING_ERROR_CODES.API_ERROR, context);
    }
    
    return new ScrapingError(message, SCRAPING_ERROR_CODES.API_ERROR, context);
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export class ScrapingJobError extends ScrapingError {
  constructor(message, code, jobId, details = {}) {
    super(message, code, { ...details, jobId });
    this.name = 'ScrapingJobError';
    this.jobId = jobId;
  }
}

export class ScrapingValidationError extends ScrapingError {
  constructor(message, field, details = {}) {
    super(message, SCRAPING_ERROR_CODES.INVALID_CONFIG, { ...details, field });
    this.name = 'ScrapingValidationError';
    this.field = field;
  }
}