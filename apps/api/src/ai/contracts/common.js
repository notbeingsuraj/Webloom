/**
 * Shared data contracts for the Webloom AI task layer.
 *
 * Contract rules:
 *  - Every AI-sourced field is an envelope: { value, confidence, provenance,
 *    status, evidence[] }. A missing fact is expressed as an UNKNOWN envelope
 *    (value: null, provenance: 'unknown', status: 'missing'), never as an
 *    omitted key and never as a plausible guess.
 *  - Provenance vocabulary matches the existing pipeline (FieldCandidate /
 *    BusinessProfile) plus 'unknown'. The AI layer never invents new kinds.
 *  - Schemas use the same hand-rolled JSON Schema subset understood by
 *    services/ai/AIResponseValidator.js (type, enum, minimum/maximum,
 *    required, properties, items). No new schema dependency.
 */

export const PROVENANCE_KINDS = Object.freeze([
  'canonical',
  'verified',
  'observed',
  'discovered',
  'identified',
  'user_provided',
  'inferred',
  'ai_generated',
  'unknown',
]);

export const FIELD_STATUSES = Object.freeze(['extracted', 'missing', 'ambiguous', 'unsupported']);

export const CONFIDENCE_BANDS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNSUPPORTED']);

export const EVIDENCE_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    source: { type: 'string', minLength: 1 },
    text: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
    field: { type: ['string', 'null'] },
  },
  required: ['source'],
});

/** UNKNOWN envelope — the canonical representation of "we do not know". */
export function unknownEnvelope() {
  return Object.freeze({ value: null, confidence: 0, provenance: 'unknown', status: 'missing', evidence: [] });
}

/**
 * Build the JSON Schema for a field envelope.
 * @param {object} valueSchema schema for the `value` property
 */
export function fieldEnvelope(valueSchema, { statuses = FIELD_STATUSES, required = ['value', 'confidence', 'provenance', 'status'] } = {}) {
  return {
    type: 'object',
    properties: {
      value: valueSchema,
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      provenance: { type: 'string', enum: PROVENANCE_KINDS },
      status: { type: 'string', enum: [...statuses] },
      evidence: { type: 'array', items: EVIDENCE_ITEM_SCHEMA },
    },
    required: [...required],
  };
}

export const STRING_FIELD = () => fieldEnvelope({ type: ['string', 'null'] });
export const NUMBER_FIELD = () => fieldEnvelope({ type: ['number', 'null'] });
export const INTEGER_FIELD = () => fieldEnvelope({ type: ['integer', 'null'] });
export const STRING_LIST_FIELD = () => fieldEnvelope({ type: ['array', 'null'], items: { type: 'string' } });
export const COORDINATES_FIELD = () => fieldEnvelope({
  type: ['object', 'null'],
  properties: {
    lat: { type: ['number', 'null'] },
    lng: { type: ['number', 'null'] },
  },
  required: ['lat', 'lng'],
});

export const SOCIAL_LINKS_FIELD = () => fieldEnvelope({
  type: ['array', 'null'],
  items: {
    type: 'object',
    properties: {
      platform: { type: 'string' },
      url: { type: 'string' },
    },
    required: ['platform', 'url'],
  },
});

/**
 * AIInferenceResult — the wrapper every WebloomAI.run() call returns.
 * Carries the task output plus the model/grounding/confidence metadata needed
 * to audit, benchmark, and reproduce the inference.
 */
export const AI_INFERENCE_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    task: { type: 'string', minLength: 1 },
    taskVersion: { type: 'string', minLength: 1 },
    output: { type: 'object' },
    inference: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: ['string', 'null'] },
        modelId: { type: ['string', 'null'] },
        promptVersion: { type: 'string' },
        latencyMs: { type: ['number', 'null'] },
        usage: { type: ['object', 'null'] },
        confidence: {
          type: 'object',
          properties: {
            overall: { type: 'number', minimum: 0, maximum: 1 },
            band: { type: 'string', enum: CONFIDENCE_BANDS },
            valuedFields: { type: 'integer', minimum: 0 },
          },
          required: ['overall', 'band', 'valuedFields'],
        },
        grounding: {
          type: 'object',
          properties: {
            checked: { type: 'boolean' },
            mode: { type: 'string', enum: ['enforce', 'report', 'off'] },
            grounded: { type: 'integer', minimum: 0 },
            unsupported: { type: 'integer', minimum: 0 },
            unverifiable: { type: 'integer', minimum: 0 },
          },
          required: ['checked', 'mode', 'grounded', 'unsupported', 'unverifiable'],
        },
        generatedAt: { type: 'string' },
      },
      required: ['provider', 'model', 'modelId', 'promptVersion', 'latencyMs', 'usage', 'confidence', 'grounding', 'generatedAt'],
    },
  },
  required: ['task', 'taskVersion', 'output', 'inference'],
});

/**
 * AIModelMetadata — what the model registry stores for every model version.
 */
export const AI_MODEL_METADATA_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['baseline', 'webloom', 'external', 'fallback'] },
    foundationModel: { type: ['string', 'null'] },
    provider: { type: ['string', 'null'] },
    quantization: { type: ['string', 'null'] },
    license: { type: ['string', 'null'] },
    promptVersion: { type: ['string', 'null'] },
    datasetVersions: { type: 'object' },
    trainingConfig: { type: ['object', 'null'] },
    loraConfig: { type: ['object', 'null'] },
    status: { type: 'string', enum: ['configured', 'candidate', 'evaluated', 'active-baseline', 'active-production', 'archived'] },
    registeredAt: { type: 'string' },
    knownWeaknesses: { type: 'array', items: { type: 'string' } },
    benchmarks: { type: 'array' },
  },
  required: ['id', 'type', 'status', 'registeredAt'],
});

/**
 * AIConfidence — the confidence record attached to a field or an inference.
 */
export const AI_CONFIDENCE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    overall: { type: 'number', minimum: 0, maximum: 1 },
    band: { type: 'string', enum: CONFIDENCE_BANDS },
    calibrated: { type: 'boolean' },
    calibrationError: { type: ['number', 'null'] },
  },
  required: ['overall', 'band'],
});

export default {
  PROVENANCE_KINDS,
  FIELD_STATUSES,
  CONFIDENCE_BANDS,
  EVIDENCE_ITEM_SCHEMA,
  unknownEnvelope,
  fieldEnvelope,
  AI_INFERENCE_RESULT_SCHEMA,
  AI_MODEL_METADATA_SCHEMA,
  AI_CONFIDENCE_SCHEMA,
};
