import express from 'express';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';
import aiService from '../services/AIService.js';
import aiHealthService from '../services/ai/AIHealthService.js';

const router = express.Router();

function dbStatus() {
  try {
    return getDb() ? 'ok' : 'unavailable';
  } catch {
    return 'error';
  }
}

/**
 * GET /health
 * Basic liveness. Intentionally cheap — no AI probes here.
 */
router.get('/', (req, res) => {
  const status = dbStatus();
  res.json({
    status: status === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0',
    services: {
      database: status,
      // Count only, never key material. Per-provider detail is on /health/ai.
      aiProvidersConfigured: aiService.getChainSummary()
        .providers.filter((p) => p.configured).length,
      geoapify: config.geoapify.apiKey ? 'configured' : 'optional',
    },
  });
});

/**
 * GET /health/ai
 *
 * Per-provider AI health. Reports four distinct facts per provider and never
 * exposes keys, headers, or raw provider bodies:
 *
 *   configured    — required settings exist (no network call)
 *   reachable     — the provider host answered
 *   authenticated — the provider accepted our credentials
 *   usable        — a real request against the configured model succeeded
 *
 * @query force=1 bypass the cache and re-probe every provider.
 */
router.get('/ai', async (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  const health = await aiHealthService.getHealth({ force });

  // AI being fully unavailable is `degraded`, not `unavailable`: the rest of
  // the API (DB, providers, caching) is still serving. Callers that depend on
  // AI should read status/providers, not the HTTP code alone.
  const httpStatus = health.status === 'healthy' ? 200 : 503;

  res.status(httpStatus).json({
    status: health.status,
    checkedAt: health.checkedAt,
    chain: health.chain,
    order: { primary: health.primary, secondary: health.secondary, fallback: health.fallback },
    policy: { timeoutMs: health.timeoutMs, maxRetries: health.maxRetries },
    providers: health.providers,
  });
});

/**
 * GET /health/detailed
 * Full dependency status including the AI chain.
 */
router.get('/detailed', async (req, res) => {
  const status = dbStatus();
  const health = await aiHealthService.getHealth();

  const checks = {
    server: { status: 'ok', timestamp: new Date().toISOString() },
    database: { status },
    // "ok" only when every configured provider is genuinely usable. A degraded
    // AI chain is reported honestly rather than being flattened to "configured".
    aiProviders: {
      status: health.status === 'healthy' ? 'ok' : health.status,
      chain: health.chain,
      providers: Object.values(health.providers).map((p) => ({
        provider: p.provider,
        configured: p.configured,
        reachable: p.reachable,
        authenticated: p.authenticated,
        usable: p.usable,
        detail: p.detail,
        // Present only on a credit rejection. This is the number that turns
        // "AI is broken" into "add credits, or lower AI_*_MODEL budgets".
        ...(p.affordableMaxTokens != null
          ? { affordableMaxTokens: p.affordableMaxTokens }
          : {}),
      })),
    },
    geoapify: { status: config.geoapify.apiKey ? 'configured' : 'optional' },
    rateLimit: {
      windowMs: config.rateLimit.windowMs,
      maxRequests: config.rateLimit.maxRequests,
    },
  };

  const okStates = new Set(['ok', 'configured', 'optional']);
  const allOk = Object.values(checks).every((c) =>
    typeof c.status === 'string' ? okStates.has(c.status) : true);

  res.status(allOk ? 200 : 503).json({
    overall: allOk ? 'healthy' : 'degraded',
    checks,
  });
});

export default router;
