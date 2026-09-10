import express from 'express';
import { config } from '../config/env.js';
import { getDb } from '../db/client.js';

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
      omniRoute: config.omniroute.apiKey ? 'configured' : 'missing',
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

  const checks = {
    server: { status: 'ok', timestamp: new Date().toISOString() },
    database: { status: dbStatus },
    omniRoute: { status: config.omniroute.apiKey ? 'configured' : 'missing' },
    geoapify: { status: config.geoapify.apiKey ? 'configured' : 'optional' },
    rateLimit: {
      windowMs: config.rateLimit.windowMs,
      maxRequests: config.rateLimit.maxRequests,
    },
  };

  const allOk = Object.values(checks).every(c =>
    typeof c.status === 'string' ? (c.status === 'ok' || c.status === 'configured' || c.status === 'optional') : true
  );

  res.status(allOk ? 200 : 503).json({
    overall: allOk ? 'healthy' : 'degraded',
    checks,
  });
});

export default router;