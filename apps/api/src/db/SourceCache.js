/**
 * SourceCache — PHASE 20 persistent source-extraction cache (SQLite)
 *
 * Replaces the in-memory `extractionCache` Map in BusinessDataExtractor.
 *
 * WHY SQLite: Webloom already depends on SQLite (better-sqlite3 via drizzle).
 * No Redis. The cache must:
 *   - survive process restart
 *   - prevent duplicate acquisition (same normalized URL)
 *   - support TTL (cache entries expire)
 *   - distinguish SOURCE cache identity from PROVIDER record identity and
 *     BUSINESS ENTITY identity — three separate concepts (#17)
 *
 * Cache entry concepts:
 *   source_url      — the normalized source URL (canonical identity of the source)
 *   source_hash     — sha256 of normalized URL (fast key)
 *   content_hash    — sha256 of serialized result (detects content changes)
 *   retrieved_at    — when the value was retrieved
 *   expires_at      — TTL expiry (ISO string; NULL = never expires)
 *   provider        — which provider produced the entry
 *   result          — JSON serialization of the acquisition result
 *
 * INVARIANT: this is a provider-acquisition cache. Its identity is
 * (provider, normalized source URL), not URL alone. A Geoapify acquisition and
 * a web-extraction acquisition for the same URL must never overwrite each
 * other.
 *
 * This table is NOT linked to business_entity. Never confuse a cached source
 * with a business identity.
 */

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

const DEFAULT_DB_PATH = process.env.SQLITE_SOURCE_CACHE_PATH || './source-cache.db';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h default

export class SourceCache {
  /**
   * @param {string} [dbPath] SQLite file path
   */
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._ensureSchema();
  }

  _ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_cache (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        source_hash   TEXT NOT NULL,
        provider      TEXT NOT NULL,
        source_url    TEXT NOT NULL,
        content_hash  TEXT,
        retrieved_at  TEXT NOT NULL,
        expires_at    TEXT,
        result        TEXT NOT NULL,
        UNIQUE(source_hash, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_source_cache_source_url ON source_cache(source_url);
      CREATE INDEX IF NOT EXISTS idx_source_cache_provider ON source_cache(provider);
      CREATE INDEX IF NOT EXISTS idx_source_cache_expires ON source_cache(expires_at);
    `);
  }

  /** Normalize a source URL to its canonical cache key. */
  static hashSourceUrl(normalizedUrl) {
    return createHash('sha256').update(normalizedUrl).digest('hex');
  }

  /**
   * Read a cache entry by normalized URL and provider.
   * @param {string} normalizedUrl
   * @param {string} provider - required; distinguishes provider acquisitions for same URL
   * @param {number} [ttlMs] optional TTL override (defaults to DEFAULT_TTL_MS)
   * @returns {Object|null} { result, sourceUrl, retrievedAt, provider, contentHash, expired }
   */
  get(normalizedUrl, provider, ttlMs = DEFAULT_TTL_MS) {
    if (!normalizedUrl || !provider) return null;
    const hash = SourceCache.hashSourceUrl(normalizedUrl);
    const row = this.db
      .prepare('SELECT * FROM source_cache WHERE source_hash = ? AND provider = ?')
      .get(hash, provider);
    if (!row) return null;

    const expired = row.expires_at != null && new Date(row.expires_at).getTime() < Date.now();
    if (expired) {
      this.db.prepare('DELETE FROM source_cache WHERE source_hash = ? AND provider = ?').run(hash, provider);
      return null;
    }

    let result = null;
    try {
      result = JSON.parse(row.result);
    } catch {
      return null;
    }

    return {
      result,
      sourceUrl: row.source_url,
      retrievedAt: row.retrieved_at,
      provider: row.provider,
      contentHash: row.content_hash,
    };
  }

  /**
   * Write a cache entry.
   * @param {string} normalizedUrl
   * @param {Object} result - acquisition result object (JSON-serializable)
   * @param {Object} [opts]
   * @param {string} [opts.provider]
   * @param {number} [opts.ttlMs] TTL in ms (defaults to DEFAULT_TTL_MS; pass Infinity for no expiry)
   * @param {string} [opts.contentHash] sha256 of serialized result (computed if omitted)
   */
  set(normalizedUrl, result, { provider = null, ttlMs = DEFAULT_TTL_MS, contentHash = null } = {}) {
    if (!normalizedUrl || !provider) return;
    const hash = SourceCache.hashSourceUrl(normalizedUrl);
    const now = new Date().toISOString();
    const expiresAt =
      ttlMs === Infinity ? null : new Date(Date.now() + ttlMs).toISOString();
    const serialized = JSON.stringify(result);
    const digest = contentHash || createHash('sha256').update(serialized).digest('hex');

    this.db
      .prepare(
        `INSERT INTO source_cache (source_hash, source_url, content_hash, provider, retrieved_at, expires_at, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_hash) DO UPDATE SET
           source_url = excluded.source_url,
           content_hash = excluded.content_hash,
           provider = excluded.provider,
           retrieved_at = excluded.retrieved_at,
           expires_at = excluded.expires_at,
           result = excluded.result`
      )
      .run(hash, normalizedUrl, digest, provider, now, expiresAt, serialized);
  }

  /**
   * Delete an entry (or all entries for a provider).
   * @param {Object} [opts] { sourceUrl?, provider? }
   */
  delete({ sourceUrl = null, provider = null } = {}) {
    if (sourceUrl) {
      const hash = SourceCache.hashSourceUrl(sourceUrl);
      return this.db.prepare('DELETE FROM source_cache WHERE source_hash = ?').run(hash);
    }
    if (provider) {
      return this.db.prepare('DELETE FROM source_cache WHERE provider = ?').run(provider);
    }
    return this.db.prepare('DELETE FROM source_cache').run();
  }

  /**
   * Purge all expired entries.
   * @returns {number} number of purged rows
   */
  purgeExpired() {
    const now = new Date().toISOString();
    const info = this.db
      .prepare('DELETE FROM source_cache WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(now);
    return info.changes;
  }

  /** @returns {Object} cache stats */
  stats() {
    const total = this.db.prepare('SELECT COUNT(*) AS count FROM source_cache').get().count;
    const rows = this.db
      .prepare('SELECT source_url, provider, retrieved_at, expires_at FROM source_cache ORDER BY id DESC LIMIT 50')
      .all();
    return {
      total,
      entries: rows.map((r) => ({
        sourceUrl: r.source_url,
        provider: r.provider,
        retrievedAt: r.retrieved_at,
        expiresAt: r.expires_at,
      })),
    };
  }

  close() {
    this.db.close();
  }
}

let _defaultInstance = null;

/**
 * Lazily-initialized default SourceCache singleton.
 * Uses SQLITE_SOURCE_CACHE_PATH env var or './source-cache.db'.
 */
export function getSourceCache() {
  if (!_defaultInstance) {
    _defaultInstance = new SourceCache();
  }
  return _defaultInstance;
}

export default SourceCache;