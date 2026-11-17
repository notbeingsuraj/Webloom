/**
 * Google Maps Scraper Adapter — Webloom integration for gosom/google-maps-scraper
 * 
 * This adapter communicates with the gosom/google-maps-scraper REST API
 * running as a separate Dockerized worker service.
 * 
 * Upstream: https://github.com/gosom/google-maps-scraper
 * REST API: http://localhost:8080/api/v1 (when running in web server mode)
 * 
 * Job lifecycle: PENDING -> QUEUED -> SCRAPING -> NORMALIZING -> ENRICHING -> COMPLETED
 * Also supports: FAILED, PARTIAL, CANCELLED, RETRYING
 */

import { config } from '../config/env.js';
import { SCRAPING_JOB_STATUS, SCRAPING_ERROR_CODES } from './ScrapingErrors.js';

const DEFAULT_SCRAPER_URL = process.env.GOOGLE_MAPS_SCRAPER_URL || 'http://localhost:8080';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.GOOGLE_MAPS_SCRAPER_TIMEOUT_MS || '180000', 10);
const DEFAULT_CONCURRENCY = parseInt(process.env.GOOGLE_MAPS_SCRAPER_CONCURRENCY || '2', 10);
const DEFAULT_MAX_RESULTS = parseInt(process.env.GOOGLE_MAPS_SCRAPER_MAX_RESULTS || '100', 10);
const DEFAULT_JOB_RETRIES = parseInt(process.env.GOOGLE_MAPS_SCRAPER_JOB_RETRIES || '2', 10);
const EMAIL_EXTRACTION = process.env.GOOGLE_MAPS_SCRAPER_EMAIL_EXTRACTION === 'true';
const EXTRA_REVIEWS = process.env.GOOGLE_MAPS_SCRAPER_EXTRA_REVIEWS === 'true';

export class GoogleMapsScraperAdapter {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_SCRAPER_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.defaultConcurrency = options.concurrency || DEFAULT_CONCURRENCY;
    this.defaultMaxResults = options.maxResults || DEFAULT_MAX_RESULTS;
    this.defaultJobRetries = options.jobRetries || DEFAULT_JOB_RETRIES;
    this.emailExtraction = options.emailExtraction !== undefined ? options.emailExtraction : EMAIL_EXTRACTION;
    this.extraReviews = options.extraReviews !== undefined ? options.extraReviews : EXTRA_REVIEWS;
    
