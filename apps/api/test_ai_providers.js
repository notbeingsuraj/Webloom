/**
 * Webloom — AI provider chain tests
 *
 * Covers:
 *   A. Provider selection   (primary -> secondary -> local -> structured failure)
 *   B. Retry behaviour      (retryable vs not, bounded, no auth retry, timeout)
 *   C. Response validation  (valid, malformed, schema, semantics, empty)
 *   D. Provider isolation   (each provider mocked independently)
 *   E. Secret hygiene       (keys never leak into results or errors)
 *
 * No real API keys and no network: the transport is injected via
 * src/services/ai/httpClient.js, so every provider is mocked at the HTTP
 * boundary. Run with:  node test_ai_providers.js
 */

import assert from 'node:assert/strict';

// Env must be set before config is imported.
process.env.OPENROUTER_API_KEY = 'sk-or-v1-test-primary-000';
process.env.OPENROUTER_MODEL = 'test/primary-model';
process.env.GEMINI_API_KEY = 'test-gemini-key';
// Mirrors the model the deployed .env selects, so the health assertions below
// check the real configuration rather than a placeholder.
process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
process.env.LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1';
process.env.LOCAL_AI_MODEL = 'test-local-model';
process.env.AI_MAX_RETRIES = '1';
process.env.AI_TIMEOUT_MS = '5000';
process.env.AI_PROBE_VERIFY_AUTH = 'false';

const { setHttpClient, resetHttpClient } = await import('./src/services/ai/httpClient.js');
const aiService = (await import('./src/services/AIService.js')).default;
const { AIError, AIAllProvidersFailedError, AI_ERROR_CATEGORY, sanitizeSecretText } =
  await import('./src/services/ai/AIError.js');
const validator = await import('./src/services/ai/AIResponseValidator.js');
const { resolveProviderOrder, createProviderChain } = await import('./src/services/ai/AIProviderFactory.js');
const { LocalProvider } = await import('./src/services/ai/providers/LocalProvider.js');
const { config } = await import('./src/config/env.js');

// ---------------------------------------------------------------- helpers

let calls = [];

function providerOfUrl(url = '') {
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('googleapis.com')) return 'gemini';
  if (url.includes('127.0.0.1') || url.includes('localhost')) return 'local';
  return 'unknown';
}

