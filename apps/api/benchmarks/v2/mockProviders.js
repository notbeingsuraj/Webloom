/**
 * Benchmark v2 — Mock Provider Harness
 *
 * Replaces the singleton provider objects (GeoapifyProvider, WebExtractionProvider)
 * used by BusinessResearchService with deterministic mocks. The mocks implement
 * the same public surface the service calls:
 *
 *   GeoapifyProvider:
 *     isAvailable() -> bool
 *     search(hints)  -> AcquisitionResult { status, records, error?, diagnostics }
 *     selectBestRecord(result, hints) -> record|null        (pure, real impl reused)
 *     enrichRecord(best, { lat, lng }) -> record|Promise   (real impl reused)
 *
 *   WebExtractionProvider:
 *     search(hints)  -> AcquisitionResult { status, records, metadata?, error? }
 *
 * NO network calls. Deterministic per-fixture payloads.
 */

import GeoapifyProvider from '../../src/services/providers/GeoapifyProvider.js';
import WebExtractionProvider from '../../src/services/providers/WebExtractionProvider.js';

/** Create an AcquisitionResult-shaped object. */
function acquisition({ status, records = [], error = null, diagnostics = {}, metadata = null }) {
  return {
    provider: 'mock',
    status,
    records,
    error,
    diagnostics,
    metadata,
    source: { url: null, retrieval: new Date().toISOString() },
  };
}

/** Install deterministic mocks on the global singletons. Returns a restore fn. */
export function installProviderMocks(fixture) {
  const geo = fixture.providerMocks?.geoapify || { status: 'not_configured', records: [] };
  const web = fixture.providerMocks?.webExtraction || { status: 'not_configured', records: [] };

  const previous = {
    geoSearch: GeoapifyProvider.search,
    webSearch: WebExtractionProvider.search,
    geoAvailable: GeoapifyProvider.isAvailable,
    webAvailable: WebExtractionProvider.isAvailable,
  };

  // --- Geoapify mock ---
  GeoapifyProvider.isAvailable = () => geo.status === 'success' || geo.status === 'empty_result';
  GeoapifyProvider.search = async () =>
    acquisition({ status: geo.status, records: geo.records || [] });

  // --- Web extraction mock ---
  WebExtractionProvider.isAvailable = () => true;
  WebExtractionProvider.search = async () => {
    if (web.status === 'not_configured' || web.status === 'empty_result') {
      return acquisition({ status: 'empty_result', records: [] });
    }
    return acquisition({
      status: web.status === 'partial' ? 'partial' : 'success',
      records: web.records || [],
      metadata: web.metadata || null,
    });
  };

  return () => restoreProviderMocks(previous);
}

/** Restore original provider methods. */
export function restoreProviderMocks(previous) {
  if (previous?.geoSearch) GeoapifyProvider.search = previous.geoSearch;
  if (previous?.webSearch) WebExtractionProvider.search = previous.webSearch;
  if (previous?.geoAvailable) GeoapifyProvider.isAvailable = previous.geoAvailable;
  if (previous?.webAvailable) WebExtractionProvider.isAvailable = previous.webAvailable;
}

/**
 * Deterministic mock AI service.
 *
 * The real fallback/AI-enrichment code paths call `AIService.generate()`.
 * We substitute a fixed-response mock so AI behavior is fully deterministic.
 *
 * Important: for fixtures where the AI is supposed to fail (hallucination,
 * no-evidence), the mock returns FABRICATED data — the benchmark measures
 * whether the pipeline REJECTS it. For legitimate AI-fallback fixtures, the
 * mock returns evidence-grounded values.
 */
