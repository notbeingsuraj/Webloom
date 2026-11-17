import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { resolveProviderOrder } from './src/services/ai/AIProviderFactory.js';
import { createProvider } from './src/ai/providers/index.js';

const order = resolveProviderOrder(config.ai);
console.log('order:', order);

for (const name of order) {
  const providerConfig = config.ai.providers[name] || {};
  console.log(`\n--- ${name} ---`);
  console.log('providerConfig.apiKey:', providerConfig.apiKey ? 'SET' : 'NULL');
  
  const provider = createProvider(name, providerConfig, config.ai.timeoutMs, config.ai.probeMaxTokens);
  console.log('Created:', provider.name);
  console.log('isConfigured:', provider.isConfigured());
  console.log('apiKey:', provider.config.apiKey ? 'SET' : 'NULL');
}
