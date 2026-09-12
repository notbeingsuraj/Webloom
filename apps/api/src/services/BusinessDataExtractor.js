/**
 * BusinessDataExtractor - New Architecture
 * 
 * Extracts business information from Google Maps URLs using ONLY:
 * 1. GoogleMapsUrlParserProvider - parses URL for identifiers (NO network calls)
 * 2. OfficialWebsiteProvider - fetches and extracts from official website
 * 3. UserProvidedDataProvider - accepts explicit user data
 * 
 * NO Google Places API, NO Google Maps API, NO Google billing required.
 * 
 * Pipeline:
 * Input (Google Maps URL)
 *   ↓
 * GoogleMapsUrlParserProvider.parse() → Identified hints
 *   ↓
 * DiscoveryProvider.discover() → Candidate official website URLs (pluggable)
 *   ↓
 * OfficialWebsiteProvider.extract() → Discovered/Verified data from official website
 *   ↓
 * BusinessProfile.merge() → Normalized profile with provenance
 */

import axios from 'axios';
import { createHash } from 'crypto';
import GoogleMapsUrlParserProvider from './GoogleMapsUrlParserProvider.js';
import OfficialWebsiteProvider from './OfficialWebsiteProvider.js';
import UserProvidedDataProvider from './UserProvidedDataProvider.js';
import BusinessProfile from './BusinessProfile.js';
import { config } from '../config/env.js';
import {
  createAcquisitionResult,
  classifyEmptyAcquisition,
  hasIdentityEvidence,
  ACQUISITION_STATUS,
  normalizeErrorCode
} from './AcquisitionResult.js';
import { normalizeField, stripObjectToString } from './FieldNormalizer.js';
import { getSourceCache } from '../db/SourceCache.js';
import { validateFetchUrl } from '../utils/ssrfValidator.js';

// PHASE 20: in-memory extraction cache replaced by persistent SQLite SourceCache.
// Survives process restart, supports TTL, and keeps SOURCE cache identity
// separate from provider record identity and business entity identity (#17).
// _sourceCache is lazily initialized to keep 'source-cache.db' out of the
// way for tests that call getCacheKey/normalizeUrl without touching the cache.

class BusinessDataExtractor {
  constructor() {
    this.client = axios.create({
      timeout: config.extraction.timeout,
      headers: {
        'User-Agent': config.extraction.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    });

    // Separate client for r.jina.ai proxy (no redirects, simpler)
    this.proxyClient = axios.create({
      timeout: config.extraction.timeout,
      headers: {
        'User-Agent': config.extraction.userAgent,
        'Accept': 'text/plain, text/markdown, */*',
      },
      maxRedirects: 3,
      validateStatus: (status) => status < 500,
    });

    // Initialize providers
    this.websiteProvider = new OfficialWebsiteProvider();
    this.parser = GoogleMapsUrlParserProvider;
    // Lazy SourceCache singleton (SQLite-backed, persistent across restarts)
    this._cache = null;
  }

  _cacheInstance() {
    if (!this._cache) {
      this._cache = getSourceCache();
    }
    return this._cache;
  }

  /**
   * Normalize Google Maps URL for consistent caching
   */
  normalizeUrl(url) {
    return this.parser.normalizeUrl(url);
  }

  /**
   * Generate cache key from normalized URL
   */
  getCacheKey(url) {
    const normalized = this.normalizeUrl(url);
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check cache for existing extraction (SQLite-backed, TTL-aware)
   *
   * @returns {Object|null} the stored extraction result (with cached flags),
   *   or null on miss. Backward compatible with prior in-memory cache which
   *   returned the extraction result object directly.
   */
  getCachedExtraction(url) {
    const normalized = this.normalizeUrl(url);
    const entry = this._cacheInstance().get(normalized, 'web_extraction');
    if (entry) {
      // entry.result is the stored wrapper { data, timestamp, normalizedUrl }.
      // Spread the underlying data result and surface cached metadata.
      const data = entry.result?.data || entry.result;
      if (data && typeof data === 'object') {
        return {
          ...data,
          cached: true,
          cachedAt: entry.retrievedAt,
        };
      }
    }
    return null;
  }

  /**
   * Store extraction in cache (SQLite-backed, TTL-aware)
   */
  setCachedExtraction(url, data) {
    const normalized = this.normalizeUrl(url);
    const wrap = {
      data,
      timestamp: new Date().toISOString(),
      normalizedUrl: normalized,
    };
    this._cacheInstance().set(normalized, wrap, { provider: 'web_extraction' });
  }

  /**
   * Validate if URL is a Google Maps URL
   */
  validateGoogleMapsUrl(url) {
    return this.parser.validateGoogleMapsUrl(url);
  }

  /**
   * Extract place ID from Google Maps URL
   */
  extractPlaceId(url) {
    return this.parser.extractPlaceId(url);
  }

  /**
   * Extract place name from URL path
   */
  extractPlaceName(url) {
    return this.parser.extractPlaceName(url);
  }

  /**
   * Fetch page content with retries using r.jina.ai proxy
   */
  async fetchPage(url, retryCount = 0) {
    // Validate URL against centralized SSRF policy
    validateFetchUrl(url);

    // Use jina.ai proxy to extract content from JavaScript-rendered pages
    const proxyUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;

    try {
      const response = await this.proxyClient.get(proxyUrl);
      return {
        url,
        html: response.data,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      if (error.response) {
        return {
          url,
          html: error.response.data || '',
          status: error.response.status,
          headers: error.response.headers,
          error: error.message,
        };
      }

      if (retryCount < config.extraction.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.fetchPage(url, retryCount + 1);
      }

      throw new Error(`Failed to fetch page: ${error.message}`);
    }
  }

  /**
   * Extract structured metadata from page (from Google Maps page via proxy)
   */
  extractMetadata(html) {
    return {
      jsonLd: this.extractJsonLd(html),
      microdata: this.extractMicrodata(html),
      openGraph: this.extractOpenGraph(html),
      visibleText: this.extractVisibleText(html),
    };
  }

  extractJsonLd(html) {
    const results = [];
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        results.push(json);
      } catch {
        // Ignore invalid JSON-LD
      }
    }
    return results;
  }

  extractMicrodata(html) {
    const results = {};
    const itemPropRegex = /itemprop=["']([^"']+)["'][^>]*>([^<]*)</gi;
    let match;
    while ((match = itemPropRegex.exec(html)) !== null) {
      const prop = match[1];
      const value = match[2].trim();
      if (value && !results[prop]) {
        results[prop] = value;
      }
    }
    return results;
  }

  extractOpenGraph(html) {
    const results = {};
    const regex = /<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']*)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      results[match[1]] = match[2];
    }
    return results;
  }

