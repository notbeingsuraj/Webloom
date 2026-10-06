import dotenv from 'dotenv';

dotenv.config();

/**
 * No AI key is hard-required at boot.
 *
 * The previous design exited the process when the single gateway key was
 * absent, which made the API unusable for every non-AI feature (caching, DB,
 * providers) whenever AI happened to be misconfigured. AI is now one of three
 * independent providers: at least one usable provider is required for AI
 * features, and /health/ai reports exactly which are available.
 */
const hasAnyAIProviderKey = Boolean(
  process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.LOCAL_AI_BASE_URL,
);

export const config = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  debugBusinessAnalysis: process.env.DEBUG_BUSINESS_ANALYSIS === 'true',
  database: {
    sqlitePath: process.env.SQLITE_DATABASE_PATH || './webloom.db',
  },
  ai: {
    // ---- Chain definition (single source of truth) ----
    // Provider names are declared ONLY here. No other module names a vendor.
    primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'openrouter',
    secondaryProvider: process.env.AI_SECONDARY_PROVIDER || 'gemini',
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'local',

    // Hard ceiling on any single AI request. Brand DNA and digital audit are
    // long-running, so this is separate from the (much shorter) extraction
    // timeout, but it is still a hard timeout: nothing may hang indefinitely.
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 30000,

    // Bounded retries per provider, applied only to retryable categories
    // (timeout / 429 / 5xx / connection). 1 => at most 2 attempts per provider.
    maxRetries: process.env.AI_MAX_RETRIES != null
      ? Math.max(0, parseInt(process.env.AI_MAX_RETRIES))
      : 1,

    // Ceiling for one generate() call across EVERY provider and every retry.
    // Without this, three providers x two attempts x timeoutMs can hold a user
    // request open for minutes. Each attempt is additionally clamped to what is
    // left of this budget, so a slow provider cannot starve the chain.
    maxTotalMs: parseInt(process.env.AI_MAX_TOTAL_MS) || 90000,

    // How many times one provider may re-dispatch a request at a smaller
    // max_tokens after a credit pre-flight rejection (HTTP 402). Providers
    // bill actual usage, not the requested ceiling, so shrinking the request
    // is free; it just has to fit the remaining balance. 1 is enough: a second
    // clamp on the same shrinking balance is not a different outcome.
    maxTokenDowngrades: process.env.AI_MAX_TOKEN_DOWNGRADES != null
      ? Math.max(0, parseInt(process.env.AI_MAX_TOKEN_DOWNGRADES))
      : 1,

    // Completion ceiling used by the /health probes. This is the single most
    // important number in this file for diagnosis: a probe asking for 1 token
    // passes on an account that cannot fund any real request, which is how the
    // gateway reported "ok" while every call failed with HTTP 402. Sized to the
    // heaviest real operation (brand DNA, 6000) so `usable: true` means "this
    // provider can serve our heaviest operation" — the reading an operator
    // assumes. Free either way: providers bill generated tokens, and the probe
    // stops after one token regardless of the ceiling it is offered.
    probeMaxTokens: parseInt(process.env.AI_PROBE_MAX_TOKENS) || 6000,

    // Legacy single-model overrides, retained so existing deployments that set
    // AI_PRIMARY_MODEL / AI_FALLBACK_MODEL keep a single consistent model.
    primaryModel: process.env.AI_PRIMARY_MODEL || null,
    fallbackModel: process.env.AI_FALLBACK_MODEL || null,

    // ---- Provider definitions ----
    providers: {
      openrouter: {
        enabled: process.env.OPENROUTER_API_KEY ? true : false,
        apiKey: process.env.OPENROUTER_API_KEY || null,
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.OPENROUTER_MODEL || null,
        timeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS) || null,
        appUrl: process.env.OPENROUTER_APP_URL || 'https://webloom.dev',
        appName: process.env.OPENROUTER_APP_NAME || 'Webloom',
        requiresApiKey: true,
        // Per-operation model overrides (brand/audit/extraction). Absent by
        // default so the common case stays one model per provider.
        operationModels: {
          extraction: process.env.OPENROUTER_EXTRACTION_MODEL || null,
          brand: process.env.OPENROUTER_BRAND_MODEL || null,
          audit: process.env.OPENROUTER_AUDIT_MODEL || null,
        },
      },
      gemini: {
        enabled: process.env.GEMINI_API_KEY ? true : false,
        apiKey: process.env.GEMINI_API_KEY || null,
        baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
        model: process.env.GEMINI_MODEL || null,
        timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS) || null,
        operationModels: {
          extraction: process.env.GEMINI_EXTRACTION_MODEL || null,
          brand: process.env.GEMINI_BRAND_MODEL || null,
          audit: process.env.GEMINI_AUDIT_MODEL || null,
        },
      },
      local: {
        // Opt-in. A local server is a bonus, never a dependency, so this stays
        // enabled-by-configured rather than required.
        enabled: process.env.LOCAL_AI_BASE_URL ? true : false,
        apiKey: process.env.LOCAL_AI_API_KEY || null,
        baseUrl: process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1',
        model: process.env.LOCAL_AI_MODEL || null,
        timeoutMs: parseInt(process.env.LOCAL_AI_TIMEOUT_MS) || null,
        label: 'Local AI',
        // Ollama/LM Studio/llama.cpp usually need no key; set
        // LOCAL_AI_REQUIRES_API_KEY=true for servers that do.
        requiresApiKey: process.env.LOCAL_AI_REQUIRES_API_KEY === 'true',
      },
    },

    // At boot, spend one max_tokens:1 call per provider to confirm the key is
    // accepted and the model is routable. A model catalog listing proves
    // neither, which is how a dead key previously looked healthy at boot.
    // Costs one token per provider per boot.
    probeVerifyAuth: process.env.AI_PROBE_VERIFY_AUTH !== 'false',
    hasAnyProviderKey: hasAnyAIProviderKey,

    // AI enrichment may replace an already-populated value only when that
    // value's confidence sits below this floor. Defaults to 0.5 — high enough
    // that healthy provider data is never second-guessed. Set to 0 to restore
    // strict gap-fill-only behaviour.
    enrichmentOverwriteBelowConfidence: process.env.AI_ENRICHMENT_OVERWRITE_BELOW != null
      ? parseFloat(process.env.AI_ENRICHMENT_OVERWRITE_BELOW)
      : 0.5,
    // An AI value must clear this bar before it is allowed to replace anything,
    // and before any factual (contact/location) AI value is written at all.
    enrichmentMinIncomingConfidence: process.env.AI_ENRICHMENT_MIN_CONFIDENCE != null
      ? parseFloat(process.env.AI_ENRICHMENT_MIN_CONFIDENCE)
      : 0.75,
    // Evidence grounding: reject AI evidence snippets that do not actually
    // occur in the source evidence text (hallucination guard). Default ON.
    // Set AI_GROUNDING_ENFORCE=false to accept model-asserted snippets.
    groundingEnforce: process.env.AI_GROUNDING_ENFORCE !== 'false',
    // Crawl the business's own website during enrichment to fill contact and
    // location gaps. Disable with AI_OFFICIAL_WEBSITE=false.
    officialWebsiteEnrichment: process.env.AI_OFFICIAL_WEBSITE !== 'false',
    // Minimum name similarity before a crawled page is accepted as belonging to
    // the business we researched (guards against a hallucinated domain).
    officialWebsiteNameMatch: parseFloat(process.env.AI_OFFICIAL_WEBSITE_NAME_MATCH) || 0.75,
    // How many AI-proposed domains to probe when no website is known.
    officialWebsiteMaxCandidates: parseInt(process.env.AI_OFFICIAL_WEBSITE_MAX_CANDIDATES) || 3,

    // Baseline evaluation target. The baseline is ONE fixed foundation model —
    // the model registered as active-baseline in models/registry.json. It can
    // be served through any OpenAI-compatible backend already configured:
    //   AI_BASELINE_PROVIDER=local|openrouter   (default 'local'; one backend,
    //                                            never an ordered chain)
    //   AI_BASELINE_MODEL=<serving slug>        (default: the active baseline
    //                                            registry record's serving model)
    //   AI_BASELINE_FORMAT=json_object|json_schema|none
    //     json_object   — plain JSON requested, schema enforced after the fact
    //                     (honest measure of the foundation model's raw JSON)
    //     json_schema   — strict response_format json_schema when the model
    //                     supports it
    //     none          — no response_format at all
    baseline: {
      provider: process.env.AI_BASELINE_PROVIDER || 'local',
      model: process.env.AI_BASELINE_MODEL || null,
      // 'none' (default) measures the model's natural output, which is what a
      // fine-tuned model must imitate. Gateway-forced json_object/json_schema
      // can alter a small base model's behaviour (observed: degraded output
      // shape), so they are opt-in experiment flags, not the baseline.
      format: process.env.AI_BASELINE_FORMAT || 'none',
    },
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  extraction: {
    timeout: parseInt(process.env.EXTRACTION_TIMEOUT_MS) || 15000,
    maxRetries: parseInt(process.env.EXTRACTION_MAX_RETRIES) || 2,
    userAgent: 'Webloom/1.0 (+https://webloom.dev)',
  },
  geoapify: {
    apiKey: process.env.GEOAPIFY_API_KEY || null,
    // Base endpoints
    baseUrl: process.env.GEOAPIFY_BASE_URL || 'https://api.geoapify.com/v2/places',
    geocodeUrl: process.env.GEOAPIFY_GEOCODE_URL || 'https://api.geoapify.com/v1/geocode/search',
    placeDetailsUrl: process.env.GEOAPIFY_PLACE_DETAILS_URL || 'https://api.geoapify.com/v2/place-details',
    timeout: parseInt(process.env.GEOAPIFY_TIMEOUT_MS) || 10000,
    maxResults: parseInt(process.env.GEOAPIFY_MAX_RESULTS) || 5,
  },
  websiteGeneration: {
    // Local-only generated site management.
    templatesDir: process.env.WEBSITE_TEMPLATES_DIR || null, // resolved later from repo root
    generatedDir: process.env.GENERATED_SITES_DIR || null, // resolved later from repo root
    host: process.env.WEBSITE_HOST || '127.0.0.1',
    basePort: parseInt(process.env.WEBSITE_BASE_PORT) || 4321,
    maxPort: parseInt(process.env.WEBSITE_MAX_PORT) || 4330,
    // Whether to actually run `npm install` (offline-friendly toggle).
    runInstall: process.env.WEBSITE_RUN_INSTALL !== 'false',
  },
};

export default config;
