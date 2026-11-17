/**
 * Scraping Result Normalizer — Converts gosom/google-maps-scraper output to Webloom canonical format.
 * 
 * Maps the 36+ data points from the scraper into Webloom's BusinessProfile structure
 * with proper provenance tracking and evidence preservation.
 * 
 * Provenance hierarchy (highest to lowest):
 *   user_provided (5) > verified (4) > discovered (3) > identified (2) > inferred (1) > ai_generated (0.5)
 * 
 * Scraped Google Maps data enters at 'discovered' (3) provenance level.
 */

import { normalizePhone } from '../services/EntityResolution.js';

export class ScrapingResultNormalizer {
  constructor(options = {}) {
    this.source = options.source || 'google_maps_scraper';
    this.defaultConfidence = options.defaultConfidence || 0.7;
    this.coordinateThreshold = options.coordinateThreshold || 0.35; // degrees
  }

  /**
   * Normalize a single scraped business into canonical format.
   * 
   * @param {Object} scrapedBusiness - Raw business from scraper
   * @param {Object} [context] - Additional context (URL, hints, etc.)
   * @returns {Object} Normalized business record with provenance
   */
  normalize(scrapedBusiness, context = {}) {
    const { sourceUrl, hints, authoritativeCoordinates } = context;
    
    // Build the canonical record structure
    const normalized = {
      // Identity
      identity: this._normalizeIdentity(scrapedBusiness, context),
      
      // Contact
      contact: this._normalizeContact(scrapedBusiness, context),
      
      // Location
      location: this._normalizeLocation(scrapedBusiness, context),
      
      // Business details
      business: this._normalizeBusinessDetails(scrapedBusiness, context),
      
      // Ratings & Reviews
      ratings: this._normalizeRatings(scrapedBusiness, context),
      reviews: this._normalizeReviews(scrapedBusiness, context),
      
      // Hours
      hours: this._normalizeHours(scrapedBusiness, context),
      
      // Services & Products
      services: this._normalizeServices(scrapedBusiness, context),
      products: this._normalizeProducts(scrapedBusiness, context),
      amenities: this._normalizeAmenities(scrapedBusiness, context),
      
      // Digital presence
      digitalPresence: this._normalizeDigitalPresence(scrapedBusiness, context),
      
      // Pricing
      pricing: this._normalizePricing(scrapedBusiness, context),
      
      // Social links
      socialLinks: this._normalizeSocialLinks(scrapedBusiness, context),
      
      // Booking/Ordering
      bookingUrl: this._normalizeBookingUrl(scrapedBusiness, context),
      
      // Metadata
      sourceUrls: sourceUrl ? [sourceUrl] : [],
      confidence: this._calculateConfidence(scrapedBusiness),
      metadata: this._buildMetadata(scrapedBusiness, context),
      cached: false,
    };
    
    return normalized;
  }

  /**
   * Normalize multiple businesses with deduplication.
   * 
   * @param {Array} businesses - Array of scraped businesses
   * @param {Object} [context] - Shared context
   * @returns {Object} { records, duplicates, stats }
   */
  normalizeBatch(businesses, context = {}) {
    const records = [];
    const duplicates = [];
    const seen = new Map(); // Key: placeId or normalized name+address
    
    for (const business of businesses) {
      const normalized = this.normalize(business, context);
      const dedupKey = this._getDedupKey(normalized);
      
      if (seen.has(dedupKey)) {
        // Duplicate detected
        const existing = seen.get(dedupKey);
        duplicates.push({
          duplicate: normalized,
          existing: existing,
          reason: this._getDuplicateReason(normalized, existing),
        });
        
        // Merge non-conflicting fields from duplicate into existing
        this._mergeDuplicate(existing, normalized);
      } else {
        seen.set(dedupKey, normalized);
        records.push(normalized);
      }
    }
    
    return {
      records,
      duplicates,
      stats: {
        total: businesses.length,
        unique: records.length,
        duplicateCount: duplicates.length,
      },
    };
  }

