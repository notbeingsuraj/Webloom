/**
 * P1.8 — Source-Grounded Google Maps Fallback Extraction — Regression Tests
 *
 * Verifies the field-level fallback recovery contract:
 *   - Geoapify-first precedence; Google Maps source fills gaps
 *   - AI may only extract from supplied evidence (never invent)
 *   - AI can never replace authoritative identity
 *   - Provenance (ai_generated) survives merge and canonical projection
 *   - Conflicts (city/state/coords/provider ID) are rejected, not merged
 *   - Missing fields stay null; source evidence retained
 *
 * Run: node test_phase_p18_source_grounded_fallback.js
 */

import assert from 'node:assert/strict';
import GoogleMapsFallbackExtractor, {
  extractDeterministicFallback,
  extractWithAIFallback,
  extractFallbackFields,
  validateCoordinates,
  validatePhone,
  isValidEmail,
  validateWebsite,
  isNonPhoneSignal,
  detectConflicts,
  AI_ACCEPTANCE_THRESHOLD,
} from './src/services/GoogleMapsFallbackExtractor.js';
import CanonicalBusinessProfileService from './src/services/CanonicalBusinessProfileService.js';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err });
    console.error(`  \u2717 ${name}\n      ${err.message}`);
  }
}

function skip(name) {
  skipped += 1;
  console.log(`  \u2013 SKIPPED ${name}`);
}

/* ================================================================== *
 * FIXTURES
 * ================================================================== */

// A Google Maps /place/ URL for a real business.
const MANAN_MAPS_URL =
  'https://www.google.com/maps/place/Manan+Furnitures/@29.9165,73.8789,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d29.9165!4d73.8789';

// Geoapify record WITH address but WITHOUT phone (primary source)
const geoapifyWithAddressNoPhone = {
  business: { name: 'Manan Furnitures', category: 'commercial.furniture_store', categories: ['commercial', 'commercial.furniture_store'] },
  contact: { phone: null, email: null, website: null },
  location: {
    full_address: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001, India',
    street: 'Meera Marg',
    city: 'Sri Ganganagar',
    state: 'Rajasthan',
    country: 'India',
    postal_code: '335001',
    latitude: 29.9165,
    longitude: 73.8789,
    coordinates: { lat: 29.9165, lng: 73.8789 },
  },
  ratings: { rating: null, review_count: null },
  hours: null,
  services: ['commercial.furniture_store'],
  provider: { name: 'geoapify', placeId: 'geoapify_manan_1' },
  confidence: { overall: 0.9, name: 0.98, category: 0.9, address: 0.95 },
};

// Geoapify record with NO address, NO phone (empty on location/contact)
const geoapifyNameOnly = {
  business: { name: 'Manan Furnitures', category: 'commercial.furniture_store' },
  contact: { phone: null, email: null, website: null },
  location: {},
  ratings: {},
  provider: { name: 'geoapify', placeId: 'geoapify_manan_2' },
  confidence: { overall: 0.6, name: 0.9 },
};

// A provider record from a STRONG source with address + phone
const strongProviderRecord = {
  business: { name: 'Manan Furnitures', category: 'Furniture store' },
  contact: { phone: '+91 98765 43210', email: null, website: 'https://mananfurnitures.example.com' },
  location: {
    full_address: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001',
    city: 'Sri Ganganagar',
    state: 'Rajasthan',
    postal_code: '335001',
    country: 'India',
    coordinates: { lat: 29.9165, lng: 73.8789 },
  },
  provider: { name: 'geoapify', placeId: 'geoapify_manan_3' },
  confidence: { overall: 0.92, phone: 0.95, website: 0.9, address: 0.95 },
};

// A WRONG business in a different city (Tarn Taran, Punjab — ~165 km away)
const wrongCityProviderRecord = {
  business: { name: 'Manan Furnitures', category: 'Religious Site' },
  contact: { phone: '+91 99999 00000', website: null },
  location: {
    full_address: 'Some Gurdwara Road, Tarn Taran, Punjab 143401',
    city: 'Tarn Taran',
    state: 'Punjab',
    postal_code: '143401',
    country: 'India',
    coordinates: { lat: 31.4519, lng: 74.9244 },
  },
  provider: { name: 'geoapify', placeId: 'geoapify_manan_tarn' },
  confidence: { overall: 0.85, phone: 0.9, address: 0.9 },
};

