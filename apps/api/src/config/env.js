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
  process.env.MERCURY_API_KEY || process.env.NVIDIA_API_KEY || process.env.LOCAL_AI_BASE_URL ||
  process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY ||
  process.env.TOGETHER_API_KEY || process.env.FIREWORKS_API_KEY || process.env.HF_API_KEY,
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
    primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'mercury',
    secondaryProvider: process.env.AI_SECONDARY_PROVIDER || 'nvidia',
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'nvidia',

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
      nvidia: {
        enabled: process.env.NVIDIA_API_KEY ? true : false,
        apiKey: process.env.NVIDIA_API_KEY || null,
        baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b',
        timeoutMs: parseInt(process.env.NVIDIA_TIMEOUT_MS) || 60000,
        // Per-operation model overrides
        operationModels: {
          extraction: process.env.NVIDIA_EXTRACTION_MODEL || null,
          brand: process.env.NVIDIA_BRAND_MODEL || null,
          audit: process.env.NVIDIA_AUDIT_MODEL || null,
          reasoning: process.env.NVIDIA_REASONING_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b',
        },
      },
      deepseek: {
        enabled: process.env.DEEPSEEK_API_KEY ? true : false,
        apiKey: process.env.DEEPSEEK_API_KEY || null,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        timeoutMs: parseInt(process.env.DEEPSEEK_TIMEOUT_MS) || 30000,
        reasoningModel: process.env.DEEPSEEK_REASONING_MODEL || 'deepseek-reasoner',
        operationModels: {
          extraction: process.env.DEEPSEEK_EXTRACTION_MODEL || 'deepseek-chat',
          brand: process.env.DEEPSEEK_BRAND_MODEL || 'deepseek-reasoner',
          audit: process.env.DEEPSEEK_AUDIT_MODEL || 'deepseek-reasoner',
        },
      },
      together: {
        enabled: process.env.TOGETHER_API_KEY ? true : false,
        apiKey: process.env.TOGETHER_API_KEY || null,
        baseUrl: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
        model: process.env.TOGETHER_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        timeoutMs: parseInt(process.env.TOGETHER_TIMEOUT_MS) || 30000,
        reasoningModel: process.env.TOGETHER_REASONING_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      },
      fireworks: {
        enabled: process.env.FIREWORKS_API_KEY ? true : false,
        apiKey: process.env.FIREWORKS_API_KEY || null,
        baseUrl: process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1',
        model: process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        timeoutMs: parseInt(process.env.FIREWORKS_TIMEOUT_MS) || 30000,
        reasoningModel: process.env.FIREWORKS_REASONING_MODEL || 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      },
      huggingface: {
        enabled: process.env.HF_API_KEY ? true : false,
        apiKey: process.env.HF_API_KEY || null,
        baseUrl: process.env.HF_BASE_URL || 'https://api-inference.huggingface.co',
        model: process.env.HF_MODEL || 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        timeoutMs: parseInt(process.env.HF_TIMEOUT_MS) || 60000,
        endpointUrl: process.env.HF_ENDPOINT_URL || null,
      },
      local: {
        // Opt-in. A local server is a bonus, never a dependency, so this stays
        // enabled-by-configured rather than required.
        enabled: process.env.LOCAL_AI_BASE_URL ? true : false,
        apiKey: process.env.LOCAL_AI_API_KEY || null,
        baseUrl: process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1',
        model: process.env.LOCAL_AI_MODEL || 'llama3.1:8b',
        timeoutMs: parseInt(process.env.LOCAL_AI_TIMEOUT_MS) || 120000,
        label: 'Local AI',
        // Ollama/LM Studio/llama.cpp usually need no key; set
        // LOCAL_AI_REQUIRES_API_KEY=true for servers that do.
        requiresApiKey: process.env.LOCAL_AI_REQUIRES_API_KEY === 'true',
      },
      mercury: {
        enabled: process.env.MERCURY_API_KEY ? true : false,
        apiKey: process.env.MERCURY_API_KEY || null,
        baseUrl: process.env.MERCURY_BASE_URL || 'https://api.inceptionlabs.ai/v1',
        model: process.env.MERCURY_MODEL || 'mercury-3',
        timeoutMs: parseInt(process.env.MERCURY_TIMEOUT_MS) || 30000,
      },
      selfhosted: {
        enabled: process.env.SELF_HOSTED_BASE_URL ? true : false,
        apiKey: process.env.SELF_HOSTED_API_KEY || null,
        baseUrl: process.env.SELF_HOSTED_BASE_URL || 'http://localhost:8000/v1',
        model: process.env.SELF_HOSTED_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        timeoutMs: parseInt(process.env.SELF_HOSTED_TIMEOUT_MS) || 60000,
        label: 'Self-Hosted',
        requiresApiKey: process.env.SELF_HOSTED_REQUIRES_API_KEY === 'true',
      },
    },

    // Mercury provider configuration
    mercury: {
      enabled: process.env.MERCURY_API_KEY ? true : false,
      apiKey: process.env.MERCURY_API_KEY || null,
      baseUrl: process.env.MERCURY_BASE_URL || 'https://api.inceptionlabs.ai/v1',
      model: process.env.MERCURY_MODEL || 'mercury-3',
      timeoutMs: parseInt(process.env.MERCURY_TIMEOUT_MS) || 30000,
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

    // ---- Orchestrator Configuration ----
    // Cost phase: free | controlled | production
    costPhase: process.env.AI_COST_PHASE || 'free',
    // Monthly budget in USD
    monthlyBudgetUSD: parseInt(process.env.AI_MONTHLY_BUDGET_USD) || 50,
    // Disable all paid providers (free-tier only mode)
    disablePaidProviders: process.env.AI_DISABLE_PAID_PROVIDERS === 'true',
    // Prefer free-tier models when available
    preferFreeTier: process.env.AI_PREFER_FREE_TIER !== 'false',
    // Free tier alert threshold (0.8 = 80%)
    freeTierAlertThreshold: parseFloat(process.env.AI_FREE_TIER_ALERT_THRESHOLD) || 0.8,
    // Cost tracking enabled
    costTrackingEnabled: process.env.AI_COST_TRACKING_ENABLED !== 'false',
    // Daily cost alert threshold (USD)
    costAlertThresholdUSD: parseFloat(process.env.AI_COST_ALERT_THRESHOLD_USD) || 10,
    // Cost projection enabled
    costProjectionEnabled: process.env.AI_COST_PROJECTION_ENABLED !== 'false',

    // Capability-specific budgets (optional, override defaults)
    maxCostBusinessExtraction: parseFloat(process.env.AI_MAX_COST_BUSINESS_EXTRACTION) || 0.001,
    maxCostBusinessResearch: parseFloat(process.env.AI_MAX_COST_BUSINESS_RESEARCH) || 0.010,
    maxCostEntityResolution: parseFloat(process.env.AI_MAX_COST_ENTITY_RESOLUTION) || 0.0005,
    maxCostReviewAnalysis: parseFloat(process.env.AI_MAX_COST_REVIEW_ANALYSIS) || 0.001,
    maxCostSentimentClassification: parseFloat(process.env.AI_MAX_COST_SENTIMENT_CLASSIFICATION) || 0.0003,
    maxCostCompetitorAnalysis: parseFloat(process.env.AI_MAX_COST_COMPETITOR_ANALYSIS) || 0.005,
    maxCostTrendClassification: parseFloat(process.env.AI_MAX_COST_TREND_CLASSIFICATION) || 0.003,
    maxCostReportGeneration: parseFloat(process.env.AI_MAX_COST_REPORT_GENERATION) || 0.020,
    maxCostStructuredOutput: parseFloat(process.env.AI_MAX_COST_STRUCTURED_OUTPUT) || 0.001,

    // Latency SLA per capability (milliseconds)
    maxLatencyBusinessExtraction: parseInt(process.env.AI_MAX_LATENCY_BUSINESS_EXTRACTION) || 5000,
    maxLatencyBusinessResearch: parseInt(process.env.AI_MAX_LATENCY_BUSINESS_RESEARCH) || 30000,
    maxLatencyEntityResolution: parseInt(process.env.AI_MAX_LATENCY_ENTITY_RESOLUTION) || 3000,
    maxLatencyReviewAnalysis: parseInt(process.env.AI_MAX_LATENCY_REVIEW_ANALYSIS) || 5000,
    maxLatencySentimentClassification: parseInt(process.env.AI_MAX_LATENCY_SENTIMENT_CLASSIFICATION) || 2000,
    maxLatencyCompetitorAnalysis: parseInt(process.env.AI_MAX_LATENCY_COMPETITOR_ANALYSIS) || 20000,
    maxLatencyTrendClassification: parseInt(process.env.AI_MAX_LATENCY_TREND_CLASSIFICATION) || 15000,
    maxLatencyReportGeneration: parseInt(process.env.AI_MAX_LATENCY_REPORT_GENERATION) || 45000,
    maxLatencyStructuredOutput: parseInt(process.env.AI_MAX_LATENCY_STRUCTURED_OUTPUT) || 5000,

    // Per-provider budget overrides (JSON: {"openrouter": 20, "nvidia": 15, "deepseek": 15})
    providerBudgets: process.env.AI_PROVIDER_BUDGETS ? JSON.parse(process.env.AI_PROVIDER_BUDGETS) : {},

    // Resilience
    circuitBreakerThreshold: parseInt(process.env.AI_CIRCUIT_BREAKER_THRESHOLD) || 5,
    circuitBreakerTimeout: parseInt(process.env.AI_CIRCUIT_BREAKER_TIMEOUT) || 60000,
    circuitBreakerSuccessThreshold: parseInt(process.env.AI_CIRCUIT_BREAKER_SUCCESS_THRESHOLD) || 2,
    cooldownBaseMs: parseInt(process.env.AI_COOLDOWN_BASE_MS) || 30000,
    cooldownMaxMs: parseInt(process.env.AI_COOLDOWN_MAX_MS) || 600000,
    cooldownMultiplier: parseFloat(process.env.AI_COOLDOWN_MULTIPLIER) || 2,
    retryBaseDelayMs: parseInt(process.env.AI_RETRY_BASE_DELAY_MS) || 250,
    retryMaxDelayMs: parseInt(process.env.AI_RETRY_MAX_DELAY_MS) || 5000,
    retryJitterMs: parseInt(process.env.AI_RETRY_JITTER_MS) || 250,

    // Cost & Free Tier
    costPhase: process.env.AI_COST_PHASE || 'free',
    monthlyBudgetUSD: parseInt(process.env.AI_MONTHLY_BUDGET_USD) || 50,
    disablePaidProviders: process.env.AI_DISABLE_PAID_PROVIDERS === 'true',
    preferFreeTier: process.env.AI_PREFER_FREE_TIER !== 'false',
    freeTierAlertThreshold: parseFloat(process.env.AI_FREE_TIER_ALERT_THRESHOLD) || 0.8,
    costTrackingEnabled: process.env.AI_COST_TRACKING_ENABLED !== 'false',
    costAlertThresholdUSD: parseFloat(process.env.AI_COST_ALERT_THRESHOLD_USD) || 10,
    costProjectionEnabled: process.env.AI_COST_PROJECTION_ENABLED !== 'false',

    // Feature flags
    officialWebsiteEnrichment: process.env.AI_OFFICIAL_WEBSITE !== 'false',
    groundingEnforce: process.env.AI_GROUNDING_ENFORCE !== 'false',
    costPhase: process.env.AI_COST_PHASE || 'free',
    disablePaidProviders: process.env.AI_DISABLE_PAID_PROVIDERS === 'true',
    debugBusinessAnalysis: process.env.DEBUG_BUSINESS_ANALYSIS === 'true',
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
  googleMapsScraper: {
    enabled: process.env.GOOGLE_MAPS_SCRAPER_ENABLED === 'true',
    baseUrl: process.env.GOOGLE_MAPS_SCRAPER_URL || 'http://localhost:8080',
    timeoutMs: parseInt(process.env.GOOGLE_MAPS_SCRAPER_TIMEOUT_MS) || 180000,
    concurrency: parseInt(process.env.GOOGLE_MAPS_SCRAPER_CONCURRENCY) || 2,
    maxResults: parseInt(process.env.GOOGLE_MAPS_SCRAPER_MAX_RESULTS) || 100,
    jobRetries: parseInt(process.env.GOOGLE_MAPS_SCRAPER_JOB_RETRIES) || 2,
    emailExtraction: process.env.GOOGLE_MAPS_SCRAPER_EMAIL_EXTRACTION === 'true',
    extraReviews: process.env.GOOGLE_MAPS_SCRAPER_EXTRA_REVIEWS === 'true',
  },
  // Geoapify configuration (DEPRECATED - Replaced by Google Maps Scraper)
  // Kept for reference but not used in active pipeline
  geoapify: {
    apiKey: process.env.GEOAPIFY_API_KEY || null,
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