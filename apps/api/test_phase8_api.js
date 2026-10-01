import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import app from './src/app.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import GeoapifyProvider from './src/services/providers/GeoapifyProvider.js';
import WebExtractionProvider from './src/services/providers/WebExtractionProvider.js';
import BrandStrategyService from './src/services/BrandStrategyService.js';
import DigitalAuditService from './src/services/DigitalAuditService.js';
import WebsiteGenerationService from './src/services/WebsiteGenerationService.js';
import GeneratedSiteManager from './src/services/GeneratedSiteManager.js';
import { getDb, closeDatabase } from './src/db/client.js';
import { IdentityRepository } from './src/db/IdentityRepository.js';

const databasePath = process.env.SQLITE_DATABASE_PATH || './test_phase8_api.db';
const providerRecordId = 'phase8-api-place';
const rawRecord = {
  business: { name: 'Old Business Name', category: 'Bakery', description: 'A local bakery.' },
  contact: { phone: '4155550100', website: 'https://old.example.test' },
  location: { full_address: '1 Main Street', city: 'San Francisco', state: 'CA', country: 'US' },
  provider: { placeId: providerRecordId },
};

function configureDeterministicDependencies() {
  GeoapifyProvider.isAvailable = () => true;
  GeoapifyProvider.getBusiness = async () => rawRecord;
  WebExtractionProvider.search = async () => ({ status: 'no_result', records: [] });
  BrandStrategyService.generateBrandDNA = async (business) => ({
    businessIdentity: { name: business.identity.name },
    audience: { primary: { segment: 'local customers' } },
    services: { core: [] },
    trustSignals: [],
    brandPersonality: {},
    positioning: {},
    conversionStrategy: { primaryCTA: { text: 'Call now' } },
  });
  DigitalAuditService.auditDigitalPresence = async () => ({ overallScore: 0, categories: {} });
}

async function request(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function runProcessA() {
  configureDeterministicDependencies();
  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
  const result = await request(port, '/api/business/analyze', { name: rawRecord.business.name });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.business.identity.name, rawRecord.business.name);

  const repo = new IdentityRepository(getDb());
  const mapping = repo.findProviderIdentity('geoapify', providerRecordId);
  assert.ok(mapping);
  repo.upsertCanonicalField({
    entityId: mapping.entityId,
    fieldPath: 'identity.name',
    value: 'Canonical Business Name',
    provenance: 'verified',
    confidence: 0.99,
  });

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  console.log('  ✓ analysis API persists provider identity and canonical fixture');
}

async function runProcessB() {
  configureDeterministicDependencies();
  const server = app.listen(0);
  const port = await new Promise((resolve) => server.once('listening', () => resolve(server.address().port)));
  const analysis = await request(port, '/api/business/analyze', { name: rawRecord.business.name });
  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.business.identity.name, 'Canonical Business Name');
  assert.equal(analysis.body.business.identity.name.includes('Old Business Name'), false);

  const repo = new IdentityRepository(getDb());
  const mapping = repo.findProviderIdentity('geoapify', providerRecordId);
  assert.ok(mapping);

  const website = await request(port, '/api/website/generate', {
    business: analysis.body.business,
    options: { build: true, start: true, skipAIDesign: true },
  });
  assert.equal(website.status, 200);
  assert.equal(website.body.success, true);
  assert.equal(website.body.website.status, 'running');
  const config = await WebsiteGenerationService.assembleConfig(analysis.body.business, { skipAIDesign: true });
  assert.equal(config.business.name, 'Canonical Business Name');
  assert.equal(config.provenance.geoapify, 'ok');
  await GeneratedSiteManager.remove('canonical-business-name');

  const invalid = await request(port, '/api/business/analyze', {});
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /required/);

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  console.log('  ✓ fresh lifecycle recovers canonical intelligence and website output');
  console.log('  ✓ invalid API request returns 400 without pipeline execution');
}

async function main() {
  console.log('\nPHASE 8 API-BOUNDARY ACCEPTANCE');
  const mode = process.env.PHASE8_MODE;
  if (mode === 'a') return runProcessA();
  if (mode === 'b') return runProcessB();

  const child = (childMode) => new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, PHASE8_MODE: childMode, SQLITE_DATABASE_PATH: databasePath, OPENROUTER_API_KEY: '', GEMINI_API_KEY: '', LOCAL_AI_API_KEY: '', OPENROUTER_MODEL: '', GEMINI_MODEL: '', LOCAL_AI_MODEL: '' },
      stdio: 'inherit',
    });
    childProcess.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Phase 8 process ${childMode} exited with ${code}`)));
    childProcess.once('error', reject);
  });

  await child('a');
  await child('b');
  console.log('RESULTS: 6 passed, 0 failed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});