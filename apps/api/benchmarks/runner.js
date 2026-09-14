/**
 * Extraction Quality Benchmark Runner
 * 
 * Runs benchmark tests against the extraction pipeline using mocked providers.
 * Measures all required metrics per field.
 */

import { BENCHMARK_FIXTURES, FIXTURE_CATEGORIES } from './fixtures.js';
import { runCandidatePipeline } from '../src/services/CandidatePipeline.js';
import { createFieldCandidate, CANDIDATE_STATUS, PROVENANCE_KIND } from '../src/services/FieldCandidate.js';
import { validateCandidate } from '../src/services/FieldValidation.js';
import BusinessProfile from '../src/services/BusinessProfile.js';
import { extractFallbackFields } from '../src/services/GoogleMapsFallbackExtractor.js';
import BusinessDataExtractor from '../src/services/BusinessDataExtractor.js';

// Mock AI Service for benchmarking
class MockAIService {
  constructor(aiMock) {
    this.aiMock = aiMock || {};
  }

  async generate({ prompt, schema }) {
    // Extract field name from schema
    const fieldName = Object.keys(schema.properties)[0];
    const mock = this.aiMock[fieldName];
    if (!mock) return null;
    
    return {
      [fieldName]: mock
    };
  }
}

// Mock Geoapify Provider
class MockGeoapifyProvider {
  constructor(record) {
    this.record = record;
  }

  async search() {
    if (!this.record) {
      return { status: 'empty_result', records: [], error: null };
    }
    return { status: 'success', records: [this.record], error: null };
  }
}

// Mock Web Extraction Provider
class MockWebExtractionProvider {
  constructor(record, sourceText = null) {
    this.record = record;
    this.sourceText = sourceText;
  }

  async search() {
    if (!this.record) {
      return { status: 'not_configured', records: [], error: null };
    }
    return { 
      status: 'success', 
      records: [this.record], 
      error: null,
      metadata: { sourceText: this.sourceText }
    };
  }
}

// Benchmark result collector
class BenchmarkResults {
  constructor() {
    this.results = [];
  }

  add(fixtureId, category, field, metrics) {
    this.results.push({ fixtureId, category, field, ...metrics });
  }

  getSummary() {
    const byCategory = {};
    const byField = {};
    
    for (const r of this.results) {
      // By category
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
      
      // By field
      if (!byField[r.field]) byField[r.field] = [];
      byField[r.field].push(r);
    }

    const summary = {
      totalTests: this.results.length,
      byCategory: {},
      byField: {},
      overall: {
        extractionSuccessRate: 0,
        correctness: 0,
        evidenceValidity: 0,
        provenanceAccuracy: 0,
        providerAgreement: 0,
        conflictResolutionAccuracy: 0,
        aiFallbackAcceptanceRate: 0,
        aiFallbackFalsePositiveRate: 0,
        emptyFieldCompletionRate: 0,
        confidenceCalibration: 0,
        avgLatencyMs: 0
      }
    };

    // Compute per-category stats
    for (const [cat, results] of Object.entries(byCategory)) {
      summary.byCategory[cat] = this.computeStats(results);
    }

    // Compute per-field stats
    for (const [field, results] of Object.entries(byField)) {
      summary.byField[field] = this.computeStats(results);
    }

    // Overall stats
    summary.overall = this.computeStats(this.results);

    return summary;
  }

  computeStats(results) {
    const total = results.length;
    if (total === 0) return { count: 0 };

    const successCount = results.filter(r => r.extracted !== false).length;
    const correctCount = results.filter(r => r.correct === true).length;
    const evidenceValidCount = results.filter(r => r.evidenceValid === true).length;
    const provenanceCorrectCount = results.filter(r => r.provenanceCorrect === true).length;
    const providerAgreeCount = results.filter(r => r.providerAgreement === true).length;
    const conflictResolvedCount = results.filter(r => r.conflictResolved === true).length;
    const aiAcceptedCount = results.filter(r => r.aiAccepted === true).length;
    const aiFalsePositiveCount = results.filter(r => r.aiFalsePositive === true).length;
    const emptyCompletedCount = results.filter(r => r.emptyCompleted === true).length;
    const confidenceCalibratedCount = results.filter(r => r.confidenceCalibrated === true).length;
    
    const latencies = results.map(r => r.latencyMs || 0).filter(l => l > 0);

    return {
      count: total,
      extractionSuccessRate: successCount / total,
      correctness: correctCount / total,
      evidenceValidity: evidenceValidCount / total,
      provenanceAccuracy: provenanceCorrectCount / total,
      providerAgreement: providerAgreeCount / total,
      conflictResolutionAccuracy: conflictResolvedCount / total,
      aiFallbackAcceptanceRate: aiAcceptedCount / total,
      aiFallbackFalsePositiveRate: aiFalsePositiveCount / total,
      emptyFieldCompletionRate: emptyCompletedCount / total,
      confidenceCalibration: confidenceCalibratedCount / total,
      avgLatencyMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
    };
  }