  /**
   * Normalize identity fields.
   * @private
   */
  _normalizeIdentity(scraped, context) {
    const name = scraped.name || scraped.title || null;
    const placeId = scraped.placeId || scraped.cid || scraped.dataId || null;
    const googleMapsUrl = scraped.googleMapsUrl || (context.sourceUrl || null);
    const category = scraped.category || null;
    const categories = Array.isArray(scraped.categories) ? scraped.categories : [];
    const description = scraped.description || null;
    
    return {
      name: this._withProvenance(name, 'discovered', 0.8, { field: 'name', source: this.source, googleMapsUrl }),
      placeId: this._withProvenance(placeId, 'discovered', 0.9, { field: 'placeId', source: this.source }),
      googleMapsUrl: this._withProvenance(googleMapsUrl, 'discovered', 1.0, { field: 'googleMapsUrl', source: this.source }),
      category: this._withProvenance(category, 'discovered', 0.7, { field: 'category', source: this.source }),
      categories: this._withProvenance(categories, 'discovered', 0.7, { field: 'categories', source: this.source }),
      description: this._withProvenance(description, 'discovered', 0.6, { field: 'description', source: this.source }),
      businessType: null, // Not directly provided
    };
  }

  /**
   * Normalize contact fields.
   * @private
   */
  _normalizeContact(scraped, context) {
    const phone = scraped.phone ? normalizePhone(scraped.phone) : null;
    const website = scraped.website || null;
    const emails = Array.isArray(scraped.emails) ? scraped.emails.filter(e => e && e.includes('@')) : [];
    
    return {
      phone: this._withProvenance(phone, 'discovered', phone ? 0.8 : 0, { field: 'phone', source: this.source, raw: scraped.phone }),
      website: this._withProvenance(website, 'discovered', website ? 0.8 : 0, { field: 'website', source: this.source }),
      email: this._withProvenance(emails.length ? emails[0] : null, 'discovered', emails.length ? 0.7 : 0, { field: 'email', source: this.source, allEmails: emails }),
      emails: this._withProvenance(emails, 'discovered', emails.length ? 0.7 : 0, { field: 'emails', source: this.source }),
    };
  }

  /**
   * Normalize location fields.
   * @private
   */
  _normalizeLocation(scraped, context) {
    const coordinates = scraped.coordinates;
    const address = scraped.address || scraped.fullAddress || null;
    const plusCode = scraped.plusCode || null;
    const authoritativeCoordinates = context?.authoritativeCoordinates || null;
    
    // Parse address components if we have a full address
    const { city, state, country, postalCode, street } = this._parseAddress(address);
    
    // Check coordinate compatibility with authoritative coordinates
    let coordinateConfidence = 0.8;
    let coordinateRejected = false;
    
    if (coordinates && authoritativeCoordinates) {
      const dist = this._calculateDistance(coordinates, authoritativeCoordinates);
      if (dist > this.coordinateThreshold) {
        coordinateRejected = true;
        coordinateConfidence = 0;
      }
    }
    
    return {
      full_address: this._withProvenance(address, 'discovered', address ? 0.7 : 0, { field: 'full_address', source: this.source }),
      street: this._withProvenance(street, 'discovered', street ? 0.6 : 0, { field: 'street', source: this.source }),
      city: this._withProvenance(city, 'discovered', city ? 0.6 : 0, { field: 'city', source: this.source }),
      state: this._withProvenance(state, 'discovered', state ? 0.6 : 0, { field: 'state', source: this.source }),
      country: this._withProvenance(country, 'discovered', country ? 0.6 : 0, { field: 'country', source: this.source }),
      postal_code: this._withProvenance(postalCode, 'discovered', postalCode ? 0.6 : 0, { field: 'postal_code', source: this.source }),
      coordinates: this._withProvenance(coordinateRejected ? null : coordinates, 'discovered', coordinateConfidence, { 
        field: 'coordinates', 
        source: this.source, 
        raw: scraped.coordinates,
        rejected: coordinateRejected,
      }),
      plusCode: this._withProvenance(plusCode, 'discovered', plusCode ? 0.7 : 0, { field: 'plusCode', source: this.source }),
    };
  }