  extractVisibleText(html) {
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.substring(0, 15000);
  }

  /**
   * Direct Google Maps HTML extraction when r.jina.ai proxy fails
   * Fetches Google Maps directly with browser-like headers and extracts
   * business data from the initial HTML/JSON state
   * @private
   */
  async extractFromDirectGoogleMapsHtml(googleMapsUrl) {
    console.log('[BusinessDataExtractor] Fetching Google Maps directly with browser headers...');
    try {
      const response = await this.client.get(googleMapsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 15000,
        validateStatus: (status) => status < 500,
      });

      const html = response.data;
      
      // Parse metadata from the direct HTML
      const metadata = this.extractMetadata(html);
      metadata.sourceUrl = googleMapsUrl;

      // Extract additional data from Google Maps' embedded JSON state
      const embeddedData = this.extractGoogleMapsEmbeddedData(html);
      if (embeddedData) {
        metadata.embedded = embeddedData;
      }

      // Extract phone numbers, addresses, ratings from visible text and embedded data
      const extractedFields = this.extractFieldsFromDirectHtml(html, embeddedData);
      metadata.extractedFields = extractedFields;

      return metadata;
    } catch (error) {
      console.error('[BusinessDataExtractor] Direct Google Maps extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Extract embedded JSON data from Google Maps initial state
   * Google Maps embeds business data in window.APP_INITIALIZATION_STATE
   * @private
   */
  extractGoogleMapsEmbeddedData(html) {
    try {
      // Look for the initialization state
      const matches = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);\s*window/);
      if (matches && matches[1]) {
        const state = JSON.parse(matches[1]);
        return state;
      }

      // Also check for other common patterns
      const altMatches = html.match(/window\.APP_OPTIONS\s*=\s*({[\s\S]*?});\s*window/);
      if (altMatches && altMatches[1]) {
        return JSON.parse(altMatches[1]);
      }

      return null;
    } catch (error) {
      console.log('[BusinessDataExtractor] Could not extract embedded JSON from Google Maps');
      return null;
    }
  }

  /**
   * Extract phone, address, rating, reviews from direct HTML and embedded data
   * @private
   */
  extractFieldsFromDirectHtml(html, embeddedData = null) {
    const fields = {
      phone: null,
      address: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      rating: null,
      reviewCount: null,
      reviews: [],
      hours: {},
    };

    const fullText = html;

    // Phone number extraction (Indian format + international)
    const phonePatterns = [
      /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g,  // Indian mobile
      /(?:\+91[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{4}/g,  // Indian landline
      /\b\d{10}\b/g,  // Raw 10 digits
    ];

    for (const pattern of phonePatterns) {
      const matches = fullText.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first valid-looking phone
        for (const match of matches) {
          const clean = match.replace(/[\s-]/g, '');
          if (clean.length >= 10) {
            fields.phone = match;
            break;
          }
        }
        if (fields.phone) break;
      }
    }

    // Address patterns - look for Indian address components
    const addressMatch = fullText.match(/[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+\s+\d{6}/);
    if (addressMatch) {
      fields.address = addressMatch[0];
      const parts = addressMatch[0].split(',').map(p => p.trim());
      if (parts.length >= 4) {
        fields.city = parts[parts.length - 3];
        fields.state = parts[parts.length - 2];
        const pinMatch = parts[parts.length - 1].match(/\d{6}/);
        if (pinMatch) fields.postalCode = pinMatch[0];
      }
    }

    // Rating extraction
    const ratingMatch = fullText.match(/(?:rating|Rating|★)\s*[:]\s*([0-9]\.[0-9])/);
    if (!ratingMatch) {
      // Try to find "4.1" style rating
      const ratingPatterns = [
        /"ratingValue"\s*:\s*"([0-9]\.[0-9])"/,
        /"rating"\s*:\s*([0-9]\.[0-9])/,
        /([0-9]\.[0-9])\s*out of\s*5/,
      ];
      for (const pattern of ratingPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          fields.rating = parseFloat(match[1]);
          break;
        }
      }
    } else {
      fields.rating = parseFloat(ratingMatch[1]);
    }

    // Review count
    const reviewCountMatch = fullText.match(/"reviewCount"\s*:\s*"([0-9,]+)"/);
    if (!reviewCountMatch) {
      const altPatterns = [
        /([0-9,]+)\s*(?:reviews|ratings)/i,
        /"review_count"\s*:\s*([0-9]+)/,
      ];
      for (const pattern of altPatterns) {
        const match = fullText.match(pattern);
        if (match) {
          fields.reviewCount = parseInt(match[1].replace(/,/g, ''), 10);
          break;
        }
      }
    } else {
      fields.reviewCount = parseInt(reviewCountMatch[1].replace(/,/g, ''), 10);
    }

    // Extract reviews if available in embedded data
    if (embeddedData) {
      try {
        // Google Maps stores reviews in various places in the state
        // This is a best-effort extraction
        const stateStr = JSON.stringify(embeddedData);
        const reviewMatches = stateStr.match(/"text"\s*:\s*"([^"]{20,500})"/g);
        if (reviewMatches) {
          for (const match of reviewMatches.slice(0, 10)) {
            const textMatch = match.match(/"text"\s*:\s*"([^"]+)"/);
            if (textMatch && textMatch[1] && textMatch[1].length > 10) {
              fields.reviews.push({
                text: textMatch[1].replace(/\\u003c[^>]*\\u003e/g, '').replace(/\\n/g, ' '),
                rating: null,
                author: null,
                date: null,
              });
            }
          }
        }
      } catch {
        // Ignore review extraction errors
      }
    }

