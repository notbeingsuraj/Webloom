/**
 * AI error taxonomy and fallback policy.
 *
 * Category strings are API surface: AcquisitionResult.classifyEmptyAcquisition()
 * string-matches them, and routes/business.js forwards them to API clients.
 * Do not rename the existing values.
 */

export const AI_ERROR_CATEGORY = Object.freeze({
  AUTHENTICATION: 'AUTHENTICATION',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  // New categories. Both are classified as EXTRACTION_FAILED downstream.
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  REQUEST_INVALID: 'REQUEST_INVALID',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  ALL_PROVIDERS_FAILED: 'ALL_PROVIDERS_FAILED',
});

/**
 * Per-category policy.
 *
 * retryable  — worth another attempt against the SAME provider
 * fallback   — worth trying the NEXT provider
 *
 * Notes on the deliberate decisions:
 * - AUTHENTICATION does NOT retry (a bad key is deterministic) but DOES fall
 *   back, because the next provider is an independent vendor with its own key.
 *   The previous single-gateway design could not do this: every "fallback"
 *   hit the same host with the same key, so falling back was pure latency.
 * - INVALID_SCHEMA does not retry (re-sending the same prompt to the same model
 *   reproduces the same shape error) but does fall back, since a different
 *   vendor's model is genuinely a different sample.
 * - REQUEST_INVALID / CONFIGURATION_ERROR are our own fault, so neither retry
 *   nor fallback can help.
 */
const POLICY = Object.freeze({
  [AI_ERROR_CATEGORY.AUTHENTICATION]: { retryable: false, fallback: true },
  [AI_ERROR_CATEGORY.RATE_LIMITED]: { retryable: true, fallback: true },
  [AI_ERROR_CATEGORY.QUOTA_EXHAUSTED]: { retryable: false, fallback: true },
  [AI_ERROR_CATEGORY.TIMEOUT]: { retryable: true, fallback: true },
  [AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE]: { retryable: true, fallback: true },
  [AI_ERROR_CATEGORY.INVALID_RESPONSE]: { retryable: false, fallback: true },
  [AI_ERROR_CATEGORY.INVALID_SCHEMA]: { retryable: false, fallback: true },
  [AI_ERROR_CATEGORY.REQUEST_INVALID]: { retryable: false, fallback: false },
  [AI_ERROR_CATEGORY.CONFIGURATION_ERROR]: { retryable: false, fallback: false },
  [AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED]: { retryable: false, fallback: false },
});

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Strip anything that looks like a credential out of text we are about to log
 * or return. Providers echo back the Authorization header surprisingly often.
 */
