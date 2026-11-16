import express from 'express';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';
import aiService from '../services/AIService.js';

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
    version: '2.0.0',
    services: {
      database: status,
      aiProvidersConfigured: aiService.getChainSummary()
        .providers.filter((p) => p.configured).length,
      geoapify: config.geoapify.apiKey ? 'configured' : 'optional',
    },
  });
});

/**
 * GET /health/ai
 *
 * Per-provider AI health. Reports detailed facts per provider:
 *
 *   configured    — required settings exist (no network call)
 *   reachable     — the provider host answered
 *   authenticated — the provider accepted our credentials
 *   usable        — a real request against the configured model succeeded
 *   latency       — p50, p95, p99 percentiles
 *   failureRate   — recent failure rate
 *   cooldown      — remaining cooldown time
 *   circuit       — circuit breaker state
 *   quota         — remaining budget
 *
 * @query force=1 bypass the cache and re-probe every provider.
 * @query provider=<name> get detailed health for a specific provider.
 * @query diagnose=1 run full diagnostic for a provider.
 */
router.get('/ai', async (req, res) => {
  const force = req.query.force === '1' || req.query.force === 'true';
  const provider = req.query.provider ?? null;
  const diagnose = req.query.diagnose === '1' || req.query.diagnose === 'true';

  try {
    let health;

    if (provider && diagnose) {
      // Full diagnostic for a specific provider
      health = await aiService.diagnoseProvider(provider);
      return res.json({ success: true, data: health });
    }

    if (provider) {
      // Single provider detailed health
      health = await aiService.getProviderHealth(provider);
      return res.json({ success: true, data: health });
    }

    // Full AI health
    health = await aiService.getAIHealthDetailed({ force });

    // AI being fully unavailable is `degraded`, not `unavailable`: the rest of
    // the API (DB, providers, caching) is still serving. Callers that depend on
    // AI should read status/providers, not the HTTP code alone.
    const httpStatus = health.status === 'healthy' ? 200 : 503;

    res.status(httpStatus).json({
      success: true,
      status: health.status,
      checkedAt: health.checkedAt,
      chain: health.chain,
      order: { primary: health.primary, secondary: health.secondary, fallback: health.fallback },
      policy: { timeoutMs: health.timeoutMs, maxRetries: health.maxRetries },
      providers: health.providers,
      capabilities: health.capabilities,
      telemetry: health.telemetry,
    });
  } catch (error) {
    console.error('[health/ai] Error:', error);
    res.status(500).json({
      success: false,
      error: 'health_check_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/ai/diagnose
 * Run diagnostic for a specific provider.
 */
router.get('/ai/diagnose', async (req, res) => {
  const provider = req.query.provider;
  if (!provider) {
    return res.status(400).json({
      success: false,
      error: 'provider_required',
      message: 'provider query parameter is required',
    });
  }

  try {
    const health = await aiService.diagnoseProvider(provider);
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'diagnostic_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/ai/capabilities
 * Get capability routing policies.
 */
router.get('/ai/capabilities', async (req, res) => {
  try {
    const capabilities = aiService.orchestrator.capabilityRouter._policies;
    res.json({ success: true, data: capabilities });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'capabilities_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/ai/costs
 * Get cost tracking summary.
 */
router.get('/ai/costs', async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const summary = aiService.getCostSummary(period);
    const projection = aiService.getCostProjection();
    const budget = aiService.getBudgetStatus();
    const byCapability = aiService.getCostByCapability();
    const byProvider = aiService.getCostByProvider();

    res.json({
      success: true,
      data: {
        period,
        summary,
        projection,
        budget,
        byCapability,
        byProvider,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'costs_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/ai/budget
 * Get budget status.
 */
router.get('/ai/budget', async (req, res) => {
  try {
    const budget = aiService.getBudgetStatus();
    res.json({ success: true, data: budget });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'budget_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health/detailed
 * Full dependency status including the AI chain.
 */
router.get('/detailed', async (req, res) => {
  const status = dbStatus();
  const health = await aiService.getAIHealthDetailed();

  const checks = {
    server: { status: 'ok', timestamp: new Date().toISOString() },
    database: { status },
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
        latencyP50Ms: p.latencyP50Ms,
        latencyP95Ms: p.latencyP95Ms,
        latencyP99Ms: p.latencyP99Ms,
        failureRate: p.failureRate,
        cooldownRemainingSeconds: p.cooldownRemainingSeconds,
        circuitState: p.circuitState,
        lastSuccess: p.lastSuccess,
        lastFailure: p.lastFailure,
        lastError: p.lastError,
        totalRequests: p.totalRequests,
        successfulRequests: p.successfulRequests,
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