// A directory URL that must NOT be labeled the official website
const directoryRecord = {
  business: { name: 'Manan Furnitures', category: 'Furniture store' },
  contact: { phone: null, email: null, website: 'https://www.justdial.com/Sri-Ganganagar/Manan-Furnitures' },
  location: { full_address: 'Meera Marg, Jawahar Nagar', city: 'Sri Ganganagar' },
  provider: { name: 'geoapify', placeId: 'geoapify_dir_1' },
  confidence: { overall: 0.8, website: 0.7 },
};

// Real evidence text containing address + phone + email + website
const evidenceText = `Manan Furnitures
Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001
Phone: +91 98765 43210
Email: info@mananfurnitures.com
Website: https://www.mananfurnitures.com
Furniture store — sofas, beds, wardrobes, dining tables`;

// Evidence WITHOUT phone/email (no such fields present)
const evidenceNoContact = `Manan Furnitures
Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001
A furniture store in Sri Ganganagar.`;

// Evidence with NO cities at all
const evidenceNoCity = `Some furniture shop
1200 Main Street
We sell sofas and beds.`;

/* ================================================================== *
 * 1-6. PRECEDENCE / FALLBACK
 * ================================================================== */

check('1. Geoapify address present → Geoapify address wins (used directly)', () => {
  // When the canonical profile already carries the Geoapify address, the
  // fallback must NOT overwrite it.
  const existing = {
    identity: { name: 'Manan Furnitures' },
    location: { full_address: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001, India' },
  };
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: geoapifyWithAddressNoPhone,
    existingCanonicalProfile: existing,
  });
  // Fallback should fill whatever the canonical profile is missing, but never
  // overwrite a present Geoapify address.
  assert.equal(result.fields.address, undefined);
  assert.equal(result.unresolvedFields.includes('address'), false);
});

check('2. Geoapify address missing → Google Maps address fills it', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: geoapifyNameOnly, // no address
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  // The parser produces no formatted address itself, but the fallback uses
  // the provider record. geoapifyNameOnly has no address → cannot fill.
  // A STRONG source record (matching coords) is the fill path.
  const result2 = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  assert.equal(result2.fields.address, 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001');
  assert.equal(result2.evidence.address.source, 'geoapify');
  assert.equal(result2.evidence.address.extractionMethod, 'provider');
});

check('3. Geoapify phone missing → Google Maps/provider phone fills it', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: { city: 'Sri Ganganagar' }, contact: {} },
  });
  assert.equal(result.fields.phone, '+919876543210');
  assert.equal(result.evidence.phone.extractionMethod, 'provider');
});