  /**
   * Normalize business details.
   * @private
   */
  _normalizeBusinessDetails(scraped, context) {
    return {
      name: scraped.identity?.name?.value || null, // Will be set from identity
      category: scraped.identity?.category?.value || null,
      business_type: scraped.identity?.businessType?.value || null,
      description: scraped.identity?.description?.value || null,
      categories: scraped.identity?.categories?.value || [],
      status: this._withProvenance(scraped.status, 'discovered', scraped.status ? 0.7 : 0, { field: 'status', source: this.source }),
      timezone: this._withProvenance(scraped.timezone, 'discovered', scraped.timezone ? 0.7 : 0, { field: 'timezone', source: this.source }),
      about: this._withProvenance(scraped.about, 'discovered', scraped.about ? 0.6 : 0, { field: 'about', source: this.source }),
      creditCardsAccepted: this._withProvenance(scraped.creditCardsAccepted || [], 'discovered', 0.6, { field: 'creditCardsAccepted', source: this.source }),
    };
  }

  /**
   * Normalize ratings.
   * @private
   */
  _normalizeRatings(scraped, context) {
    const rating = scraped.rating;
    const reviewCount = scraped.reviewCount;
    const reviewsPerRating = scraped.reviewsPerRating;
    
    return {
      rating: this._withProvenance(rating, 'discovered', rating !== null ? 0.8 : 0, { 
        field: 'rating', 
        source: this.source, 
        raw: rating,
        reviewCount: reviewCount,
      }),
      review_count: this._withProvenance(reviewCount, 'discovered', reviewCount !== null ? 0.8 : 0, { 
        field: 'review_count', 
        source: this.source, 
        raw: reviewCount,
      }),
      reviewsPerRating: this._withProvenance(reviewsPerRating, 'discovered', reviewsPerRating ? 0.7 : 0, { 
        field: 'reviewsPerRating', 
        source: this.source,
      }),
    };
  }

  /**
   * Normalize reviews.
   * @private
   */
  _normalizeReviews(scraped, context) {
    const reviews = Array.isArray(scraped.reviews) ? scraped.reviews : [];
    const reviewsExtended = Array.isArray(scraped.reviewsExtended) ? scraped.reviewsExtended : [];
    const reviewCollection = scraped.reviewCollection || null;
    
    const normalizedReviews = [...reviews, ...reviewsExtended].map((review, index) => ({
      author: review.author || review.user || null,
      rating: review.rating ? parseFloat(review.rating) : null,
      text: review.text || review.content || null,
      date: review.date || review.timestamp || null,
      language: review.language || null,
      sourceUrl: scraped.reviewsLink || context.sourceUrl || null,
      provenance: this._withProvenance(null, 'discovered', 0.7, { 
        field: 'reviews', 
        source: this.source,
        index,
        collected: reviewCollection?.collected || null,
        expected: reviewCollection?.expected || null,
      }),
    }));
    
    return normalizedReviews;
  }

  /**
   * Normalize opening hours.
   * @private
   */
  _normalizeHours(scraped, context) {
    const hours = scraped.openingHours || scraped.open_hours || null;
    
    if (!hours) return {};
    
    const normalized = {};
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of days) {
      const value = hours[day] || hours[day.charAt(0).toUpperCase() + day.slice(1)] || null;
      if (value) {
        normalized[day] = this._withProvenance(value, 'discovered', 0.7, { 
          field: `hours.${day}`, 
          source: this.source,
        });
      }
    }
    
