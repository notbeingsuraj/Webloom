/**
 * Database Client — Phase 1: SQLite with Drizzle ORM
 * 
 * Initializes SQLite database and creates tables if they don't exist.
 * This is a client-only module; no business logic is integrated yet.
 * 
 * Usage:
 *   import { db } from '../db/client.js';
 *   // db is ready for schema operations
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { 
  BusinessEntity, 
  ProviderIdentity, 
  ResolutionRecord,
  Source,
  Evidence,
  Claim,
  ClaimSource,
  ClaimEvidence,
  Conflict,
  CanonicalField,
  Observation,
  CanonicalizationDecision
} from './schema.js';

// =============================================================================
// Configuration
// =============================================================================

// Default SQLite database path (relative to working directory)
const DATABASE_PATH = process.env.SQLITE_DATABASE_PATH || './webloom.db';

// =============================================================================
// Database Initialization
// =============================================================================

let database = null;
let drizzleDb = null;

/**
 * Initialize SQLite database and run schema migration
 * Creates tables if they don't exist; preserves data if they do.
 * 
 * @param {string} dbPath - path to SQLite database file
 * @returns {Promise<Object>} drizzle instance ready for queries
 */
export async function initializeDatabase(dbPath = DATABASE_PATH) {
  if (drizzleDb) {
    return drizzleDb;
  }

  try {
    // Create SQLite connection
    database = new Database(dbPath);
    
    // Enable WAL mode for better concurrency (optional but recommended)
    database.pragma('journal_mode = WAL');
    
    // Create drizzle instance
    drizzleDb = drizzle(database, {
      schema: {
        BusinessEntity,
        ProviderIdentity,
        ResolutionRecord,
      },
    });

    // Create tables if they don't exist
    // This is a manual migration; for production, use Drizzle Kit migrations
    createTables(database);

    console.log(`[DB] SQLite database initialized: ${dbPath}`);
    return drizzleDb;
  } catch (error) {
    console.error(`[DB] Failed to initialize database: ${error.message}`);
    throw error;
  }
}

/**
 * Create tables using raw SQL (schema-first approach)
 * Only creates tables; does not modify existing data.
 */
