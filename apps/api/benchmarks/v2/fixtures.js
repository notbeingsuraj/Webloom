/**
 * Benchmark v2 — Deterministic Fixture Library
 *
 * REPRESENTATIVE REAL-WORLD BUSINESS EXTRACTION CASES (Phase 2 spec):
 *   clean            — full data across all fields, all providers agree
 *   missing-fields   — individual fields absent from providers (phone/email/website)
 *   conflicting-names— providers disagree on the business name
 *   conflicting-addr — providers disagree on the address (different city)
 *   multiple-phones  — two providers give two different valid phone numbers
 *   multiple-locs    — chain business; provider records for different locations
 *   stale-directory  — old phone/website in one provider vs fresh in another
 *   social-only      — business present only via social profiles, no website
 *   js-rendered      — JS-rendered site; structured provider has gaps, source text has data
 *   malformed        — partial/malformed data (invalid email, bad URL)
 *   all-providers-fail — every provider fails to extract a field
 *   ai-fallback      — legitimately missing field recoverable from evidence by AI
 *   ai-no-overwrite  — AI produces conflicting data; must NOT overwrite verified
 *   ai-hallucination — AI fabricates values not in evidence; must be rejected
 *   duplicate-urls   — same source URL supplied twice; must dedupe cleanly
 *   conflicts-write  — conflicting provider observations must be recorded as conflicts
 *
 * Every fixture is FULLY DETERMINISTIC: mocked providers + mocked AI return
 * fixed payloads. No live websites, no network, no uncontrolled behavior.
 *
 * Ground truth (`expectedProfile`) is the *authoritative* answer for each
 * field, used to measure correctness. `expectedProvenance` states what
 * provenance tier each field should end up with, so provenance accuracy is
 * measured independently of value correctness.
 */

// Deterministic Google Maps style URLs per fixture.
const url = (id) => `https://maps.google.com/place/${id}/@37.7749,-122.4194,17z/data=!3m1!4b1`;

