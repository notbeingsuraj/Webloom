import dotenv from 'dotenv';

dotenv.config();

// Either name satisfies the requirement — OPENCODE_API_KEY is current,
// OMNIROUTE_API_KEY is the legacy name still honoured above.
if (!process.env.OPENCODE_API_KEY && !process.env.OMNIROUTE_API_KEY) {
  console.error('\n❌ Missing required environment variable: OPENCODE_API_KEY');
  console.error('   Create a key at https://opencode.ai/auth and set it in apps/api/.env');
  console.error('   (OMNIROUTE_API_KEY is still accepted as a legacy alias.)\n');
  process.exit(1);
}

export const config = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  debugBusinessAnalysis: process.env.DEBUG_BUSINESS_ANALYSIS === 'true',
  database: {
    sqlitePath: process.env.SQLITE_DATABASE_PATH || './webloom.db',
  },
  ai: {
    primaryModel: process.env.AI_PRIMARY_MODEL || null,
    // Fallback model used when the primary model fails or times out.
    // Defaults to the OpenCode fast model — a resilient, low-latency model
    // that is present in the OpenCode catalog.
    fallbackModel: process.env.AI_FALLBACK_MODEL || null,
    // AI generation timeout — distinct from the extraction timeout. Heavy
    // reasoning calls (brand DNA, digital audit) routinely exceed the 15s
    // extraction budget, so coupling them forced every enrichment to degrade.
    // 90s gives long-running reasoning models room while still failing fast
    // on a dead gateway.
    timeout: parseInt(process.env.AI_TIMEOUT_MS) || 90000,
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
    // Crawl the business's own website during enrichment to fill contact and
    // location gaps. Disable with AI_OFFICIAL_WEBSITE=false.
    officialWebsiteEnrichment: process.env.AI_OFFICIAL_WEBSITE !== 'false',
    // Minimum name similarity before a crawled page is accepted as belonging to
    // the business we researched (guards against a hallucinated domain).
    officialWebsiteNameMatch: parseFloat(process.env.AI_OFFICIAL_WEBSITE_NAME_MATCH) || 0.75,
    // How many AI-proposed domains to probe when no website is known.
    officialWebsiteMaxCandidates: parseInt(process.env.AI_OFFICIAL_WEBSITE_MAX_CANDIDATES) || 3,
    // At boot, spend one max_tokens:1 completion to confirm the AI key actually
    // authenticates and that the configured model is routable on
    // /chat/completions. The model catalog endpoint is served unauthenticated,
    // so without this the server reports "reachable" while every real AI call
    // 401s. Costs one token per boot; set to false to skip the check.
    probeVerifyAuth: process.env.AI_PROBE_VERIFY_AUTH !== 'false',
  },
  opencode: {
    // OPENCODE_* is the current name. OMNIROUTE_* is accepted as a legacy
    // fallback so existing .env files and deploys keep working. OPENCODE_* is
    // deliberately checked FIRST: dotenv never overrides a variable that is
    // already exported, so a stale exported OMNIROUTE_API_KEY would otherwise
    // shadow a good key in .env and silently 401 every AI call.
    apiKey: process.env.OPENCODE_API_KEY || process.env.OMNIROUTE_API_KEY,
    baseUrl: process.env.OPENCODE_BASE_URL
      || process.env.OMNIROUTE_BASE_URL
      || 'https://opencode.ai/zen/v1',
    models: {
      fast: process.env.OPENCODE_FAST_MODEL
        || process.env.OMNIROUTE_FAST_MODEL
        || 'gemini-3.8-flash',
      reasoning: process.env.OPENCODE_REASONING_MODEL
        || process.env.OMNIROUTE_REASONING_MODEL
        || 'claude-sonnet-5',
      coding: process.env.OPENCODE_CODING_MODEL
        || process.env.OMNIROUTE_CODING_MODEL
        || 'claude-sonnet-5',
      copywriting: process.env.OPENCODE_COPYWRITING_MODEL
        || process.env.OMNIROUTE_COPYWRITING_MODEL
        || 'gemini-3.8-flash',
      vision: process.env.OPENCODE_VISION_MODEL
        || process.env.OMNIROUTE_VISION_MODEL
        || 'gemini-3.8-flash',
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

// Deprecated alias, kept so existing callers and tests that read
// `config.omniroute` keep working. This MUST be the same object reference (not
// a spread copy) — callers mutate it, e.g.
// `config.omniroute.models = {...}` in test_provider_router.js, and a copied
// object would silently detach those overrides from config.opencode.
config.omniroute = config.opencode;
