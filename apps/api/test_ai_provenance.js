/**
 * Webloom — AI provenance tests
 *
 * The rule being enforced: a value produced by a model must always be
 * traceable to the provider and model that produced it, and must never be
 * presented as a verified fact.
 *
 * Runs with NO API keys. The AI transport is injected, so this is deterministic
 * and free. Run with:  node test_ai_provenance.js
 */

import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-provenance';
process.env.OPENROUTER_MODEL = 'test/provenance-model';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_MODEL = 'test-gemini-model';
process.env.LOCAL_AI_MODEL = '';
process.env.AI_PROBE_VERIFY_AUTH = 'false';

const { setHttpClient, resetHttpClient } = await import('./src/services/ai/httpClient.js');
const aiService = (await import('./src/services/AIService.js')).default;
const BusinessDataExtractor = (await import('./src/services/BusinessDataExtractor.js')).default;

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message.split('\n')[0]}`);
  } finally {
    resetHttpClient();
  }
}

const openAIResponse = (content, model = 'test/provenance-model') => ({
  status: 200,
  data: {
    model,
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  },
});


/** A response that satisfies the extractor's schema exactly. */
function aiProfile(name, category) {
  const hours = {
    monday: null, tuesday: null, wednesday: null, thursday: null,
    friday: null, saturday: null, sunday: null,
  };
  return {
    business: { name, category, categories: [category], description: null, business_type: null },
    contact: { phone: null, email: null, website: null },
    location: {
      full_address: null, street: null, city: null, state: null,
      country: null, postal_code: null, latitude: null, longitude: null,
    },
    ratings: { rating: null, review_count: null },
    hours,
    reviews: [],
    services: [],
    products: [],
    amenities: [],
    social_links: [],
    pricing: null,
    booking_url: null,
    source_urls: ['https://www.google.com/maps/place/Acme+Co'],
    confidence: { overall: 0.8, name: 0.9, category: 0.7, phone: 0, website: 0, address: 0, rating: 0 },
  };
}

console.log('\nProvenance on AI results');

await test('A successful call records provider, model and timestamp', async () => {
  setHttpClient(async () => openAIResponse('{"value":"x"}'));
  const out = await aiService.generate({ prompt: 'x', schema: { type: 'object' } });
  assert.equal(out.__ai.provider, 'openrouter');
  assert.equal(out.__ai.model, 'test/provenance-model');
  assert.equal(out.__ai.generatedByAI, true);
  assert.ok(out.__ai.latencyMs >= 0);
  assert.ok(Array.isArray(out.__ai.attempts), 'attempts must be recorded');
  assert.equal(out.__ai.attempts.length, 1, 'one provider on the happy path');
});

await test('Provenance records that a fallback provider served the request', async () => {
  setHttpClient(async (req) => {
    if (req.url.includes('openrouter.ai')) {
      const e = new Error('boom');
      e.response = { status: 500, data: { error: { message: 'boom' } } };
      throw e;
    }
    return {
      status: 200,
      data: {
        modelVersion: 'test-gemini-model',
        candidates: [{ content: { parts: [{ text: '{"value":"x"}' }] }, finishReason: 'STOP' }],
      },
    };
  });
  const out = await aiService.generate({ prompt: 'x', schema: { type: 'object' } });
  assert.equal(out.__ai.provider, 'gemini');
  assert.ok(out.__ai.fallbackCount >= 1, 'a fallback must be visible in provenance');
  // 500 is retryable, so the primary is tried twice before falling back.
  assert.deepEqual(
    out.__ai.attempts.map((a) => `${a.provider}:${a.success ? 'ok' : a.error}`),
    ['openrouter:PROVIDER_UNAVAILABLE', 'openrouter:PROVIDER_UNAVAILABLE', 'gemini:ok'],
  );
});

const PAGE_METADATA = {
  jsonLd: [],
  microdata: {},
  openGraph: {},
  visibleText: 'Nilkamal Homes, furniture store in Ludhiana, Punjab. Open 10am-8pm.',
};

console.log('\nProvenance reaches the extraction result');

await test('Extraction stamps provider+model on AI-derived output', async () => {
  setHttpClient(async () => openAIResponse(JSON.stringify(aiProfile('Nilkamal Homes', 'Furniture store'))));

  const result = await BusinessDataExtractor.extractWithAI(PAGE_METADATA, 'https://www.google.com/maps/place/Nilkamal+Homes');
  assert.ok(result.aiProvenance, 'extraction must carry aiProvenance');
  assert.equal(result.aiProvenance.provider, 'openrouter');
  assert.equal(result.aiProvenance.model, 'test/provenance-model');
  assert.ok(result.aiProvenance.generatedAt, 'provenance must be timestamped');
  assert.ok(!('__ai' in JSON.parse(JSON.stringify(result))), 'provenance must be plain enumerable data');
});

await test('Provenance never leaks into the business facts themselves', async () => {
  setHttpClient(async () => openAIResponse(JSON.stringify(aiProfile('Acme Co', 'Cafe'))));

  const result = await BusinessDataExtractor.extractWithAI(PAGE_METADATA, 'https://www.google.com/maps/place/Acme+Co');
  const validated = BusinessDataExtractor.validateProfile(result);

  // A model name or provider id must never appear where a customer would read
  // it as a business attribute.
  const businessBlob = JSON.stringify(validated.business);
  assert.ok(!/openrouter|claude|gemini|test\/provenance-model/i.test(businessBlob),
    `provider/model leaked into business fields: ${businessBlob}`);
  assert.equal(validated.business.name, 'Acme Co');
  assert.equal(validated.business.provider, undefined, 'no provider field on business data');
  assert.equal(validated.business.model, undefined, 'no model field on business data');
});

await test('validateProfile drops the provenance carrier from business data', async () => {
  setHttpClient(async () => openAIResponse(JSON.stringify(aiProfile('Acme Co', 'Cafe'))));
  const result = await BusinessDataExtractor.extractWithAI(PAGE_METADATA, 'https://www.google.com/maps/place/Acme+Co');
  const validated = BusinessDataExtractor.validateProfile(result);
  assert.equal(validated.aiProvenance, undefined,
    'aiProvenance must not survive into the validated business profile');
  assert.ok(!JSON.stringify(validated).includes('aiProvenance'));
});

await test('A failed AI call is reported as unavailability, not as empty facts', async () => {
  setHttpClient(async () => {
    const e = new Error('down');
    e.response = { status: 500, data: { error: { message: 'down' } } };
    throw e;
  });
  const result = await BusinessDataExtractor.extractWithAI(PAGE_METADATA, 'https://www.google.com/maps/place/Acme+Co');
  assert.equal(result.providerUnavailable, true);
  assert.ok(result.providerError, 'a provider error must be reported');
  assert.equal(result.business.name, null, 'no business name may be invented on failure');
  assert.equal(result.aiProvenance, undefined, 'no provenance is claimed when no model ran');
});

console.log(`\n${'='.repeat(52)}`);
console.log(`AI provenance: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`\n  ${f.name}`);
    console.log(`  ${f.error.stack?.split('\n').slice(0, 4).join('\n  ')}`);
  }
}
console.log(`${'='.repeat(52)}`);
process.exit(failed > 0 ? 1 : 0);
