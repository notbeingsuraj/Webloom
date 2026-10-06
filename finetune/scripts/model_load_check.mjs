#!/usr/bin/env node
/**
 * Model load check — reports whether a fine-tuned Webloom registry model is
 * resolvable and would be served by the local OpenAI-compatible backend.
 *
 * Usage:
 *   node finetune/scripts/model_load_check.mjs [--model <registryId>] [--check-configured]
 *
 * Exit codes:
 *   0 — record resolved (and, with --check-configured, would actually serve)
 *   2 — record missing or unservable
 */
import path from 'node:path';
import { REPO_ROOT } from '../../apps/api/src/ai/paths.js';
import { getModel } from '../../apps/api/src/ai/modelRegistry.js';
import { createProvider } from '../../apps/api/src/ai/providers/index.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--check-configured') args.checkConfigured = true;
  }
  return args;
}

async function main() {
  const { model = 'webloom-ai-v0.1.0', checkConfigured = false } = parseArgs(process.argv.slice(2));
  const record = getModel(model);
  if (!record) {
    console.error(`registry: model "${model}" not found in ${path.join(REPO_ROOT, 'models/registry.json')}`);
    process.exit(2);
  }
  const provider = createProvider('webloom', { modelId: model });
  console.log(`registry: ${record.id}`);
  console.log(`  status      : ${record.status}`);
  console.log(`  foundation  : ${record.foundationModel}`);
  console.log(`  serving     : ${record.servingModel || record.foundationModel}`);
  console.log(`  quantization: ${record.quantization || 'none'}`);
  console.log(`  provider    : ${provider.name} (${provider.type})`);
  console.log(`  isConfigured: ${provider.isConfigured()}`);

  if (checkConfigured && !provider.isConfigured()) {
    console.error('  ✗ not servable. Serve the merged base+adapter via a LOCAL_AI_BASE_URL/API key, or check status is candidate/active-production.');
    process.exit(2);
  }
  if (checkConfigured) {
    console.log('  ✓ model resolves and local backend is configured — can serve requests.');
  } else if (record.status === 'configured') {
    console.log('  note: status "configured" = package ready, adapter not yet trained. No serving claim.');
  }
}

main().finally(() => {});