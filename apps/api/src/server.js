import app from './app.js';
import { config } from './config/env.js';
import { initializeDatabase } from './db/client.js';
import aiService from './services/AIService.js';

const PORT = config.port;

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
    const omniStatus = config.omniroute.apiKey ? '✅ configured' : '❌ missing';
    const geoStatus = config.geoapify.apiKey ? '✅ configured' : '⚠️  not configured (optional)';
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  🚀  WEBLOOM SERVER STARTED');
    console.log('═══════════════════════════════════════════');
    console.log(`  Port:        ${PORT}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Database:    ${dbReady ? '✅ ready' : '⚠️  not ready'}`);
    console.log(`  OmniRoute:   ${omniStatus}`);
    console.log(`  Geoapify:    ${geoStatus}`);
    console.log(`  Frontend:    ${config.frontendUrl}`);
    console.log(`  Health:      http://localhost:${PORT}/health`);
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Non-fatal gateway probe: surface OmniRoute auth/reachability problems at
    // boot so a misconfigured key or gateway down is visible in the startup log
    // instead of manifesting as slow per-request timeouts/401s downstream.
    aiService.probeGateway().then((probe) => {
      console.log(`  AI Gateway:  ${probe.ok ? '✅ ' + probe.message : '❌ ' + probe.message}`);
      console.log('');
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