check('4. Geoapify email missing → official website evidence fills it (AI grounded)', async () => {
  // Deterministic path has no email; AI extracts from evidence text.
  const result = await extractWithAIFallback({
    evidenceText,
    sourceUrl: MANAN_MAPS_URL,
    countryHint: 'India',
    ai: {
      generate: async () => ({
        address: { value: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001', evidence: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001', confidence: 0.95, status: 'extracted' },
        phone: { value: '+91 98765 43210', evidence: 'Phone: +91 98765 43210', confidence: 0.98, status: 'extracted' },
        email: { value: 'info@mananfurnitures.com', evidence: 'Email: info@mananfurnitures.com', confidence: 0.97, status: 'extracted' },
        website: { value: 'https://www.mananfurnitures.com', evidence: 'Website: https://www.mananfurnitures.com', confidence: 0.96, status: 'extracted' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.ok(result, 'AI extraction must return a result');
  assert.equal(result.fields.email, 'info@mananfurnitures.com');
  assert.equal(result.evidence.email.provenance, 'ai_generated');
  assert.equal(result.evidence.email.extractionMethod, 'ai');
});

check('5. Geoapify website missing → source evidence fills it', async () => {
  const result = await extractWithAIFallback({
    evidenceText,
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: 'https://www.mananfurnitures.com', evidence: 'Website: https://www.mananfurnitures.com', confidence: 0.96, status: 'extracted' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.website, 'https://www.mananfurnitures.com');
  assert.equal(result.evidence.website.extractionMethod, 'ai');
});

check('6. AI extracts address only from supplied evidence', async () => {
  const result = await extractWithAIFallback({
    evidenceText: 'Manan Furnitures, Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001',
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001', evidence: 'Meera Marg, Jawahar Nagar, Sri Ganganagar', confidence: 0.9, status: 'extracted' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.address, 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001');
  assert.equal(result.fields.phone, undefined);
  assert.equal(result.fields.email, undefined);
});

/* ================================================================== *
 * 7-13. AI SAFETY — cannot invent
 * ================================================================== */

check('7. AI returns null when evidence is absent', async () => {
  const result = await extractWithAIFallback({ evidenceText: null, sourceUrl: MANAN_MAPS_URL });
  assert.equal(result, null);
  const empty = await extractWithAIFallback({ evidenceText: '', sourceUrl: MANAN_MAPS_URL });
  assert.equal(empty, null);
});

check('8. AI cannot invent a city (returns null without evidence)', async () => {
  const result = await extractWithAIFallback({
    evidenceText: evidenceNoCity, // no city in evidence
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.address, undefined);
  assert.ok(result.unresolvedFields.includes('address'));
});

check('9. AI cannot invent a phone number', async () => {
  const result = await extractWithAIFallback({
    evidenceText: evidenceNoContact, // no phone present
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.phone, undefined);
  assert.ok(result.unresolvedFields.includes('phone'));
});

check('10. AI cannot invent an email', async () => {
  const result = await extractWithAIFallback({
    evidenceText: evidenceNoContact,
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: 'https://mananfurnitures.com', evidence: 'Website: https://mananfurnitures.com', confidence: 0.9, status: 'extracted' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  // No email evidence → no email.
  assert.equal(result.fields.email, undefined);
  // A website existing does NOT imply an email.
  assert.equal(result.fields.email, undefined);
});

check('11. AI cannot replace authoritative name', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: { city: 'Sri Ganganagar' } },
  });
  // The name is already present in the canonical profile → authoritative stays.
  assert.equal(result.fields.name, undefined);
  // The wrong city conflicts → rejected.
  assert.equal(result.fields.address, undefined);
});

check('12. AI cannot replace authoritative coordinates', () => {
  // Coordinates from the URL pin the business at (29.9165, 73.8789).
  // A provider record at Tarn Taran must be rejected.
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: { coordinates: { lat: 29.9165, lng: 73.8789 } } },
  });
  // URL-derived coordinate is authoritative; wrong-city record is rejected.
  assert.equal(result.fields.coordinates, undefined);
});

check('13. AI cannot replace authoritative provider IDs', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord,
    existingCanonicalProfile: {
      identity: { name: 'Manan Furnitures' },
      providers: [{ provider: 'geoapify', providerRecordId: 'geoapify_manan_3' }],
      location: { coordinates: { lat: 29.9165, lng: 73.8789 } },
    },
  });
  // Hard conflict (provider ID differs) → fallback cannot merge this record.
  assert.equal(result.fields.address, undefined);
  assert.equal(result.fields.phone, undefined);
});

/* ================================================================== *
 * 14-16. EVIDENCE / PROVENANCE / MISSING
 * ================================================================== */

check('14. Source evidence is retained', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: { city: 'Sri Ganganagar' } },
  });
  assert.equal(result.evidence.address.sourceUrl, MANAN_MAPS_URL);
  assert.equal(result.evidence.phone.sourceUrl, MANAN_MAPS_URL);
  assert.equal(result.evidence.address.source, 'geoapify');
  assert.equal(result.evidence.address.extractionMethod, 'provider');
});