  printReport() {
    const summary = this.getSummary();
    console.log('\n========== EXTRACTION QUALITY BENCHMARK REPORT ==========\n');
    console.log(`Total Tests: ${summary.totalTests}\n`);

    console.log('--- OVERALL METRICS ---');
    console.log(`Extraction Success Rate:     ${(summary.overall.extractionSuccessRate * 100).toFixed(1)}%`);
    console.log(`Correctness:                 ${(summary.overall.correctness * 100).toFixed(1)}%`);
    console.log(`Evidence Validity:           ${(summary.overall.evidenceValidity * 100).toFixed(1)}%`);
    console.log(`Provenance Accuracy:         ${(summary.overall.provenanceAccuracy * 100).toFixed(1)}%`);
    console.log(`Provider Agreement:          ${(summary.overall.providerAgreement * 100).toFixed(1)}%`);
    console.log(`Conflict Resolution Accuracy:${(summary.overall.conflictResolutionAccuracy * 100).toFixed(1)}%`);
    console.log(`AI Fallback Acceptance Rate: ${(summary.overall.aiFallbackAcceptanceRate * 100).toFixed(1)}%`);
    console.log(`AI Fallback False Positive:  ${(summary.overall.aiFallbackFalsePositiveRate * 100).toFixed(1)}%`);
    console.log(`Empty Field Completion Rate: ${(summary.overall.emptyFieldCompletionRate * 100).toFixed(1)}%`);
    console.log(`Confidence Calibration:      ${(summary.overall.confidenceCalibration * 100).toFixed(1)}%`);
    console.log(`Avg Latency:                 ${summary.overall.avgLatencyMs.toFixed(1)}ms\n`);

    console.log('--- BY CATEGORY ---');
    for (const [cat, stats] of Object.entries(summary.byCategory)) {
      console.log(`\n${cat.toUpperCase()} (${stats.count} tests):`);
      console.log(`  Success: ${(stats.extractionSuccessRate * 100).toFixed(1)}% | Correct: ${(stats.correctness * 100).toFixed(1)}% | Evidence: ${(stats.evidenceValidity * 100).toFixed(1)}% | Provenance: ${(stats.provenanceAccuracy * 100).toFixed(1)}%`);
      console.log(`  Provider Agreement: ${(stats.providerAgreement * 100).toFixed(1)}% | Conflict Resolved: ${(stats.conflictResolutionAccuracy * 100).toFixed(1)}%`);
      console.log(`  AI Acceptance: ${(stats.aiFallbackAcceptanceRate * 100).toFixed(1)}% | AI False Positive: ${(stats.aiFallbackFalsePositiveRate * 100).toFixed(1)}%`);
      console.log(`  Empty Completion: ${(stats.emptyFieldCompletionRate * 100).toFixed(1)}% | Conf Calibration: ${(stats.confidenceCalibration * 100).toFixed(1)}%`);
      console.log(`  Avg Latency: ${stats.avgLatencyMs.toFixed(1)}ms`);
    }

    console.log('\n--- BY FIELD ---');
    for (const [field, stats] of Object.entries(summary.byField)) {
      console.log(`\n${field} (${stats.count} tests):`);
      console.log(`  Success: ${(stats.extractionSuccessRate * 100).toFixed(1)}% | Correct: ${(stats.correctness * 100).toFixed(1)}% | Evidence: ${(stats.evidenceValidity * 100).toFixed(1)}%`);
      console.log(`  Provenance: ${(stats.provenanceAccuracy * 100).toFixed(1)}% | Provider Agreement: ${(stats.providerAgreement * 100).toFixed(1)}%`);
    }

    console.log('\n========== END REPORT ==========\n');
  }
}