    // Extract hours from embedded data if available
    if (embeddedData) {
      try {
        const stateStr = JSON.stringify(embeddedData);
        const hoursMatch = stateStr.match(/"openingHours"\s*:\s*({[\s\S]*?})/);
        if (hoursMatch) {
          const hoursData = JSON.parse(hoursMatch[1]);
          const dayMap = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          for (const day of dayMap) {
            if (hoursData[day]) {
              fields.hours[day] = hoursData[day];
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    return fields;
  }

  /**
   * Build AI extraction prompt from Google Maps page content
   */
  buildExtractionPrompt(metadata, sourceUrl) {
    const jsonLd = metadata.jsonLd.length > 0 ? JSON.stringify(metadata.jsonLd, null, 2) : 'None found';
    const microdata = Object.keys(metadata.microdata).length > 0 ? JSON.stringify(metadata.microdata, null, 2) : 'None found';
    const openGraph = Object.keys(metadata.openGraph).length > 0 ? JSON.stringify(metadata.openGraph, null, 2) : 'None found';
    const visibleText = metadata.visibleText || 'None extracted';

    return `You are a business information extractor. Analyze the following data retrieved from a Google Maps page and extract structured business information.

SOURCE URL: ${sourceUrl}

STRUCTURED METADATA (JSON-LD):
${jsonLd}

STRUCTURED METADATA (Microdata):
${microdata}

STRUCTURED METADATA (Open Graph):
${openGraph}

VISIBLE PAGE TEXT (truncated):
${visibleText}

Extract ONLY information that is explicitly present in the source data. Do NOT hallucinate or infer missing information. If a field cannot be determined, use null.

Return a JSON object with this exact schema:
{
  "business": {
    "name": null,
    "category": null,
    "categories": [],
    "description": null,
    "business_type": null
  },
  "contact": {
    "phone": null,
    "email": null,
    "website": null
  },
  "location": {
    "full_address": null,
    "street": null,
    "city": null,
    "state": null,
    "country": null,
    "postal_code": null,
    "latitude": null,
    "longitude": null
  },
  "ratings": {
    "rating": null,
    "review_count": null
  },
  "hours": {
    "monday": null,
    "tuesday": null,
    "wednesday": null,
    "thursday": null,
    "friday": null,
    "saturday": null,
    "sunday": null
  },
  "reviews": [],
  "services": [],
  "products": [],
  "amenities": [],
  "social_links": [],
  "pricing": null,
  "booking_url": null,
  "source_urls": [],
  "confidence": {
    "overall": null,
    "name": null,
    "category": null,
    "phone": null,
    "website": null,
    "address": null,
    "rating": null
  }
}

Rules:
- "source_urls" should include the original Google Maps URL
- "confidence" values should be 0.0 to 1.0 based on how clearly the information appears in the source
- For "reviews", only include reviews explicitly found in the source data with {author, rating, text, date}
- For "hours", use 24-hour format strings like "09:00-17:00" or "closed"
- For "categories", use specific business types from the data
\``;
  }

  /**
   * Extract structured business profile using AI (from Google Maps page content)
   */
  async extractWithAI(metadata, sourceUrl) {
    // Dynamic import to avoid circular deps
    const { default: AIService } = await import('./AIService.js');
    
    const prompt = this.buildExtractionPrompt(metadata, sourceUrl);
    
    const schema = {
      type: 'object',
      properties: {
        business: {
          type: 'object',
          properties: {
            name: { type: ['string', 'null'] },
            category: { type: ['string', 'null'] },
            categories: { type: 'array', items: { type: 'string' } },
            description: { type: ['string', 'null'] },
            business_type: { type: ['string', 'null'] }
          },
          required: ['name', 'category', 'categories', 'description', 'business_type']
        },
        contact: {
          type: 'object',
          properties: {
            phone: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            website: { type: ['string', 'null'] }
          },
          required: ['phone', 'email', 'website']
        },
        location: {
          type: 'object',
          properties: {
            full_address: { type: ['string', 'null'] },
            street: { type: ['string', 'null'] },
            city: { type: ['string', 'null'] },
            state: { type: ['string', 'null'] },
            country: { type: ['string', 'null'] },
            postal_code: { type: ['string', 'null'] },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] }
          },
          required: ['full_address', 'street', 'city', 'state', 'country', 'postal_code', 'latitude', 'longitude']
        },
        ratings: {
          type: 'object',
          properties: {
            rating: { type: ['number', 'null'] },
            review_count: { type: ['number', 'null'] }
          },
          required: ['rating', 'review_count']
        },
        hours: {
          type: 'object',
          properties: {
            monday: { type: ['string', 'null'] },
            tuesday: { type: ['string', 'null'] },
            wednesday: { type: ['string', 'null'] },
            thursday: { type: ['string', 'null'] },
            friday: { type: ['string', 'null'] },
            saturday: { type: ['string', 'null'] },
            sunday: { type: ['string', 'null'] }
          },
          required: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        },
        reviews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              author: { type: 'string' },
              rating: { type: 'number' },
              text: { type: 'string' },
              date: { type: 'string' }
            },
            required: ['author', 'rating', 'text', 'date']
          }
        },
        services: { type: 'array', items: { type: 'string' } },
        products: { type: 'array', items: { type: 'string' } },
        amenities: { type: 'array', items: { type: 'string' } },
        social_links: { type: 'array', items: { type: 'string' } },
        pricing: { type: ['string', 'null'] },
        booking_url: { type: ['string', 'null'] },
        source_urls: { type: 'array', items: { type: 'string' } },
        confidence: {
          type: 'object',
          properties: {
            overall: { type: ['number', 'null'] },
            name: { type: ['number', 'null'] },
            category: { type: ['number', 'null'] },
            phone: { type: ['number', 'null'] },
            website: { type: ['number', 'null'] },
            address: { type: ['number', 'null'] },
            rating: { type: ['number', 'null'] }
          },
          required: ['overall', 'name', 'category', 'phone', 'website', 'address', 'rating']
        }
      },
      required: ['business', 'contact', 'location', 'ratings', 'hours', 'reviews', 'services', 'products', 'amenities', 'social_links', 'pricing', 'booking_url', 'source_urls', 'confidence']
    };