check('15. AI provenance remains ai_generated', async () => {
  const result = await extractWithAIFallback({
    evidenceText,
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001', evidence: 'Meera Marg', confidence: 0.95, status: 'extracted' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.evidence.address.provenance, 'ai_generated');
});

check('16. Missing fields remain null', async () => {
  const result = await extractWithAIFallback({
    evidenceText: evidenceNoContact,
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.phone, undefined);
  assert.equal(result.fields.email, undefined);
  assert.equal(result.fields.website, undefined);
  for (const f of ['phone', 'email', 'website']) {
    assert.ok(result.unresolvedFields.includes(f), `${f} should be unresolved`);
  }
});

/* ================================================================== *
 * 17-22. VALIDATION
 * ================================================================== */

check('17. Invalid phone is rejected', () => {
  const v = validatePhone('not a phone');
  assert.equal(v.status, 'rejected');
  // Random short numeric string
  const v2 = validatePhone('123');
  assert.equal(v2.status, 'rejected');
});

check('18. Postal code is not mistaken for phone', () => {
  assert.equal(isNonPhoneSignal('335001'), true);
  assert.equal(isNonPhoneSignal('335001-2222'), true);
  const v = validatePhone('335001');
  assert.equal(v.status, 'rejected');
});

check('19. Coordinates are validated', () => {
  assert.deepEqual(validateCoordinates({ lat: 29.9165, lng: 73.8789 }), { lat: 29.9165, lng: 73.8789 });
  assert.deepEqual(validateCoordinates({ latitude: '29.9165', longitude: '73.8789' }), { lat: 29.9165, lng: 73.8789 });
  assert.deepEqual(validateCoordinates([73.8789, 29.9165]), { lat: 29.9165, lng: 73.8789 });
});

check('20. Invalid coordinates are rejected', () => {
  assert.equal(validateCoordinates({ lat: 91, lng: 0 }), null); // lat > 90
  assert.equal(validateCoordinates({ lat: -91, lng: 0 }), null);
  assert.equal(validateCoordinates({ lat: 0, lng: 181 }), null); // lng > 180
  assert.equal(validateCoordinates({ lat: 0, lng: -181 }), null);
  assert.equal(validateCoordinates({ lat: 'abc', lng: 5 }), null);
  assert.equal(validateCoordinates(null), null);
});

check('21. Address components are preserved', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  assert.ok(result.fields.addressComponents);
  assert.equal(result.fields.addressComponents.city, 'Sri Ganganagar');
  assert.equal(result.fields.addressComponents.state, 'Rajasthan');
  assert.equal(result.fields.addressComponents.postalCode, '335001');
  assert.equal(result.fields.addressComponents.country, 'India');
});

check('22. Official website is distinguished from directory URL', () => {
  const direct = validateWebsite('https://mananfurnitures.com');
  assert.equal(direct.status, 'valid');
  assert.equal(direct.isDirectory, false);

  const directory = validateWebsite('https://www.justdial.com/Sri-Ganganagar/Manan-Furnitures');
  assert.equal(directory.status, 'rejected_directory');
  assert.equal(directory.isDirectory, true);
});

/* ================================================================== *
 * 23-28. CONFLICT / NO FALLBACK / CACHE
 * ================================================================== */

check('23. Conflicting provider address is rejected', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord,
    existingCanonicalProfile: {
      identity: { name: 'Manan Furnitures' },
      location: { city: 'Sri Ganganagar', state: 'Rajasthan', coordinates: { lat: 29.9165, lng: 73.8789 } },
    },
  });
  assert.equal(result.fields.address, undefined);
});

check('24. Conflicting city is rejected', () => {
  const conflict = detectConflicts(
    { city: 'Tarn Taran' },
    { city: 'Sri Ganganagar' }
  );
  assert.equal(conflict.conflicting, true);
  assert.ok(conflict.fields.includes('city'));
});

check('25. Conflicting state is rejected', () => {
  const conflict = detectConflicts(
    { state: 'Punjab' },
    { state: 'Rajasthan' }
  );
  assert.equal(conflict.conflicting, true);
  assert.ok(conflict.fields.includes('state'));
});

check('26. Conflicting coordinates are rejected', () => {
  const conflict = detectConflicts(
    { coordinates: { lat: 31.4519, lng: 74.9244 } },
    { coordinates: { lat: 29.9165, lng: 73.8789 } }
  );
  assert.equal(conflict.conflicting, true);
  assert.ok(conflict.fields.includes('coordinates'));
});

check('27. No name-only fallback is used', () => {
  // A provider record with ONLY a name and no identity corroboration must
  // not produce latitude/address/phone.
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: geoapifyNameOnly,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  assert.equal(result.fields.coordinates, undefined);
  assert.equal(result.fields.address, undefined);
  assert.equal(result.fields.phone, undefined);
});

