import express from 'express';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';
import aiService from '../services/AIService.js';

const router = express.Router();

/**
 * Health check endpoint
 * Returns basic server status and configuration info
 */
router.get('/', (req, res) => {
  let dbStatus = 'ok';
  try {
    const db = getDb();
    dbStatus = db ? 'ok' : 'unavailable';
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0',
    services: {
      database: dbStatus,
      // "configured" here only means a key string exists. Use /health/detailed
      // for the auth-verified gateway status.
      aiGateway: config.opencode.apiKey ? 'key-present' : 'missing',
      geoapify: config.geoapify.apiKey ? 'configured' : 'optional',
    },
  });
});

/**
 * Detailed health check with dependency status
 */
router.get('/detailed', async (req, res) => {
  let dbStatus = 'ok';
  try {
    const db = getDb();
    dbStatus = db ? 'ok' : 'unavailable';
  } catch {
    dbStatus = 'error';
  }

  // Report the *verified* gateway state, not merely whether a key string is
  // present. A wrong or gateway-mismatched key used to report "configured"
  // here while every AI call 401'd. probeGateway() caches its result at boot,
  // so this costs nothing per request.
  const probe = aiService.getLastProbe();
  let aiStatus;
  if (!config.opencode.apiKey) {
    aiStatus = 'missing';
  } else if (!probe) {
    aiStatus = 'unverified';
  } else if (!probe.ok) {
    aiStatus = 'unusable';
  } else if (!probe.authVerified) {
    aiStatus = 'unverified';
  } else {
    aiStatus = 'ok';
  }

  const checks = {
    server: { status: 'ok', timestamp: new Date().toISOString() },
    database: { status: dbStatus },
    aiGateway: {
      status: aiStatus,
      reachable: probe?.reachable ?? null,
      authVerified: probe?.authVerified ?? null,
      modelCount: probe?.modelCount ?? null,
      detail: probe?.message ?? (config.opencode.apiKey
        ? 'key present, not yet probed'
        : 'OMNIROUTE_API_KEY is not set'),
    },
    geoapify: { status: config.geoapify.apiKey ? 'configured' : 'optional' },
    rateLimit: {
      windowMs: config.rateLimit.windowMs,
      maxRequests: config.rateLimit.maxRequests,
    },
  };

  const okStates = new Set(['ok', 'configured', 'optional']);
  const allOk = Object.values(checks).every(c =>
    typeof c.status === 'string' ? okStates.has(c.status) : true
  );

  res.status(allOk ? 200 : 503).json({
    overall: allOk ? 'healthy' : 'degraded',
    checks,
  });
});

export default router;