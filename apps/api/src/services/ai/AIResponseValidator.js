import { AIError, AI_ERROR_CATEGORY } from './AIError.js';

/**
 * Structured-output pipeline for AI responses.
 *
 *   extract JSON -> parse -> schema validation -> semantic validation -> accept
 *
 * Nothing here "repairs" a bad response. A model that returns prose where JSON
 * was requested has failed, and guessing at intent is how fabricated business
 * data gets into a CRM.
 */

/**
 * Pull the first balanced JSON value out of arbitrary text.
 *
 * Handles ```json fences, leading prose ("Here is the JSON:"), and trailing
 * commentary. Scans with string/escape awareness so a brace inside a string
 * literal does not end the value early.
 *
 * @returns {string|null} the JSON substring, or null if none is present
 */
export function extractJSONText(text) {
  if (typeof text !== 'string') return null;
  const src = text.trim();
  if (!src) return null;

  // Fast path: the whole string is already JSON.
  if (src.startsWith('{') || src.startsWith('[')) {
    const direct = scanBalanced(src, 0);
    if (direct !== null) return direct;
  }

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch !== '{' && ch !== '[') continue;
    const candidate = scanBalanced(src, i);
    if (candidate !== null) return candidate;
  }
  return null;
}

function scanBalanced(src, start) {
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJSONText(text) {
  const candidate = extractJSONText(text);
  if (candidate === null) {
    return { ok: false, value: null, reason: 'no JSON value found in response' };
  }
  try {
    return { ok: true, value: JSON.parse(candidate), reason: null };
  } catch (error) {
    return { ok: false, value: null, reason: `malformed JSON: ${error.message}` };
  }
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

/**
 * Minimal JSON Schema subset — deliberately no new dependency.
 *
 * Supports: type (incl. union arrays), properties, required,
 * additionalProperties:false, items, enum, minimum/maximum, minLength/maxLength.
 * Unknown keywords are ignored rather than failed, so a richer schema from a
 * caller degrades to the checks we can actually perform.
 *
 * @returns {{ok: boolean, path: string, message: string}|null}
 */
export function validateSchema(value, schema, path = '$') {
  if (!schema || typeof schema !== 'object') return null;

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => matchesType(value, t))) {
      return { ok: false, path, message: `expected type ${allowed.join('|')}, got ${typeOf(value)}` };
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return { ok: false, path, message: `value not in enum` };
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      return { ok: false, path, message: `below minimum ${schema.minimum}` };
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      return { ok: false, path, message: `above maximum ${schema.maximum}` };
    }
  }

  if (typeof value === 'string' && schema.type !== 'null') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      return { ok: false, path, message: `shorter than minLength ${schema.minLength}` };
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      return { ok: false, path, message: `longer than maxLength ${schema.maxLength}` };
    }
  }

  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i += 1) {
      const err = validateSchema(value[i], schema.items, `${path}[${i}]`);
      if (err) return err;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!(key in value) || value[key] === undefined) {
        return { ok: false, path, message: `missing required property "${key}"` };
      }
    }
    const properties = schema.properties || {};
    for (const [key, subSchema] of Object.entries(properties)) {
      if (value[key] !== undefined) {
        const err = validateSchema(value[key], subSchema, `${path}.${key}`);
        if (err) return err;
      }
    }
    if (schema.additionalProperties === false) {
      const extra = Object.keys(value).filter((k) => !(k in properties));
      if (extra.length) {
        return { ok: false, path, message: `unexpected properties: ${extra.join(', ')}` };
      }
    }
  }

  return null;
}

/**
 * Semantic checks that a JSON Schema cannot express.
 *
 * Intentionally conservative. These reject output that is structurally valid
 * but cannot be real data. They must never rewrite or coerce a value.
 */
export function validateSemantics(value, path = '$') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { ok: false, path, message: 'non-finite number' };
    }
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const err = validateSemantics(value[i], `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;

      // A confidence score outside [0,1] means the model's self-report is
      // meaningless, and every downstream overwrite gate keys off it.
      if (/^confidence$/i.test(key) && typeof child === 'number' && (child < 0 || child > 1)) {
        return { ok: false, path: childPath, message: `confidence ${child} outside [0,1]` };
      }

      const err = validateSemantics(child, childPath);
      if (err) return err;
    }
  }

  return null;
}

/**
 * Run the full pipeline over raw provider text.
 *
 * @param {string} content raw model output
 * @param {object|null} schema JSON Schema, or null when a JSON object is merely
 *   expected without a declared shape
 * @param {object} context    { provider, model } for error attribution
 * @returns the validated value
 * @throws  {AIError} INVALID_RESPONSE (unparseable) or INVALID_SCHEMA (shape)
 */
export function validateStructuredOutput(content, schema, context = {}) {
  const parsed = parseJSONText(content);

  if (!parsed.ok) {
    throw new AIError({
      category: AI_ERROR_CATEGORY.INVALID_RESPONSE,
      message: `AI returned unusable output: ${parsed.reason}`,
      ...context,
    });
  }

  const value = parsed.value;

  // Callers that pass a bare object schema (not `true`) still expect an object.
  const schemaErr = schema && typeof schema === 'object'
    ? validateSchema(value, schema)
    : null;

  if (schemaErr) {
    throw new AIError({
      category: AI_ERROR_CATEGORY.INVALID_SCHEMA,
      message: `AI response failed schema validation at ${schemaErr.path}: ${schemaErr.message}`,
      ...context,
    });
  }

  const semanticErr = validateSemantics(value);
  if (semanticErr) {
    throw new AIError({
      category: AI_ERROR_CATEGORY.INVALID_SCHEMA,
      message: `AI response failed semantic validation at ${semanticErr.path}: ${semanticErr.message}`,
      ...context,
    });
  }

  return value;
}

export default {
  extractJSONText,
  parseJSONText,
  validateSchema,
  validateSemantics,
  validateStructuredOutput,
};