export function createMockAI(fixture) {
  const aiMock = fixture.aiMock || {};

  return {
    async generate({ prompt }) {
      // --- ai-hallucination fixture: return fabricated values ---
      if (fixture.id === 'ai-hallucination') {
        return {
          address: { value: null, evidence: null, confidence: 0, status: 'missing' },
          phone: aiMock.phone ? {
            value: aiMock.phone.value,
            evidence: aiMock.phone.evidence, // null → must be rejected
            confidence: aiMock.phone.confidence,
            status: 'extracted',
          } : { value: null, evidence: null, confidence: 0, status: 'missing' },
          email: aiMock.email ? {
            value: aiMock.email.value,
            evidence: aiMock.email.evidence, // null → must be rejected
            confidence: aiMock.email.confidence,
            status: 'extracted',
          } : { value: null, evidence: null, confidence: 0, status: 'missing' },
          website: { value: null, evidence: null, confidence: 0, status: 'missing' },
          coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
        };
      }

      // --- js-rendered fixture: recover website from source text evidence ---
      if (fixture.id === 'js-rendered') {
        const src = fixture.sourceText || '';
        return {
          address: { value: null, evidence: null, confidence: 0, status: 'missing' },
          phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
          email: { value: null, evidence: null, confidence: 0, status: 'missing' },
          website: src.includes('moderncoffee.app')
            ? { value: 'https://moderncoffee.app', evidence: 'https://moderncoffee.app', confidence: 0.9, status: 'extracted' }
            : { value: null, evidence: null, confidence: 0, status: 'missing' },
          coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
        };
      }

      // --- ai-fallback-phone fixture: recover phone from evidence ---
      if (fixture.id === 'ai-fallback-phone') {
        const src = fixture.sourceText || '';
        return {
          address: { value: null, evidence: null, confidence: 0, status: 'missing' },
          phone: src.includes('(415) 555-0600')
            ? { value: '+14155550600', evidence: '(415) 555-0600', confidence: 0.95, status: 'extracted' }
            : { value: null, evidence: null, confidence: 0, status: 'missing' },
          email: { value: null, evidence: null, confidence: 0, status: 'missing' },
          website: { value: null, evidence: null, confidence: 0, status: 'missing' },
          coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
        };
      }

      // --- generic: AI returns nothing (no fabricated values) ---
      return {
        address: { value: null, evidence: null, confidence: 0, status: 'missing' },
        phone: { value: null, evidence: null, confidence: 0, status: 'missing' },
        email: { value: null, evidence: null, confidence: 0, status: 'missing' },
        website: { value: null, evidence: null, confidence: 0, status: 'missing' },
        coordinates: { lat: null, lng: null, evidence: null, confidence: 0, status: 'missing' },
      };
    },
  };
}

/**
 * Inject a mock AI into the dynamic-import path used by the fallback and
 * reputation extractors (`await import('./AIService.js')` → `mod.default`).
 *
 * The modules resolve to the SAME live singleton that we override here, so
 * patching `AIService.generate` makes every downstream call deterministic.
 * The real `enrichMissingWithAI` path in BusinessResearchService also imports
 * this singleton — one patch covers all AI call sites.
 */
export async function installAI(fixture) {
  const mod = await import('../../src/services/AIService.js');
  const AIService = mod.default;
  const previous = AIService.generate;
  AIService.generate = createMockAI(fixture).generate;
  return () => { AIService.generate = previous; };
}

/**
 * Install a deterministic fetchPage mock on the BusinessDataExtractor
 * singleton. The fallback/reputation extractor blocks call
 * `extractor.fetchPage(sourceUrl)` when the web record carried no sourceText.
 * The mock returns the fixture's deterministic source text in the same shape
 * the real method returns ({ url, html, status }).
 */
export async function installFetchPageMock(fixture) {
  const mod = await import('../../src/services/BusinessDataExtractor.js');
  const extractor = mod.default;
  const previous = extractor.fetchPage.bind(extractor);
  extractor.fetchPage = async (url) => ({
    url,
    html: fixture.sourceText || '',
    status: 200,
    headers: {},
  });
  return () => { extractor.fetchPage = previous; };
}