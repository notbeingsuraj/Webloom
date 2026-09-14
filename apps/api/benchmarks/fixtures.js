/**
 * Benchmark Fixtures — Representative Business Cases
 * 
 * These fixtures represent real-world business extraction scenarios.
 * Each fixture includes:
 * - googleMapsUrl: The input URL
 * - expectedProfile: Ground truth business profile
 * - providerMocks: Mocked provider responses (Geoapify, web extraction, etc.)
 * - aiMock: Mocked AI responses for fallback scenarios
 * - category: Fixture category for reporting
 */

export const BENCHMARK_FIXTURES = [
  // 1. Clean business website - full data available
  {
    id: 'clean-business',
    name: 'Clean Business Website',
    category: 'clean',
    googleMapsUrl: 'https://maps.google.com/place/ChIJN1t_tDeuEmsRUsoyG83frY4',
    expectedProfile: {
      identity: {
        name: 'Tartine Bakery',
        category: 'Bakery',
        description: 'Artisan bakery known for country bread and morning buns',
        business_type: 'bakery',
        categories: ['Bakery', 'Cafe', 'Breakfast']
      },
      contact: {
        phone: '+1-415-487-2600',
        email: 'info@tartinebakery.com',
        website: 'https://tartinebakery.com'
      },
      location: {
        full_address: '600 Guerrero St, San Francisco, CA 94110, USA',
        street: '600 Guerrero St',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        postal_code: '94110',
        coordinates: { lat: 37.7614, lng: -122.4239 }
      },
      ratings: {
        rating: 4.5,
        review_count: 2847
      }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Tartine Bakery', category: 'Bakery', description: 'Artisan bakery', business_type: 'bakery' },
          contact: { phone: '+1-415-487-2600', email: 'info@tartinebakery.com', website: 'https://tartinebakery.com' },
          location: { full_address: '600 Guerrero St, San Francisco, CA 94110', coordinates: { lat: 37.7614, lng: -122.4239 }, city: 'San Francisco', state: 'CA', country: 'USA', postal_code: '94110' },
          ratings: { rating: 4.5, review_count: 2847 }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Tartine Bakery', category: 'Bakery' },
          contact: { phone: '+1-415-487-2600', website: 'https://tartinebakery.com' },
          location: { full_address: '600 Guerrero St, San Francisco, CA 94110' }
        }]
      }
    }
  },

  // 2. Business with missing fields - phone missing
  {
    id: 'missing-phone',
    name: 'Business Missing Phone',
    category: 'missing-fields',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_missing_phone',
    expectedProfile: {
      identity: { name: 'Blue Bottle Coffee', category: 'Coffee Shop' },
      contact: { phone: null, email: 'hello@bluebottlecoffee.com', website: 'https://bluebottlecoffee.com' },
      location: { full_address: '300 Webster St, San Francisco, CA 94117', coordinates: { lat: 37.7749, lng: -122.4194 } }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Blue Bottle Coffee', category: 'Coffee Shop' },
          contact: { phone: null, email: 'hello@bluebottlecoffee.com', website: 'https://bluebottlecoffee.com' },
          location: { full_address: '300 Webster St, San Francisco, CA 94117', coordinates: { lat: 37.7749, lng: -122.4194 } }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Blue Bottle Coffee' },
          contact: { email: 'hello@bluebottlecoffee.com', website: 'https://bluebottlecoffee.com' }
        }]
      }
    }
  },

  // 3. Conflicting business names
  {
    id: 'conflicting-names',
    name: 'Conflicting Business Names',
    category: 'conflicts',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_conflicting',
    expectedProfile: {
      identity: { name: 'Starbucks Reserve', category: 'Coffee Shop' },
      contact: { phone: '+1-415-555-0100' },
      location: { full_address: '700 Howard St, San Francisco, CA 94103' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Starbucks', category: 'Coffee Shop' },
          contact: { phone: '+1-415-555-0100' },
          location: { full_address: '700 Howard St, San Francisco, CA 94103' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Starbucks Reserve Roastery', category: 'Coffee Shop' },
          contact: { phone: '+1-415-555-0100' },
          location: { full_address: '700 Howard St, San Francisco, CA 94103' }
        }]
      }
    }
  },

  // 4. Conflicting addresses - different city
  {
    id: 'conflicting-address',
    name: 'Conflicting Address - Different City',
    category: 'conflicts',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_address_conflict',
    expectedProfile: {
      identity: { name: 'Philz Coffee', category: 'Coffee Shop' },
      contact: { phone: '+1-415-872-2600' },
      location: { full_address: '3101 24th St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Philz Coffee', category: 'Coffee Shop' },
          contact: { phone: '+1-415-872-2600' },
          location: { full_address: '3101 24th St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA', coordinates: { lat: 37.7519, lng: -122.4191 } }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Philz Coffee' },
          contact: { phone: '+1-415-872-2600' },
          location: { full_address: '101 Main St, Oakland, CA 94607', city: 'Oakland', state: 'CA', coordinates: { lat: 37.8044, lng: -122.2711 } }
        }]
      }
    }
  },

  // 5. Multiple phone numbers
  {
    id: 'multiple-phones',
    name: 'Multiple Phone Numbers',
    category: 'multiple-values',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_multiple_phones',
    expectedProfile: {
      identity: { name: 'Kaiser Permanente', category: 'Medical Center' },
      contact: { phone: '+1-415-833-2000' }, // Main line
      location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Kaiser Permanente Medical Center', category: 'Medical Center' },
          contact: { phone: '+1-415-833-2000' },
          location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Kaiser Permanente' },
          contact: { phone: '+1-800-555-1234' }, // Toll-free number
          location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115' }
        }]
      }
    }
  },

  // 6. Multiple locations
  {
    id: 'multiple-locations',
    name: 'Multiple Locations - Chain',
    category: 'multiple-values',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_multiple_locations',
    expectedProfile: {
      identity: { name: 'Target', category: 'Department Store' },
      contact: { phone: '+1-415-555-0200' },
      location: { full_address: '789 Mission St, San Francisco, CA 94103' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Target', category: 'Department Store' },
          contact: { phone: '+1-415-555-0200' },
          location: { full_address: '789 Mission St, San Francisco, CA 94103' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Target' },
          contact: { phone: '+1-415-555-0200' },
          location: { full_address: '789 Mission St, San Francisco, CA 94103' }
        }]
      }
    }
  },

  // 7. Incorrect/stale directory data
  {
    id: 'stale-directory',
    name: 'Stale Directory Data',
    category: 'stale-data',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_stale',
    expectedProfile: {
      identity: { name: 'The Mill', category: 'Bakery' },
      contact: { phone: '+1-415-872-2600', website: 'https://themillsf.com' },
      location: { full_address: '736 Divisadero St, San Francisco, CA 94117' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'The Mill', category: 'Bakery' },
          contact: { phone: '+1-415-555-9999', website: 'http://old-themill-site.com' }, // Old phone and website
          location: { full_address: '736 Divisadero St, San Francisco, CA 94117' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'The Mill' },
          contact: { phone: '+1-415-872-2600', website: 'https://themillsf.com' },
          location: { full_address: '736 Divisadero St, San Francisco, CA 94117' }
        }]
      }
    }
  },

  // 8. Social profile only - no website
  {
    id: 'social-only',
    name: 'Social Profile Only',
    category: 'minimal-data',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_social_only',
    expectedProfile: {
      identity: { name: 'Pop-up Bakery', category: 'Bakery' },
      contact: { phone: '+1-415-555-0300', email: 'popup@bakery.com', website: null },
      location: { full_address: 'Ferry Building, San Francisco, CA 94111' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Pop-up Bakery', category: 'Bakery' },
          contact: { phone: '+1-415-555-0300', email: null, website: null },
          location: { full_address: 'Ferry Building, San Francisco, CA 94111' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Pop-up Bakery' },
          contact: { phone: '+1-415-555-0300', email: 'popup@bakery.com' },
          location: { full_address: 'Ferry Building, San Francisco, CA 94111' }
        }]
      }
    }
  },

  // 9. JavaScript-rendered website
  {
    id: 'js-rendered',
    name: 'JavaScript-Rendered Website',
    category: 'js-rendered',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_js_rendered',
    expectedProfile: {
      identity: { name: 'Modern Coffee', category: 'Coffee Shop' },
      contact: { phone: '+1-415-555-0400', website: 'https://moderncoffee.app' },
      location: { full_address: '1500 Mission St, San Francisco, CA 94103' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Modern Coffee', category: 'Coffee Shop' },
          contact: { phone: '+1-415-555-0400', website: 'https://moderncoffee.app' },
          location: { full_address: '1500 Mission St, San Francisco, CA 94103' }
        }]
      },
      webExtraction: {
        status: 'partial', // JS-rendered, so partial extraction
        records: [{
          business: { name: 'Modern Coffee' },
          contact: { phone: '+1-415-555-0400' },
          location: { full_address: '1500 Mission St, San Francisco, CA 94103' }
        }],
        metadata: { aiExtracted: true }
      }
    }
  },

  // 10. Incomplete/malformed data
  {
    id: 'malformed-data',
    name: 'Incomplete/Malformed Data',
    category: 'malformed',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_malformed',
    expectedProfile: {
      identity: { name: 'Corner Cafe', category: 'Cafe' },
      contact: { phone: '+1-415-555-0500', email: null, website: null },
      location: { full_address: '123 Market St, San Francisco, CA 94105', city: 'San Francisco', state: 'CA', country: 'USA' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Corner Cafe', category: null, description: null },
          contact: { phone: '+1-415-555-0500', email: 'invalid-email', website: 'not-a-url' },
          location: { full_address: '123 Market St', city: 'San Francisco', state: 'CA', country: 'USA' }
        }]
      }
    }
  },

  // 11. All providers fail - empty extraction
  {
    id: 'all-providers-fail',
    name: 'All Providers Fail',
    category: 'all-fail',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_all_fail',
    expectedProfile: {
      identity: { name: 'Mystery Business', category: null },
      contact: { phone: null, email: null, website: null },
      location: { full_address: null, coordinates: { lat: 37.7749, lng: -122.4194 } }
    },
    providerMocks: {
      geoapify: {
        status: 'empty_result',
        records: []
      },
      webExtraction: {
        status: 'not_configured',
        records: []
      }
    }
  },

  // 12. Requires AI fallback for missing phone
  {
    id: 'ai-fallback-phone',
    name: 'AI Fallback Required - Missing Phone',
    category: 'ai-fallback',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_ai_phone',
    expectedProfile: {
      identity: { name: 'AI Coffee Co', category: 'Coffee Shop' },
      contact: { phone: '+1-415-555-0600', email: 'info@aicoffee.com', website: 'https://aicoffee.com' },
      location: { full_address: '500 Folsom St, San Francisco, CA 94105' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'AI Coffee Co', category: 'Coffee Shop' },
          contact: { phone: null, email: 'info@aicoffee.com', website: 'https://aicoffee.com' },
          location: { full_address: '500 Folsom St, San Francisco, CA 94105' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'AI Coffee Co' },
          contact: { email: 'info@aicoffee.com', website: 'https://aicoffee.com' },
          location: { full_address: '500 Folsom St, San Francisco, CA 94105' }
        }],
        metadata: { sourceText: 'AI Coffee Co is located at 500 Folsom St. Call us at +1-415-555-0600 or email info@aicoffee.com. Visit https://aicoffee.com for more.' }
      }
    },
    aiMock: {
      phone: { value: '+1-415-555-0600', evidence: 'Call us at +1-415-555-0600', confidence: 0.95, status: 'extracted' }
    }
  },

  // 13. AI must not overwrite verified data
  {
    id: 'ai-no-overwrite',
    name: 'AI Must Not Overwrite Verified',
    category: 'ai-protection',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_ai_protection',
    expectedProfile: {
      identity: { name: 'Verified Bakery', category: 'Bakery' },
      contact: { phone: '+1-415-555-0700', website: 'https://verifiedbakery.com' },
      location: { full_address: '100 Main St, San Francisco, CA 94105' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Verified Bakery', category: 'Bakery' },
          contact: { phone: '+1-415-555-0700', website: 'https://verifiedbakery.com' },
          location: { full_address: '100 Main St, San Francisco, CA 94105' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Verified Bakery' },
          contact: { website: 'https://verifiedbakery.com' },
          location: { full_address: '100 Main St, San Francisco, CA 94105' }
        }],
        metadata: { 
          sourceText: 'Verified Bakery at 100 Main St. Phone: +1-415-555-9999. Website: https://fake-site.com.',
          aiExtracted: true 
        }
      }
    },
    aiMock: {
      phone: { value: '+1-415-555-9999', evidence: 'Phone: +1-415-555-9999', confidence: 0.85, status: 'extracted' },
      website: { value: 'https://fake-site.com', evidence: 'Website: https://fake-site.com', confidence: 0.8, status: 'extracted' }
    }
  },

  // 14. Duplicate source URLs
  {
    id: 'duplicate-urls',
    name: 'Duplicate Source URLs',
    category: 'deduplication',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_duplicate',
    expectedProfile: {
      identity: { name: 'Dedupe Cafe', category: 'Cafe' },
      contact: { phone: '+1-415-555-0800' },
      location: { full_address: '200 Pine St, San Francisco, CA 94104' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Dedupe Cafe', category: 'Cafe' },
          contact: { phone: '+1-415-555-0800' },
          location: { full_address: '200 Pine St, San Francisco, CA 94104' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Dedupe Cafe' },
          contact: { phone: '+1-415-555-0800' },
          location: { full_address: '200 Pine St, San Francisco, CA 94104' }
        }],
        metadata: { sourceUrl: 'https://maps.google.com/place/ChIJ_duplicate' }
      }
    }
  },

  // 15. AI hallucination test - evidence contradicts AI
  {
    id: 'ai-hallucination',
    name: 'AI Hallucination - Evidence Contradicts',
    category: 'ai-hallucination',
    googleMapsUrl: 'https://maps.google.com/place/ChIJ_hallucination',
    expectedProfile: {
      identity: { name: 'Real Coffee', category: 'Coffee Shop' },
      contact: { phone: '+1-415-555-0900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' },
      location: { full_address: '300 Howard St, San Francisco, CA 94105' }
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Real Coffee', category: 'Coffee Shop' },
          contact: { phone: '+1-415-555-0900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' },
          location: { full_address: '300 Howard St, San Francisco, CA 94105' }
        }]
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Real Coffee' },
          contact: { phone: '+1-415-555-0900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' },
          location: { full_address: '300 Howard St, San Francisco, CA 94105' }
        }],
        metadata: { 
          sourceText: 'Real Coffee at 300 Howard St. Phone: +1-415-555-0900. Email: real@realcoffee.com. Website: https://realcoffee.com.',
          aiExtracted: true 
        }
      }
    },
    aiMock: {
      phone: { value: '+1-415-555-9999', evidence: 'Phone: +1-415-555-9999', confidence: 0.9, status: 'extracted' }, // Hallucinated different phone
      email: { value: 'fake@fake.com', evidence: 'Email: fake@fake.com', confidence: 0.85, status: 'extracted' } // Hallucinated email
    }
  }
];

// Export categories for filtering
export const FIXTURE_CATEGORIES = [
  'clean',
  'missing-fields',
  'conflicts',
  'multiple-values',
  'stale-data',
  'minimal-data',
  'js-rendered',
  'malformed',
  'all-fail',
  'ai-fallback',
  'ai-protection',
  'deduplication',
  'ai-hallucination'
];

export default BENCHMARK_FIXTURES;