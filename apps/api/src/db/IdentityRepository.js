/**
 * IdentityRepository — Phase 2: Persistent Business Identity
 * 
 * Provides CRUD and lookup operations for:
 * - BusinessEntity (canonical business identity)
 * - ProviderIdentity (provider → entity mapping)
 * - ResolutionRecord (entity resolution history)
 * 
 * Sits between application/business logic and Drizzle/SQLite.
 * Does NOT contain business logic — pure persistence operations.
 */

import { randomUUID } from 'node:crypto';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { looksLikeStreetAddress } from '../utils/streetAddressDetector.js';
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
  CanonicalizationDecision,
  ReviewItem
} from './schema.js';

// =============================================================================
// Custom Error Types
// =============================================================================

export class NotFoundError extends Error {
  constructor(message = 'Entity not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class DuplicateError extends Error {
  constructor(message = 'Record already exists') {
    super(message);
    this.name = 'DuplicateError';
  }
}

export class ValidationError extends Error {
  constructor(message = 'Invalid input') {
    super(message);
    this.name = 'ValidationError';
  }
}

// =============================================================================
// IdentityRepository
// =============================================================================

export class IdentityRepository {
  /**
   * Create a new IdentityRepository instance.
   * 
   * @param {Object} dbInstance - Drizzle database instance (from getDb())
   */
  constructor(dbInstance) {
    if (!dbInstance) {
      throw new ValidationError('Database instance is required');
    }
    this.db = dbInstance;
  }

  // =========================================================================
  // BusinessEntity Operations
  // =========================================================================

  /**
   * Create a new BusinessEntity with a generated durable ID.
   * 
   * @param {Object} data - { canonicalName, canonicalAddress, canonicalPhone?, canonicalWebsite?, canonicalLatitude?, canonicalLongitude?, category?, status? }
   * @returns {Object} created entity
   * @throws {ValidationError} if required fields are missing
   */
  createEntity(data) {
    if (!data?.canonicalName || typeof data.canonicalName !== 'string') {
      throw new ValidationError('canonicalName is required and must be a string');
    }
    if (!data?.canonicalAddress || typeof data.canonicalAddress !== 'string') {
      throw new ValidationError('canonicalAddress is required and must be a string');
    }

    const entityId = `ent_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      entityId,
      canonicalName: data.canonicalName,
      canonicalPhone: data.canonicalPhone || null,
      canonicalWebsite: data.canonicalWebsite || null,
      canonicalAddress: data.canonicalAddress,
      canonicalLatitude: data.canonicalLatitude ?? null,
      canonicalLongitude: data.canonicalLongitude ?? null,
      category: data.category || null,
      status: data.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(BusinessEntity).values(row).run();
    return this._mapEntityRow(row);
  }

  /**
   * Atomically create an entity and its first provider identity.
   *
   * The provider identity UNIQUE constraint remains authoritative. Any
   * insertion failure rolls back both rows.
   */
  createEntityWithProviderIdentity(entityData, providerData) {
    if (!entityData?.canonicalName || typeof entityData.canonicalName !== 'string') {
      throw new ValidationError('canonicalName is required and must be a string');
    }
    if (!entityData?.canonicalAddress || typeof entityData.canonicalAddress !== 'string') {
      throw new ValidationError('canonicalAddress is required and must be a string');
    }
    if (!providerData?.provider || typeof providerData.provider !== 'string') {
      throw new ValidationError('provider is required and must be a string');
    }
    if (!providerData?.providerRecordId || typeof providerData.providerRecordId !== 'string') {
      throw new ValidationError('providerRecordId is required and must be a string');
    }

    const entityId = `ent_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const providerIdentityId = `pid_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const entityRow = {
      entityId,
      canonicalName: entityData.canonicalName,
      canonicalPhone: entityData.canonicalPhone || null,
      canonicalWebsite: entityData.canonicalWebsite || null,
      canonicalAddress: entityData.canonicalAddress,
      canonicalLatitude: entityData.canonicalLatitude ?? null,
      canonicalLongitude: entityData.canonicalLongitude ?? null,
      category: entityData.category || null,
      status: entityData.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    const providerRow = {
      id: providerIdentityId,
      entityId,
      provider: providerData.provider,
      providerRecordId: providerData.providerRecordId,
      firstSeen: now,
      lastSeen: now,
      resolutionMethod: providerData.resolutionMethod || 'first_observation',
      resolutionConfidence: providerData.resolutionConfidence ?? null,
    };

    try {
      this.db.transaction((tx) => {
        tx.insert(BusinessEntity).values(entityRow).run();
        tx.insert(ProviderIdentity).values(providerRow).run();
      });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new DuplicateError(
          `Provider identity (${providerData.provider}, ${providerData.providerRecordId}) already exists`
        );
      }
      throw err;
    }

    return {
      entity: this._mapEntityRow(entityRow),
      providerIdentity: this._mapProviderRow(providerRow),
    };
  }

  /**
   * Get a BusinessEntity by its primary key.
   * 
   * @param {string} entityId
   * @returns {Object|null} entity or null if not found
   */
  getEntityById(entityId) {
    if (!entityId || typeof entityId !== 'string') return null;

    const rows = this.db
      .select()
      .from(BusinessEntity)
      .where(eq(BusinessEntity.entityId, entityId))
      .all();
    return rows.length > 0 ? this._mapEntityRow(rows[0]) : null;
  }

  /**
   * Remove a newly-created entity that failed to acquire its provider mapping.
   * Used for duplicate-insertion recovery; dependent rows cascade by schema.
   */
  deleteEntity(entityId) {
    if (!entityId || typeof entityId !== 'string') return false;
    const result = this.db
      .delete(BusinessEntity)
      .where(eq(BusinessEntity.entityId, entityId))
      .run();
    return result.changes > 0;
  }

  /**
   * Update fields on a BusinessEntity.
   * Only supplied fields are updated; unspecified fields are preserved.
   * 
   * @param {string} entityId
   * @param {Object} patch - partial entity data (same shape as createEntity input)
   * @returns {Object} updated entity
   * @throws {NotFoundError} if entity does not exist
   */
  updateEntity(entityId, patch) {
    const existing = this.getEntityById(entityId);
    if (!existing) {
      throw new NotFoundError(`Entity ${entityId} not found`);
    }

    const updates = {};
    if (patch.canonicalName !== undefined) updates.canonicalName = patch.canonicalName;
    if (patch.canonicalPhone !== undefined) updates.canonicalPhone = patch.canonicalPhone || null;
    if (patch.canonicalWebsite !== undefined) updates.canonicalWebsite = patch.canonicalWebsite || null;
    if (patch.canonicalAddress !== undefined) updates.canonicalAddress = patch.canonicalAddress;
    if (patch.canonicalLatitude !== undefined) updates.canonicalLatitude = patch.canonicalLatitude ?? null;
    if (patch.canonicalLongitude !== undefined) updates.canonicalLongitude = patch.canonicalLongitude ?? null;
    if (patch.category !== undefined) updates.category = patch.category || null;
    if (patch.status !== undefined) updates.status = patch.status;

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    updates.updatedAt = new Date().toISOString();

    this.db
      .update(BusinessEntity)
      .set(updates)
      .where(eq(BusinessEntity.entityId, entityId))
      .run();

    return this.getEntityById(entityId);
  }

  // =========================================================================
  // ProviderIdentity Operations
  // =========================================================================

  /**
   * Find a ProviderIdentity by (provider, providerRecordId).
   * Returns the mapped entity ID if found, null otherwise.
   * 
   * @param {string} provider - provider name (e.g., 'geoapify')
   * @param {string} providerRecordId - provider-specific record ID
   * @returns {Object|null} { entityId, id, firstSeen, lastSeen, ... } or null
   */
  findProviderIdentity(provider, providerRecordId) {
    if (!provider || typeof provider !== 'string') return null;
    if (!providerRecordId || typeof providerRecordId !== 'string') return null;

    const rows = this.db
      .select()
      .from(ProviderIdentity)
      .where(
        and(
          eq(ProviderIdentity.provider, provider),
          eq(ProviderIdentity.providerRecordId, providerRecordId)
        )
      )
      .all();

    return rows.length > 0 ? this._mapProviderRow(rows[0]) : null;
  }

  /**
   * Create a new ProviderIdentity mapping.
   * 
   * @param {Object} data - { provider, providerRecordId, entityId, resolutionMethod, resolutionConfidence? }
   * @returns {Object} created mapping
   * @throws {ValidationError} if required fields are missing
   * @throws {DuplicateError} if (provider, providerRecordId) already exists
   */
  createProviderIdentity(data) {
    if (!data?.provider || typeof data.provider !== 'string') {
      throw new ValidationError('provider is required and must be a string');
    }
    if (!data?.providerRecordId || typeof data.providerRecordId !== 'string') {
      throw new ValidationError('providerRecordId is required and must be a string');
    }
    if (!data?.entityId || typeof data.entityId !== 'string') {
      throw new ValidationError('entityId is required and must be a string');
    }
    if (!data?.resolutionMethod || typeof data.resolutionMethod !== 'string') {
      throw new ValidationError('resolutionMethod is required and must be a string');
    }

    // Verify entity exists (foreign key integrity)
    const entity = this.getEntityById(data.entityId);
    if (!entity) {
      throw new NotFoundError(`Entity ${data.entityId} not found`);
    }

    const id = `pid_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      entityId: data.entityId,
      provider: data.provider,
      providerRecordId: data.providerRecordId,
      firstSeen: now,
      lastSeen: now,
      resolutionMethod: data.resolutionMethod,
      resolutionConfidence: data.resolutionConfidence ?? null,
    };

