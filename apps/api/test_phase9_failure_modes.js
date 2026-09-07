import assert from 'node:assert/strict';
import app from './src/app.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import GeoapifyProvider from './src/services/providers/GeoapifyProvider.js';
import WebExtractionProvider from './src/services/providers/WebExtractionProvider.js';
import BrandStrategyService from './src/services/BrandStrategyService.js';
import { closeDatabase, getDb } from './src/db/client.js';
import { IdentityRepository } from './src/db/IdentityRepository.js';
import { createAcquisitionResult, ACQUISITION_STATUS } from './src/services/AcquisitionResult.js';

const rawRecord = {
  business: { name: 'Failure Mode Bakery', category: 'Bakery', description: 'A local bakery.' },
  contact: { phone: '4155550100', website: 'https://bakery.example.test' },
  location: { full_address: '1 Main Street', city: 'San Francisco', state: 'CA', country: 'US' },
  provider: { placeId: 'phase9-failure-place' },
};

function configureProvider() {
  GeoapifyProvider.isAvailable = () => true;
  // Provider boundary now returns the authoritative AcquisitionResult. Keep
  // this fixture aligned with the production contract instead of mocking the
  // removed getBusiness orchestration path.
  GeoapifyProvider.search = async () => createAcquisitionResult({
    provider: 'geoapify',
    sourceUrl: 'geoapify://phase9-test',
    status: ACQUISITION_STATUS.SUCCESS,
    records: [rawRecord],
    diagnostics: { httpStatus: 200 },
    latencyMs: 1,
  });
  WebExtractionProvider.search = async () => createAcquisitionResult({
    provider: 'web_extraction',
    sourceUrl: null,
    status: ACQUISITION_STATUS.EMPTY_RESULT,
    diagnostics: { httpStatus: null },
  });
  BrandStrategyService.generateBrandDNA = async () => { throw new Error('AI unavailable'); };
}

async function request(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));

  // Provider unavailable: no provider observation means no entity is created.
  GeoapifyProvider.isAvailable = () => false;
  const unavailable = await request(port, '/api/business/analyze', { name: 'Unavailable Bakery' });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.success, false);
  assert.equal(unavailable.body.error, 'provider_unavailable');

  // Database failure: research remains available, but persistence status is explicit.
  configureProvider();
  const originalPersist = BusinessResearchService._persistIdentity;
  BusinessResearchService._persistIdentity = async () => ({
    status: 'database_unavailable', entityId: null, providerIdentities: [], resolutionRecord: null,
  });
  const databaseFailure = await request(port, '/api/business/analyze', { name: rawRecord.business.name });
  assert.equal(databaseFailure.status, 200);
  assert.equal(databaseFailure.body.success, true);
  assert.equal(databaseFailure.body.metadata.persistence.status, 'database_unavailable');
  BusinessResearchService._persistIdentity = originalPersist;

  // AI unavailable: analysis is successful but enrichment is explicitly degraded.
  const aiFailure = await request(port, '/api/business/analyze', { name: rawRecord.business.name });
  assert.equal(aiFailure.status, 200);
  assert.equal(aiFailure.body.brandStrategy.status, 'failed');
  assert.equal(aiFailure.body.business.identity.name, rawRecord.business.name);

  // Unexpected service failure: shared error middleware returns a 500 JSON response.
  const originalResearch = BusinessResearchService.extractBusinessIntelligenceWithProviders;
  BusinessResearchService.extractBusinessIntelligenceWithProviders = async () => {
    throw new Error('controlled internal failure');
  };
  const internalFailure = await request(port, '/api/business/analyze', { name: 'Failure Mode Bakery' });
  assert.equal(internalFailure.status, 500);
  assert.equal(internalFailure.body.message, 'controlled internal failure');
  assert.equal(internalFailure.body.stack, null);
  BusinessResearchService.extractBusinessIntelligenceWithProviders = originalResearch;

  // The process remains usable after the error boundary has handled the exception.
  configureProvider();
  const recovery = await request(port, '/api/business/analyze', { name: rawRecord.business.name });
  assert.equal(recovery.status, 200);

  const repo = new IdentityRepository(getDb());
  assert.ok(repo.findProviderIdentity('geoapify', rawRecord.provider.placeId));
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  console.log('PHASE 9 FAILURE MODES: 10 passed, 0 failed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});