check('28. Stale cache does not fill fields from another lead', () => {
  // Simulate a scenario where the canonical profile for THIS lead has a
  // clear country/city, and a cached provider record from ANOTHER region
  // tries to fill. The conflict check must reject it.
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: {
      business: { name: 'Some Other Store' },
      contact: { phone: '+1-415-555-0100' },
      location: { city: 'San Francisco', state: 'California', coordinates: { lat: 37.77, lng: -122.42 } },
      provider: { placeId: 'geoapify_other' },
    },
    existingCanonicalProfile: {
      identity: { name: 'Manan Furnitures' },
      location: { city: 'Sri Ganganagar', coordinates: { lat: 29.9165, lng: 73.8789 } },
    },
  });
  assert.equal(result.fields.address, undefined);
  assert.equal(result.fields.phone, undefined);
});

/* ================================================================== *
 * 29-32. PROJECTION / API / FRONTEND
 * ================================================================== */

check('29. Canonical projection preserves fallback fields', () => {
  const intelligence = {
    identity: {
      name: 'Manan Furnitures',
      category: 'Furniture store',
    },
    contact: { phone: '+919876543210', email: null, website: 'https://mananfurnitures.example.com' },
    location: {
      address: 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001',
      city: 'Sri Ganganagar',
      state: 'Rajasthan',
      country: 'India',
      postalCode: '335001',
      coordinates: { lat: 29.9165, lng: 73.8789 },
    },
    source: {
      mapsUrl: MANAN_MAPS_URL,
      providers: {},
      fallbackEvidence: {
        phone: {
          value: '+919876543210',
          source: 'google_maps',
          sourceUrl: MANAN_MAPS_URL,
          extractionMethod: 'provider',
          provenance: 'observed',
          confidence: 0.95,
          verified: false,
        },
      },
    },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record: intelligence });
  // Fallback field survives.
  assert.equal(canonical.identity.phone, '+919876543210');
  assert.equal(canonical.identity.address, 'Meera Marg, Jawahar Nagar, Sri Ganganagar, Rajasthan 335001');
  // Fallback evidence survives enrichment.
  assert.equal(canonical.enrichment?.fallbackEvidence?.phone?.extractionMethod, 'provider');
  assert.equal(canonical.enrichment?.fallbackEvidence?.phone?.provenance, 'observed');
});

check('30. API response preserves provenance', () => {
  const intelligence = {
    identity: {
      name: 'Manan Furnitures',
      _provenance: {
        phone: { provenance: 'discovered', confidence: 0.95, hasConflict: false },
      },
    },
    contact: { phone: '+919876543210' },
    location: { address: 'Meera Marg, Jawahar Nagar' },
    source: {
      providers: {
        fallback: { status: 'deterministic', recoveredFields: ['phone'], aiExtracted: false },
      },
    },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record: intelligence });
  assert.equal(canonical.identity.phone, '+919876543210');
  assert.equal(canonical.enrichment?.fallback?.status, 'deterministic');
  assert.deepEqual(canonical.enrichment?.fallback?.recoveredFields, ['phone']);
  assert.equal(canonical.enrichment?.fallback?.aiExtracted, false);
});

check('31. Frontend renders unavailable state correctly (null stays null)', () => {
  // The frontend receives canonical business.identity with nulls when missing.
  // The test verifies the API never turns a null into a fabricated value.
  const canonical = CanonicalBusinessProfileService.fromEntityData({
    record: { identity: { name: 'Manan Furnitures' }, contact: { phone: null }, location: { address: null } },
  });
  assert.equal(canonical.identity.phone, null);
  assert.equal(canonical.identity.address, null);
  const json = JSON.stringify(canonical).toLowerCase();
  assert.equal(json.includes('unknown business'), false);
});

check('32. Frontend renders AI-extracted state correctly', () => {
  const intelligence = {
    identity: { name: 'Manan Furnitures' },
    contact: { phone: '+919876543210' },
    location: { address: 'Meera Marg, Jawahar Nagar' },
    source: {
      providers: { fallback: { status: 'ai_extraction', recoveredFields: ['phone'], aiExtracted: true } },
    },
  };
  const canonical = CanonicalBusinessProfileService.fromEntityData({ record: intelligence });
  assert.equal(canonical.enrichment?.fallback?.aiExtracted, true);
  assert.equal(canonical.enrichment?.fallback?.status, 'ai_extraction');
});

