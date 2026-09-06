import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import GeoapifyProvider from './src/services/providers/GeoapifyProvider.js';
import WebExtractionProvider from './src/services/providers/WebExtractionProvider.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import { closeDatabase, getRawDb, getDb } from './src/db/client.js';
import { IdentityRepository } from './src/db/IdentityRepository.js';

const databasePath = process.env.SQLITE_DATABASE_PATH || './test_phase10_entity_lifecycle.db';
const primaryProviderRecordId = 'phase10-primary-place';
const secondProviderRecordId = 'https://www.google.com/maps/place/Phase10+Bakery/@37.7,-122.4,17z';

const primaryRecord = (rating = 4.2) => ({
  business: { name: 'Phase Ten Bakery', category: 'Bakery', description: 'A durable bakery fixture.' },
  contact: { phone: '4155550100', website: 'https://phase10.example.test' },
  location: { full_address: '10 Lifecycle Street', city: 'San Francisco', state: 'CA', country: 'US' },
  ratings: { rating, review_count: 100 },
  provider: { placeId: primaryProviderRecordId },
});

const secondaryRecord = {
  business: { name: 'Phase Ten Bakery', category: 'Bakery', description: 'A durable bakery fixture.' },
  contact: { phone: '4155550100', website: 'https://phase10.example.test' },
  location: { full_address: '10 Lifecycle Street', city: 'San Francisco', state: 'CA', country: 'US' },
  ratings: { rating: 4.2, review_count: 100 },
};

const differentRecord = {
  business: { name: 'Different Phase Ten Shop', category: 'Furniture', description: 'A separate business fixture.' },
  contact: { phone: '4155550200', website: 'https://different-phase10.example.test' },
  location: { full_address: '200 Other Street', city: 'Oakland', state: 'CA', country: 'US' },
  provider: { placeId: 'phase10-different-place' },
};

function configureProvider(record) {
  GeoapifyProvider.isAvailable = () => true;
  GeoapifyProvider.getBusiness = async () => record;
  // Phase 20 lossless contract: WebExtractionProvider.search returns a
  // structured result with canonical ACQUISITION_STATUS values.
  WebExtractionProvider.search = async () => ({
    provider: 'web_extraction',
    status: 'success',
    records: [secondaryRecord],
    error: null,
    diagnostics: { httpStatus: 200, errorCode: null, retryCount: 0, latencyMs: 1 },
    source: { url: secondProviderRecordId, retrieval: new Date().toISOString() },
  });
}

async function runProcessA() {
  configureProvider(primaryRecord(4.2));
  const first = await BusinessResearchService.extractBusinessIntelligenceWithProviders({ name: 'Phase Ten Bakery' });
  assert.equal(first.persistence.status, 'ok');
  const firstEntityId = first.persistence.entityId;
  const repo = new IdentityRepository(getDb());
  const firstMapping = repo.findProviderIdentity('geoapify', primaryProviderRecordId);
  assert.ok(firstMapping);
  assert.equal(firstMapping.entityId, firstEntityId);
  const firstSeen = firstMapping.firstSeen;

  await new Promise((resolve) => setTimeout(resolve, 10));
  configureProvider(primaryRecord(4.8));
  const second = await BusinessResearchService.extractBusinessIntelligenceWithProviders({ name: 'Phase Ten Bakery' });
  assert.equal(second.persistence.entityId, firstEntityId);
  const secondMapping = repo.findProviderIdentity('geoapify', primaryProviderRecordId);
  assert.equal(secondMapping.id, firstMapping.id);
  assert.equal(secondMapping.firstSeen, firstSeen);
  assert.ok(secondMapping.lastSeen >= firstSeen);
  assert.equal(repo.getObservations(firstEntityId, 'ratings.rating').length, 2);
  assert.equal(repo.getCanonicalField(firstEntityId, 'ratings.rating').value, '4.2');

  configureProvider(primaryRecord(4.8));
  const crossProvider = await BusinessResearchService.extractBusinessIntelligenceWithProviders({
    name: 'Phase Ten Bakery',
    googleMapsUrl: secondProviderRecordId,
  });
  assert.equal(crossProvider.persistence.entityId, firstEntityId);
  const secondaryMapping = repo.findProviderIdentity('web_extraction', secondProviderRecordId);
  assert.ok(secondaryMapping);
  assert.equal(secondaryMapping.entityId, firstEntityId);

  configureProvider(differentRecord);
  WebExtractionProvider.search = async () => ({
    provider: 'web_extraction',
    status: 'no_result',
    records: [],
    error: { category: 'EMPTY_RESULT', safeMessage: 'No business evidence extracted.' },
    diagnostics: { httpStatus: null, errorCode: 'empty_result', retryCount: 0, latencyMs: 1 },
    source: { url: null, retrieval: new Date().toISOString() },
  });
  const different = await BusinessResearchService.extractBusinessIntelligenceWithProviders({ name: 'Different Phase Ten Shop' });
  assert.notEqual(different.persistence.entityId, firstEntityId);
  assert.equal(repo.getObservations(different.persistence.entityId, 'identity.name').length, 1);
  assert.equal(repo.getObservations(firstEntityId, 'identity.name').length >= 3, true);
  const entityCount = getRawDb().prepare('SELECT COUNT(*) AS count FROM business_entity').get().count;
  assert.equal(entityCount, 2);
  console.log(`PROCESS A: entity=${firstEntityId}, second=${different.persistence.entityId}, entities=${entityCount}`);
  closeDatabase();
}

async function runProcessB() {
  configureProvider(primaryRecord(4.8));
  const result = await BusinessResearchService.extractBusinessIntelligenceWithProviders({ name: 'Phase Ten Bakery' });
  const repo = new IdentityRepository(getDb());
  const mapping = repo.findProviderIdentity('geoapify', primaryProviderRecordId);
  assert.ok(mapping);
  assert.equal(result.persistence.entityId, mapping.entityId);
  assert.equal(result.intelligence.identity.name, 'Phase Ten Bakery');
  assert.equal(repo.getCanonicalField(mapping.entityId, 'ratings.rating').value, '4.2');
  assert.equal(repo.getObservations(mapping.entityId, 'ratings.rating').length, 5);
  assert.equal(repo.findProviderIdentity('web_extraction', secondProviderRecordId).entityId, mapping.entityId);
  const entityCount = getRawDb().prepare('SELECT COUNT(*) AS count FROM business_entity').get().count;
  assert.equal(entityCount, 2);
  console.log(`PROCESS B: reused entity=${mapping.entityId}, ratingsObservations=5, entities=${entityCount}`);
  closeDatabase();
}

function runChild(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, PHASE10_MODE: mode, SQLITE_DATABASE_PATH: databasePath, OMNIROUTE_API_KEY: 'phase10-test' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Phase 10 process ${mode} exited with ${code}`)));
  });
}

async function main() {
  const mode = process.env.PHASE10_MODE;
  if (mode === 'a') return runProcessA();
  if (mode === 'b') return runProcessB();
  await runChild('a');
  await runChild('b');
  console.log('PHASE 10 ENTITY LIFECYCLE: 12 passed, 0 failed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
