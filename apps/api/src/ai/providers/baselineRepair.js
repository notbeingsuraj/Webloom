import { validateSchema } from '../../services/ai/AIResponseValidator.js';

/**
 * Deterministic, reviewable shape-repair for baseline outputs.
 *
 * The baseline foundation model (e.g. Qwen2.5-7B) frequently produces output
 * that is *informationally* correct but not *contract-shaped*:
 *   - JSON wrapped in a ```json markdown fence;
 *   - envelope fields flattened into dot-path keys ("identity.name") instead
 *     of nested objects ({ identity: { name } }).
 *
 * This module performs ONLY shape repairs — it never invents, drops or edits
 * values — and is used exclusively to instrument the baseline benchmark. It
 * lets the benchmark report three honest numbers instead of collapsing them:
 *   1. raw JSON validity (parse success);
 *   2. raw contract compliance (as-consumed score, the number that matters);
 *   3. post-repair compliance (what a shape-repair layer could unlock).
 *
 * Any value that cannot be recovered stays a failure — the repair never
 * papers over missing or wrong values.
 */

/**
 * Extract JSON from a fenced/wrapped text payload.
 * Handles ```json fences and leading/trailing prose. Returns null when no
 * balanced JSON object/array is present.
 */
export function extractJsonPayload(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  try {
    JSON.parse(text);
    return text;
  } catch {
    /* fall through to fence extraction */
  }
  const fence = text.match(/```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```/);
  if (fence) {
    const candidate = fence[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  const open = text.indexOf('[');
  const close = text.lastIndexOf(']');
  let start = -1;
  let end = -1;
  if (first >= 0 && last > first) {
    start = first;
    end = last + 1;
  }
  if (open >= 0 && close > open && (open < start || start < 0)) {
    start = open;
    end = close + 1;
  }
  if (start < 0) return null;
  const candidate = text.slice(start, end).trim();
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

const hasDot = (key) => key.includes('.');

/**
 * Re-nest a flat object whose keys are dot-paths ("identity.name") into the
 * nested shape the Webloom contracts expect. Only runs when at least one key
 * contains a dot (i.e. the output is evidently flattened). Never edits
 * values. A parent key that also exists as a leaf envelope (rare) is merged
 * under the parent as "__other".
 */
export function renestFlatKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const keys = Object.keys(obj);
  if (!keys.some(hasDot)) return obj;
  const result = {};
  const group = new Map();
  for (const key of keys) {
    if (!hasDot(key)) {
      group.has(key) ? group.get(key).__other = obj[key] : (result[key] = obj[key]);
      continue;
    }
    const [head, ...rest] = key.split('.');
    if (rest.length === 1) {
      if (!group.has(head)) group.set(head, {});
      group.get(head)[rest[0]] = obj[key];
      continue;
    }
    const leaf = rest.pop();
    let node = group.get(head);
    if (!node) { node = {}; group.set(head, node); }
    let cursor = node;
    for (const part of rest) {
      if (cursor[part] == null || typeof cursor[part] !== 'object') cursor[part] = {};
      cursor = cursor[part];
    }
    cursor[leaf] = obj[key];
  }
  return { ...result, ...Object.fromEntries(group) };
}

/**
 * A Webloom contract whose required keys contain '.' is a FLAT contract — the
 * dotted keys are the field names themselves (e.g. "identity.name"), exactly
 * what a flat keyed model output already matches. Only NESTED contracts (top
 * level objects per group, e.g. { identity: { name } }) benefit from renesting.
 */
export function isFlatDottedContract(schema) {
  if (!schema || typeof schema !== 'object') return false;
  const keys = [...Object.keys(schema.properties || {}), ...(schema.required || [])];
  return keys.some((k) => typeof k === 'string' && k.includes('.'));
}

/**
 * Attempt to consume `raw` as the `schema`-shaped output.
 *
 * Shape repairs applied remain deterministic and value-preserving:
 *  - fenced JSON is unwrapped;
 *  - for NESTED contracts, flat dot-path keys are re-nested.
 * Enum/status vocabulary drift, missing keys and wrong values are NEVER
 * repaired — those are real failures and stay visible.
 *
 * @param {string} raw
 * @param {object} schema JSON-schema contract
 * @param {object} context { provider, model } (unused today, kept for parity)
 * @returns {{ consumed: boolean, rawConsumable: boolean, value?: object,
 *             rawError?: string, repaired?: boolean, method?: string }|null}
 *          null when the payload yields nothing parseable at all.
 */
export function repairForContract(raw, schema, context = {}) {
  const payload = extractJsonPayload(raw);
  if (payload === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { consumed: false, rawConsumable: false, rawError: 'payload is not a JSON object' };
  }

  const rawError = validateSchema(parsed, schema);
  if (!rawError) {
    return { consumed: true, rawConsumable: true, value: parsed, rawError: null, repaired: false, method: null };
  }

  if (isFlatDottedContract(schema)) {
    // The model already used the flat contract's own keys — no shape to fix.
    return {
      consumed: false,
      rawConsumable: false,
      value: parsed,
      rawError: rawError.message,
      repaired: false,
      method: null,
    };
  }

  const nested = renestFlatKeys(parsed);
  const repairedError = validateSchema(nested, schema);
  if (repairedError) {
    return {
      consumed: false,
      rawConsumable: false,
      value: nested,
      rawError: rawError.message,
      repaired: true,
      method: 'flat-renest',
      repairedError: repairedError.message,
    };
  }
  return {
    consumed: true,
    rawConsumable: false,
    value: nested,
    rawError: rawError.message,
    repaired: true,
    method: 'flat-renest',
  };
}