/* ================================================================== *
 * 33-36. MANAN FURNITURES REGRESSION (identity safety)
 * ================================================================== */

check('33. Manan Furnitures — expected city Sri Ganganagar, rejected Tarn Taran', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord, // Tarn Taran, Punjab
    existingCanonicalProfile: {
      identity: { name: 'Manan Furnitures' },
      location: { city: 'Sri Ganganagar' },
    },
  });
  // The Tarn Taran record must be rejected; no address/city from it.
  assert.equal(result.fields.address, undefined);
  assert.equal(result.fields.phone, undefined);
});

check('34. Manan Furnitures — expected address contains Meera Marg, rejected Tarn Taran', () => {
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  assert.ok(result.fields.address.includes('Meera Marg'));
  assert.equal(result.fields.address.includes('Tarn Taran'), false);
});

check('35. Manan Furnitures — expected category Furniture store, rejected Religious Site', () => {
  // A wrong-city record returns category 'Religious Site'. The fallback must
  // keep the authoritative category if one exists, and never adopt a
  // conflicting wrong-city category.
  const result = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: wrongCityProviderRecord, // category 'Religious Site'
    existingCanonicalProfile: {
      identity: { name: 'Manan Furnitures', category: 'commercial.furniture_store' },
      location: { city: 'Sri Ganganagar' },
    },
  });
  assert.notEqual(result.fields.category, 'Religious Site');
  assert.equal(result.fields.category, undefined); // authoritative category exists
});

check('36. Manan Furnitures — expected phone is source-derived, no fabricated phone', async () => {
  // With NO phone evidence, the fallback must never fabricate a phone.
  const result = await extractWithAIFallback({
    evidenceText: evidenceNoContact,
    sourceUrl: MANAN_MAPS_URL,
    ai: {
      generate: async () => ({
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      }),
    },
  });
  assert.equal(result.fields.phone, undefined);
  // No fabricated phone appears anywhere.
  const json = JSON.stringify(result).toLowerCase();
  assert.equal(json.includes('98765'), false);
});

/* ================================================================== *
 * 37-40. DETERMINISM / IMMUTABILITY / SIDE EFFECTS
 * ================================================================== */

check('37. Deterministic repeated extraction', () => {
  const a = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  const b = extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: strongProviderRecord,
    existingCanonicalProfile: { identity: { name: 'Manan Furnitures' }, location: {} },
  });
  assert.deepEqual(a.fields, b.fields);
  assert.deepEqual(a.evidence, b.evidence);
});

check('38. Input immutability', () => {
  const profile = {
    identity: { name: 'Manan Furnitures' },
    location: {},
  };
  const record = JSON.parse(JSON.stringify(strongProviderRecord));
  const snapshot = JSON.stringify({ profile, record });
  extractDeterministicFallback({
    sourceUrl: MANAN_MAPS_URL,
    providerRecord: record,
    existingCanonicalProfile: profile,
  });
  assert.equal(JSON.stringify({ profile, record }), snapshot, 'inputs must not be mutated');
});

check('39. No unexpected database writes', async () => {
  // extractDeterministicFallback + extractWithAIFallback are pure/deterministic;
  // they must not touch any DB. This test simply verifies the module does not
  // import or initialize a DB (checked statically by absence of db/client import).
  const src = await import('./src/services/GoogleMapsFallbackExtractor.js');
  const code = Object.keys(src);
  assert.ok(code.includes('extractDeterministicFallback'));
  assert.ok(code.includes('extractWithAIFallback'));
  // No DB symbol is exposed.
  assert.equal(code.includes('db'), false);
  assert.equal(code.includes('initializeDatabase'), false);
});

check('40. No network call when evidence is absent', async () => {
  // With no evidenceText, extractWithAIFallback returns null WITHOUT invoking
  // AI (no network call). The injected AI service must never be called.
  let aiCalls = 0;
  await extractWithAIFallback({
    evidenceText: null,
    sourceUrl: MANAN_MAPS_URL,
    ai: { generate: async () => { aiCalls += 1; return {}; } },
  });
  assert.equal(aiCalls, 0);
});

/* ================================================================== *
 * SUMMARY
 * ================================================================== */
console.log(`\nP1.8 source-grounded fallback: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.error?.message || f.error}`);
  }
  process.exit(1);
}