    return normalized;
  }

  /**
   * Normalize services.
   * @private
   */
  _normalizeServices(scraped, context) {
    const services = Array.isArray(scraped.services) ? scraped.services : [];
    return this._withProvenance(services, 'discovered', services.length ? 0.6 : 0, { 
      field: 'services', 
      source: this.source,
    });
  }

  /**
   * Normalize products.
   * @private
   */
  _normalizeProducts(scraped, context) {
    // Scraper doesn't directly provide products, might be in categories
    return this._withProvenance([], 'discovered', 0, { field: 'products', source: this.source });
  }

  /**
   * Normalize amenities.
   * @private
   */
  _normalizeAmenities(scraped, context) {
    // Could extract from categories or other fields
    return this._withProvenance([], 'discovered', 0, { field: 'amenities', source: this.source });
  }

  /**
   * Normalize digital presence.
   * @private
   */
  _normalizeDigitalPresence(scraped, context) {
    const website = scraped.contact?.website?.value || scraped.website || null;
    const googleMapsUrl = scraped.identity?.googleMapsUrl?.value || scraped.googleMapsUrl || null;
    const thumbnail = scraped.thumbnail || null;
    const images = Array.isArray(scraped.images) ? scraped.images : [];
    
    return {
      googleMapsUrl: this._withProvenance(googleMapsUrl, 'discovered', googleMapsUrl ? 1.0 : 0, { field: 'googleMapsUrl', source: this.source }),
      website: this._withProvenance(website, 'discovered', website ? 0.8 : 0, { field: 'website', source: this.source }),
      socialProfiles: {
        facebook: this._withProvenance(null, 'discovered', 0, { field: 'facebook', source: this.source }),
        instagram: this._withProvenance(null, 'discovered', 0, { field: 'instagram', source: this.source }),
        twitter: this._withProvenance(null, 'discovered', 0, { field: 'twitter', source: this.source }),
        linkedin: this._withProvenance(null, 'discovered', 0, { field: 'linkedin', source: this.source }),
      },
      hasWebsite: this._withProvenance(!!website, 'discovered', website ? 0.8 : 0, { field: 'hasWebsite', source: this.source }),
      photos: this._withProvenance([thumbnail, ...images].filter(Boolean), 'discovered', images.length ? 0.7 : 0, { field: 'photos', source: this.source }),
    };
  }

  /**
   * Normalize pricing.
   * @private
   */
  _normalizePricing(scraped, context) {
    const priceRange = scraped.priceRange || null;
    return this._withProvenance(priceRange, 'discovered', priceRange ? 0.6 : 0, { 
      field: 'pricing', 
      source: this.source,
      raw: priceRange,
    });
  }

  /**
   * Normalize social links.
   * @private
   */
  _normalizeSocialLinks(scraped, context) {
    // Not directly provided by scraper
    return this._withProvenance([], 'discovered', 0, { field: 'social_links', source: this.source });
  }

  /**
   * Normalize booking URL.
   * @private
   */
  _normalizeBookingUrl(scraped, context) {
    const bookingUrl = scraped.reservationsLink || scraped.orderOnlineLink || scraped.menuLink || null;
    return this._withProvenance(bookingUrl, 'discovered', bookingUrl ? 0.6 : 0, { 
      field: 'booking_url', 
      source: this.source,
      type: scraped.reservationsLink ? 'reservations' : (scraped.orderOnlineLink ? 'order_online' : 'menu'),
    });
  }

  /**
   * Calculate overall confidence.
   * @private
   */
  _calculateConfidence(scraped) {
    const fields = [
      scraped.name,
      scraped.placeId,
      scraped.address,
      scraped.phone,
      scraped.website,
      scraped.rating,
      scraped.reviewCount,
      scraped.coordinates,
    ].filter(Boolean).length;
    
    // Base confidence on field completeness
    const completeness = fields / 8;
    return Math.max(0.5, Math.min(0.9, completeness));
  }

  /**
   * Build metadata object.
   * @private
   */
  _buildMetadata(scraped, context) {
    return {
      source: this.source,
      scrapedAt: scraped._scrapedAt || new Date().toISOString(),
      raw: scraped._raw || null,
      inputId: scraped.inputId || null,
      cid: scraped.cid || null,
      dataId: scraped.dataId || null,
      thumbnail: scraped.thumbnail || null,
      streetViewUrl: scraped.streetViewUrl || null,
      reviewsLink: scraped.reviewsLink || null,
      ownerClaimed: scraped.ownerClaimed || false,
      popularTimes: scraped.popularTimes || null,
      reviewCollection: scraped.reviewCollection || null,
      authoritativeCoordinates: context.authoritativeCoordinates || null,
      coordinateRejected: context.coordinateRejected || false,
    };
  }

  /**
   * Create a provenance-wrapped value.
   * @private
   */
  _withProvenance(value, provenance, confidence, evidence = {}) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      return { value: null, confidence: 0, provenance: 'inferred', evidence: null };
    }
    
    return {
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      provenance,
      evidence: {
        ...evidence,
        source: this.source,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate deduplication key.
   * @private
   */
  _getDedupKey(normalized) {
    // Priority: placeId > googleMapsUrl > name+address
    if (normalized.identity?.placeId?.value) {
      return `placeId:${normalized.identity.placeId.value}`;
    }
    if (normalized.identity?.googleMapsUrl?.value) {
      return `url:${normalized.identity.googleMapsUrl.value}`;
    }
    if (normalized.identity?.name?.value && normalized.location?.full_address?.value) {
      return `nameaddr:${normalized.identity.name.value.toLowerCase()}|${normalized.location.full_address.value.toLowerCase()}`;
    }
    if (normalized.identity?.name?.value) {
      return `name:${normalized.identity.name.value.toLowerCase()}`;
    }
    return `unknown:${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get duplicate reason.
   * @private
   */
  _getDuplicateReason(dup, existing) {
    if (dup.identity?.placeId?.value && dup.identity.placeId.value === existing.identity?.placeId?.value) {
      return 'same_place_id';
    }
    if (dup.identity?.googleMapsUrl?.value && dup.identity.googleMapsUrl.value === existing.identity?.googleMapsUrl?.value) {
      return 'same_google_maps_url';
    }
    if (dup.identity?.name?.value && existing.identity?.name?.value) {
      const nameMatch = dup.identity.name.value.toLowerCase() === existing.identity.name.value.toLowerCase();
      if (nameMatch && dup.location?.full_address?.value && existing.location?.full_address?.value) {
        const addrMatch = dup.location.full_address.value.toLowerCase() === existing.location.full_address.value.toLowerCase();
        if (addrMatch) return 'same_name_and_address';
      }
      if (nameMatch) return 'same_name';
    }
    return 'unknown';
  }

  /**
   * Merge non-conflicting fields from duplicate into existing.
   * @private
   */
  _mergeDuplicate(existing, duplicate) {
    // Only fill gaps in existing (onlyIfMissing = true)
    const fillIfMissing = (target, source, path) => {
      const keys = path.split('.');
      let t = target;
      let s = source;
      for (let i = 0; i < keys.length - 1; i++) {
        t = t[keys[i]];
        s = s[keys[i]];
        if (!t || !s) return;
      }
      const finalKey = keys[keys.length - 1];
      if (!t[finalKey]?.value && s[finalKey]?.value) {
        t[finalKey] = s[finalKey];
      }
    };
    
    // Fields to consider merging
    const mergePaths = [
      'contact.phone',
      'contact.website',
      'contact.email',
      'contact.emails',
      'location.full_address',
      'location.street',
      'location.city',
      'location.state',
      'location.country',
      'location.postal_code',
      'location.coordinates',
      'business.category',
      'business.description',
      'ratings.rating',
      'ratings.review_count',
      'digitalPresence.website',
      'digitalPresence.photos',
      'pricing',
    ];
    
    for (const path of mergePaths) {
      fillIfMissing(existing, duplicate, path);
    }
  }

  /**
   * Parse address components from full address.
   * @private
   */
  _parseAddress(fullAddress) {
    if (!fullAddress) return { city: null, state: null, country: null, postalCode: null, street: null };
    
    const parts = fullAddress.split(',').map(p => p.trim());
    const result = { city: null, state: null, country: null, postalCode: null, street: null };
    
    if (parts.length >= 1) result.street = parts[0];
    if (parts.length >= 2) result.city = parts[1];
    if (parts.length >= 3) {
      // Third part might be "State ZIP" or "State, Country"
      const part3 = parts[2];
      const stateZipMatch = part3.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/);
      if (stateZipMatch) {
        result.state = stateZipMatch[1];
        result.postalCode = stateZipMatch[2];
      } else {
        result.state = part3;
      }
    }
    if (parts.length >= 4) result.country = parts[3];
    
    return result;
  }

  /**
   * Calculate distance between two coordinates in degrees.
   * @private
   */
  _calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2) return Infinity;
    return Math.hypot(coord1.lat - coord2.lat, coord1.lng - coord2.lng);
  }
}

export default ScrapingResultNormalizer;