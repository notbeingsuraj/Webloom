import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['OMNIROUTE_API_KEY'];
const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please check your .env file\n');
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
    // Defaults to the OmniRoute fast combo — a resilient, low-latency model
    // that exists in every OmniRoute catalog.
    fallbackModel: process.env.AI_FALLBACK_MODEL || null,
  },
  omniroute: {
    apiKey: process.env.OMNIROUTE_API_KEY,
    baseUrl: process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1',
    models: {
      fast: process.env.OMNIROUTE_FAST_MODEL || 'auto/best-fast',
      reasoning: process.env.OMNIROUTE_REASONING_MODEL || 'auto/best-coding',
      coding: process.env.OMNIROUTE_CODING_MODEL || 'auto/best-coding',
      copywriting: process.env.OMNIROUTE_COPYWRITING_MODEL || 'auto/best-fast',
      vision: process.env.OMNIROUTE_VISION_MODEL || 'auto/best-vision',
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
