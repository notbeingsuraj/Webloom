import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { createProviderChain } from './src/services/ai/AIProviderFactory.js';

console.log('Testing createProviderChain...');
const chain = createProviderChain(config.ai);
console.log('Chain length:', chain.length);
chain.forEach((p, i) => {
  console.log(`  ${i+1}. ${p.name} (${p.label}) - Configured: ${p.isConfigured()}, Model: ${p.getModel('default')}, apiKey: ${p.config.apiKey ? 'SET' : 'NULL'}`);
});