const openAIResponse = (content, model = 'test/primary-model') => ({
  status: 200,
  data: {
    model,
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
});

const geminiResponse = (content) => ({
  status: 200,
  data: {
    modelVersion: 'test-gemini-model',
    candidates: [{ content: { parts: [{ text: content }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  },
});

function httpError(status, message) {
  const e = new Error(message);
  e.response = { status, data: { error: { message } } };
  return e;
}

function timeoutError() {
  const e = new Error('timeout of 5000ms exceeded');
  e.code = 'ECONNABORTED';
  return e;
}

const connectionError = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
  code: 'ECONNREFUSED',
});

/** Install a transport that dispatches per provider. */
function installTransport(handlers) {
  calls = [];
  setHttpClient(async (req) => {
    const provider = providerOfUrl(req.url);
    // The real client is axios, which names the payload `data`. Normalize it to
    // `body` (the name AIProvider.request documents) so handlers can read one
    // field. Previously handlers read req.body and silently got undefined.
    const body = req.body ?? req.data;
    calls.push({ provider, url: req.url, model: body?.model, body });
    const handler = handlers[provider];
    if (!handler) throw new Error(`test bug: no handler for provider "${provider}"`);
    return handler({ ...req, body });
  });
}

const callOrder = () => calls.map((c) => c.provider);
const countCalls = (p) => calls.filter((c) => c.provider === p).length;

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

const SIMPLE_SCHEMA = {
  type: 'object',
  properties: { value: { type: 'string' } },
  required: ['value'],
};

// ------------------------------------------------- A. provider selection

console.log('\nA. Provider selection');

await test('OpenRouter available -> OpenRouter is selected and no other provider is called', async () => {
  installTransport({
    openrouter: () => openAIResponse('{"value":"from-openrouter"}'),
    gemini: () => { throw new Error('must not be called'); },
    local: () => { throw new Error('must not be called'); },
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'from-openrouter');
  assert.equal(out.__ai.provider, 'openrouter');
  assert.deepEqual(callOrder(), ['openrouter'], 'exactly one provider call on the happy path');
});

await test('OpenRouter unavailable -> Gemini is selected', async () => {
  installTransport({
    openrouter: () => { throw httpError(500, 'upstream exploded'); },
    gemini: () => geminiResponse('{"value":"from-gemini"}'),
    local: () => { throw new Error('must not be called'); },
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'from-gemini');
  assert.equal(out.__ai.provider, 'gemini');
  assert.equal(callOrder().at(-1), 'gemini');
});

await test('OpenRouter + Gemini unavailable -> Local is selected', async () => {
  installTransport({
    openrouter: () => { throw httpError(503, 'service unavailable'); },
    gemini: () => { throw httpError(500, 'gemini down'); },
    local: () => openAIResponse('{"value":"from-local"}', 'test-local-model'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'from-local');
  assert.equal(out.__ai.provider, 'local');
});

await test('All providers unavailable -> structured AI_ALL_PROVIDERS_FAILED error', async () => {
  installTransport({
    openrouter: () => { throw httpError(500, 'a'); },
    gemini: () => { throw httpError(500, 'b'); },
    local: () => { throw connectionError(); },
  });
  await assert.rejects(
    () => aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }),
    (err) => {
      assert.equal(err.code, 'AI_ALL_PROVIDERS_FAILED');
      assert.equal(err.name, 'AIAllProvidersFailedError');
      assert.equal(err.operation, 'extraction');
      // Every provider must appear in the audit trail.
      const providers = new Set(err.attempts.map((a) => a.provider));
      assert.ok(providers.has('openrouter') && providers.has('gemini') && providers.has('local'),
        `expected all 3 providers in attempts, got ${[...providers].join(',')}`);
      // Categories, not raw text.
      for (const a of err.attempts) assert.ok(typeof a.error === 'string' && a.error.length > 0);
      return true;
    },
  );
});

await test('Unconfigured provider is skipped, not attempted', async () => {
  // Gemini has no key in this scenario: it must be stepped over silently.
  const savedGemini = config.ai.providers.gemini.enabled;
  config.ai.providers.gemini.enabled = false;
  config.ai.providers.gemini.apiKey = null;
  try {
    installTransport({
      openrouter: () => { throw httpError(500, 'down'); },
      local: () => openAIResponse('{"value":"from-local"}', 'test-local-model'),
    });
    const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
    assert.equal(out.value, 'from-local');
    assert.equal(countCalls('gemini'), 0, 'unconfigured gemini must not be called');
  } finally {
    config.ai.providers.gemini.enabled = savedGemini;
    config.ai.providers.gemini.apiKey = 'test-gemini-key';
  }
});

// ------------------------------------------------------- B. retry behaviour

console.log('\nB. Retry behaviour');

await test('Retryable error (500) retries exactly once, then falls back', async () => {
  installTransport({
    openrouter: () => { throw httpError(500, 'transient'); },
    gemini: () => geminiResponse('{"value":"ok"}'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'ok');
  assert.equal(countCalls('openrouter'), 2, 'AI_MAX_RETRIES=1 => at most 2 attempts');
  assert.equal(countCalls('gemini'), 1);
});

await test('Non-retryable error (401 auth) does NOT retry, falls back immediately', async () => {
  installTransport({
    openrouter: () => { throw httpError(401, 'invalid api key'); },
    gemini: () => geminiResponse('{"value":"ok"}'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'ok');
  assert.equal(countCalls('openrouter'), 1, 'a bad key must not be retried');
  assert.equal(countCalls('gemini'), 1, 'the next provider is independent, so we try it');
});

await test('Timeout triggers fallback (and is retried once first)', async () => {
  installTransport({
    openrouter: () => { throw timeoutError(); },
    gemini: () => geminiResponse('{"value":"ok"}'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'ok');
  assert.equal(countCalls('openrouter'), 2, 'timeout is retryable');
  assert.equal(countCalls('gemini'), 1);
});

await test('Non-retryable, non-fallback error (400 bad request) does not retry or fall back', async () => {
  installTransport({
    openrouter: () => { throw httpError(400, 'invalid request: prompt too long'); },
    gemini: () => { throw new Error('must not be called'); },
    local: () => { throw new Error('must not be called'); },
  });
  await assert.rejects(() => aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }));
  assert.equal(countCalls('openrouter'), 1, 'our own bad request must not be retried');
  assert.equal(countCalls('gemini'), 0, 'our own bad request must not hit other providers');
});

await test('Retry-After from the provider is honoured over the local backoff', async () => {
  const { parseRetryAfterMs } = await import('./src/services/ai/AIError.js');
  assert.equal(parseRetryAfterMs({ 'retry-after': '7' }), 7000);
  assert.equal(parseRetryAfterMs({ 'Retry-After': '0' }), 0);
  assert.equal(parseRetryAfterMs({ 'x-ratelimit-reset-after': '2.5' }), 2500);
  assert.equal(parseRetryAfterMs({}), null);
  // Never let a hostile/absurd header stall a request for minutes.
  assert.equal(parseRetryAfterMs({ 'retry-after': '99999' }), 60000);
  // A future HTTP date resolves to a delay, not NaN.
  const future = new Date(Date.now() + 5000).toUTCString();
  const ms = parseRetryAfterMs({ 'retry-after': future });
  assert.ok(ms > 0 && ms <= 6000, `expected a sane delay, got ${ms}`);

  const err = AIError.from(
    { response: { status: 429, headers: { 'retry-after': '3' }, data: { error: { message: 'slow down' } } } },
    { provider: 'openrouter' },
  );
  assert.equal(err.retryAfterMs, 3000);
  assert.equal(aiService.backoffMs(err, 0), 3000, 'server-directed delay must win');
});

await test('Rate limits back off longer than transient 5xx blips', () => {
  const rateLimited = new AIError({ category: 'RATE_LIMITED' });
  const serverError = new AIError({ category: 'PROVIDER_UNAVAILABLE' });
  const r1 = aiService.backoffMs(rateLimited, 0);
  const s1 = aiService.backoffMs(serverError, 0);
  assert.ok(r1 > s1, `rate-limit backoff (${r1}ms) must exceed 5xx backoff (${s1}ms)`);
  assert.ok(aiService.backoffMs(rateLimited, 3) <= 6000, 'rate-limit backoff must stay bounded');
  assert.ok(aiService.backoffMs(serverError, 3) <= 1000, '5xx backoff must stay bounded');
});

await test('A retry delay stated in the body is honoured when there is no header', async () => {
  const { parseRetryAfterMs } = await import('./src/services/ai/AIError.js');
  // Google sends no Retry-After header but writes the delay into the message.
  const body = 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash. Please retry in 18.065878778s.';
  assert.equal(parseRetryAfterMs({}, body), 18066);
  const err = AIError.from(
    { response: { status: 429, headers: {}, data: { error: { message: body } } } },
    { provider: 'gemini' },
  );
  assert.equal(err.category, 'RATE_LIMITED');
  assert.equal(err.retryAfterMs, 18066);
  // The chain also caps any wait at the per-request timeout, so a provider
  // asking for 18s cannot exceed the budget the caller allowed.
  assert.equal(aiService.backoffMs(err, 0), Math.min(18066, config.ai.timeoutMs),
    'the provider-stated delay must win over our own guessed backoff');
});

await test('A non-2xx handed back by a transport is treated as an error, not an empty answer', async () => {
  // A 429 that arrives as a "successful" response must not be reported as an
  // empty model response, which would hide the real cause.
  setHttpClient(async () => ({
    status: 429,
    data: { error: { message: 'Quota exceeded. Please retry in 5s.' } },
    headers: {},
  }));
  const err = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }).then(() => null, (e) => e);
  assert.ok(err, 'expected an error');
  assert.ok(err.attempts.some((a) => a.httpStatus === 429),
    `expected a 429 attempt, got ${JSON.stringify(err.attempts)}`);
  assert.ok(!err.attempts.some((a) => a.error === 'INVALID_RESPONSE'),
    'a 429 must not be misreported as an empty/invalid model response');
});

await test('429 rate-limit wording is retryable, quota/billing wording is not', async () => {
  // Gemini words RPM throttling as "exceeded your current quota ... rate-limits".
  // Treating that as a dead quota would skip the retry that would have worked.
  const throttled = httpError(429, 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.');
  const err = AIError.from(throttled, { provider: 'gemini' });
  assert.equal(err.category, 'RATE_LIMITED', 'a rate-limit 429 must stay retryable');
  assert.equal(err.retryable, true);

  // A genuine billing wall must NOT be retried.
  const broke = httpError(429, 'Quota exceeded. Please add credits to your account.');
  const err2 = AIError.from(broke, { provider: 'gemini' });
  assert.equal(err2.category, 'QUOTA_EXHAUSTED', 'a billing/quota 429 must not be retried');
  assert.equal(err2.retryable, false);
  assert.equal(err2.shouldFallback, true, 'but we should still try another provider');
});

await test('Retry count never exceeds AI_MAX_RETRIES for any provider', async () => {
  installTransport({
    openrouter: () => { throw httpError(429, 'rate limited'); },
    gemini: () => { throw httpError(429, 'rate limited'); },
    local: () => { throw httpError(429, 'rate limited'); },
  });
  await assert.rejects(() => aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }));
  for (const p of ['openrouter', 'gemini', 'local']) {
    assert.ok(countCalls(p) <= 2, `${p} called ${countCalls(p)} times, expected <= 2`);
  }
});

await test('AI_MAX_RETRIES=0 disables retries entirely', async () => {
  const saved = config.ai.maxRetries;
  config.ai.maxRetries = 0;
  try {
    installTransport({
      openrouter: () => { throw httpError(500, 'transient'); },
      gemini: () => geminiResponse('{"value":"ok"}'),
    });
    await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
    assert.equal(countCalls('openrouter'), 1, 'no retries when maxRetries=0');
  } finally {
    config.ai.maxRetries = saved;
  }
});

// -------------------------------------------------- C. response validation

console.log('\nB2. Total time budget');

await test('Every attempt is clamped to the remaining total budget', async () => {
  const seen = [];
  setHttpClient(async (req) => {
    const provider = providerOfUrl(req.url);
    seen.push({ provider, timeout: req.timeout });
    // Pretend to be a very slow provider.
    await new Promise((r) => setTimeout(r, 30));
    return provider === 'gemini'
      ? geminiResponse('{"value":"ok"}')
      : openAIResponse('{"value":"ok"}');
  });
  const savedTotal = config.ai.maxTotalMs;
  config.ai.maxTotalMs = 5000;
  try {
    await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
    assert.ok(seen.length > 0);
    for (const s of seen) {
      assert.ok(s.timeout <= 5000, `${s.provider} was given ${s.timeout}ms, over the 5000ms budget`);
    }
  } finally {
    config.ai.maxTotalMs = savedTotal;
  }
});

await test('An exhausted total budget stops the chain instead of trying forever', async () => {
  let calls = 0;
  setHttpClient(async (req) => {
    calls += 1;
    // Burn the whole budget on the first provider.
    await new Promise((r) => setTimeout(r, 120));
    throw httpError(500, 'slow failure');
  });
  const savedTotal = config.ai.maxTotalMs;
  config.ai.maxTotalMs = 150;
  try {
    const err = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }).then(() => null, (e) => e);
    assert.ok(err, 'expected a failure once the budget ran out');
    assert.equal(err.code, 'AI_ALL_PROVIDERS_FAILED');
    // The point of the test: the wall clock is bounded, not the attempt count.
    assert.ok(calls <= 3, `chain kept calling after the budget expired (${calls} calls)`);
  } finally {
    config.ai.maxTotalMs = savedTotal;
  }
});

await test('A slow provider cannot starve the fallback of remaining time', async () => {
  const order = [];
  setHttpClient(async (req) => {
    const provider = providerOfUrl(req.url);
    order.push(provider);
    if (provider === 'openrouter') {
      // Consume nearly everything.
      await new Promise((r) => setTimeout(r, 140));
      throw httpError(500, 'slow primary');
    }
    return geminiResponse('{"value":"from-gemini"}');
  });
  const savedTotal = config.ai.maxTotalMs;
  const savedRetries = config.ai.maxRetries;
  config.ai.maxTotalMs = 600;
  config.ai.maxRetries = 0;
  try {
    const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
    assert.equal(out.value, 'from-gemini', 'the fallback must still get its turn');
    assert.deepEqual(order, ['openrouter', 'gemini']);
  } finally {
    config.ai.maxTotalMs = savedTotal;
    config.ai.maxRetries = savedRetries;
  }
});

console.log('\nC. Response validation');

await test('Valid JSON passes the pipeline', () => {
  const v = validator.validateStructuredOutput('{"value":"x"}', SIMPLE_SCHEMA, {});
  assert.deepEqual(v, { value: 'x' });
});

await test('JSON inside a markdown fence is extracted', () => {
  const v = validator.validateStructuredOutput('```json\n{"value":"fenced"}\n```', SIMPLE_SCHEMA, {});
  assert.equal(v.value, 'fenced');
});

await test('JSON preceded by prose is extracted', () => {
  const v = validator.validateStructuredOutput('Sure! Here you go:\n{"value":"prose"}\nHope that helps.', SIMPLE_SCHEMA, {});
  assert.equal(v.value, 'prose');
});

await test('Braces inside string literals do not truncate the JSON', () => {
  const v = validator.validateStructuredOutput('{"value":"a { brace } and \\" quote"}', SIMPLE_SCHEMA, {});
  assert.equal(v.value, 'a { brace } and " quote');
});

await test('Malformed JSON is rejected as INVALID_RESPONSE', () => {
  assert.throws(
    () => validator.validateStructuredOutput('{"value": ', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_RESPONSE,
  );
});

await test('Empty response is rejected', () => {
  assert.throws(
    () => validator.validateStructuredOutput('   ', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_RESPONSE,
  );
});

await test('No JSON at all is rejected', () => {
  assert.throws(
    () => validator.validateStructuredOutput('I cannot help with that.', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_RESPONSE,
  );
});

await test('Missing required field is rejected as INVALID_SCHEMA', () => {
  assert.throws(
    () => validator.validateStructuredOutput('{"other":"x"}', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_SCHEMA,
  );
});

await test('Wrong type is rejected as INVALID_SCHEMA', () => {
  assert.throws(
    () => validator.validateStructuredOutput('{"value":123}', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_SCHEMA,
  );
});

await test('Hallucinated extra field rejected when additionalProperties:false', () => {
  const strict = { ...SIMPLE_SCHEMA, additionalProperties: false };
  assert.throws(
    () => validator.validateStructuredOutput('{"value":"x","phone":"555-0000"}', strict, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_SCHEMA,
  );
});

await test('Out-of-range confidence is rejected as semantically invalid', () => {
  assert.throws(
    () => validator.validateStructuredOutput('{"value":"x","confidence":1.7}', SIMPLE_SCHEMA, {}),
    (e) => e.category === AI_ERROR_CATEGORY.INVALID_SCHEMA,
  );
});

await test('Invalid JSON falls through to the next provider rather than being repaired', async () => {
  installTransport({
    openrouter: () => openAIResponse('Sure! {"value": broken'),
    gemini: () => geminiResponse('{"value":"recovered"}'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'recovered');
  assert.equal(out.__ai.provider, 'gemini');
});

await test('Schema-invalid JSON falls through to the next provider', async () => {
  installTransport({
    openrouter: () => openAIResponse('{"wrong_key":1}'),
    gemini: () => geminiResponse('{"value":"recovered"}'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'recovered');
});

await test('Unstructured request returns raw text, not parsed JSON', async () => {
  installTransport({ openrouter: () => openAIResponse('just some prose') });
  const out = await aiService.generate({ prompt: 'x' });
  assert.equal(out, 'just some prose');
});

// ---------------------------------------------------- D. provider isolation

console.log('\nD. Provider isolation');

await test('Each provider can be made to fail independently', async () => {
  // Only Gemini fails -> OpenRouter must not even be consulted afterwards.
  installTransport({
    openrouter: () => { throw httpError(500, 'openrouter down'); },
    gemini: () => { throw httpError(401, 'gemini key rejected'); },
    local: () => openAIResponse('{"value":"local-saved-us"}', 'test-local-model'),
  });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'local-saved-us');
  assert.equal(out.__ai.provider, 'local');
});

await test('Gemini response envelope is normalized to the common shape', async () => {
  installTransport({ gemini: () => geminiResponse('{"value":"normalized"}') });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.equal(out.value, 'normalized');
  assert.equal(out.__ai.provider, 'gemini');
  assert.equal(out.__ai.model, 'test-gemini-model');
  assert.equal(out.__ai.usage.totalTokens, 15);
  assert.equal(out.__ai.finishReason, 'STOP');
});

await test('OpenRouter and local responses share the identical normalized shape', async () => {
  installTransport({ openrouter: () => openAIResponse('{"value":"a"}') });
  const a = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });

  installTransport({ local: () => openAIResponse('{"value":"b"}', 'test-local-model') });
  const savedPrimary = config.ai.primaryProvider;
  config.ai.primaryProvider = 'local';
  try {
    const b = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
    assert.deepEqual(Object.keys(b.__ai).sort(), Object.keys(a.__ai).sort(),
      'both providers must expose the same provenance keys');
  } finally {
    config.ai.primaryProvider = savedPrimary;
  }
});

await test('Chain order comes from config, not from code', () => {
  assert.deepEqual(resolveProviderOrder(config.ai), ['openrouter', 'gemini', 'local']);
  assert.deepEqual(resolveProviderOrder({
    primaryProvider: 'gemini', secondaryProvider: 'openrouter', fallbackProvider: 'local',
  }), ['gemini', 'openrouter', 'local']);
  // Duplicates collapse.
  assert.deepEqual(resolveProviderOrder({
    primaryProvider: 'local', secondaryProvider: 'local', fallbackProvider: 'gemini',
  }), ['local', 'gemini']);
});

await test('Factory builds one instance per configured provider', () => {
  const chain = createProviderChain(config.ai);
  assert.equal(chain.length, 3);
  assert.deepEqual(chain.map((p) => p.name), ['openrouter', 'gemini', 'local']);
  assert.ok(chain.every((p) => typeof p.complete === 'function'));
  assert.ok(chain.every((p) => typeof p.checkHealth === 'function'));
});

await test('Legacy model task hints map onto operations', async () => {
  installTransport({ openrouter: () => openAIResponse('{"value":"x"}') });
  // 14 call sites still pass model:'reasoning' / 'fast'.
  await aiService.generate({ prompt: 'x', model: 'reasoning', schema: SIMPLE_SCHEMA });
  await aiService.generate({ prompt: 'x', model: 'fast', schema: SIMPLE_SCHEMA });
  const ops = aiService.getTelemetry().map((e) => e.operation);
  assert.ok(ops.includes('brand'), "model:'reasoning' should route to the brand operation");
  assert.ok(ops.includes('extraction'), "model:'fast' should route to the extraction operation");
});

// ------------------------------------------------------- E. secret hygiene

console.log('\nE. Secret hygiene');

await test('Provider messages are stripped of credentials before surfacing', () => {
  const raw = 'Auth failed for Authorization: Bearer sk-or-v1-abcdef1234567890 and key "AIzaSyABCDEFGHIJ123456"';
  const safe = sanitizeSecretText(raw);
  assert.ok(!safe.includes('sk-or-v1-abcdef1234567890'), 'bearer token leaked');
  assert.ok(!safe.includes('AIzaSyABCDEFGHIJ123456'), 'gemini key leaked');
  assert.ok(safe.includes('[REDACTED]'));
});

await test('An error echoing a key does not leak it through generate()', async () => {
  installTransport({
    openrouter: () => { throw httpError(401, 'Invalid API key: sk-or-v1-abcdef1234567890'); },
    gemini: () => { throw httpError(401, 'API key not valid: AIzaSyABCDEFGHIJ123456'); },
    local: () => { throw httpError(401, 'bad key sk-or-v1-abcdef1234567890'); },
  });
  const err = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA }).then(
    () => null,
    (e) => e,
  );
  assert.ok(err, 'expected an error');
  const serialized = JSON.stringify({ msg: err.message, attempts: err.attempts });
  assert.ok(!serialized.includes('sk-or-v1-abcdef1234567890'), 'OpenRouter key leaked into error');
  assert.ok(!serialized.includes('AIzaSyABCDEFGHIJ123456'), 'Gemini key leaked into error');
});

await test('Provenance is non-enumerable so it cannot leak into API payloads or the DB', async () => {
  installTransport({ openrouter: () => openAIResponse('{"value":"x"}') });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  assert.ok(out.__ai, 'provenance should be reachable');
  assert.ok(!Object.keys(out).includes('__ai'), '__ai must not be enumerable');
  assert.ok(!JSON.stringify(out).includes('__ai'), '__ai must not appear in JSON');
});

await test('Successful results never carry a credential', async () => {
  installTransport({ openrouter: () => openAIResponse('{"value":"x"}') });
  const out = await aiService.generate({ prompt: 'x', schema: SIMPLE_SCHEMA });
  const dumped = JSON.stringify(out);
  assert.ok(!dumped.includes('sk-or'), 'key leaked into a successful result');
  assert.ok(!dumped.includes(config.ai.providers.openrouter.apiKey), 'live key leaked into a result');
});

// ------------------------------------------------------------ error taxonomy

console.log('\nF. Error taxonomy');

await test('Categories map to the documented retry/fallback policy', () => {
  const expectations = [
    [AI_ERROR_CATEGORY.AUTHENTICATION, false, true],
    [AI_ERROR_CATEGORY.RATE_LIMITED, true, true],
    [AI_ERROR_CATEGORY.QUOTA_EXHAUSTED, false, true],
    [AI_ERROR_CATEGORY.TIMEOUT, true, true],
    [AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE, true, true],
    [AI_ERROR_CATEGORY.INVALID_RESPONSE, false, true],
    [AI_ERROR_CATEGORY.INVALID_SCHEMA, false, true],
    [AI_ERROR_CATEGORY.REQUEST_INVALID, false, false],
    [AI_ERROR_CATEGORY.CONFIGURATION_ERROR, false, false],
  ];
  for (const [category, retryable, fallback] of expectations) {
    const err = new AIError({ category, message: 'x' });
    assert.equal(err.retryable, retryable, `${category} retryable`);
    assert.equal(err.shouldFallback, fallback, `${category} fallback`);
  }
});

await test('Legacy providerError shape is preserved for existing consumers', () => {
  // AcquisitionResult.classifyEmptyAcquisition and routes/business.js read
  // these exact fields.
  const err = new AIError({
    category: AI_ERROR_CATEGORY.RATE_LIMITED, provider: 'openrouter', model: 'm', httpStatus: 429,
  });
  assert.equal(err.providerError.category, 'RATE_LIMITED');
  assert.equal(err.providerError.httpStatus, 429);
  assert.equal(err.providerError.provider, 'openrouter');
  assert.equal(typeof err.providerError.safeMessage, 'string');
  assert.equal(err.providerError.success, false);
});

await test('generate() rejects an empty prompt without touching the network', async () => {
  installTransport({ openrouter: () => { throw new Error('must not be called'); } });
  await assert.rejects(
    () => aiService.generate({ prompt: '' }),
    (e) => e.category === AI_ERROR_CATEGORY.REQUEST_INVALID,
  );
  assert.equal(calls.length, 0);
});

// ------------------------------------------ G. credit exhaustion & diagnostics

console.log('\nG. Credit exhaustion and health honesty');

const credit402 = (affordable) => httpError(402,
  `This request requires more credits, or fewer max_tokens. `
  + `You requested up to 6000 tokens, but can only afford ${affordable}. `
  + 'To increase, visit https://openrouter.ai/settings/credits.');

await test('A 402 that states an affordable ceiling re-dispatches at a smaller max_tokens', async () => {
  let seen = [];
  installTransport({
    openrouter: (req) => {
      seen.push(req.body.max_tokens);
      if (req.body.max_tokens > 900) throw credit402(1000);
      return openAIResponse('{"value":"shrunk"}');
    },
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 6000 });
  assert.deepEqual(result, { value: 'shrunk' });
  assert.equal(seen[0], 6000, 'first attempt asks for the full budget');
  assert.ok(seen[1] < 1000, `second attempt must be clamped below the ceiling, got ${seen[1]}`);
});

await test('The clamp is applied with a margin, not exactly at the stated ceiling', async () => {
  // OpenRouter computes the ceiling before reserving in-flight cost, so
  // re-requesting exactly N reliably 402s again.
  const seen = [];
  installTransport({
    openrouter: (req) => {
      seen.push(req.body.max_tokens);
      if (req.body.max_tokens >= 1000) throw credit402(1000);
      return openAIResponse('{"value":"ok"}');
    },
  });
  await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 6000 });
  assert.ok(seen[1] < 1000, `clamp must be strictly below 1000, got ${seen[1]}`);
});

await test('A clamp does not loop: it is bounded to one re-dispatch per provider', async () => {
  let attempts = 0;
  installTransport({
    openrouter: (req) => { attempts += 1; throw credit402(1000); },
  });
  await assert.rejects(() => aiService.generate({ prompt: 'p', schema: true, maxTokens: 6000 }));
  // 1 initial + 1 clamp; the clamp's own 402 must not schedule another clamp.
  assert.equal(attempts, 2, `expected exactly 2 attempts, got ${attempts}`);
});

await test('A clamp is per-provider and does not leak to the rest of the chain', async () => {
  const seen = [];
  installTransport({
    openrouter: (req) => { seen.push(['openrouter', req.body.max_tokens]); throw credit402(1000); },
    local: (req) => { seen.push(['local', req.body.max_tokens]); return openAIResponse('{"value":"local-served"}', 'test-local-model'); },
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 6000 });
  assert.equal(result.value, 'local-served');
  const local = seen.find(([p]) => p === 'local');
  assert.equal(local[1], 6000, 'the next provider must get the original budget back');
});

await test('A 402 with no stated ceiling is not retried as a clamp', async () => {
  let attempts = 0;
  installTransport({
    // The other real OpenRouter 402: in-flight reservations, no ceiling given.
    openrouter: (req) => {
      attempts += 1;
      throw httpError(402, 'This request would exceed your available credits given your current in-flight requests.');
    },
  });
  await assert.rejects(() => aiService.generate({ prompt: 'p', schema: true, maxTokens: 6000 }));
  assert.equal(attempts, 1, `no clamp without a ceiling to clamp to, got ${attempts}`);
});

await test('An out-of-credit account is reported unusable, not healthy', async () => {
  // The probe must ask for a realistic ceiling. Asking for 1 token passed on
  // an account that could fund nothing, so /health/ai said "ok" while every
  // real request 402'd.
  installTransport({ openrouter: () => { throw credit402(500); } });
  const [openrouter] = createProviderChain(config.ai);
  const health = await openrouter.runHealthCheck();
  assert.equal(health.configured, true);
  assert.equal(health.usable, false, 'a 402 must never read as usable');
  assert.equal(health.authenticated, true, 'the key itself was accepted');
  assert.match(health.detail, /QUOTA_EXHAUSTED/);
  assert.equal(health.affordableMaxTokens, 500, 'the real ceiling must be surfaced');
});

await test('The health probe requests a real workload ceiling, not 1 token', async () => {
  let requested = null;
  installTransport({
    openrouter: (req) => { requested = req.body.max_tokens; return openAIResponse('ok'); },
  });
  const [openrouter] = createProviderChain(config.ai);
  await openrouter.runHealthCheck();
  assert.equal(requested, config.ai.probeMaxTokens);
  assert.ok(requested >= 6000, `probe ceiling must cover the heaviest operation, got ${requested}`);
});

await test('A failed brand-DNA call keeps its diagnosis instead of collapsing to a bare Error', async () => {
  const BrandStrategyService = (await import('./src/services/BrandStrategyService.js')).default;
  installTransport({ openrouter: () => { throw credit402(1000); } });
  await assert.rejects(
    () => BrandStrategyService.generateBrandDNA({
      name: 'Test Bakery', category: 'Bakery', address: '1 Main St', phone: '+1 555 0100',
    }),
    (e) => {
      assert.equal(e.category, AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED, 'category must survive');
      assert.ok(Array.isArray(e.attempts), 'the per-provider trail must survive');
      assert.ok(e.attempts.some((a) => a.httpStatus === 402), 'the 402 must be visible in the trail');
      return true;
    },
  );
});

await test('A failed brand-DNA call does not log the provider credential', async () => {
  const BrandStrategyService = (await import('./src/services/BrandStrategyService.js')).default;
  const secret = 'sk-or-v1-leak-canary-000';
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  installTransport({ openrouter: () => { throw httpError(401, `Invalid key ${secret}`); } });
  try {
    await BrandStrategyService.generateBrandDNA({
      name: 'Test Bakery', category: 'Bakery', address: '1 Main St', phone: '+1 555 0100',
    }).catch(() => {});
  } finally {
    console.error = original;
  }
  const output = logged.join('\n');
  assert.ok(output.length > 0, 'the failure must still be logged');
  assert.ok(!output.includes(secret), `credential leaked into logs:\n${output}`);
});

await test('A response truncated at the token ceiling is rejected, not passed downstream', async () => {
  // finish_reason=length with well-formed JSON: structurally valid, but missing
  // most of its fields. Must never be handed to callers as a good result.
  installTransport({
    openrouter: () => ({
      status: 200,
      data: {
        model: 'test/primary-model',
        choices: [{ message: { content: '{"value":"cut off here"}' }, finish_reason: 'length' }],
        usage: { completion_tokens: 6000 },
      },
    }),
  });
  await assert.rejects(
    () => aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 6000 }),
    (e) => {
      // The chain surfaces the aggregate error; the truncation must be visible
      // in the per-provider trail rather than swallowed.
      assert.equal(e.category, AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED);
      const truncated = e.attempts.find((a) => a.provider === 'openrouter');
      assert.equal(truncated.error, AI_ERROR_CATEGORY.QUOTA_EXHAUSTED);
      assert.match(truncated.safeMessage, /truncated/i);
      return true;
    },
  );
});

await test('A truncated response falls through to the next provider', async () => {
  installTransport({
    openrouter: () => ({
      status: 200,
      data: {
        model: 'test/primary-model',
        choices: [{ message: { content: '{"value":"partial"}' }, finish_reason: 'length' }],
        usage: {},
      },
    }),
    local: () => openAIResponse('{"value":"complete"}', 'test-local-model'),
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 6000 });
  assert.equal(result.value, 'complete');
});

// ------------------------------- H. per-provider health classification
//
// The four reported facts (configured / reachable / authenticated / usable)
// are what an operator acts on, so each provider's failure mode has to land on
// the right one. Getting these wrong is how a zero-credit account reads as an
// auth problem, or how a valid key reads as a dead provider.

console.log('\nH. Per-provider health classification');

const providerNamed = (name) => createProviderChain(config.ai)
  .find((p) => p.name === name);

await test('Gemini 3.1 Flash-Lite is the configured model and is reported as configured', async () => {
  const gemini = providerNamed('gemini');
  assert.equal(gemini.getModel('default'), 'gemini-3.1-flash-lite-preview');
  assert.equal(gemini.isConfigured(), true);

  installTransport({ gemini: () => geminiResponse('pong') });
  const health = await gemini.runHealthCheck();
  assert.equal(health.model, 'gemini-3.1-flash-lite-preview');
  assert.equal(health.configured, true);
  assert.equal(health.reachable, true);
  assert.equal(health.authenticated, true);
  assert.equal(health.usable, true, 'a real 200 against the configured model is usable');
});

await test('Gemini 3.1 Flash-Lite is called on the real request path, not just the probe', async () => {
  installTransport({
    openrouter: () => { throw credit402(0); },
    gemini: () => geminiResponse('{"value":"from-gemini"}'),
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 4000 });
  assert.equal(result.value, 'from-gemini');
  assert.equal(result.__ai.provider, 'gemini');
  // Gemini names the model in the path rather than a body field, so the URL is
  // what proves the configured model is the one actually requested.
  const geminiCalls = calls.filter((c) => c.provider === 'gemini');
  assert.ok(geminiCalls.length >= 1, 'Gemini must actually be called');
  assert.ok(
    geminiCalls.every((c) => c.url.includes('models/gemini-3.1-flash-lite-preview:generateContent')),
    `every Gemini call must target the configured model, got ${geminiCalls[0].url}`,
  );
});

await test('Gemini upstream 503 is provider-unavailable, not an auth or quota failure', async () => {
  installTransport({
    gemini: () => { throw httpError(503, 'This model is currently experiencing high demand.'); },
  });
  const health = await providerNamed('gemini').runHealthCheck();
  assert.equal(health.configured, true, 'the key and model are present');
  assert.equal(health.authenticated, true, 'a 503 proves the host accepted our credentials');
  assert.equal(health.reachable, true);
  assert.equal(health.usable, false, 'capacity pressure must never read as usable');
  assert.equal(health.detail, 'PROVIDER_UNAVAILABLE');
});

await test('Gemini 503 falls through to the next provider', async () => {
  installTransport({
    openrouter: () => { throw credit402(500); },
    gemini: () => { throw httpError(503, 'high demand'); },
    local: () => openAIResponse('{"value":"from-local"}', 'test-local-model'),
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 4000 });
  assert.equal(result.value, 'from-local');
  assert.ok(countCalls('gemini') >= 1, 'Gemini must actually be attempted');
  assert.ok(countCalls('local') >= 1, 'the chain must reach the local fallback');
});

await test('A Gemini 503 is retried before falling through, and local is still reached', async () => {
  installTransport({
    openrouter: () => { throw credit402(500); },
    gemini: () => { throw httpError(503, 'high demand'); },
    local: () => openAIResponse('{"value":"ok"}', 'test-local-model'),
  });
  await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 4000 });
  assert.ok(
    countCalls('gemini') >= 2,
    `a retryable 5xx should be retried at least once, got ${countCalls('gemini')} call(s)`,
  );
});

await test('A zero-credit OpenRouter account is never classified as an auth failure', async () => {
  installTransport({ openrouter: () => { throw credit402(784); } });
  const health = await providerNamed('openrouter').runHealthCheck();
  assert.equal(health.authenticated, true, 'the key was accepted; only the balance is gone');
  assert.notEqual(health.detail, 'AUTHENTICATION');
  assert.match(health.detail, /QUOTA_EXHAUSTED/);
  assert.equal(health.usable, false);
});

await test('A genuinely rejected OpenRouter key is still an auth failure', async () => {
  // The inverse guard: the fix must not collapse every OpenRouter problem into
  // "out of credit", which would hide a rotated or revoked key.
  installTransport({ openrouter: () => { throw httpError(401, 'No auth credentials found'); } });
  const health = await providerNamed('openrouter').runHealthCheck();
  assert.equal(health.authenticated, false);
  assert.equal(health.detail, 'AUTHENTICATION');
});

await test('Local without a model is reported unconfigured, not unusable-at-runtime', async () => {
  const unconfigured = new LocalProvider({
    name: 'local',
    config: { enabled: true, baseUrl: 'http://127.0.0.1:11434/v1', model: null },
    defaultTimeoutMs: 5000,
    probeMaxTokens: 6000,
  });
  const health = await unconfigured.runHealthCheck();
  assert.equal(health.configured, false);
  assert.equal(health.usable, false);
  assert.equal(health.reachable, false);
  assert.match(health.detail, /no model configured/);
});

await test('A configured local provider whose server is down reports unreachable', async () => {
  installTransport({ local: () => { throw connectionError(); } });
  const health = await providerNamed('local').runHealthCheck();
  assert.equal(health.configured, true);
  assert.equal(health.reachable, false, 'a refused connection is not "reachable"');
  assert.equal(health.usable, false);
  assert.equal(health.detail, 'unreachable');
});

await test('A serving local provider reports usable', async () => {
  installTransport({ local: () => openAIResponse('pong', 'test-local-model') });
  const health = await providerNamed('local').runHealthCheck();
  assert.equal(health.configured, true);
  assert.equal(health.reachable, true);
  assert.equal(health.authenticated, true, 'keyless local servers still answer auth');
  assert.equal(health.usable, true);
});

await test('Local answers the chain when both remote providers are unusable', async () => {
  installTransport({
    openrouter: () => { throw credit402(500); },
    gemini: () => { throw httpError(503, 'high demand'); },
    local: () => openAIResponse('{"value":"local-only"}', 'test-local-model'),
  });
  const result = await aiService.generate({ prompt: 'p', schema: SIMPLE_SCHEMA, maxTokens: 4000 });
  assert.equal(result.value, 'local-only');
  assert.equal(result.__ai.provider, 'local');
  assert.ok(result.__ai.fallbackCount >= 2, 'both upstream providers must have failed first');
});

await test('The configured chain order is preserved, not reordered by health', async () => {
  // A provider being unusable must not silently promote another provider.
  installTransport({ openrouter: () => { throw credit402(500); } });
  const health = await aiService.getAIHealth();
  assert.deepEqual(health.chain, ['openrouter', 'gemini', 'local']);
  assert.equal(health.primary, 'openrouter');
  assert.equal(health.secondary, 'gemini');
  assert.equal(health.fallback, 'local');
});

await test('Health is unavailable, not healthy, when no provider can serve', async () => {
  installTransport({
    openrouter: () => { throw credit402(500); },
    gemini: () => { throw httpError(503, 'high demand'); },
    local: () => { throw connectionError(); },
  });
  const health = await aiService.getAIHealth({ force: true });
  assert.equal(health.status, 'unavailable', 'no provider served, so the chain is not healthy');
  assert.deepEqual(health.usableProviders, []);
  // This suite sets AI_PROBE_VERIFY_AUTH=false, so health reports usable:null
  // ("unverified") rather than a verdict. What must never happen is usable:true.
  for (const name of ['openrouter', 'gemini', 'local']) {
    assert.notEqual(
      health.providers[name].usable,
      true,
      `${name} must not report usable:true when nothing served`,
    );
  }
});

await test('A failed probe never marks a provider usable, whatever the failure', async () => {
  // Every failure mode the chain can hit, asserted against the one field an
  // operator would read before deciding the chain is fine.
  const failures = [
    ['openrouter', () => { throw credit402(500); }],
    ['openrouter', () => { throw httpError(401, 'No auth credentials found'); }],
    ['gemini', () => { throw httpError(503, 'high demand'); }],
    ['gemini', () => { throw timeoutError(); }],
    ['local', () => { throw connectionError(); }],
  ];
  for (const [provider, handler] of failures) {
    installTransport({ [provider]: handler });
    const health = await providerNamed(provider).runHealthCheck();
    assert.equal(
      health.usable,
      false,
      `${provider} reported usable after a failure (${health.detail})`,
    );
  }
});

// ------------------------------------------------------------------ summary

console.log(`\n${'='.repeat(52)}`);
console.log(`AI provider chain: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`\n  ${f.name}`);
    console.log(`  ${f.error.stack?.split('\n').slice(0, 4).join('\n  ')}`);
  }
}
console.log(`${'='.repeat(52)}`);
process.exit(failed > 0 ? 1 : 0);
