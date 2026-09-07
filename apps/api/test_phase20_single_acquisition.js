/**
 * Phase 20 — Requirement #2: No duplicate Geoapify acquisition
 *
 * Proves that the acquisition pipeline performs exactly ONE provider search
 * per research request and that failure diagnostics come from that same call.
 *
 * We stub GeoapifyProvider before importing BusinessResearchService so the
 * service sees the spy. Because the service holds a static import reference,
 * we monkey-patch the methods on the module's default export.
 *
 * Run: node test_phase20_single_acquisition.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Normalize the module specifier the same way the API app does.
const GEOAPIFY_MODULE = pathToFileURL(join(__dirname, 'src/services/providers/GeoapifyProvider.js')).href;
const BRS_MODULE = pathToFileURL(join(__dirname, 'src/services/BusinessResearchService.js')).href;

// A controllable fake client so we never touch the network.
function makeFakeRecord(name = 'Acme Cafe', opts = {}) {
  return {
    business: { name, category: 'cafe', categories: ['cafe'], description: null, business_type: null },
    contact: { phone: opts.phone ?? '+1 415 555 0100', email: null, website: opts.website ?? 'acme.example.com' },
    location: {
      full_address: opts.address ?? '100 Main St, San Francisco, CA 94105',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      coordinates: opts.coords ?? { lat: 37.77, lng: -122.42 },
    },
    provider: { placeId: opts.placeId ?? 'ChIJ-test-place-id-0001' },
    source: 'geoapify',
  };
}

import { test as nodeTest } from 'node:test';

test('single Geoapify acquisition per research request — success path', async () => {
  const geoapifyModule = await import(GEOAPIFY_MODULE);
  const GeoapifyProvider = geoapifyModule.default;

  let searchCalls = 0;
  let enrichCalls = 0;
  const resultRecords = [makeFakeRecord('Acme Cafe')];
  const result = {
    provider: 'geoapify',
    status: 'success',
    records: resultRecords,
    error: null,
    diagnostics: { httpStatus: 200, errorCode: null, retryCount: 0, latencyMs: 12 },
    source: { url: 'geoapify://search', retrieval: new Date().toISOString() },
  };

  const originalSearch = GeoapifyProvider.search.bind(GeoapifyProvider);
  const originalSelect = GeoapifyProvider.selectBestRecord.bind(GeoapifyProvider);
  const originalEnrich = GeoapifyProvider.enrichRecord.bind(GeoapifyProvider);

  GeoapifyProvider.search = async () => {
    searchCalls++;
    return result;
  };
  GeoapifyProvider.selectBestRecord = (r, hints) => originalSelect(r, hints);
  GeoapifyProvider.enrichRecord = async (rec) => {
    enrichCalls++;
    return rec;
  };
  GeoapifyProvider.isAvailable = () => true;

  try {
    const brs = (await import(`${BRS_MODULE}?t=${Date.now()}`)).default;
    // BRService may be a class or singleton; find the orchestrator method.
    const service = brs && brs.constructor && typeof brs.extractBusinessIntelligenceWithProviders === 'function'
      ? brs
      : new brs.constructor();
    const out = await service.extractBusinessIntelligenceWithProviders({
      name: 'Acme Cafe',
      city: 'San Francisco',
      latitude: 37.77,
      longitude: -122.42,
    });

    assert.strictEqual(searchCalls, 1, 'search() must be called exactly once');
    assert.strictEqual(enrichCalls, 1, 'enrichRecord() called once for the selected record');
    assert.ok(out.profile, 'profile built');
    assert.strictEqual(out.provider.geoapify, 'ok');
  } finally {
    GeoapifyProvider.search = originalSearch;
    GeoapifyProvider.selectBestRecord = originalSelect;
    GeoapifyProvider.enrichRecord = originalEnrich;
  }
});

test('no retry-like duplicate when Geoapify returns no records — diagnostics preserved', async () => {
  const geoapifyModule = await import(GEOAPIFY_MODULE);
  const GeoapifyProvider = geoapifyModule.default;

  let searchCalls = 0;
  const result = {
    provider: 'geoapify',
    status: 'empty_result',
    records: [],
    error: { category: 'empty_result', safeMessage: 'No businesses found matching the search criteria.', httpStatus: 200 },
    diagnostics: { httpStatus: 200, errorCode: 'empty_result', retryCount: 0, latencyMs: 9 },
    source: { url: 'geoapify://search', retrieval: new Date().toISOString() },
  };

  const originalSearch = GeoapifyProvider.search.bind(GeoapifyProvider);
  const originalSelect = GeoapifyProvider.selectBestRecord.bind(GeoapifyProvider);

  GeoapifyProvider.search = async () => {
    searchCalls++;
    return result;
  };
  GeoapifyProvider.selectBestRecord = (r) => (r.records && r.records.length ? r.records[0] : null);
  GeoapifyProvider.enrichRecord = async (rec) => rec;
  GeoapifyProvider.isAvailable = () => true;

  try {
    const brs = (await import(`${BRS_MODULE}?t=${Date.now()}`)).default;
    const service = brs && typeof brs.extractBusinessIntelligenceWithProviders === 'function'
      ? brs
      : new brs.constructor();
    const out = await service.extractBusinessIntelligenceWithProviders({
      name: 'No Such Place',
      latitude: 12.34,
      longitude: 56.78,
    });

    // EXACTLY ONE acquisition even when no record is returned.
    assert.strictEqual(searchCalls, 1, 'search() must not be re-called when no record is returned');
    // The trace must carry the diagnostics from THE acquisition (not a re-run).
    assert.strictEqual(out.provider.geoapify, 'empty_result');
    assert.strictEqual(out.provider.geoapifyError?.category, 'empty_result');
    assert.strictEqual(out.provider.geoapifyDiagnostics?.latencyMs, 9);
  } finally {
    GeoapifyProvider.search = originalSearch;
    GeoapifyProvider.selectBestRecord = originalSelect;
  }
});