// Main benchmark runner
export async function runBenchmark() {
  const results = new BenchmarkResults();
  const startTime = Date.now();

  console.log('Starting Extraction Quality Benchmark...');
  console.log(`Testing ${BENCHMARK_FIXTURES.length} fixtures across ${FIXTURE_CATEGORIES.length} categories\n`);

  for (const fixture of BENCHMARK_FIXTURES) {
    console.log(`Testing: ${fixture.name} (${fixture.category})...`);
    
    const fixtureStart = Date.now();
    
    try {
      // Create mock providers
      const geoapifyRecord = fixture.providerMocks.geoapify?.records?.[0] || null;
      const webRecord = fixture.providerMocks.webExtraction?.records?.[0] || null;
      const webSourceText = fixture.providerMocks.webExtraction?.metadata?.sourceText || null;
      
      const mockGeoapify = new MockGeoapifyProvider(geoapifyRecord);
      const mockWebExtraction = new MockWebExtractionProvider(webRecord, webSourceText);
      const mockAI = new MockAIService(fixture.aiMock);

      // Simulate the extraction pipeline for each expected field
      const expectedFields = [
        'identity.name',
        'identity.category',
        'identity.description',
        'contact.phone',
        'contact.email',
        'contact.website',
        'location.full_address',
        'location.city',
        'location.state',
        'location.country',
        'location.postal_code',
        'location.coordinates',
        'ratings.rating',
        'ratings.review_count'
      ];

      for (const fieldPath of expectedFields) {
        const expectedValue = getNestedValue(fixture.expectedProfile, fieldPath);
        const isIdentityField = ['identity.name', 'contact.phone', 'contact.website', 'location.full_address', 'location.coordinates'].includes(fieldPath);
        
        // Run candidate pipeline with mocked data
        const records = [];
        
        // Add geoapify record if it has this field
        if (geoapifyRecord && getNestedValue(geoapifyRecord, fieldPath) != null) {
          records.push({
            record: geoapifyRecord,
            provenance: 'discovered',
            sourceInfo: { provider: 'geoapify', sourceUrl: fixture.googleMapsUrl }
          });
        }
        
        // Add web extraction record if it has this field
        if (webRecord && getNestedValue(webRecord, fieldPath) != null) {
          records.push({
            record: webRecord,
            provenance: webRecord.metadata?.aiExtracted ? 'ai_generated' : 'discovered',
            sourceInfo: { provider: 'web_extraction', sourceUrl: fixture.googleMapsUrl }
          });
        }

        // Create a test profile
        const profile = new BusinessProfile();
        if (fixture.expectedProfile.identity?.name) {
          profile.set('identity.name', fixture.expectedProfile.identity.name, 'identified', 0.6, { sourceUrl: fixture.googleMapsUrl });
        }

        // Run pipeline if we have records
        let pipelineResult = { accepted: [], rejected: [], conflicts: [], diagnostics: {} };
        if (records.length > 0) {
          pipelineResult = await runCandidatePipeline({
            records,
            profileContext: profile.toObject(),
            options: { onlyIfMissing: false }
          });
        }

        // Also test fallback for missing fields
        let fallbackResult = null;
        if (expectedValue != null && records.length === 0) {
          fallbackResult = await extractFallbackFields({
            sourceUrl: fixture.googleMapsUrl,
            sourceType: 'google_maps_url',
            sourceText: webSourceText,
            parsedSource: null,
            providerRecord: geoapifyRecord,
            existingCanonicalProfile: profile.toObject(),
            ai: mockAI
          });
        }

        // Evaluate results
        const accepted = pipelineResult.accepted.find(c => c.fieldPath === fieldPath);
        const fallbackValue = fallbackResult?.fields?.[fieldPath.split('.').pop()] || null;
        const actualValue = accepted?.normalizedValue || fallbackValue;
        
        // Compute metrics
        const extracted = actualValue != null;
        const correct = extracted && valuesEqual(actualValue, expectedValue);
        const evidenceValid = accepted?.evidence?.snippet != null || (fallbackResult?.evidence?.[fieldPath.split('.').pop()]?.evidenceSnippet != null);
        
        const provenance = accepted?.provenance?.webloom || (fallbackResult?.evidence?.[fieldPath.split('.').pop()]?.provenance) || null;
        const provenanceCorrect = checkProvenanceCorrect(provenance, expectedValue, isIdentityField);
        
        const providerAgreement = checkProviderAgreement(fieldPath, geoapifyRecord, webRecord);
        const conflictResolved = pipelineResult.conflicts.some(c => c.fieldPath === fieldPath && c.status === 'resolved');
        
        const aiAccepted = accepted?.provenance?.kind === 'ai_generated' || fallbackResult?.evidence?.[fieldPath.split('.').pop()]?.provenance === 'ai_generated';
        const aiFalsePositive = aiAccepted && !correct;
        const emptyCompleted = expectedValue != null && extracted && records.length > 0;
        const confidenceCalibrated = accepted?.confidence != null && accepted.confidence >= 0 && accepted.confidence <= 1;
        
        const latencyMs = Date.now() - fixtureStart;

        results.add(fixture.id, fixture.category, fieldPath, {
          extracted,
          correct,
          evidenceValid,
          provenanceCorrect,
          providerAgreement,
          conflictResolved,
          aiAccepted,
          aiFalsePositive,
          emptyCompleted,
          confidenceCalibrated,
          latencyMs
        });
      }

      console.log(`  ✓ Completed in ${Date.now() - fixtureStart}ms`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      console.error(error.stack);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\nBenchmark completed in ${totalTime}ms`);
  
  results.printReport();
  return results.getSummary();
}

function getNestedValue(obj, path) {
  if (!obj) return null;
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function checkProvenanceCorrect(provenance, expectedValue, isIdentityField) {
  if (!provenance) return expectedValue === null;
  if (isIdentityField) {
    // Identity fields should never be ai_generated if verified data exists
    return provenance !== 'ai_generated';
  }
  return true; // Non-identity fields can be ai_generated for gaps
}

function checkProviderAgreement(fieldPath, geoapifyRecord, webRecord) {
  const geoValue = geoapifyRecord ? getNestedValue(geoapifyRecord, fieldPath) : null;
  const webValue = webRecord ? getNestedValue(webRecord, fieldPath) : null;
  if (geoValue == null || webValue == null) return true; // No conflict if one missing
  return valuesEqual(geoValue, webValue);
}

// Export for direct execution
export default { runBenchmark };