export function sanitizeSecretText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/Authorization\s*:\s*Bearer\s*[A-Za-z0-9._~+/-]+=*/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9._-]{8,}/g, '[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._-]{6,}/gi, 'api_key=[REDACTED]')
    .replace(/x-api-key\s*[:=]\s*['"]?[A-Za-z0-9._-]{6,}/gi, 'x-api-key=[REDACTED]')
    .replace(/key\s*[:=]\s*['"][A-Za-z0-9._-]{12,}['"]/gi, 'key="[REDACTED]"')
    .replace(/cookie\s*[:=]\s*[^;\n]+/gi, 'cookie=[REDACTED]');
}

/**
 * Map a transport failure onto our taxonomy.
 * Accepts axios errors, native fetch errors, Gemini REST errors, and AIError.
 */
export function classifyAIError(error) {
  if (error instanceof AIError) return error.category;

  const status = error?.response?.status ?? error?.status ?? null;
  const code = error?.code || null;
  const text = [
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.message,
    typeof error === 'string' ? error : null,
  ].filter(Boolean).join(' ').toLowerCase();

  if (status === 401 || status === 403) return AI_ERROR_CATEGORY.AUTHENTICATION;

  if (status === 429) {
    // Providers disagree on what 429 means, and conflating them is expensive:
    // a *rate limit* recovers with a backoff retry, while an *exhausted quota*
    // never will. Google words RPM throttling as "You exceeded your current
    // quota ... see .../rate-limits", so a rate-limit reference in the body is
    // the strongest signal available and is checked first.
    if (/rate.?limit|requests per minute|rpm|tpm|too many requests/i.test(text)) {
      return AI_ERROR_CATEGORY.RATE_LIMITED;
    }
    if (/billing|credit balance|insufficient funds|payment|upgrade your plan|out of credits|add credits|no credits|top up|subscription|purchase/i.test(text)) {
      return AI_ERROR_CATEGORY.QUOTA_EXHAUSTED;
    }
    // Bare "quota" with no other hint: retry once, since throttling is far more
    // common in practice than a hard quota wall, and one retry is cheap.
    return AI_ERROR_CATEGORY.RATE_LIMITED;
  }

  if (status === 402) return AI_ERROR_CATEGORY.QUOTA_EXHAUSTED;

  if (status === 408 || status === 504) return AI_ERROR_CATEGORY.TIMEOUT;
  if (status === 400) return AI_ERROR_CATEGORY.REQUEST_INVALID;
  if (status === 413) return AI_ERROR_CATEGORY.REQUEST_INVALID;

  if (status && RETRYABLE_STATUS.has(status)) return AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE;
  if (status && status >= 500) return AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE;

  // Transport-level failures frequently carry no HTTP status at all.
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timed? ?out/i.test(text)) {
    return AI_ERROR_CATEGORY.TIMEOUT;
  }
  if (
    code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN'
    || code === 'ECONNRESET' || code === 'EPIPE'
    || /econnrefused|enotfound|socket hang up|network error|fetch failed/i.test(text)
  ) {
    return AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE;
  }

  if (/api key not valid|invalid api key|invalid_api_key|permission_denied|unauthenticated/i.test(text)) {
    return AI_ERROR_CATEGORY.AUTHENTICATION;
  }
  if (/rate.?limit|too many requests/i.test(text)) return AI_ERROR_CATEGORY.RATE_LIMITED;
  if (/quota|billing|insufficient funds|credit balance/i.test(text)) {
    return AI_ERROR_CATEGORY.QUOTA_EXHAUSTED;
  }
  if (/model .*not (found|supported|available)|no endpoint|unknown model/i.test(text)) {
    return AI_ERROR_CATEGORY.CONFIGURATION_ERROR;
  }
  if (/empty response|invalid json|malformed json|json parse|returned invalid/i.test(text)) {
    return AI_ERROR_CATEGORY.INVALID_RESPONSE;
  }

  return AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE;
}

/**
 * A single provider attempt failed. Carries the shape the rest of Webloom
 * already consumes via `error.providerError`.
 */
export class AIError extends Error {
  constructor({
    category = AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
    provider = null,
    model = null,
    httpStatus = null,
    message = 'AI request failed.',
    retryCount = 0,
    latencyMs = null,
    operation = null,
    cause = null,
    retryAfterMs = null,
  } = {}) {
    const safeMessage = sanitizeSecretText(message) || 'AI request failed.';
    super(safeMessage);
    this.name = 'AIError';
    this.category = category;
    this.provider = provider;
    this.model = model;
    this.httpStatus = httpStatus ?? null;
    this.safeMessage = safeMessage;
    this.retryCount = retryCount;
    this.retryAttempted = retryCount > 0;
    this.latencyMs = latencyMs ?? null;
    this.operation = operation;
    this.retryAfterMs = retryAfterMs;
    this.success = false;
    if (cause) this.cause = cause;

    // Legacy alias: the rest of Webloom reads error.providerError.
    this.providerError = {
      category: this.category,
      provider: this.provider,
      model: this.model,
      httpStatus: this.httpStatus,
      retryCount: this.retryCount,
      retryAttempted: this.retryAttempted,
      latencyMs: this.latencyMs,
      safeMessage: this.safeMessage,
      success: false,
    };
  }

  get retryable() {
    return POLICY[this.category]?.retryable ?? false;
  }

  get shouldFallback() {
    return POLICY[this.category]?.fallback ?? false;
  }

  /** Normalize any thrown value into an AIError. */
  static from(error, context = {}) {
    if (error instanceof AIError) return error;
    // Prefer the provider's own words over axios' generic status line.
    const providerMessage = extractProviderMessage(error);
    const generic = error?.message || 'AI request failed.';
    return new AIError({
      category: classifyAIError(error),
      message: providerMessage || generic,
      httpStatus: error?.response?.status ?? error?.status ?? null,
      retryAfterMs: parseRetryAfterMs(error?.response?.headers, extractProviderMessage(error) || error?.message || ''),
      cause: error,
      ...context,
    });
  }
}

/**
 * How many completion tokens a credit-limited provider says it can actually
 * afford, or null when it did not say.
 *
 * OpenRouter pre-checks affordability against the *requested* max_tokens and
 * rejects the whole request with HTTP 402 before it reaches any model:
 *
 *   "This request requires more credits, or fewer max_tokens. You requested up
 *    to 6000 tokens, but can only afford 1169."
 *
 * That number is the difference between a request that is merely too large and
 * one the account cannot fund at all, so it is worth reading rather than
 * treating every 402 as an opaque dead account.
 */
export function parseAffordableMaxTokens(error) {
  const text = [
    error?.safeMessage,
    error?.message,
    typeof error === 'string' ? error : null,
    extractProviderMessage(error),
  ].filter(Boolean).join(' ');

  const match = /can only afford\s+([\d,]+)/i.exec(text);
  if (!match) return null;

  const tokens = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : null;
}

/**
 * Every configured provider was tried and none produced a usable response.
 * This is what reaches the caller, so it carries a per-provider audit trail
 * while deliberately withholding keys, headers, and raw provider bodies.
 */
/**
 * Pull the provider's own explanation out of an error body.
 *
 * axios only reports "Request failed with status code 404", which hides the
 * single most useful sentence available — Google's "This model ... is no longer
 * available to new users", OpenRouter's "no endpoints found for <model>". Every
 * provider here uses one of these shapes, so try them in order.
 */
export function extractProviderMessage(error) {
  const data = error?.response?.data;
  if (!data) return null;
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 2000);
  const candidates = [
    data?.error?.message,
    typeof data?.error === 'string' ? data.error : null,
    data?.error?.status,
    data?.message,
    data?.detail,
  ];
  return candidates.find((c) => typeof c === 'string' && c.trim()) || null;
}

/**
 * Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds.
 *
 * Rate limits are the one failure a short fixed backoff cannot fix: a
 * per-minute quota needs seconds, not the ~250ms that is right for a 5xx. When
 * the server states when to come back, obeying it beats guessing.
 */
export function parseRetryAfterMs(headers, text = '') {
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After']
    ?? headers?.['x-ratelimit-reset-after'] ?? headers?.['x-ratelimit-reset'];
  if (raw === undefined || raw === null || raw === '') {
    // Google sends no Retry-After header but does state the delay in the body:
    // "Please retry in 18.065878778s." Honouring it beats a guessed backoff.
    const hinted = /please retry in\s+([\d.]+)\s*s/i.exec(String(text));
    if (hinted) {
      const ms = Math.round(parseFloat(hinted[1]) * 1000);
      if (Number.isFinite(ms)) return Math.max(0, Math.min(ms, 60000));
    }
    return null;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    if (seconds <= 0) return 0;
    // Never stall a user request longer than a sane slice of the AI budget.
    return Math.min(seconds * 1000, 60000);
  }

  const asDate = Date.parse(String(raw));
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, Math.min(asDate - Date.now(), 60000));
}