    this._abortController = null;
    this._pollInterval = null;
  }

  /**
   * Submit a scraping job to the scraper worker.
   * 
   * @param {Object} options - Job configuration
   * @param {string[]} options.queries - Search queries or Google Maps URLs (one per line)
   * @param {Object} [options.config] - Scraper configuration overrides
   * @returns {Promise<Object>} Job creation response { jobId, status }
   */
  async submitJob({ queries, config = {} }) {
    if (!queries || !queries.length) {
      throw new Error('At least one query is required');
    }

    const inputText = queries.join('\n');
    
    const payload = {
      input: inputText,
      // Core options
      depth: config.depth ?? 1,
      c: config.concurrency ?? this.defaultConcurrency,
      max_results: config.maxResults ?? this.defaultMaxResults,
      // Output format
      json: true,
      // Feature flags
      email: config.emailExtraction ?? this.emailExtraction,
      extra_reviews: config.extraReviews ?? this.extraReviews,
      // Language/location
      lang: config.lang || 'en',
      geo: config.geo || null,
      zoom: config.zoom || 15,
      radius: config.radius || 10000,
      // Resume
      resume: config.resume ?? false,
      // Fast mode
      fast_mode: config.fastMode ?? false,
      // Grid scraping
      grid_bbox: config.gridBbox || null,
      grid_cell: config.gridCell || 1.0,
      grid_strict: config.gridStrict ?? false,
      // Advanced
      exit_on_inactivity: config.exitOnInactivity || '3m',
      pages_per_browser: config.pagesPerBrowser || 1,
      browser_pool_size: config.browserPoolSize || 0,
    };

    // Remove null/undefined values
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === undefined) {
        delete payload[key];
      }
    });

    const response = await this._request('POST', '/api/v1/jobs', payload);
    
    return {
      jobId: response.id,
      status: response.status,
      createdAt: response.created_at,
    };
  }

  /**
   * Get job status and details.
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Job details
   */
  async getJob(jobId) {
    const response = await this._request('GET', `/api/v1/jobs/${jobId}`);
    return this._normalizeJobResponse(response);
  }

  /**
   * Get job results (when completed).
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Job results with businesses array
   */
  async getResults(jobId) {
    const response = await this._request('GET', `/api/v1/jobs/${jobId}/download`);
    return this._normalizeResultsResponse(response);
  }

  /**
   * Cancel a running job.
   * 
   * @param {string} jobId 
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelJob(jobId) {
    const response = await this._request('DELETE', `/api/v1/jobs/${jobId}`);
    return { jobId, status: response.status };
  }

  /**
   * List all jobs.
   * 
   * @param {Object} [filters] - Optional filters
   * @returns {Promise<Array>} Array of job summaries
   */
  async listJobs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await this._request('GET', `/api/v1/jobs${queryString}`);
    return response.jobs || response || [];
  }

  /**
   * Wait for job completion with polling.
   * 
   * @param {string} jobId 
   * @param {Object} [options]
   * @param {number} [options.pollIntervalMs=5000] - Poll interval
   * @param {number} [options.maxWaitMs=300000] - Maximum wait time
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Object>} Final job result
   */
  async waitForCompletion(jobId, options = {}) {
    const pollIntervalMs = options.pollIntervalMs || 5000;
    const maxWaitMs = options.maxWaitMs || this.timeoutMs;
    const onProgress = options.onProgress;
    
    const startedAt = Date.now();
    
    while (Date.now() - startedAt < maxWaitMs) {
      const job = await this.getJob(jobId);
      
      if (onProgress) {
        onProgress(job);
      }
      
      if (job.status === SCRAPING_JOB_STATUS.COMPLETED) {
        return await this.getResults(jobId);
      }
      
      if (job.status === SCRAPING_JOB_STATUS.FAILED) {
        throw new Error(`Scraping job failed: ${job.error || 'Unknown error'}`);
      }
      
      if (job.status === SCRAPING_JOB_STATUS.CANCELLED) {
        throw new Error('Scraping job was cancelled');
      }
      
      // Still running - wait and poll again
      await this._sleep(pollIntervalMs);
    }
    
    throw new Error(`Scraping job timed out after ${maxWaitMs}ms`);
  }

  /**
   * Submit a single-business scraping job (direct Google Maps place URL).
   * 
   * @param {string} placeUrl - Google Maps place URL
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Scraped business data
   */
  async scrapeSingleBusiness(placeUrl, options = {}) {
    const job = await this.submitJob({
      queries: [placeUrl],
      config: {
        depth: 1,
        c: 1,
        maxResults: 1,
        fastMode: false,
        ...options,
      },
    });
    
    return await this.waitForCompletion(job.jobId, {
      pollIntervalMs: 3000,
      maxWaitMs: this.timeoutMs,
      onProgress: options.onProgress,
    });
  }

  /**
   * Submit a multi-business discovery job (search query + location).
   * 
   * @param {Object} options
   * @param {string} options.query - Search query (e.g., "dentists in Berlin")
   * @param {string} [options.location] - Location bias (e.g., "Berlin, Germany")
   * @param {number} [options.maxResults] - Maximum results
   * @param {number} [options.depth] - Scroll depth
   * @returns {Promise<Object>} Scraped businesses
   */
  async scrapeMultiBusiness({ query, location, maxResults, depth, ...options }) {
    const searchQuery = location ? `${query} in ${location}` : query;
    
    const job = await this.submitJob({
      queries: [searchQuery],
      config: {
        depth: depth || 1,
        c: this.defaultConcurrency,
        maxResults: maxResults || this.defaultMaxResults,
        fastMode: options.fastMode ?? false,
        geo: options.geo || null,
        zoom: options.zoom || 15,
        radius: options.radius || 10000,
        ...options,
      },
    });
    
    return await this.waitForCompletion(job.jobId, {
      pollIntervalMs: 5000,
      maxWaitMs: this.timeoutMs,
      onProgress: options.onProgress,
    });
  }

  /**
   * Check scraper worker health.
   * 
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await this._request('GET', '/api/v1/health', null, { timeoutMs: 5000 });
      return {
        healthy: true,
        status: response.status || 'ok',
        version: response.version || null,
        uptime: response.uptime || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unreachable',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get scraper worker metrics.
   * 
   * @returns {Promise<Object>} Metrics
   */
  async getMetrics() {
    try {
      const response = await this._request('GET', '/api/v1/metrics');
      return response;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Internal HTTP request with timeout and error handling.
   * 
   * @private
   */
  async _request(method, path, body = null, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    
    this._abortController = new AbortController();
    const timeoutId = setTimeout(() => this._abortController.abort(), timeoutMs);
    
    try {
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: this._abortController.signal,
      };
      
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Normalize job response from API.
   * @private
   */
  _normalizeJobResponse(response) {
    return {
      jobId: response.id,
      status: response.status,
      progress: response.progress || 0,
      totalPlaces: response.total_places || 0,
      completedPlaces: response.completed_places || 0,
      failedPlaces: response.failed_places || 0,
      createdAt: response.created_at,
      startedAt: response.started_at,
      completedAt: response.completed_at,
      error: response.error || null,
      config: response.config || null,
    };
  }

  /**
   * Normalize results response from API.
   * @private
   */
  _normalizeResultsResponse(response) {
    // Handle both array (direct results) and object with businesses key
    let businesses = [];
    if (Array.isArray(response)) {
      businesses = response;
    } else if (response && Array.isArray(response.businesses)) {
      businesses = response.businesses;
    } else if (response && Array.isArray(response.results)) {
      businesses = response.results;
    } else if (response && response.data && Array.isArray(response.data)) {
      businesses = response.data;
    }
    
    return {
      businesses: businesses.map(b => this._normalizeBusiness(b)),
      totalCount: businesses.length,
      jobId: response.id || response.job_id || null,
    };
  }

  /**
   * Normalize a single business from scraper output.
   * @private
   */
  _normalizeBusiness(business) {
    // Map scraper field names to canonical names
    return {
      // Identity
      name: business.title || business.name || null,
      placeId: business.place_id || business.data_id || null,
      cid: business.cid || null,
      dataId: business.data_id || null,
      googleMapsUrl: business.link || null,
      category: business.category || null,
      categories: business.categories || [],
      description: business.descriptions || business.about || null,
      
      // Contact
      phone: business.phone || null,
      website: business.website || null,
      emails: business.emails || [],
      
      // Location
      address: business.address || null,
      fullAddress: business.complete_address || business.address || null,
      street: null, // Not directly provided
      city: null, // Would need to parse from address
      state: null,
      country: null,
      postalCode: null,
      coordinates: (business.latitude && business.longitude) ? {
        lat: parseFloat(business.latitude),
        lng: parseFloat(business.longitude),
      } : null,
      plusCode: business.plus_code || null,
      
      // Business intelligence
      rating: business.review_rating ? parseFloat(business.review_rating) : null,
      reviewCount: business.review_count ? parseInt(business.review_count, 10) : null,
      reviewsPerRating: business.reviews_per_rating || null,
      openingHours: business.open_hours || null,
      popularTimes: business.popular_times || null,
      status: business.status || null, // open/closed/temporary
      priceRange: business.price_range || null,
      timezone: business.timezone || null,
      creditCardsAccepted: business.credit_cards_accepted || [],
      about: business.about || null,
      
      // Reviews
      reviews: business.user_reviews || [],
      reviewsExtended: business.user_reviews_extended || [],
      reviewCollection: business.review_collection || null,
      
      // Media
      thumbnail: business.thumbnail || null,
      images: business.images || [],
      streetViewUrl: business.street_view_url || null,
      
      // Links
      reviewsLink: business.reviews_link || null,
      reservationsLink: business.reservations || null,
      orderOnlineLink: business.order_online || null,
      menuLink: business.menu || null,
      
      // Meta
      ownerClaimed: business.owner === true,
      inputId: business.input_id || null,
      
      // Raw data for traceability
      _raw: business,
      _scrapedAt: new Date().toISOString(),
      _source: 'google_maps_scraper',
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup any pending requests.
   */
  destroy() {
    if (this._abortController) {
      this._abortController.abort();
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
    }
  }
}

export default GoogleMapsScraperAdapter;