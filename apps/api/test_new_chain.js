import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { createProviderChain, resolveProviderOrder } from './src/services/ai/AIProviderFactory.js';

console.log('=== NEW PROVIDER CHAIN VALIDATION ===\n');

console.log('Config provider chain:');
console.log('  Primary:', config.ai.primaryProvider);
console.log('  Secondary:', config.ai.secondaryProvider);
console.log('  Fallback:', config.ai.fallbackProvider);

console.log('\nResolved provider order:');
const order = resolveProviderOrder(config.ai);
console.log('  ', order);

console.log('\nProvider configs:');
order.forEach(name => {
  const p = config.ai.providers[name];
  console.log(`  ${name}:`, p ? { enabled: p.enabled, model: p.model, baseUrl: p.baseUrl } : 'NOT CONFIGURED');
});

console.log('\nCreating provider chain...');
const chain = createProviderChain(config.ai);
console.log('Chain length:', chain.length);
chain.forEach((p, i) => {
  console.log(`  ${i+1}. ${p.name} (${p.label}) - Configured: ${p.isConfigured()}, Model: ${p.getModel('default')}`);
});

console.log('\n=== CHAIN VALIDATION COMPLETE ===');