export class AIAllProvidersFailedError extends AIError {
  constructor({ operation, attempts = [], message } = {}) {
    const summary = attempts
      .map(a => `${a.provider}: ${a.category}${a.httpStatus ? ` (HTTP ${a.httpStatus})` : ''}`)
      .join('; ') || 'no providers configured';

    super({
      category: AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED,
      message: message || `All AI providers failed for "${operation || 'unknown'}". Attempts — ${summary}.`,
      provider: attempts.at(-1)?.provider || null,
      model: attempts.at(-1)?.model || null,
      httpStatus: attempts.at(-1)?.httpStatus ?? null,
      operation,
    });

    this.name = 'AIAllProvidersFailedError';
    this.code = 'AI_ALL_PROVIDERS_FAILED';
    this.operation = operation;
    // Callers record the category under `error`; accept `category` too so a
    // hand-built attempts array cannot silently lose its audit trail.
    this.attempts = attempts.map((a) => ({
      provider: a.provider,
      model: a.model ?? null,
      error: a.error ?? a.category ?? AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
      httpStatus: a.httpStatus ?? null,
      retryCount: a.retryCount ?? 0,
      latencyMs: a.latencyMs ?? null,
      // Provider messages can echo request internals; only the category is
      // guaranteed secret-free.
      safeMessage: sanitizeSecretText(a.safeMessage || ''),
    }));
  }
}

export default AIError;