    try {
      const result = await AIService.generate({
        prompt,
        model: 'reasoning',
        schema,
        temperature: 0.1,
        maxTokens: 6000,
        systemPrompt: `You are a business information extractor. Analyze the following data retrieved from a Google Maps page and extract structured business information. Return ONLY valid JSON matching the exact schema provided. No markdown, no explanations, no extra text.`,
      });
      return result;
    } catch (error) {
      const providerError = error?.providerError || {
        category: 'PROVIDER_UNAVAILABLE',
        httpStatus: null,
        safeMessage: error?.message || 'AI provider request failed.',
        retryAttempted: false,
        retryCount: 0,
        provider: 'omniroute',
        model: 'reasoning',
        success: false,
      };

      console.error('[BusinessDataExtractor] AI extraction failed:', providerError.safeMessage);
      return {
        business: { name: null, category: null, categories: [], description: null, business_type: null },
        contact: { phone: null, email: null, website: null },
        location: { full_address: null, street: null, city: null, state: null, country: null, postal_code: null, latitude: null, longitude: null },
        ratings: { rating: null, review_count: null },
        hours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null },
        reviews: [],
        services: [],
        products: [],
        amenities: [],
        social_links: [],
        pricing: null,
        booking_url: null,
        source_urls: [sourceUrl],
        confidence: { overall: 0, name: 0, category: 0, phone: 0, website: 0, address: 0, rating: 0 },
        providerError,
        providerUnavailable: true,
        metadata: {
          providerError,
          providerUnavailable: true,
          extractionStatus: 'provider_unavailable',
        }
      };
    }
  }

  /**
   * Validate and clean extracted profile
   */
  validateProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile: not an object');
    }

    const validated = {
      business: {
        name: profile.business?.name ?? null,
        category: profile.business?.category ?? null,
        categories: Array.isArray(profile.business?.categories) ? profile.business.categories : [],
        description: profile.business?.description ?? null,
        business_type: profile.business?.business_type ?? null,
      },
      contact: {
        phone: profile.contact?.phone ?? null,
        email: profile.contact?.email ?? null,
        website: profile.contact?.website ?? null,
      },
      location: {
        full_address: profile.location?.full_address ?? null,
        street: profile.location?.street ?? null,
        city: profile.location?.city ?? null,
        state: profile.location?.state ?? null,
        country: profile.location?.country ?? null,
        postal_code: profile.location?.postal_code ?? null,
        latitude: profile.location?.latitude ?? null,
        longitude: profile.location?.longitude ?? null,
      },
      ratings: {
        rating: typeof profile.ratings?.rating === 'number' ? profile.ratings.rating : null,
        review_count: typeof profile.ratings?.review_count === 'number' ? profile.ratings.review_count : null,
      },
      hours: profile.hours ?? {},
      reviews: Array.isArray(profile.reviews) ? profile.reviews : [],
      services: Array.isArray(profile.services) ? profile.services : [],
      products: Array.isArray(profile.products) ? profile.products : [],
      amenities: Array.isArray(profile.amenities) ? profile.amenities : [],
      social_links: Array.isArray(profile.social_links) ? profile.social_links : [],
      pricing: profile.pricing ?? null,
      booking_url: profile.booking_url ?? null,
      source_urls: Array.isArray(profile.source_urls) ? profile.source_urls : [],
      confidence: profile.confidence ?? { overall: 0, name: 0, category: 0, phone: 0, website: 0, address: 0, rating: 0 },
    };

    return validated;
  }

  /**
   * MAIN ENTRY POINT: Extract from Google Maps URL
   * 
   * Pipeline:
   * 1. Parse URL for identifiers (IDENTIFIED provenance)
   * 2. If website found in extracted data, fetch official website (DISCOVERED provenance)
   * 3. Merge into BusinessProfile with provenance tracking
   * 4. Return normalized result
   */
  async extractFromGoogleMapsUrl(googleMapsUrl, options = {}) {
    const { forceRefresh = false } = options;
    
    // Check cache first (unless forceRefresh)
    if (!forceRefresh) {
      const cached = this.getCachedExtraction(googleMapsUrl);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // Step 1: Parse URL for identifiers (IDENTIFIED provenance)
    const parsed = this.parser.parse(googleMapsUrl);
    const identified = parsed.identified;
    const provenance = parsed.provenance;

    if (config.debugBusinessAnalysis) {
      console.log('[BusinessDataExtractor] Parsed identifiers:', identified);
    }

    // Step 2: Fetch Google Maps page content via proxy
    let pageData;
    let metadata;
    let extractedProfile;
    let resolutionStatus = 'unresolved';
    let acquisitionMethod = 'r_jina_ai';
    // P1.2 AI quarantine: tracks whether the extracted profile was produced by
    // the AI model (extractWithAI) rather than deterministic parsing. AI-derived
    // identity fields must be labeled ai_generated so they can never overwrite
    // identified/discovered/verified identity (BusinessProfile provenance
    // priority: ai_generated (0.5) < identified (2)).
    let aiExtracted = false;

    try {
      pageData = await this.fetchPage(googleMapsUrl);
      
      if (pageData.status >= 400) {
        throw new Error(`Failed to retrieve page: HTTP ${pageData.status}`);
      }

      // Extract metadata from HTML
      metadata = this.extractMetadata(pageData.html);
      metadata.sourceUrl = pageData.url;

      // If Jina AI didn't return enough business evidence, try direct HTML extraction
      let directMetadata = null;
      if (this.isEmptyAcquisitionPage(metadata, pageData.url)) {
        console.log('[BusinessDataExtractor] Jina AI returned empty page, attempting direct Google Maps HTML extraction...');
        directMetadata = await this.extractFromDirectGoogleMapsHtml(googleMapsUrl);
        if (directMetadata && !this.isEmptyAcquisitionPage(directMetadata, googleMapsUrl)) {
          console.log('[BusinessDataExtractor] Direct extraction succeeded, using direct metadata');
          metadata = directMetadata;
          acquisitionMethod = 'direct_google_maps';
        }
      }

      // A JavaScript application shell, consent wall, map-tile response, or
      // explicit upstream error is not business evidence. Do not spend an AI
      // call on content that contains nothing the model can ground on.
      if (this.isEmptyAcquisitionPage(metadata, pageData.url)) {
        extractedProfile = this.emptyExtractionProfile(googleMapsUrl, {
          category: 'EMPTY_RESULT',
          safeMessage: 'The source responded, but no business evidence was available.',
          httpStatus: pageData.status,
          provider: 'web_extraction',
          model: config.omniroute.models.reasoning,
          success: false,
        });
      } else {
        // Use AI to extract structured profile from page content
        extractedProfile = await this.extractWithAI(metadata, pageData.url);
        aiExtracted = true;

        // Validate and clean
        extractedProfile = this.validateProfile(extractedProfile);
      }
      
      // Determine resolution status
      if (identified.placeId && this.parser.isValidPlaceIdFormat(identified.placeId)) {
        resolutionStatus = extractedProfile.business?.name ? 'resolved' : 'partial';
      } else if (identified.placeName) {
        resolutionStatus = 'ambiguous';
      }
    } catch (error) {
      console.error('[BusinessDataExtractor] Extraction failed:', error.message);
      // Return minimal profile with just identified info
      // P1.7: viewport coordinates from a /search/ URL only describe where the
      // map was centered — they are NOT a pin for this business. Never carry
      // them into the canonical profile.
      const coords = identified.coordinates && !identified.coordinates.viewport ? identified.coordinates : null;
      extractedProfile = {
        business: { name: identified.placeName, category: null, categories: [], description: null, business_type: null },
        contact: { phone: null, email: null, website: null },
        location: { full_address: null, street: null, city: null, state: null, country: null, postal_code: null, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null },
        ratings: { rating: null, review_count: null },
        hours: {},
        reviews: [],
        services: [],
        products: [],
        amenities: [],
        social_links: [],
        pricing: null,
          booking_url: null,
        source_urls: [googleMapsUrl],
        confidence: { overall: 0, name: identified.placeName ? 0.5 : 0, category: 0, phone: 0, website: 0, address: 0, rating: 0 },
      };
      resolutionStatus = identified.placeId ? 'partial' : 'unresolved';
    }

    // Step 3: Build BusinessProfile with provenance tracking
    const profile = new BusinessProfile();
    
    // Add IDENTIFIED data from URL parsing
    if (identified.placeName) {
      profile.set('identity.name', identified.placeName, 'identified', 0.6, { sourceUrl: googleMapsUrl });
    }
    // P1.7: Only coordinates that pin a specific business (a /place/ URL's
    // @lat,lng or explicit operator coords) become identified location data.
    // Viewport coordinates from a /search/ URL mark the map center and must
    // never be written to the profile as the business location.
    if (identified.coordinates && !identified.coordinates.viewport) {
      profile.set('location.coordinates', identified.coordinates, 'identified', 0.8, { sourceUrl: googleMapsUrl });
    }

    // Add DISCOVERED/ai_generated data from Google Maps page extraction.
    // P1.2 AI quarantine: when the profile was produced by the AI model, the
    // identity fields are labeled ai_generated so they can never outrank
    // deterministic URL/provider identity. Values remain available as
    // evidence/candidate data but cannot overwrite authoritative fields.
    const extractedProvenance = aiExtracted ? 'ai_generated' : 'discovered';
    if (extractedProfile.business?.name) {
      profile.set('identity.name', extractedProfile.business.name, extractedProvenance, extractedProfile.confidence?.name || 0.7, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.business?.category) {
      profile.set('identity.category', extractedProfile.business.category, extractedProvenance, extractedProfile.confidence?.category || 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.business?.categories?.length) {
      profile.set('identity.categories', extractedProfile.business.categories, extractedProvenance, 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.business?.description) {
      profile.set('identity.description', extractedProfile.business.description, extractedProvenance, 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.contact?.phone) {
      profile.set('contact.phone', extractedProfile.contact.phone, extractedProvenance, extractedProfile.confidence?.phone || 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.contact?.website) {
      profile.set('contact.website', extractedProfile.contact.website, extractedProvenance, extractedProfile.confidence?.website || 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.location?.full_address) {
      profile.set('location.full_address', extractedProfile.location.full_address, extractedProvenance, extractedProfile.confidence?.address || 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.location?.coordinates) {
      profile.set('location.coordinates', extractedProfile.location.coordinates, extractedProvenance, 0.7, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.ratings?.rating) {
      profile.set('ratings.rating', extractedProfile.ratings.rating, extractedProvenance, extractedProfile.confidence?.rating || 0.7, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.hours && Object.keys(extractedProfile.hours).some(k => extractedProfile.hours[k])) {
      profile.set('hours', extractedProfile.hours, extractedProvenance, 0.6, { sourceUrl: pageData?.url || googleMapsUrl });
    }
    if (extractedProfile.social_links?.length) {
      profile.set('social_links', extractedProfile.social_links, extractedProvenance, 0.5, { sourceUrl: pageData?.url || googleMapsUrl });
    }

    // Step 4: Build an AcquisitionResult from the extraction (before merging
    // into BusinessProfile). This gives us a clean internal contract we can
    // reason about.
    const acquisition = this.buildAcquisitionResult({
      provider: 'web_extraction',
      sourceUrl: pageData?.url || googleMapsUrl,
      extractedProfile,
      pageData,
      metadata,
      identified,
      provenance,
      acquisitionMethod,
    });

    // If the acquisition has no identity evidence, do NOT merge into profile,
    // do NOT create a BusinessProfile, do NOT persist. Return a structured
    // acquisition failure instead of "Unknown Business".
    if (!acquisition.fields || !hasIdentityEvidence(acquisition.fields)) {
      return {
        ...acquisition,
        success: false,
        metadata: {
          ...provenance,
          placeId: identified.placeId,
          placeName: identified.placeName,
          extractedAt: new Date().toISOString(),
          httpStatus: pageData?.status,
          hasJsonLd: metadata?.jsonLd?.length > 0,
          hasMicrodata: Object.keys(metadata?.microdata || {}).length > 0,
          hasOpenGraph: Object.keys(metadata?.openGraph || {}).length > 0,
          acquisitionMethod,
          resolutionStatus: 'unresolved',
          provenanceBreakdown: { verified: 0, discovered: 0, identified: 0, user_provided: 0, inferred: 0, ai_generated: 0 },
          completeness: 0,
          providerError: acquisition.errors?.[0] || null,
          providerUnavailable: acquisition.status === ACQUISITION_STATUS.PROVIDER_UNAVAILABLE,
          gateway: config.omniroute.baseUrl,
          model: config.omniroute.models.reasoning,
        },
        cached: false,
      };
    }

    // Step 4: Try to fetch official website for VERIFIED/DISCOVERED data
    const websiteUrl = extractedProfile.contact?.website || profile.get('contact.website');
    if (websiteUrl) {
      try {
        if (config.debugBusinessAnalysis) {
          console.log('[BusinessDataExtractor] Fetching official website:', websiteUrl);
        }
        const websiteData = await this.websiteProvider.extract(websiteUrl);
        
        // Merge with VERIFIED provenance (official website is authoritative)
        profile.merge(websiteData, 'verified', 0.9);
        
        if (config.debugBusinessAnalysis) {
          console.log('[BusinessDataExtractor] Official website data merged');
        }
      } catch (error) {
        if (config.debugBusinessAnalysis) {
          console.log('[BusinessDataExtractor] Official website fetch failed:', error.message);
        }
        // Don't fail - continue with what we have
      }
    }

    // Step 5: Build final result (only when we have real evidence)
    const providerFailure = Boolean(
      extractedProfile?.providerError ||
      extractedProfile?.providerUnavailable ||
      (Array.isArray(extractedProfile?.source_urls) && extractedProfile.source_urls.includes(googleMapsUrl) && extractedProfile?.confidence?.overall === 0)
    );

    const result = {
      ...profile.toObject(),
      metadata: {
        ...provenance,
        placeId: identified.placeId,
        placeName: identified.placeName,
        extractedAt: new Date().toISOString(),
        httpStatus: pageData?.status,
        hasJsonLd: metadata?.jsonLd?.length > 0,
        hasMicrodata: Object.keys(metadata?.microdata || {}).length > 0,
        hasOpenGraph: Object.keys(metadata?.openGraph || {}).length > 0,
        acquisitionMethod,
        resolutionStatus,
        // P1.2 AI quarantine: surface whether the profile identity was produced
        // by AI so downstream merge/persistence boundaries can distinguish
        // AI-derived identity from provider-observed facts.
        aiExtracted,
        provenanceBreakdown: profile.getProvenanceBreakdown(),
        completeness: profile.getCompleteness(),
        providerError: extractedProfile?.providerError || null,
        providerUnavailable: Boolean(extractedProfile?.providerUnavailable),
        gateway: config.omniroute.baseUrl,
        model: config.omniroute.models.reasoning,
        // P1.8: retain the retrieved page text as recoverable evidence for the
        // source-grounded fallback extractor. This is the SAME text the AI
        // extraction prompt already consumes — carrying it forward lets the
        // field-level fallback complete missing fields (phone/email/website)
        // from the same evidence without a second fetch. Additive only; never
        // parsed downstream as structured business data.
        sourceText: (metadata?.visibleText || '').slice(0, 6000) || null,
        acquisition: {
          status: acquisition.status,
          completeness: acquisition.completeness,
          fieldsPresent: acquisition.fields ? Object.keys(acquisition.fields).length : 0,
          warnings: acquisition.warnings?.length || 0,
        },
      },
      cached: false,
    };

    if (!providerFailure) {
      this.setCachedExtraction(googleMapsUrl, result);
    }

    return result;
  }

  /**
   * Detect pages that have a successful HTTP response but contain no business
   * evidence (Google Maps JS shell, consent wall, server error, map tiles only).
   * @private
   */
  isEmptyAcquisitionPage(metadata, sourceUrl) {
    // r.jina.ai proxy sometimes returns 200 with a "Server error" page
    if (metadata?.visibleText) {
      const text = metadata.visibleText.toLowerCase();
      if (text.includes('server error') && text.includes('try again later')) return true;
      if (text.includes('enable javascript') && text.includes('browser') && text.includes('google')) return true;
    }
    // No structured data AND no meaningful visible text
    const hasStructured = (metadata?.jsonLd?.length || 0) > 0
      || Object.keys(metadata?.microdata || {}).length > 0
      || Object.keys(metadata?.openGraph || {}).length > 0;
    if (!hasStructured && (!metadata?.visibleText || metadata.visibleText.trim().length < 100)) {
      return true;
    }
    return false;
  }

  /**
   * Build an empty extraction profile that satisfies the shape without AI call.
   * @private
   */
  emptyExtractionProfile(googleMapsUrl, providerError) {
    return {
      business: { name: null, category: null, categories: [], description: null, business_type: null },
      contact: { phone: null, email: null, website: null },
      location: { full_address: null, street: null, city: null, state: null, country: null, postal_code: null, latitude: null, longitude: null },
      ratings: { rating: null, review_count: null },
      hours: {},
      reviews: [],
      services: [],
      products: [],
      amenities: [],
      social_links: [],
      pricing: null,
      booking_url: null,
      source_urls: [googleMapsUrl],
      confidence: { overall: 0, name: 0, category: 0, phone: 0, website: 0, address: 0, rating: 0 },
      providerError: {
        category: providerError.category || 'PROVIDER_UNAVAILABLE',
        httpStatus: providerError.httpStatus || null,
        safeMessage: providerError.safeMessage || 'No business evidence extracted.',
        retryAttempted: false,
        retryCount: 0,
        provider: providerError.provider || 'web_extraction',
        model: providerError.model || 'auto/best-coding',
        success: false,
      },
      providerUnavailable: true,
      metadata: {
        providerError,
        providerUnavailable: true,
        extractionStatus: 'provider_unavailable',
      }
    };
  }

  /**
   * Build a structured AcquisitionResult from the extraction pipeline state.
   * @private
   */
  buildAcquisitionResult({ provider, sourceUrl, extractedProfile, pageData, metadata, identified, provenance, acquisitionMethod }) {
    // Provider-level error?
    if (extractedProfile?.providerError) {
      return classifyEmptyAcquisition({
        provider,
        sourceUrl,
        record: extractedProfile,
        providerError: extractedProfile.providerError,
        httpStatus: pageData?.status,
      });
    }

    // AI returned a profile — check whether it actually contains any fields.
    if (extractedProfile) {
      // Normalize extracted fields to dot-path for the AcquisitionResult contract.
      const fields = this.flattenExtraction(extractedProfile);
      const completeness = this.calculateCompleteness(extractedProfile);
      const identityEvidence = hasIdentityEvidence(fields);
      const confidence = extractedProfile.confidence?.overall || 0;

      if (!identityEvidence) {
        return classifyEmptyAcquisition({
          provider,
          sourceUrl,
          record: extractedProfile,
          providerError: null,
          httpStatus: pageData?.status,
        });
      }

      return {
        provider,
        sourceUrl,
        status: ACQUISITION_STATUS.SUCCESS,
        fields,
        completeness,
        confidence,
        dataKind: 'inferred',
        errors: [],
        warnings: [],
        latencyMs: null,
        metadata: {
          acquisitionMethod,
          hasJsonLd: metadata?.jsonLd?.length > 0,
          hasMicrodata: Object.keys(metadata?.microdata || {}).length > 0,
          hasOpenGraph: Object.keys(metadata?.openGraph || {}).length > 0,
          identified,
          provenance,
          acquisitionMethod,
        },
      };
    }

    // No profile at all.
    return classifyEmptyAcquisition({ provider, sourceUrl, record: {}, providerError: null, httpStatus: pageData?.status });
  }

  /**
   * Flatten the extractedProfile into dot-path fields for AcquisitionResult.
   * @private
   */
  flattenExtraction(extractedProfile) {
    if (!extractedProfile) return {};
    const fields = {};
    if (extractedProfile.business) {
      if (extractedProfile.business.name) fields['identity.name'] = extractedProfile.business.name;
      if (extractedProfile.business.category) fields['identity.category'] = extractedProfile.business.category;
      if (extractedProfile.business.categories?.length) fields['identity.categories'] = extractedProfile.business.categories;
      if (extractedProfile.business.description) fields['identity.description'] = extractedProfile.business.description;
      if (extractedProfile.business.business_type) fields['identity.business_type'] = extractedProfile.business.business_type;
    }
    if (extractedProfile.contact) {
      if (extractedProfile.contact.phone) fields['contact.phone'] = extractedProfile.contact.phone;
      if (extractedProfile.contact.email) fields['contact.email'] = extractedProfile.contact.email;
      if (extractedProfile.contact.website) fields['contact.website'] = extractedProfile.contact.website;
    }
    if (extractedProfile.location) {
      if (extractedProfile.location.full_address) fields['location.full_address'] = extractedProfile.location.full_address;
      if (extractedProfile.location.street) fields['location.street'] = extractedProfile.location.street;
      if (extractedProfile.location.city) fields['location.city'] = extractedProfile.location.city;
      if (extractedProfile.location.state) fields['location.state'] = extractedProfile.location.state;
      if (extractedProfile.location.country) fields['location.country'] = extractedProfile.location.country;
      if (extractedProfile.location.postal_code) fields['location.postal_code'] = extractedProfile.location.postal_code;
      if (extractedProfile.location.coordinates) fields['location.coordinates'] = extractedProfile.location.coordinates;
    }
    if (extractedProfile.ratings) {
      if (extractedProfile.ratings.rating != null) fields['ratings.rating'] = extractedProfile.ratings.rating;
      if (extractedProfile.ratings.review_count != null) fields['ratings.review_count'] = extractedProfile.ratings.review_count;
    }
    if (extractedProfile.hours && Object.keys(extractedProfile.hours).some(k => extractedProfile.hours[k])) {
      fields.hours = extractedProfile.hours;
    }
    if (extractedProfile.social_links?.length) fields['social_links'] = extractedProfile.social_links;
    return fields;
  }

  /**
   * Calculate overall completeness from the extracted profile.
   * @private
   */
  calculateCompleteness(extractedProfile) {
    const identityFields = ['business.name', 'contact.phone', 'contact.website', 'location.full_address', 'location.coordinates'];
    let present = 0;
    for (const f of identityFields) {
      const parts = f.split('.');
      let v = extractedProfile;
      for (const p of parts) v = v?.[p];
      if (v != null && v !== '') present++;
    }
    return present / identityFields.length;
  }

  /**
   * Extract from user-provided data
   */
  async extractFromUserData(userData) {
    const processed = UserProvidedDataProvider.process(userData);
    const profile = new BusinessProfile();
    profile.merge(processed, 'user_provided', 1.0);
    
    return {
      ...profile.toObject(),
      metadata: {
        source: 'user_provided',
        extractedAt: new Date().toISOString(),
        provenanceBreakdown: profile.getProvenanceBreakdown(),
        completeness: profile.getCompleteness(),
      },
      cached: false,
    };
  }

  /**
   * Clear cache (SQLite: purge all source-cache rows) — for testing/admin
   */
  clearCache() {
    this._cacheInstance().delete();
  }

  /**
   * Get cache stats (SQLite-backed)
   */
  getCacheStats() {
    const stats = this._cacheInstance().stats();
    return {
      size: stats.total,
      entries: stats.entries.map((e) => ({
        normalizedUrl: e.sourceUrl,
        timestamp: e.retrievedAt,
      })),
    };
  }
}

export default new BusinessDataExtractor();