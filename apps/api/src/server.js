import app from './app.js';
import { config } from './config/env.js';
import { initializeDatabase } from './db/client.js';
import aiHealthService from './services/ai/AIHealthService.js';

const PORT = config.port;

/**
 * Render the AI provider block.
 *
 * Deliberately distinguishes configured / reachable / authenticated / usable.
 * Reporting a provider as healthy because an env var merely exists is what let
 * a dead key boot cleanly and fail hours later inside a single feature.
 */
function renderAIBlock(health) {
  const line = '─'.repeat(44);
  const rows = [];

  rows.push('');
  rows.push('  AI PROVIDERS');
  rows.push(`  ${line}`);

  for (const provider of health.chain) {
    const p = health.providers[provider] || {};
    const label = p.provider ? p.provider : provider;
    let text;
    if (!p.configured) text = 'not configured';
    else if (p.usable === true) text = 'usable';
    else if (p.usable === false) text = `unusable (${p.detail || 'unknown'})`;
    else text = 'unverified';

    const mark = p.usable === true ? '✅' : p.configured ? '⚠️ ' : '·  ';
    rows.push(`  ${mark} ${String(label).padEnd(12)} ${text}`);
  }

  rows.push('');
  rows.push(`  Primary:     ${health.primary}`);
  rows.push(`  Fallback 1:  ${health.secondary}`);
  rows.push(`  Fallback 2:  ${health.fallback}`);
  rows.push('');
  rows.push('  Gateway:      none (direct provider calls)');
  rows.push(`  Timeout:      ${health.timeoutMs}ms   Max retries: ${health.maxRetries}`);
  rows.push('');

  return rows.join('\n');
}

async function start() {
  // Initialize database before accepting requests
  let dbReady = false;
  try {
    await initializeDatabase();
    dbReady = true;
  } catch (dbErr) {
    console.error('⚠️  Database initialization failed:', dbErr.message);
  }

  const server = app.listen(PORT, () => {
    const geoStatus = config.geoapify.apiKey ? '✅ configured' : '⚠️  not configured (optional)';
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  🚀  WEBLOOM SERVER STARTED');
    console.log('═══════════════════════════════════════════');
    console.log(`  Port:        ${PORT}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Database:    ${dbReady ? '✅ ready' : '⚠️  not ready'}`);
    console.log(`  Geoapify:    ${geoStatus}`);
    console.log(`  Frontend:    ${config.frontendUrl}`);
    console.log(`  Health:      http://localhost:${PORT}/health`);
    console.log(`  AI Health:   http://localhost:${PORT}/health/ai`);
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Non-fatal: probe each provider once so a bad key or dead host is visible
    // at boot rather than as an opaque per-feature failure later.
    aiHealthService.getHealth().then((health) => {
      console.log(renderAIBlock(health));

      if (health.status === 'unavailable') {
        console.error('  ❌ No AI provider is usable. AI features (enrichment, brand DNA,');
        console.error('     digital audit) will fail until a provider is configured.');
      } else if (health.status === 'degraded') {
        console.warn('  ⚠️  AI chain is degraded — see the per-provider detail above.');
      }
      console.log('');
    }).catch((err) => {
      console.warn(`  ⚠️  AI health probe failed: ${err?.message || err}`);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err?.message || err);
    server.close(() => process.exit(1));
  });

  return server;
}

start();