// ---------------------------------------------------------------------------
// Shared source-text snippets (deterministic "page content" used by fallback)
// ---------------------------------------------------------------------------
export const SOURCE_TEXTS = {
  clean:
    'Tartine Bakery\nArtisan bakery known for country bread and morning buns\n' +
    '600 Guerrero St, San Francisco, CA 94110\n' +
    '(415) 487-2600\ninfo@tartinebakery.com\nhttps://tartinebakery.com\n' +
    'Open now · 4.5 (2,847 reviews)\nBreakfast · Bakery · Cafe',
  ai_fallback:
    'AI Coffee Co\nCoffee Shop\n500 Folsom St, San Francisco, CA 94105\n' +
    'Call us at (415) 555-0600 or email info@aicoffee.com\n' +
    'Visit https://aicoffee.com for more.',
  ai_no_overwrite:
    'Verified Bakery\nBakery\n100 Main St, San Francisco, CA 94105\n' +
    'Phone: (415) 555-0700. Website: https://verifiedbakery.com',
  ai_hallucination:
    'Real Coffee\nCoffee Shop\n300 Howard St, San Francisco, CA 94105\n' +
    'Phone: (415) 555-0900. Email: real@realcoffee.com. Website: https://realcoffee.com',
  js_rendered:
    'Modern Coffee\nCoffee Shop\n1500 Mission St, San Francisco, CA 94103\n' +
    '(415) 555-0400\nhttps://moderncoffee.app',
  stale:
    'The Mill\nBakery\n736 Divisadero St, San Francisco, CA 94117\n' +
    '(415) 872-2600\nhttps://themillsf.com',
};

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------
export const BENCHMARK_FIXTURES = [
  // 1. Clean business website — full data, providers agree
  {
    id: 'clean',
    name: 'Clean Business Website',
    category: 'clean',
    googleMapsUrl: url('ChIJ_clean'),
    expectedProfile: {
      identity: { name: 'Tartine Bakery', category: 'bakery', description: 'Artisan bakery known for country bread and morning buns' },
      contact: { phone: '+14154872600', email: 'info@tartinebakery.com', website: 'https://tartinebakery.com' },
      location: { full_address: '600 Guerrero St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA', country: 'US', postal_code: '94110', coordinates: { lat: 37.7614, lng: -122.4239 } },
      ratings: { rating: 4.5, review_count: 2847 },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Tartine Bakery', category: 'bakery', description: 'Artisan bakery known for country bread and morning buns' },
          contact: { phone: '+14154872600', email: 'info@tartinebakery.com', website: 'https://tartinebakery.com' },
          location: { full_address: '600 Guerrero St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA', country: 'US', postal_code: '94110', coordinates: { lat: 37.7614, lng: -122.4239 } },
          ratings: { rating: 4.5, review_count: 2847 },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Tartine Bakery', category: 'bakery' },
          contact: { phone: '+14154872600', website: 'https://tartinebakery.com' },
          location: { full_address: '600 Guerrero St, San Francisco, CA 94110' },
          metadata: { sourceText: SOURCE_TEXTS.clean },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.clean,
    expectedProvenance: {
      'identity.name': 'identified', // from URL parse (authoritative over discovered)
      'location.coordinates': 'identified',
      'contact.phone': 'discovered',
      'contact.email': 'discovered',
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
      'identity.category': 'discovered',
      'ratings.rating': 'observed',
      'ratings.review_count': 'observed',
    },
  },

  // 2. Business missing phone & email — providers lack them, no AI evidence
  {
    id: 'missing-phone-email',
    name: 'Missing Phone & Email',
    category: 'missing-fields',
    googleMapsUrl: url('ChIJ_missing'),
    expectedProfile: {
      identity: { name: 'Blue Bottle Coffee', category: 'cafe' },
      contact: { phone: null, email: null, website: 'https://bluebottlecoffee.com' },
      location: { full_address: '300 Webster St, San Francisco, CA 94117', coordinates: { lat: 37.7717, lng: -122.4118 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Blue Bottle Coffee', category: 'cafe' },
          contact: { website: 'https://bluebottlecoffee.com' }, // no phone/email
          location: { full_address: '300 Webster St, San Francisco, CA 94117', coordinates: { lat: 37.7717, lng: -122.4118 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Blue Bottle Coffee' },
          contact: { website: 'https://bluebottlecoffee.com' },
          location: { full_address: '300 Webster St, San Francisco, CA 94117' },
          metadata: { sourceText: 'Blue Bottle Coffee\nCafe\n300 Webster St, San Francisco\nhttps://bluebottlecoffee.com' },
        }],
      },
    },
    sourceText: 'Blue Bottle Coffee\nCafe\n300 Webster St, San Francisco\nhttps://bluebottlecoffee.com',
    expectedProvenance: {
      'identity.name': 'identified',
      'location.coordinates': 'identified',
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
      'contact.phone': null, // must stay null — no evidence anywhere
      'contact.email': null,
    },
  },

  // 3. Conflicting business names — providers disagree
  {
    id: 'conflicting-names',
    name: 'Conflicting Business Names',
    category: 'conflicts',
    googleMapsUrl: url('ChIJ_names'),
    expectedProfile: {
      identity: { name: 'Starbucks Reserve', category: 'cafe' }, // URL name is authoritative
      contact: { phone: '+14155550100' },
      location: { full_address: '700 Howard St, San Francisco, CA 94103', coordinates: { lat: 37.7843, lng: -122.4016 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Starbucks', category: 'cafe' },
          contact: { phone: '+14155550100' },
          location: { full_address: '700 Howard St, San Francisco, CA 94103', coordinates: { lat: 37.7843, lng: -122.4016 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Starbucks Reserve Roastery', category: 'cafe' },
          contact: { phone: '+14155550100' },
          location: { full_address: '700 Howard St, San Francisco, CA 94103' },
          metadata: { sourceText: 'Starbucks Reserve Roastery\n700 Howard St, San Francisco, CA 94103\n(415) 555-0100' },
        }],
      },
    },
    sourceText: 'Starbucks Reserve Roastery\n700 Howard St, San Francisco, CA 94103\n(415) 555-0100',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'location.full_address': 'discovered',
      'location.coordinates': 'identified',
    },
    expectConflicts: ['identity.name'],
  },

  // 4. Conflicting addresses — one provider has wrong city
  {
    id: 'conflicting-address',
    name: 'Conflicting Address (Different City)',
    category: 'conflicts',
    googleMapsUrl: url('ChIJ_addr'),
    expectedProfile: {
      identity: { name: 'Philz Coffee', category: 'cafe' },
      contact: { phone: '+14158722600' },
      location: { full_address: '3101 24th St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA', coordinates: { lat: 37.7519, lng: -122.4191 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Philz Coffee', category: 'cafe' },
          contact: { phone: '+14158722600' },
          location: { full_address: '3101 24th St, San Francisco, CA 94110', city: 'San Francisco', state: 'CA', coordinates: { lat: 37.7519, lng: -122.4191 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Philz Coffee' },
          contact: { phone: '+14158722600' },
          location: { full_address: '101 Main St, Oakland, CA 94607', city: 'Oakland', state: 'CA', coordinates: { lat: 37.8044, lng: -122.2711 } },
          metadata: { sourceText: 'Philz Coffee\n101 Main St, Oakland, CA 94607\n(415) 872-2600' },
        }],
      },
    },
    sourceText: 'Philz Coffee\n101 Main St, Oakland, CA 94607\n(415) 872-2600',
    expectedProvenance: {
      'identity.name': 'identified',
      'location.coordinates': 'identified',
      'location.full_address': 'discovered',
      'contact.phone': 'discovered',
    },
    expectConflicts: ['location.full_address'],
  },

  // 5. Multiple phone numbers — providers return different valid phones
  {
    id: 'multiple-phones',
    name: 'Multiple Phone Numbers',
    category: 'multiple-values',
    googleMapsUrl: url('ChIJ_phones'),
    expectedProfile: {
      identity: { name: 'Kaiser Permanente SF', category: 'medical_center' },
      contact: { phone: '+14158332000' }, // main line is authoritative (geoapify)
      location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115', coordinates: { lat: 37.7816, lng: -122.4645 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Kaiser Permanente SF', category: 'medical_center' },
          contact: { phone: '+14158332000' },
          location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115', coordinates: { lat: 37.7816, lng: -122.4645 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Kaiser Permanente SF' },
          contact: { phone: '+18005551234' }, // toll-free corporate line
          location: { full_address: '2425 Geary Blvd, San Francisco, CA 94115' },
          metadata: { sourceText: 'Kaiser Permanente SF\n2425 Geary Blvd, San Francisco, CA 94115\nToll-free: (800) 555-1234' },
        }],
      },
    },
    sourceText: 'Kaiser Permanente SF\n2425 Geary Blvd, San Francisco, CA 94115\nToll-free: (800) 555-1234',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered', // geoapify wins by equal-provenance-confidence
      'location.full_address': 'discovered',
    },
    expectConflicts: ['contact.phone'],
  },

  // 6. Multiple locations — chain records for different sites
  {
    id: 'multiple-locations',
    name: 'Multiple Locations (Chain)',
    category: 'multiple-values',
    googleMapsUrl: url('ChIJ_locs'),
    expectedProfile: {
      identity: { name: 'Target Mission', category: 'department_store' },
      contact: { phone: '+14155550200' },
      location: { full_address: '789 Mission St, San Francisco, CA 94103', coordinates: { lat: 37.7849, lng: -122.4046 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Target Mission', category: 'department_store' },
          contact: { phone: '+14155550200' },
          location: { full_address: '789 Mission St, San Francisco, CA 94103', coordinates: { lat: 37.7849, lng: -122.4046 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Target' }, // generic chain name
          contact: { phone: '+14155550200' },
          location: { full_address: '789 Mission St, San Francisco, CA 94103' },
          metadata: { sourceText: 'Target\n789 Mission St, San Francisco, CA 94103\n(415) 555-0200' },
        }],
      },
    },
    sourceText: 'Target\n789 Mission St, San Francisco, CA 94103\n(415) 555-0200',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'location.full_address': 'discovered',
    },
  },

  // 7. Stale directory data — one provider has old phone/website
  {
    id: 'stale-directory',
    name: 'Stale Directory Data',
    category: 'stale-data',
    googleMapsUrl: url('ChIJ_stale'),
    expectedProfile: {
      identity: { name: 'The Mill', category: 'bakery' },
      contact: { phone: '+14158722600', website: 'https://themillsf.com' }, // fresh data
      location: { full_address: '736 Divisadero St, San Francisco, CA 94117', coordinates: { lat: 37.7749, lng: -122.4376 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'The Mill', category: 'bakery' },
          contact: { phone: '+14155559999', website: 'http://old-themill-site.com' }, // STALE
          location: { full_address: '736 Divisadero St, San Francisco, CA 94117', coordinates: { lat: 37.7749, lng: -122.4376 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'The Mill' },
          contact: { phone: '+14158722600', website: 'https://themillsf.com' }, // FRESH
          location: { full_address: '736 Divisadero St, San Francisco, CA 94117' },
          metadata: { sourceText: SOURCE_TEXTS.stale },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.stale,
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
    },
    expectConflicts: ['contact.phone', 'contact.website'],
  },

  // 8. Social profile only — no website anywhere
  {
    id: 'social-only',
    name: 'Social Profile Only (No Website)',
    category: 'minimal-data',
    googleMapsUrl: url('ChIJ_social'),
    expectedProfile: {
      identity: { name: 'Pop-up Bakery', category: 'bakery' },
      contact: { phone: '+14155550300', email: null, website: null },
      location: { full_address: 'Ferry Building, San Francisco, CA 94111', coordinates: { lat: 37.7955, lng: -122.3937 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Pop-up Bakery', category: 'bakery' },
          contact: { phone: '+14155550300' }, // no email/website
          location: { full_address: 'Ferry Building, San Francisco, CA 94111', coordinates: { lat: 37.7955, lng: -122.3937 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Pop-up Bakery' },
          contact: { phone: '+14155550300' },
          location: { full_address: 'Ferry Building, San Francisco, CA 94111' },
          metadata: { sourceText: 'Pop-up Bakery\nFerry Building, San Francisco, CA 94111\n(415) 555-0300' },
        }],
      },
    },
    sourceText: 'Pop-up Bakery\nFerry Building, San Francisco, CA 94111\n(415) 555-0300',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'location.full_address': 'discovered',
      'contact.email': null,
      'contact.website': null,
    },
  },

  // 9. JavaScript-rendered website — structured provider gaps, source text full
  {
    id: 'js-rendered',
    name: 'JavaScript-Rendered Website',
    category: 'js-rendered',
    googleMapsUrl: url('ChIJ_js'),
    expectedProfile: {
      identity: { name: 'Modern Coffee', category: 'cafe' },
      contact: { phone: '+14155550400', website: 'https://moderncoffee.app' },
      location: { full_address: '1500 Mission St, San Francisco, CA 94103', coordinates: { lat: 37.7721, lng: -122.4190 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Modern Coffee', category: 'cafe' },
          contact: { phone: '+14155550400' }, // no website from provider
          location: { full_address: '1500 Mission St, San Francisco, CA 94103', coordinates: { lat: 37.7721, lng: -122.4190 } },
        }],
      },
      webExtraction: {
        status: 'partial', // JS-rendered page — partial recovery
        records: [{
          business: { name: 'Modern Coffee' },
          contact: { phone: '+14155550400' },
          location: { full_address: '1500 Mission St, San Francisco, CA 94103' },
          metadata: { sourceText: SOURCE_TEXTS.js_rendered },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.js_rendered, // website recovered from source text
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'contact.website': 'ai_generated', // recovered via evidence-grounded AI
      'location.full_address': 'discovered',
    },
  },

  // 10. Incomplete/malformed data — invalid email/URL in provider record
  {
    id: 'malformed',
    name: 'Incomplete/Malformed Data',
    category: 'malformed',
    googleMapsUrl: url('ChIJ_malformed'),
    expectedProfile: {
      identity: { name: 'Corner Cafe', category: null }, // category missing everywhere
      contact: { phone: '+14155550500', email: null, website: null }, // invalid ones rejected
      location: { full_address: '123 Market St, San Francisco, CA 94105', city: 'San Francisco', state: 'CA', country: 'US', coordinates: { lat: 37.7890, lng: -122.3935 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Corner Cafe', category: null, description: null },
          contact: { phone: '+14155550500', email: 'not-an-email', website: 'not-a-url' }, // MALFORMED
          location: { full_address: '123 Market St', city: 'San Francisco', state: 'CA', country: 'US', coordinates: { lat: 37.7890, lng: -122.3935 } },
        }],
      },
      webExtraction: {
        status: 'empty_result', // no secondary recovery
        records: [],
      },
    },
    sourceText: '',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'contact.email': null, // rejected — invalid format
      'contact.website': null, // rejected — invalid URL
      'location.full_address': 'discovered',
    },
  },

  // 11. All providers fail — no data, no identity fabrication
  {
    id: 'all-providers-fail',
    name: 'All Providers Fail',
    category: 'all-fail',
    googleMapsUrl: url('ChIJ_fail'),
    expectedProfile: {
      identity: { name: 'Mystery Business', category: null },
      contact: { phone: null, email: null, website: null },
      location: { full_address: null, coordinates: { lat: 37.7749, lng: -122.4194 } },
    },
    providerMocks: {
      geoapify: { status: 'empty_result', records: [] },
      webExtraction: { status: 'not_configured', records: [] },
    },
    sourceText: null,
    expectedProvenance: {
      'identity.name': 'identified',
      'location.coordinates': 'identified',
      'contact.phone': null,
      'contact.email': null,
      'contact.website': null,
      'location.full_address': null,
    },
  },

  // 12. AI fallback — phone recoverable from source text evidence
  {
    id: 'ai-fallback-phone',
    name: 'AI Fallback Required (Phone)',
    category: 'ai-fallback',
    googleMapsUrl: url('ChIJ_aiphone'),
    expectedProfile: {
      identity: { name: 'AI Coffee Co', category: 'cafe' },
      contact: { phone: '+14155550600', email: 'info@aicoffee.com', website: 'https://aicoffee.com' },
      location: { full_address: '500 Folsom St, San Francisco, CA 94105', coordinates: { lat: 37.7860, lng: -122.3980 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'AI Coffee Co', category: 'cafe' },
          contact: { email: 'info@aicoffee.com', website: 'https://aicoffee.com' }, // NO phone
          location: { full_address: '500 Folsom St, San Francisco, CA 94105', coordinates: { lat: 37.7860, lng: -122.3980 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'AI Coffee Co' },
          contact: { email: 'info@aicoffee.com', website: 'https://aicoffee.com' },
          location: { full_address: '500 Folsom St, San Francisco, CA 94105' },
          metadata: { sourceText: SOURCE_TEXTS.ai_fallback },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.ai_fallback, // contains "(415) 555-0600"
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'ai_generated', // evidence-grounded AI fills the gap
      'contact.email': 'discovered',
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
    },
  },

  // 13. AI must NOT overwrite verified data
  {
    id: 'ai-no-overwrite',
    name: 'AI Must Not Overwrite Verified',
    category: 'ai-protection',
    googleMapsUrl: url('ChIJ_aiprot'),
    expectedProfile: {
      identity: { name: 'Verified Bakery', category: 'bakery' },
      contact: { phone: '+14155550700', website: 'https://verifiedbakery.com' }, // REAL data preserved
      location: { full_address: '100 Main St, San Francisco, CA 94105', coordinates: { lat: 37.7898, lng: -122.3912 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Verified Bakery', category: 'bakery' },
          contact: { phone: '+14155550700', website: 'https://verifiedbakery.com' },
          location: { full_address: '100 Main St, San Francisco, CA 94105', coordinates: { lat: 37.7898, lng: -122.3912 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Verified Bakery' },
          contact: { website: 'https://verifiedbakery.com' },
          location: { full_address: '100 Main St, San Francisco, CA 94105' },
          metadata: { sourceText: SOURCE_TEXTS.ai_no_overwrite, aiExtracted: true },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.ai_no_overwrite, // contains a DIFFERENT (wrong) phone 555-9999
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered', // verified data NOT overwritten by AI
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
    },
  },

  // 14. Duplicate source URLs — same URL twice, no double-write
  {
    id: 'duplicate-urls',
    name: 'Duplicate Source URLs',
    category: 'deduplication',
    googleMapsUrl: url('ChIJ_dup'),
    expectedProfile: {
      identity: { name: 'Dedupe Cafe', category: 'cafe' },
      contact: { phone: '+14155550800' },
      location: { full_address: '200 Pine St, San Francisco, CA 94104', coordinates: { lat: 37.7928, lng: -122.4010 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Dedupe Cafe', category: 'cafe' },
          contact: { phone: '+14155550800' },
          location: { full_address: '200 Pine St, San Francisco, CA 94104', coordinates: { lat: 37.7928, lng: -122.4010 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Dedupe Cafe' },
          contact: { phone: '+14155550800' },
          location: { full_address: '200 Pine St, San Francisco, CA 94104' },
          metadata: { sourceUrl: url('ChIJ_dup') }, // same URL as input
        }],
      },
    },
    sourceText: 'Dedupe Cafe\n200 Pine St, San Francisco, CA 94104\n(415) 555-0800',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'location.full_address': 'discovered',
    },
  },

  // 15. AI hallucination — AI fabricates values not present in evidence
  {
    id: 'ai-hallucination',
    name: 'AI Hallucination (Must Be Rejected)',
    category: 'ai-hallucination',
    googleMapsUrl: url('ChIJ_halluc'),
    expectedProfile: {
      identity: { name: 'Real Coffee', category: 'cafe' },
      contact: { phone: '+14155550900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' }, // REAL values
      location: { full_address: '300 Howard St, San Francisco, CA 94105', coordinates: { lat: 37.7859, lng: -122.3964 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Real Coffee', category: 'cafe' },
          contact: { phone: '+14155550900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' },
          location: { full_address: '300 Howard St, San Francisco, CA 94105', coordinates: { lat: 37.7859, lng: -122.3964 } },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Real Coffee' },
          contact: { phone: '+14155550900', email: 'real@realcoffee.com', website: 'https://realcoffee.com' },
          location: { full_address: '300 Howard St, San Francisco, CA 94105' },
          metadata: { sourceText: SOURCE_TEXTS.ai_hallucination, aiExtracted: true },
        }],
      },
    },
    sourceText: SOURCE_TEXTS.ai_hallucination, // AI mock returns WRONG values below
    aiMock: {
      phone: { value: '+14159999999', evidence: null, confidence: 0.9, status: 'extracted' }, // invented
      email: { value: 'fake@fake.com', evidence: null, confidence: 0.85, status: 'extracted' }, // invented
    },
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered', // AI invented phone REJECTED — real one kept
      'contact.email': 'discovered',
      'contact.website': 'discovered',
      'location.full_address': 'discovered',
    },
  },

  // 16. Conflicting provider observations — conflicts must be recorded
  {
    id: 'conflicts-recorded',
    name: 'Conflicting Providers (Recorded)',
    category: 'conflicts',
    googleMapsUrl: url('ChIJ_confrec'),
    expectedProfile: {
      identity: { name: 'Conflict Cafe', category: 'cafe' },
      contact: { phone: '+14155550111' }, // higher-confidence wins
      location: { full_address: '11 First St, San Francisco, CA 94105', coordinates: { lat: 37.7890, lng: -122.3925 } },
    },
    providerMocks: {
      geoapify: {
        status: 'success',
        records: [{
          business: { name: 'Conflict Cafe', category: 'cafe' },
          contact: { phone: '+14155550111' }, // conf 0.95
          location: { full_address: '11 First St, San Francisco, CA 94105', coordinates: { lat: 37.7890, lng: -122.3925 } },
          confidence: { phone: 0.95 },
        }],
      },
      webExtraction: {
        status: 'success',
        records: [{
          business: { name: 'Conflict Cafe' },
          contact: { phone: '+14152222222' }, // conf 0.6 — different number
          location: { full_address: '11 First St, San Francisco, CA 94105' },
          metadata: { sourceText: 'Conflict Cafe\n11 First St, San Francisco, CA 94105\n(415) 222-2222' },
        }],
      },
    },
    sourceText: 'Conflict Cafe\n11 First St, San Francisco, CA 94105\n(415) 222-2222',
    expectedProvenance: {
      'identity.name': 'identified',
      'contact.phone': 'discovered',
      'location.full_address': 'discovered',
    },
    expectConflicts: ['contact.phone'],
  },
];

// Categories for reporting
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
  'ai-hallucination',
];

export default BENCHMARK_FIXTURES;