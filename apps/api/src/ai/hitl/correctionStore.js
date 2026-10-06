import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATASETS_DIR } from '../paths.js';
import { validateSchema } from '../../services/ai/AIResponseValidator.js';

/**
 * Human-in-the-loop correction store.
 *
 * Every human correction of an AI/system output is captured as a structured,
 * versionable record under datasets/corrections/. These records are the raw
 * material for the learning loop:
 *
 *   production → failures → human correction → dataset → evaluation →
 *   fine-tuning → improved model
 *
 * Storage is append-only JSONL (one correction per line): git-friendly,
 * diffable, and loadable by the fine-tuning dataset formatter without a
 * database migration.
 */

export const CORRECTION_REASONS = Object.freeze([
  'wrong_extraction',
  'missing_information',
  'hallucination',
  'incorrect_category',
  'incorrect_dna',
  'incorrect_analysis',
  'incorrect_strategy',
  'other',
]);

export const CORRECTION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    correctionId: { type: 'string', minLength: 1 },
    taskId: { type: 'string', minLength: 1 },
    exampleId: { type: ['string', 'null'] },
    fieldPath: { type: ['string', 'null'] },
    originalValue: {},
    correctedValue: {},
    reason: { type: 'string', enum: [...CORRECTION_REASONS] },
    correctedBy: { type: 'string', minLength: 1 },
    source: { type: 'string', enum: ['production', 'review', 'evaluation'] },
    inputSnapshot: { type: ['object', 'null'] },
    evidence: { type: ['array', 'null'] },
    notes: { type: ['string', 'null'] },
    createdAt: { type: 'string', minLength: 1 },
  },
  required: ['correctionId', 'taskId', 'reason', 'correctedBy', 'source', 'createdAt'],
});

export function correctionsFile() {
  return process.env.WEBLOOM_CORRECTIONS_FILE
    ?? path.join(DATASETS_DIR, 'corrections', 'corrections.jsonl');
}

/**
 * Append a human correction.
 *
 * @param {object} entry { taskId, fieldPath?, originalValue?, correctedValue?,
 *   reason, correctedBy, source, exampleId?, inputSnapshot?, evidence?, notes? }
 * @returns {object} the stored record (with correctionId/createdAt)
 */
export function recordCorrection(entry = {}) {
  const record = {
    correctionId: crypto.randomUUID(),
    taskId: entry.taskId,
    exampleId: entry.exampleId ?? null,
    fieldPath: entry.fieldPath ?? null,
    originalValue: entry.originalValue ?? null,
    correctedValue: entry.correctedValue ?? null,
    reason: entry.reason,
    correctedBy: entry.correctedBy,
    source: entry.source ?? 'review',
    inputSnapshot: entry.inputSnapshot ?? null,
    evidence: entry.evidence ?? null,
    notes: entry.notes ?? null,
    createdAt: new Date().toISOString(),
  };

  const error = validateSchema(record, CORRECTION_SCHEMA);
  if (error) throw new Error(`Invalid correction at ${error.path}: ${error.message}`);
  if (!CORRECTION_REASONS.includes(record.reason)) {
    throw new Error(`Invalid correction reason "${record.reason}"`);
  }

  const file = correctionsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/** Read all corrections (optionally filtered). */
export function listCorrections({ taskId = null, reason = null } = {}) {
  const file = correctionsFile();
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((c) => (taskId ? c.taskId === taskId : true))
    .filter((c) => (reason ? c.reason === reason : true));
}

/**
 * Convert corrections for a task into dataset example drafts
 * (annotationStatus: 'needs_annotation') so curators can promote them into a
 * versioned dataset split.
 */
export function correctionsToExampleDrafts(taskId) {
  return listCorrections({ taskId }).map((c) => ({
    exampleId: `corr-${c.correctionId}`,
    task: c.taskId,
    datasetVersion: 'unassigned',
    split: 'train',
    input: c.inputSnapshot ?? {},
    expectedOutput: c.correctedValue ?? null,
    evidence: c.evidence ?? [],
    source: { type: `human_correction:${c.reason}`, url: null, retrievedAt: c.createdAt },
    annotation: { status: 'needs_annotation', qualityScore: null, annotatedBy: c.correctedBy },
  }));
}

export default { recordCorrection, listCorrections, correctionsToExampleDrafts, CORRECTION_REASONS, correctionsFile };