function createTables(db) {
  // BusinessEntity table
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_entity (
      entity_id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      canonical_phone TEXT,
      canonical_website TEXT,
      canonical_address TEXT NOT NULL,
      canonical_latitude REAL,
      canonical_longitude REAL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ProviderIdentity table
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_identity (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_record_id TEXT NOT NULL,
      first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolution_method TEXT NOT NULL,
      resolution_confidence REAL,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE
    )
  `);

  // Indexes for ProviderIdentity
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_identity_provider_record 
    ON provider_identity(provider, provider_record_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_provider_identity_entity 
    ON provider_identity(entity_id)
  `);

  // ResolutionRecord table
  db.exec(`
    CREATE TABLE IF NOT EXISTS resolution_record (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      match_score REAL NOT NULL,
      match_type TEXT NOT NULL,
      provider_a TEXT NOT NULL,
      provider_record_id_a TEXT,
      provider_b TEXT NOT NULL,
      provider_record_id_b TEXT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending_review',
      confidence REAL,
      notes TEXT,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE
    )
  `);

  // Indexes for ResolutionRecord
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resolution_record_entity 
    ON resolution_record(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resolution_record_timestamp 
    ON resolution_record(timestamp)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_resolution_record_match_type 
    ON resolution_record(match_type)
  `);

  // Index for BusinessEntity
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_business_entity_status 
    ON business_entity(status)
  `);

  // Phase 4: Source table
  db.exec(`
    CREATE TABLE IF NOT EXISTS source (
      id TEXT PRIMARY KEY,
      url TEXT,
      domain TEXT,
      provider TEXT,
      source_type TEXT NOT NULL DEFAULT 'other',
      authority REAL NOT NULL DEFAULT 0.5,
      is_primary INTEGER NOT NULL DEFAULT 0,
      retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT,
      updated_at TEXT,
      metadata TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_source_domain ON source(domain)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_source_provider ON source(provider)
  `);

  // Phase 4: Evidence table
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      value TEXT NOT NULL,
      excerpt TEXT,
      location TEXT,
      extracted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      extraction_method TEXT NOT NULL DEFAULT 'unknown',
      metadata TEXT,
      FOREIGN KEY (source_id) REFERENCES source(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_evidence_field ON evidence(field_path)
  `);

  // Phase 4: Claim table
  db.exec(`
    CREATE TABLE IF NOT EXISTS claim (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT,
      claim_type TEXT NOT NULL DEFAULT 'fact',
      confidence REAL NOT NULL DEFAULT 0.5,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      temporal_retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      temporal_published_at TEXT,
      temporal_observed_at TEXT,
      temporal_last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_entity ON claim(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_field ON claim(field_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_entity_field ON claim(entity_id, field_path)
  `);

  // Phase 4: ClaimSource table
  db.exec(`
    CREATE TABLE IF NOT EXISTS claim_source (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      is_primary INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (claim_id) REFERENCES claim(id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES source(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_source_claim ON claim_source(claim_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_source_source ON claim_source(source_id)
  `);

  // Phase 4: ClaimEvidence table
  db.exec(`
    CREATE TABLE IF NOT EXISTS claim_evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES claim(id) ON DELETE CASCADE,
      FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_claim_evidence_evidence ON claim_evidence(evidence_id)
  `);

  // Phase 4: Conflict table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conflict (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      "values" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'conflicted',
      resolution_strategy TEXT,
      resolution_reason TEXT,
      resolved_at TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conflict_entity ON conflict(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conflict_field ON conflict(field_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conflict_status ON conflict(status)
  `);

  // Phase 4: CanonicalField table
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_field (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      value TEXT NOT NULL,
      provenance TEXT NOT NULL,
      confidence REAL NOT NULL,
      source_id TEXT,
      claim_id TEXT,
      resolved_at TEXT,
      superseded_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES source(id) ON DELETE SET NULL,
      FOREIGN KEY (claim_id) REFERENCES claim(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canonical_field_entity ON canonical_field(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canonical_field_field ON canonical_field(field_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canonical_field_entity_field ON canonical_field(entity_id, field_path)
  `);

  // Phase 4: Observation table
  db.exec(`
    CREATE TABLE IF NOT EXISTS observation (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_record_id TEXT,
      field_path TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT,
      provenance TEXT NOT NULL,
      confidence REAL NOT NULL,
      source_id TEXT,
      claim_id TEXT,
      observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES source(id) ON DELETE SET NULL,
      FOREIGN KEY (claim_id) REFERENCES claim(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_observation_entity ON observation(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_observation_provider ON observation(provider)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_observation_field ON observation(field_path)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_observation_entity_field ON observation(entity_id, field_path)
  `);

  // Phase 4: CanonicalizationDecision table
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonicalization_decision (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      chosen_value TEXT,
      rejected_value TEXT,
      reason TEXT,
      strategy TEXT,
      confidence REAL,
      conflict_id TEXT,
      claim_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE,
      FOREIGN KEY (conflict_id) REFERENCES conflict(id) ON DELETE SET NULL,
      FOREIGN KEY (claim_id) REFERENCES claim(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canonicalization_entity ON canonicalization_decision(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_canonicalization_field ON canonicalization_decision(field_path)
  `);

  // Index for BusinessEntity
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_business_entity_status
    ON business_entity(status)
  `);

  // Phase 15: ReviewItem table (human-review queue for ambiguous resolutions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_item (
      id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      related_entity_id TEXT,
      provider TEXT,
      provider_record_id TEXT,
      related_provider TEXT,
      related_provider_record_id TEXT,
      match_type TEXT NOT NULL,
      match_score REAL,
      reason TEXT,
      evidence TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_note TEXT,
      FOREIGN KEY (entity_id) REFERENCES business_entity(entity_id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_item_dedupe
    ON review_item(dedupe_key)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_item_entity ON review_item(entity_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_item_status ON review_item(status)
  `);

  // Lead table (persistent store for the in-memory lead cache in routes/leads.js).
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lead_created_at ON lead(created_at)
  `);
}

/**
 * Get the drizzle database instance
 * Must call initializeDatabase() first.
 * 
 * @returns {Object} drizzle instance
 * @throws {Error} if database not initialized
 */
export function getDb() {
  if (!drizzleDb) {
    throw new Error('[DB] Database not initialized. Call initializeDatabase() first.');
  }
  return drizzleDb;
}

/**
 * Get the raw SQLite connection
 * Useful for raw queries or advanced operations.
 * 
 * @returns {Object} better-sqlite3 database instance
 * @throws {Error} if database not initialized
 */
export function getRawDb() {
  if (!database) {
    throw new Error('[DB] Database not initialized. Call initializeDatabase() first.');
  }
  return database;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (database) {
    database.close();
    database = null;
    drizzleDb = null;
    console.log('[DB] Database connection closed');
  }
}

// =============================================================================
// Default export
// =============================================================================
export default {
  initializeDatabase,
  getDb,
  getRawDb,
  closeDatabase,
};
