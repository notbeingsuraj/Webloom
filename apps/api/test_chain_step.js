import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { resolveProviderOrder, createProvider } from './src/services/ai/AIProviderFactory.js';

const order = resolveProviderOrder(config.ai);
console.log('order:', order);

order.forEach(name => {
  const providerConfig = config.ai.providers[name] || {};
  console.log(`\n--- ${name} ---`);
  console.log('providerConfig:', providerConfig);
  
  const provider = createProvider(name, providerConfig, config.ai.timeoutMs, config.ai.probeMaxTokens);
  console.log('Created:', provider.name);
  console.log('isConfigured:', provider.isConfigured());
  console.log('apiKey:', provider.config.apiKey ? 'SET' : 'NULL');
});