    try {
      this.db.insert(ProviderIdentity).values(row).run();
    } catch (err) {
      // SQLite UNIQUE constraint violation
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new DuplicateError(
          `Provider identity (${data.provider}, ${data.providerRecordId}) already exists`
        );
      }
      throw err;
    }

    return this._mapProviderRow(row);
  }

  /**
   * Update lastSeen (and optionally metadata) for an existing provider identity.
   * Preserves firstSeen.
   * 
   * @param {string} provider
   * @param {string} providerRecordId
   * @param {Object} options - { resolutionMethod?, resolutionConfidence? }
   * @returns {Object|null} updated mapping or null if not found
   */
  touchProviderIdentity(provider, providerRecordId, options = {}) {
    const existing = this.findProviderIdentity(provider, providerRecordId);
    if (!existing) return null;

    const updates = {
      lastSeen: new Date().toISOString(),
    };
    if (options.resolutionMethod !== undefined) {
      updates.resolutionMethod = options.resolutionMethod;
    }
    if (options.resolutionConfidence !== undefined) {
      updates.resolutionConfidence = options.resolutionConfidence;
    }

    this.db
      .update(ProviderIdentity)
      .set(updates)
      .where(
        and(
          eq(ProviderIdentity.provider, provider),
          eq(ProviderIdentity.providerRecordId, providerRecordId)
        )
      )
      .run();

    return this.findProviderIdentity(provider, providerRecordId);
  }

  // =========================================================================
  // ResolutionRecord Operations
  // =========================================================================

  /**
   * Create a new ResolutionRecord.
   * 
   * @param {Object} data - { entityId, matchScore, matchType, providerA, providerB, providerRecordIdA?, providerRecordIdB?, confidence?, status?, notes? }
   * @returns {Object} created record
   * @throws {ValidationError} if required fields are missing
   */
  createResolutionRecord(data) {
    if (!data?.entityId || typeof data.entityId !== 'string') {
      throw new ValidationError('entityId is required and must be a string');
    }
    if (typeof data?.matchScore !== 'number') {
      throw new ValidationError('matchScore is required and must be a number');
    }
    if (!data?.matchType || typeof data.matchType !== 'string') {
      throw new ValidationError('matchType is required and must be a string');
    }
    if (!data?.providerA || typeof data.providerA !== 'string') {
      throw new ValidationError('providerA is required and must be a string');
    }
    if (!data?.providerB || typeof data.providerB !== 'string') {
      throw new ValidationError('providerB is required and must be a string');
    }

    // Verify entity exists
    const entity = this.getEntityById(data.entityId);
    if (!entity) {
      throw new NotFoundError(`Entity ${data.entityId} not found`);
    }

    const id = `res_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      entityId: data.entityId,
      matchScore: data.matchScore,
      matchType: data.matchType,
      providerA: data.providerA,
      providerRecordIdA: data.providerRecordIdA || null,
      providerB: data.providerB,
      providerRecordIdB: data.providerRecordIdB || null,
      timestamp: now,
      status: data.status || 'pending_review',
      confidence: data.confidence ?? null,
      notes: data.notes || null,
    };

    this.db.insert(ResolutionRecord).values(row).run();
    return this._mapResolutionRow(row);
  }

  /**
   * Get resolution history for an entity, newest first.
   * 
   * @param {string} entityId
   * @returns {Object[]} resolution records (newest first)
   */
  getResolutionHistory(entityId) {
    if (!entityId || typeof entityId !== 'string') return [];

    // Order newest-first. Use SQLite's implicit rowid (monotonically increasing
    // per insert) as a deterministic tiebreaker when two records share the same
    // millisecond-precision timestamp (e.g., same-millisecond inserts).
    const rows = this.db
      .select()
      .from(ResolutionRecord)
      .where(eq(ResolutionRecord.entityId, entityId))
      .orderBy(desc(ResolutionRecord.timestamp), sql`rowid desc`)
      .all();

    return rows.map(this._mapResolutionRow);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  _mapEntityRow(row) {
    return {
      entityId: row.entityId,
      canonicalName: row.canonicalName,
      canonicalPhone: row.canonicalPhone,
      canonicalWebsite: row.canonicalWebsite,
      canonicalAddress: row.canonicalAddress,
      canonicalLatitude: row.canonicalLatitude,
      canonicalLongitude: row.canonicalLongitude,
      category: row.category,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  _mapProviderRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      provider: row.provider,
      providerRecordId: row.providerRecordId,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      resolutionMethod: row.resolutionMethod,
      resolutionConfidence: row.resolutionConfidence,
    };
  }

  _mapResolutionRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      matchScore: row.matchScore,
      matchType: row.matchType,
      providerA: row.providerA,
      providerRecordIdA: row.providerRecordIdA,
      providerB: row.providerB,
      providerRecordIdB: row.providerRecordIdB,
      timestamp: row.timestamp,
      status: row.status,
      confidence: row.confidence,
      notes: row.notes,
    };
  }

  // =========================================================================
  // Phase 4: Canonical Business Intelligence Operations
  // =========================================================================

  /**
   * Create or update a canonical field for an entity
   * @param {Object} data - { entityId, fieldPath, value, provenance, confidence, sourceId?, claimId? }
   * @returns {Object} created/updated canonical field
   */
  upsertCanonicalField(data) {
    if (!data?.entityId || !data?.fieldPath || data.value === undefined) {
      throw new ValidationError('entityId, fieldPath, and value are required');
    }
    if (!data?.provenance || typeof data.provenance !== 'string') {
      throw new ValidationError('provenance is required and must be a string');
    }
    if (typeof data?.confidence !== 'number') {
      throw new ValidationError('confidence is required and must be a number');
    }

    // Check if canonical field already exists
    const existing = this.db
      .select()
      .from(CanonicalField)
      .where(
        and(
          eq(CanonicalField.entityId, data.entityId),
          eq(CanonicalField.fieldPath, data.fieldPath)
        )
      )
      .all();

    const now = new Date().toISOString();
    const id = `cf_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    if (existing.length > 0) {
      const existingRow = existing[0];
      const existingProvenancePriority = this._provenancePriority(existingRow.provenance);
      const newProvenancePriority = this._provenancePriority(data.provenance);

      // Only update if new provenance is higher or same provenance with higher confidence
      if (newProvenancePriority > existingProvenancePriority || 
          (newProvenancePriority === existingProvenancePriority && data.confidence > existingRow.confidence)) {
        
        const updates = {
          value: data.value,
          provenance: data.provenance,
          confidence: data.confidence,
          sourceId: data.sourceId || null,
          claimId: data.claimId || null,
          resolvedAt: new Date().toISOString(),
          supersededAt: existingRow.supersededAt,
          updatedAt: new Date().toISOString()
        };

        this.db
          .update(CanonicalField)
          .set(updates)
          .where(eq(CanonicalField.id, existingRow.id))
          .run();

        return this._mapCanonicalFieldRow({ ...existingRow, ...updates });
      }
      // If not updating, return existing
      return this._mapCanonicalFieldRow(existingRow);
    }

    // Create new canonical field
    const row = {
      id: `cf_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      entityId: data.entityId,
      fieldPath: data.fieldPath,
      value: data.value,
      provenance: data.provenance,
      confidence: data.confidence,
      sourceId: data.sourceId || null,
      claimId: data.claimId || null,
      resolvedAt: new Date().toISOString(),
      supersededAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.db.insert(CanonicalField).values(row).run();
    return this._mapCanonicalFieldRow(row);
  }

  /**
   * Get a canonical field for an entity
   * @param {string} entityId
   * @param {string} fieldPath
   * @returns {Object|null}
   */
  getCanonicalField(entityId, fieldPath) {
    if (!entityId || !fieldPath) return null;

    const rows = this.db
      .select()
      .from(CanonicalField)
      .where(
        and(
          eq(CanonicalField.entityId, entityId),
          eq(CanonicalField.fieldPath, fieldPath)
        )
      )
      .all();

    return rows.length > 0 ? this._mapCanonicalFieldRow(rows[0]) : null;
  }

  /**
   * Get all canonical fields for an entity
   * @param {string} entityId
   * @returns {Object[]}
   */
  getCanonicalFields(entityId) {
    if (!entityId) return [];

    const rows = this.db
      .select()
      .from(CanonicalField)
      .where(eq(CanonicalField.entityId, entityId))
      .all();

    return rows.map(this._mapCanonicalFieldRow);
  }

  /**
   * Create an observation record
   * @param {Object} data - { entityId, provider, providerRecordId, fieldPath, value, normalizedValue?, provenance, confidence, sourceId?, claimId? }
   * @returns {Object} created observation
   */
  createObservation(data) {
    if (!data?.entityId || !data?.provider || !data?.fieldPath || data.value === undefined) {
      throw new ValidationError('entityId, provider, fieldPath, and value are required');
    }

    const id = `obs_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id: `obs_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      entityId: data.entityId,
      provider: data.provider,
      providerRecordId: data.providerRecordId || null,
      fieldPath: data.fieldPath,
      value: data.value,
      normalizedValue: data.normalizedValue || null,
      provenance: data.provenance || 'discovered',
      confidence: data.confidence ?? 0.8,
      sourceId: data.sourceId || null,
      claimId: data.claimId || null,
      observedAt: data.observedAt || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    this.db.insert(Observation).values(row).run();
    return this._mapObservationRow(row);
  }

  /**
   * Get observations for an entity
   * @param {string} entityId
   * @param {string} [fieldPath]
   * @returns {Object[]}
   */
  getObservations(entityId, fieldPath = null) {
    if (!entityId) return [];

    const conditions = [eq(Observation.entityId, entityId)];
    if (fieldPath) conditions.push(eq(Observation.fieldPath, fieldPath));

    const rows = this.db
      .select()
      .from(Observation)
      .where(and(...conditions))
      .orderBy(Observation.observedAt)
      .all();

    return rows.map(this._mapObservationRow);
  }

  /**
   * Create a source record
   * @param {Object} data - { url, domain?, provider?, sourceType?, authority?, isPrimary?, publishedAt?, updatedAt?, metadata? }
   * @returns {Object} created source
   */
  createSource(data) {
    if (!data?.url) {
      throw new ValidationError('url is required for source');
    }

    const id = `src_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      url: data.url,
      domain: data.domain || (data.url ? new URL(data.url).hostname : null),
      provider: data.provider || null,
      sourceType: data.sourceType || 'other',
      authority: Math.max(0, Math.min(1, data.authority ?? 0.5)),
      isPrimary: data.isPrimary ? 1 : 0,
      retrievedAt: new Date().toISOString(),
      publishedAt: data.publishedAt || null,
      updatedAt: data.updatedAt || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null
    };

    this.db.insert(Source).values(row).run();
    return this._mapSourceRow(row);
  }

  /**
   * Get source by ID
   */
  getSource(sourceId) {
    if (!sourceId) return null;
    const rows = this.db.select().from(Source).where(eq(Source.id, sourceId)).all();
    return rows.length > 0 ? this._mapSourceRow(rows[0]) : null;
  }

  /**
   * Create an evidence record
   * @param {Object} data - { sourceId, fieldPath, value, excerpt?, location?, extractionMethod?, metadata? }
   * @returns {Object} created evidence
   */
  createEvidence(data) {
    if (!data?.sourceId || !data?.fieldPath || data.value === undefined) {
      throw new ValidationError('sourceId, fieldPath, and value are required');
    }

    const id = `ev_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      sourceId: data.sourceId,
      fieldPath: data.fieldPath,
      value: data.value,
      excerpt: data.excerpt || null,
      location: data.location ? JSON.stringify(data.location) : null,
      extractedAt: data.extractedAt || new Date().toISOString(),
      extractionMethod: data.extractionMethod || 'unknown',
      metadata: data.metadata ? JSON.stringify(data.metadata) : null
    };

    this.db.insert(Evidence).values(row).run();
    return this._mapEvidenceRow(row);
  }

  /**
   * Create a claim
   * @param {Object} data - { entityId, fieldPath, value, normalizedValue?, claimType?, confidence?, verificationStatus?, temporalMetadata? }
   * @returns {Object} created claim
   */
  createClaim(data) {
    if (!data?.entityId || !data?.fieldPath || data.value === undefined) {
      throw new ValidationError('entityId, fieldPath, and value are required');
    }

    const id = `clm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      entityId: data.entityId,
      fieldPath: data.fieldPath,
      value: data.value,
      normalizedValue: data.normalizedValue || null,
      claimType: data.claimType || 'fact',
      confidence: data.confidence ?? 0.5,
      verificationStatus: data.verificationStatus || 'unverified',
      temporalRetrievedAt: new Date().toISOString(),
      temporalPublishedAt: data.temporalMetadata?.publishedAt || null,
      temporalObservedAt: data.temporalMetadata?.observedAt || null,
      temporalLastVerifiedAt: data.temporalMetadata?.lastVerifiedAt || null,
      createdAt: now,
      updatedAt: now
    };

    this.db.insert(Claim).values(row).run();
    return this._mapClaimRow(row);
  }

  /**
   * Link claim to source
   */
  linkClaimSource(claimId, sourceId, confidence = 0.5, isPrimary = false) {
    const id = `cs_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.db.insert(ClaimSource).values({
      id,
      claimId,
      sourceId,
      confidence,
      isPrimary: isPrimary ? 1 : 0
    }).run();
  }

  /**
   * Link claim to evidence
   */
  linkClaimEvidence(claimId, evidenceId) {
    const id = `ce_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.db.insert(ClaimEvidence).values({ id, claimId, evidenceId }).run();
  }

  /**
   * Create a conflict
   * @param {Object} data - { entityId, fieldPath, values, resolutionStrategy?, resolutionReason?, resolvedAt?, resolvedBy? }
   * @returns {Object} created conflict
   */
  createConflict(data) {
    if (!data?.entityId || !data?.fieldPath || !data?.values) {
      throw new ValidationError('entityId, fieldPath, and values are required');
    }

    const id = `conf_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      entityId: data.entityId,
      fieldPath: data.fieldPath,
      values: JSON.stringify(data.values),
      status: data.status || 'conflicted',
      resolutionStrategy: data.resolutionStrategy || null,
      resolutionReason: data.resolutionReason || null,
      resolvedAt: data.resolvedAt || null,
      resolvedBy: data.resolvedBy || null,
      createdAt: now,
      updatedAt: now
    };

    this.db.insert(Conflict).values(row).run();
    return this._mapConflictRow(row);
  }

  /**
   * Get conflicts for an entity
   */
  getConflicts(entityId, fieldPath = null, status = null) {
    if (!entityId) return [];

    const conditions = [eq(Conflict.entityId, entityId)];
    if (fieldPath) conditions.push(eq(Conflict.fieldPath, fieldPath));
    if (status) conditions.push(eq(Conflict.status, status));

    const rows = this.db.select().from(Conflict).where(and(...conditions)).all();
    return rows.map(this._mapConflictRow);
  }

  /**
   * Resolve a conflict
   */
  resolveConflict(conflictId, resolutionStrategy, resolutionReason, resolvedBy) {
    const now = new Date().toISOString();
    this.db
      .update(Conflict)
      .set({
        status: 'resolved',
        resolutionStrategy,
        resolutionReason,
        resolvedAt: now,
        resolvedBy,
        updatedAt: now
      })
      .where(eq(Conflict.id, conflictId))
      .run();

    const rows = this.db.select().from(Conflict).where(eq(Conflict.id, conflictId)).all();
    return rows.length > 0 ? this._mapConflictRow(rows[0]) : null;
  }

  /**
   * Record a canonicalization decision
   */
  recordCanonicalizationDecision(data) {
    if (!data?.entityId || !data?.fieldPath || !data?.decisionType || !data?.chosenValue) {
      throw new ValidationError('entityId, fieldPath, decisionType, and chosenValue are required');
    }

    const id = `cd_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const row = {
      id,
      entityId: data.entityId,
      fieldPath: data.fieldPath,
      decisionType: data.decisionType,
      chosenValue: data.chosenValue,
      rejectedValue: data.rejectedValue || null,
      reason: data.reason || null,
      strategy: data.strategy || null,
      confidence: data.confidence || null,
      conflictId: data.conflictId || null,
      claimId: data.claimId || null,
      createdAt: now
    };

    this.db.insert(CanonicalizationDecision).values(row).run();
    return this._mapCanonicalizationDecisionRow(row);
  }

  /**
   * Get canonicalization decisions for an entity
   */
  getCanonicalizationDecisions(entityId, fieldPath = null) {
    if (!entityId) return [];

    const conditions = [eq(CanonicalizationDecision.entityId, entityId)];
    if (fieldPath) conditions.push(eq(CanonicalizationDecision.fieldPath, fieldPath));

    const rows = this.db.select().from(CanonicalizationDecision).where(and(...conditions)).all();
    return rows.map(this._mapCanonicalizationDecisionRow);
  }

  // =========================================================================
  // Phase 15: ReviewItem Operations (human-review queue)
  // =========================================================================

  /**
   * Build a deterministic, timestamp-free deduplication key from the actual
   * identity-resolution context so repeated research of the same unresolved
   * situation reuses one review item instead of piling up duplicates.
   *
   * Two shapes:
   *  - pairwise: keyed on the (provider, providerRecordId) pair (order-independent)
   *    + matchType — used when two provider records are compared in one request.
   *  - temporal: keyed on entityId + normalized old->new address transition +
   *    matchType — used for cross-time relocation detection.
   *
   * Unrelated entities produce different keys (different provider records /
   * different entity + address), so similar names never collapse into one review.
   *
   * @param {Object} ctx
   * @returns {string} deterministic dedupe key
   */
  buildReviewDedupeKey(ctx = {}) {
    const norm = (s) => (s == null ? '' : String(s).trim().toLowerCase());
    const matchType = norm(ctx.matchType);

    if (ctx.providerA || ctx.providerB || ctx.providerRecordIdA || ctx.providerRecordIdB) {
      const a = `${norm(ctx.providerA)}:${norm(ctx.providerRecordIdA)}`;
      const b = `${norm(ctx.providerB)}:${norm(ctx.providerRecordIdB)}`;
      const [x, y] = [a, b].sort();
      return `pair|${x}|${y}|${matchType}`;
    }

    const entity = norm(ctx.entityId);
    const from = norm(ctx.addressFrom);
    const to = norm(ctx.addressTo);
    return `temporal|${entity}|${from}->${to}|${matchType}`;
  }

  /**
   * Create a review item, idempotently. If a review already exists for the
   * computed dedupe key it is returned unchanged (no duplicate, no churn).
   *
   * @param {Object} data - { entityId, matchType, dedupeKey?, matchScore?, reason?,
   *   evidence?, relatedEntityId?, provider?, providerRecordId?, relatedProvider?,
   *   relatedProviderRecordId?, dedupeContext? }
   * @returns {Object} review item (existing or newly created)
   */
  createReviewItem(data) {
    if (!data?.entityId || typeof data.entityId !== 'string') {
      throw new ValidationError('entityId is required and must be a string');
    }
    if (!data?.matchType || typeof data.matchType !== 'string') {
      throw new ValidationError('matchType is required and must be a string');
    }

    const entity = this.getEntityById(data.entityId);
    if (!entity) {
      throw new NotFoundError(`Entity ${data.entityId} not found`);
    }

    const dedupeKey =
      data.dedupeKey ||
      this.buildReviewDedupeKey({ ...(data.dedupeContext || {}), entityId: data.entityId, matchType: data.matchType });

    // Idempotency: reuse the existing review for this context if present.
    const existing = this.getReviewItemByDedupeKey(dedupeKey);
    if (existing) return existing;

    const id = `rev_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const row = {
      id,
      dedupeKey,
      entityId: data.entityId,
      relatedEntityId: data.relatedEntityId || null,
      provider: data.provider || null,
      providerRecordId: data.providerRecordId || null,
      relatedProvider: data.relatedProvider || null,
      relatedProviderRecordId: data.relatedProviderRecordId || null,
      matchType: data.matchType,
      matchScore: typeof data.matchScore === 'number' ? data.matchScore : null,
      reason: data.reason || null,
      evidence: data.evidence != null ? JSON.stringify(data.evidence) : null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };

    try {
      this.db.insert(ReviewItem).values(row).run();
    } catch (err) {
      // Concurrent creation race on the unique dedupe key: reuse the winner.
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const winner = this.getReviewItemByDedupeKey(dedupeKey);
        if (winner) return winner;
      }
      throw err;
    }

    return this._mapReviewItemRow(row);
  }

  /**
   * Get a review item by primary key.
   */
  getReviewItem(id) {
    if (!id || typeof id !== 'string') return null;
    const rows = this.db.select().from(ReviewItem).where(eq(ReviewItem.id, id)).all();
    return rows.length > 0 ? this._mapReviewItemRow(rows[0]) : null;
  }

  /**
   * Get a review item by its deterministic dedupe key.
   */
  getReviewItemByDedupeKey(dedupeKey) {
    if (!dedupeKey || typeof dedupeKey !== 'string') return null;
    const rows = this.db.select().from(ReviewItem).where(eq(ReviewItem.dedupeKey, dedupeKey)).all();
    return rows.length > 0 ? this._mapReviewItemRow(rows[0]) : null;
  }

  /**
   * List review items, optionally filtered by entity and/or status.
   * @param {Object} [filter] - { entityId?, status? }
   * @returns {Object[]} review items (oldest first)
   */
  getReviewItems(filter = {}) {
    const conditions = [];
    if (filter.entityId) conditions.push(eq(ReviewItem.entityId, filter.entityId));
    if (filter.status) conditions.push(eq(ReviewItem.status, filter.status));

    const query = this.db.select().from(ReviewItem);
    const rows = (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(ReviewItem.createdAt)
      .all();
    return rows.map(this._mapReviewItemRow);
  }

  /**
   * Read-only assembly of everything an operator needs to decide a review,
   * using only existing repository read methods. Does NOT mutate anything.
   *
   * Returns an object keyed for operator inspection (why Webloom created the
   * review), or `null` if the review does not exist.
   *
   * @param {string} reviewId
   * @returns {Object|null} {
   *   review,           review item (metadata + evidence + timestamps)
   *   entities,         { entity, relatedEntity } (BusinessEntity or null)
   *   providerIdentities, { provider, relatedProvider } (ProviderIdentity or null)
   *   context,          { observations, canonicalFields, conflicts } for entity
   * }
   */
  getReviewDetail(reviewId) {
    const review = this.getReviewItem(reviewId);
    if (!review) return null;

    const entityId = review.entityId;
    const relatedEntityId = review.relatedEntityId;

    const entity = entityId ? this.getEntityById(entityId) : null;
    const relatedEntity = relatedEntityId ? this.getEntityById(relatedEntityId) : null;

    const provider =
      review.provider && review.providerRecordId
        ? this.findProviderIdentity(review.provider, review.providerRecordId)
        : null;
    const relatedProvider =
      review.relatedProvider && review.relatedProviderRecordId
        ? this.findProviderIdentity(review.relatedProvider, review.relatedProviderRecordId)
        : null;

    const observations = entityId ? this.getObservations(entityId) : [];
    const canonicalFields = entityId ? this.getCanonicalFields(entityId) : [];
    const conflicts = entityId ? this.getConflicts(entityId) : [];

    return {
      review,
      entities: { entity, relatedEntity },
      providerIdentities: { provider, relatedProvider },
      context: { observations, canonicalFields, conflicts },
    };
  }

  /**
   * Resolve a pending review item (pending -> approved | rejected).
   *
   * Phase 16: this is the production, actionable decision boundary. Both
   * approval and rejection apply the SAFE identity action defined for the
   * review's match type, atomically, idempotently, and with a durable audit
   * trail. It NEVER deletes historical evidence and NEVER merges entities for
   * same_brand_different_location.
   *
   * @param {string} id
   * @param {'approved'|'rejected'} status
   * @param {Object} [options] - { resolvedBy?, note?, injectFailure? }
   * @returns {Object} updated review item
   */
  resolveReviewItem(id, status, options = {}) {
    return this.enforceReviewDecision(id, status, options);
  }

  /**
   * Enforce a human review decision (
   * review_item status pending -> approved | rejected).
   *
   * Decision semantics by review match type:
   *  - REJECT (any match type): status -> rejected. No entity/canonical mutation.
   *  - APPROVE same_entity / uncertain (pairwise, relatedEntityId present):
   *      reassign the provisional secondary provider mapping onto the
   *      authoritative entity, mark the provisional entity MERGED, write an
   *      audit resolution_record, preserve all observations/history.
   *  - APPROVE relocated_entity (temporal, single entity): promote the approved
   *      new address to current canonical location; preserve historical
   *      observations. Audit stays on the review item.
   *  - APPROVE same_brand_different_location: confirm distinct branches; the two
   *      businesses are NEVER merged. Status-only approval, no entity mutation.
   *  - APPROVE without relatedEntityId (uncertain/unknown): status-only approval.
   *
   * Atomicity: the whole decision is one SQLite transaction — either every
   * identity write commits or none do.
   *
   * Idempotency: a resolved review re-resolved to the SAME decision is a safe
   * no-op returning the existing item. Re-resolving to a DIFFERENT decision
   * throws ValidationError (history is never silently rewritten).
   *
   * @param {string} id
   * @param {'approved'|'rejected'} decision
   * @param {Object} [options] - { resolvedBy?, note?, injectFailure? }
   * @returns {Object} updated review item
   */
  enforceReviewDecision(id, decision, options = {}) {
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new ValidationError("decision must be 'approved' or 'rejected'");
    }
    const existing = this.getReviewItem(id);
    if (!existing) {
      throw new NotFoundError(`Review item ${id} not found`);
    }

    // Idempotency + immutable-history guard: an already-resolved review may be
    // re-confirmed to the same decision (no-op), but never reopened or changed.
    if (existing.status !== 'pending') {
      if (existing.status === decision) return existing;
      throw new ValidationError(
        `Review ${id} already resolved as '${existing.status}'; cannot change to '${decision}'.`
      );
    }

    const now = new Date().toISOString();
    const resolvedBy = options.resolvedBy || null;
    const note = options.note || null;
    // The operator may supply the approved relocation address at the HTTP
    // boundary; it defaults to the address already persisted in the review's
    // evidence (Phase 16 default is preserved when absent).
    const addressTo = options.addressTo || null;
    // Diagnostic/test seam only: when set, forces a mid-transaction failure so
    // callers can verify the identity action rolls back atomically. No-op when
    // undefined (never set in production paths).
    const injectFailure = options.injectFailure;

    this.db.transaction((tx) => {
      if (decision === 'rejected') {
        // Rejection preserves the provisional state: only the review status and
        // reviewer metadata change. No entity, provider, or canonical mutation.
        this._txSetReviewStatus(tx, id, 'rejected', { now, resolvedBy, note });
      } else {
        this._txApplyApproval(tx, existing, { now, resolvedBy, note, addressTo });
      }

      if (injectFailure) {
        throw new Error(
          typeof injectFailure === 'string' ? injectFailure : 'Injected failure before transaction commit.'
        );
      }
    });

    return this.getReviewItem(id);
  }

  /**
   * Apply the SAFE approval action for a review's match type (transactional).
   * @private
   */
  _txApplyApproval(tx, review, { now, resolvedBy, note, addressTo = null }) {
    const targetEntityId = review.entityId;
    const sourceEntityId = review.relatedEntityId;

    if (review.matchType === 'same_brand_different_location') {
      // Confirm distinct branches. NEVER merge. Status-only approval.
      this._txSetReviewStatus(tx, review.id, 'approved', { now, resolvedBy, note });
      return;
    }

    if (
      review.matchType === 'same_entity' ||
      review.matchType === 'uncertain'
    ) {
      if (!sourceEntityId) {
        // No provisional separate entity to fold in — nothing to merge.
        this._txSetReviewStatus(tx, review.id, 'approved', { now, resolvedBy, note });
        return;
      }
      this._txApplyMerge(tx, review, sourceEntityId, targetEntityId, { now, resolvedBy, note });
      return;
    }

    if (review.matchType === 'relocated_entity') {
      if (sourceEntityId) {
        // A relocation is a single-entity, over-time move; it must NOT fold a
        // distinct related entity in. Refuse the ambiguous merge-style approval.
        throw new ValidationError(
          `Relocation review ${review.id} carries a relatedEntityId; refusing ambiguous entity merge.`
        );
      }
      this._txApplyRelocation(tx, review, { now, resolvedBy, note, addressTo });
      return;
    }

    // Unknown/other match type: status-only approval, no identity mutation.
    this._txSetReviewStatus(tx, review.id, 'approved', { now, resolvedBy, note });
  }

  /**
   * Approve same-entity: move the provisional provider mapping onto the
   * authoritative entity, mark the provisional entity MERGED, and write an
   * explicit audit resolution record. Preserves observations/history.
   * @private
   */
  _txApplyMerge(tx, review, sourceEntityId, targetEntityId, { now, resolvedBy, note }) {
    if (sourceEntityId === targetEntityId) {
      throw new ValidationError(`Cannot merge entity ${sourceEntityId} into itself.`);
    }

    const provider = review.relatedProvider || review.provider || null;
    const providerRecordId = review.relatedProviderRecordId || review.providerRecordId || null;
    if (!provider || !providerRecordId) {
      throw new ValidationError(
        `Review ${review.id} has no provider-record pair to reassign; cannot approve as a merge.`
      );
    }
    if (!sourceEntityId) {
      throw new ValidationError(`Review ${review.id} has no related entity to merge from.`);
    }

    const sourceRows = tx
      .select()
      .from(BusinessEntity)
      .where(eq(BusinessEntity.entityId, sourceEntityId))
      .all();
    if (sourceRows.length === 0) {
      throw new NotFoundError(`Source entity ${sourceEntityId} not found; cannot merge.`);
    }
    if (sourceRows[0].status === 'MERGED' || sourceRows[0].status === 'DEPRECATED') {
      throw new ValidationError(
        `Source entity ${sourceEntityId} is already '${sourceRows[0].status}'; merge is ambiguous.`
      );
    }
    const targetRows = tx
      .select()
      .from(BusinessEntity)
      .where(eq(BusinessEntity.entityId, targetEntityId))
      .all();
    if (targetRows.length === 0) {
      throw new NotFoundError(`Target entity ${targetEntityId} not found; cannot merge.`);
    }

    const mappingRows = tx
      .select()
      .from(ProviderIdentity)
      .where(
        and(
          eq(ProviderIdentity.provider, provider),
          eq(ProviderIdentity.providerRecordId, providerRecordId)
        )
      )
      .all();
    if (mappingRows.length === 0) {
      throw new NotFoundError(
        `Provider mapping (${provider}, ${providerRecordId}) not found; cannot merge.`
      );
    }
    const mapping = mappingRows[0];

    if (mapping.entityId !== targetEntityId) {
      // Move the provisional secondary mapping onto the authoritative entity.
      tx.update(ProviderIdentity)
        .set({ entityId: targetEntityId, lastSeen: now })
        .where(eq(ProviderIdentity.id, mapping.id))
        .run();
    }

    // Mark the absorbed entity MERGED (do NOT delete — its observations, claims,
    // conflicts, and provider history remain attached as the audit trail).
    tx.update(BusinessEntity)
      .set({
        status: 'MERGED',
        updatedAt: now,
      })
      .where(eq(BusinessEntity.entityId, sourceEntityId))
      .run();

    // Explicit audit resolution record for the merge (source/target/mapping/
    // reviewer/review/reason), independent of final DB state.
    const auditNote = JSON.stringify({
      action: 'merge',
      sourceEntityId,
      targetEntityId,
      provider,
      providerRecordId,
      reviewId: review.id,
      resolvedBy,
      reason: note || review.reason || null,
    });
    tx.insert(ResolutionRecord)
      .values({
        id: `res_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        entityId: targetEntityId,
        matchScore: typeof review.matchScore === 'number' ? review.matchScore : 0,
        matchType: 'same_entity',
        providerA: review.provider || provider || 'unknown',
        providerRecordIdA: review.providerRecordId || null,
        providerB: review.relatedProvider || provider || 'unknown',
        providerRecordIdB: review.relatedProviderRecordId || null,
        timestamp: now,
        status: 'merged',
        confidence: typeof review.matchScore === 'number' ? review.matchScore : null,
        notes: auditNote,
      })
      .run();

    this._txSetReviewStatus(tx, review.id, 'approved', { now, resolvedBy, note });
  }

  /**
   * Approve relocation: promote the approved new address to the current
   * canonical location (entity + canonical field), preserving historical
   * observations. Audit stays on the review item's immutable evidence.
   * @private
   */
  _txApplyRelocation(tx, review, { now, resolvedBy, note, addressTo = null }) {
    if (!review.relatedEntityId && !review.entityId) {
      throw new ValidationError(`Relocation review ${review.id} has no entity to update.`);
    }
    const entityId = review.entityId;
    const evidence = review.evidence && typeof review.evidence === 'object' ? review.evidence : {};
    // The approved new address defaults to the address persisted in the review
    // evidence (Phase 16 default), but an operator-supplied value may override it.
    const newAddress = addressTo || evidence.addressTo || null;
    if (!newAddress) {
      throw new ValidationError(
        `Relocation review ${review.id} has no approved new address (evidence.addressTo missing); cannot update canonical location.`
      );
    }

    const entityRows = tx
      .select()
      .from(BusinessEntity)
      .where(eq(BusinessEntity.entityId, entityId))
      .all();
    if (entityRows.length === 0) {
      throw new NotFoundError(`Entity ${entityId} not found; cannot apply relocation.`);
    }

    // Current canonical location becomes the approved new address. Historical
    // observations (including the old address) are NOT deleted.
    tx.update(BusinessEntity)
      .set({ canonicalAddress: newAddress, updatedAt: now })
      .where(eq(BusinessEntity.entityId, entityId))
      .run();

    // Upsert the canonical location field with the highest-priority,
    // reviewer-confirmed provenance so it deterministically supersedes earlier
    // provider-derived values via the existing canonicalization model.
    const existing = tx
      .select()
      .from(CanonicalField)
      .where(
        and(
          eq(CanonicalField.entityId, entityId),
          eq(CanonicalField.fieldPath, 'location.full_address')
        )
      )
      .all();
    if (existing.length > 0) {
      tx.update(CanonicalField)
        .set({
          value: newAddress,
          provenance: 'verified',
          confidence: 1.0,
          updatedAt: now,
        })
        .where(eq(CanonicalField.id, existing[0].id))
        .run();
    } else {
      tx.insert(CanonicalField)
        .values({
          id: `cf_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          entityId,
          fieldPath: 'location.full_address',
          value: newAddress,
          provenance: 'verified',
          confidence: 1.0,
          resolvedAt: now,
          supersededAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    this._txSetReviewStatus(tx, review.id, 'approved', { now, resolvedBy, note });
  }

  /**
   * Set the review status + reviewer metadata within a transaction.
   * @private
   */
  _txSetReviewStatus(tx, id, status, { now, resolvedBy, note }) {
    tx.update(ReviewItem)
      .set({
        status,
        resolvedAt: now,
        resolvedBy: resolvedBy || null,
        resolutionNote: note || null,
        updatedAt: now,
      })
      .where(eq(ReviewItem.id, id))
      .run();
  }

  _mapReviewItemRow(row) {
    return {
      id: row.id,
      dedupeKey: row.dedupeKey,
      entityId: row.entityId,
      relatedEntityId: row.relatedEntityId,
      provider: row.provider,
      providerRecordId: row.providerRecordId,
      relatedProvider: row.relatedProvider,
      relatedProviderRecordId: row.relatedProviderRecordId,
      matchType: row.matchType,
      matchScore: row.matchScore,
      reason: row.reason,
      evidence: row.evidence ? JSON.parse(row.evidence) : null,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      resolutionNote: row.resolutionNote,
    };
  }

  /**
   * Provenance priority helper
   */
  _provenancePriority(provenance) {
    const priorities = { verified: 4, discovered: 3, user_provided: 3, identified: 2, inferred: 1 };
    return priorities[provenance] || 0;
  }

  // Mapping helpers for new tables
  _mapCanonicalFieldRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      fieldPath: row.fieldPath,
      value: row.value,
      provenance: row.provenance,
      confidence: row.confidence,
      sourceId: row.sourceId,
      claimId: row.claimId,
      resolvedAt: row.resolvedAt,
      supersededAt: row.supersededAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  _mapObservationRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      provider: row.provider,
      providerRecordId: row.providerRecordId,
      fieldPath: row.fieldPath,
      value: row.value,
      normalizedValue: row.normalizedValue,
      provenance: row.provenance,
      confidence: row.confidence,
      sourceId: row.sourceId,
      claimId: row.claimId,
      observedAt: row.observedAt,
      createdAt: row.createdAt
    };
  }

  _mapSourceRow(row) {
    return {
      id: row.id,
      url: row.url,
      domain: row.domain,
      provider: row.provider,
      sourceType: row.sourceType,
      authority: row.authority,
      isPrimary: Boolean(row.isPrimary),
      retrievedAt: row.retrievedAt,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  _mapEvidenceRow(row) {
    return {
      id: row.id,
      sourceId: row.sourceId,
      fieldPath: row.fieldPath,
      value: row.value,
      excerpt: row.excerpt,
      location: row.location ? JSON.parse(row.location) : null,
      extractedAt: row.extractedAt,
      extractionMethod: row.extractionMethod,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  _mapClaimRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      fieldPath: row.fieldPath,
      value: row.value,
      normalizedValue: row.normalizedValue,
      claimType: row.claimType,
      confidence: row.confidence,
      verificationStatus: row.verificationStatus,
      temporalRetrievedAt: row.temporalRetrievedAt,
      temporalPublishedAt: row.temporalPublishedAt,
      temporalObservedAt: row.temporalObservedAt,
      temporalLastVerifiedAt: row.temporalLastVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  _mapConflictRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      fieldPath: row.fieldPath,
      values: JSON.parse(row.values),
      status: row.status,
      resolutionStrategy: row.resolutionStrategy,
      resolutionReason: row.resolutionReason,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  _mapCanonicalizationDecisionRow(row) {
    return {
      id: row.id,
      entityId: row.entityId,
      fieldPath: row.fieldPath,
      decisionType: row.decisionType,
      chosenValue: row.chosenValue,
      rejectedValue: row.rejectedValue,
      reason: row.reason,
      strategy: row.strategy,
      confidence: row.confidence,
      conflictId: row.conflictId,
      claimId: row.claimId,
      createdAt: row.createdAt
    };
  }

  /**
   * Load canonical fields from persistent storage into a BusinessProfile
   * @param {string} entityId - Entity ID to load canonical fields for
   * @param {BusinessProfile} profile - BusinessProfile instance to populate
   * @returns {Promise<void>}
   */
  async loadCanonicalFieldsIntoProfile(entityId, profile) {
    if (!entityId || !profile) return;
    
    const canonicalFields = this.getCanonicalFields(entityId);
    for (const field of canonicalFields) {
      // Data-quality guard (defense-in-depth): a persisted street-address
      // string must never be re-loaded as the canonical business name —
      // even when it was written to canonical_field in the past, and even
      // though canonical storage is normally authoritative. An address is a
      // location datum, not identity; skipping it lets a real name already
      // on the profile survive.
      if (field.fieldPath === 'identity.name' && looksLikeStreetAddress(field.value)) {
        continue;
      }
      // JSON-stringified arrays/objects stored in canonical_field are parsed
      // back to their structured value here so profile field types are stable
      // (e.g. identity.services stays an array, location.coordinates stays an
      // object). Plain strings/numbers pass through untouched.
      const value = parseCanonicalFieldValue(field.value);
      // Canonical storage is authoritative over fresh provider values.
      profile.set(field.fieldPath, value, field.provenance, field.confidence, {
        sourceId: field.sourceId,
        claimId: field.claimId,
        canonical: true,
      });
    }
  }
}

/**
 * Parse a persisted canonical-field value back into its structured form.
 *
 * CanonicalizationService stores arrays/objects in the text column via
 * JSON.stringify. When reloading into a BusinessProfile we must restore the
 * structured value (array for identity.services/categories, {lat,lng} for
 * coordinates, day-map for hours) so downstream consumers never see raw
 * JSON strings. Plain strings and numbers pass through untouched.
 */
function parseCanonicalFieldValue(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  const looksJson =
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'));
  if (!looksJson) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') return parsed;
    return raw;
  } catch {
    return raw;
  }
}

export default IdentityRepository;
