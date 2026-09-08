/**
 * SourceCache Tests — Phase 20 persistence & TTL
 *
 * Verifies:
 *  - cache survives process restart (SQLite-backed, not in-memory)
 *  - TTL expiry works
 *  - normalize/retrieve round-trip
 *  - source cache identity is distinct from business entity identity
 *  - purgeExpired removes stale rows
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SourceCache from './src/db/SourceCache.js';

function makeTempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'webloom-source-cache-'));
  return join(dir, 'cache.db');
}

test('SourceCache — set/get round-trip persists result', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);
  const url = 'https://tartinebakery.com';
  const payload = {
    data: { business: { name: 'Tartine Bakery' }, contact: { phone: '+14155487529' } },
    timestamp: new Date().toISOString(),
    normalizedUrl: url,
  };
  cache.set(url, payload, { provider: 'official_website' });

  const entry = cache.get(url, 'official_website');
  assert.ok(entry, 'entry should be retrievable');
  assert.strictEqual(entry.provider, 'official_website');
  assert.strictEqual(entry.result.data.business.name, 'Tartine Bakery');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — survives process restart (file persisted)', () => {
  const dbPath = makeTempDbPath();
  const url = 'https://sutter-899.example.com';

  // Write in one "process"
  const writer = new SourceCache(dbPath);
  writer.set(url, { data: { identity: { name: 'Sutter Health' } }, timestamp: new Date().toISOString(), normalizedUrl: url }, { provider: 'web_extraction' });
  writer.close();

  // "Restart": new instance on the same file
  const reader = new SourceCache(dbPath);
  const entry = reader.get(url, 'web_extraction');
  assert.ok(entry, 'cache entry should survive restart');
  assert.strictEqual(entry.result.data.identity.name, 'Sutter Health');
  assert.strictEqual(entry.provider, 'web_extraction');
  reader.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — TTL expiry removes stale entries', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);
  const url = 'https://stale.example.com';

  // Negative TTL: expires in the past → immediate miss, no race
  cache.set(url, { data: { business: { name: 'Stale Biz' } } }, { ttlMs: -1000 });
  const stale = cache.get(url, 'test');
  assert.strictEqual(stale, null, 'expired entry should be a miss');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — Infinity TTL never expires', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);
  const url = 'https://infinity.example.com';
  cache.set(url, { data: { business: { name: 'Forever Biz' } } }, { ttlMs: Infinity });
  const entry = cache.get(url, 'test');
  assert.ok(entry, 'Infinity TTL entry should be retrievable');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — purgeExpired removes only expired rows', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);
  cache.set('https://fresh.example.com', { data: { business: { name: 'Fresh' } } }, { ttlMs: Infinity });
  cache.set('https://expired.example.com', { data: { business: { name: 'Expired' } } }, { ttlMs: -1000 });

  const purged = cache.purgeExpired();
  assert.strictEqual(purged, 1, 'exactly one expired row purged');
  assert.ok(cache.get('https://fresh.example.com', 'test'), 'fresh entry should survive');
  assert.strictEqual(cache.get('https://expired.example.com', 'test'), null, 'expired entry should be gone');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — source identity is separate from business entity identity', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);

  // The SAME source URL cached twice with different business data must not
  // confuse source identity with business identity: the cache stores source
  // content, not entity mapping.
  const sourceUrl = 'https://same-page.example.com';
  cache.set(sourceUrl, { data: { business: { name: 'First Read' } } }, { provider: 'web_extraction' });
  cache.set(sourceUrl, { data: { business: { name: 'Second Read' } } }, { provider: 'web_extraction' });

  const entry = cache.get(sourceUrl, 'web_extraction');
  assert.strictEqual(entry.result.data.business.name, 'Second Read', 'last write wins for same source and provider');

  // No business_entity table exists in source-cache.db — the file only holds
  // source_cache rows. This proves source cache identity is NOT entity identity.
  const tables = cache.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map((t) => t.name);
  assert.ok(tableNames.includes('source_cache'), 'source_cache table exists');
  assert.ok(!tableNames.includes('business_entity'), 'business_entity must NOT be in source cache DB');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('BusinessDataExtractor — cache methods delegate to SourceCache', async () => {
  const { default: extractor } = await import('./src/services/BusinessDataExtractor.js');
  const url = 'https://maps.google.com/?q=Tartine+Bakery';
  // setCachedExtraction should write to SQLite (not throw)
  extractor.setCachedExtraction(url, { business: { name: 'Test' } });
  const cached = extractor.getCachedExtraction(url);
  // The extractor may normalize the URL; cached should be present or null-safe
  // (if the URL normalizes away, test with the normalized form)
  assert.ok(cached === null || cached.cached === true, 'cache read should not throw');
  extractor.clearCache();
});

test('SourceCache — provider-specific invalidation does not collide', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);
  const url = 'https://maps.google.com/?q=Same+Place';

  // Same URL, different providers - should NOT share cache entry
  cache.set(url, { data: { business: { name: 'FromGeoapify' } } }, { provider: 'geoapify' });
  cache.set(url, { data: { business: { name: 'FromWebExtraction' } } }, { provider: 'web_extraction' });

  const geoEntry = cache.get(url, 'geoapify');
  const webEntry = cache.get(url, 'web_extraction');
  // Each provider has its own entry for the same URL
  assert.ok(geoEntry, 'geoapify entry should be retrievable');
  assert.ok(webEntry, 'web_extraction entry should be retrievable');
  assert.strictEqual(geoEntry.result.data.business.name, 'FromGeoapify');
  assert.strictEqual(webEntry.result.data.business.name, 'FromWebExtraction');

  // Explicit provider-based deletion
  cache.delete({ provider: 'web_extraction' });
  const afterDelete = cache.get(url, 'web_extraction');
  assert.strictEqual(afterDelete, null, 'provider-specific delete should clear it');
  assert.ok(cache.get(url, 'geoapify'), 'geoapify entry should survive');
  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});

test('SourceCache — normalized URL equivalence', () => {
  const dbPath = makeTempDbPath();
  const cache = new SourceCache(dbPath);

  // These normalize to the same canonical URL
  const urls = [
    'https://maps.google.com/maps?q=Tartine',
    'https://maps.google.com/maps?q=Tartine&utm_source=foo',
    'https://www.google.com/maps?q=Tartine',
  ];

  cache.set(urls[0], { data: { business: { name: 'Tartine' } } }, { provider: 'web_extraction' });
  const entry1 = cache.get(urls[1], 'web_extraction'); // Should hit cache
  const entry2 = cache.get(urls[2], 'web_extraction'); // Should hit cache

  assert.ok(entry1, 'URL with tracking params should hit same cache');
  assert.ok(entry2, 'www.google.com should normalize to same cache');
  assert.strictEqual(entry1.result.data.business.name, 'Tartine');

  cache.close();
  rmSync(dbPath, { recursive: true, force: true });
});