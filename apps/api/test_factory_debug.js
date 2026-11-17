import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { createProvider } from './src/ai/providers/index.js';

console.log('Testing factory createProvider for mercury...');
const providerConfig = config.ai.providers.mercury;
console.log('providerConfig:', providerConfig);

const provider = createProvider('mercury', providerConfig, config.ai.timeoutMs, config.ai.probeMaxTokens);
console.log('Created provider:', provider.name);
console.log('isConfigured:', provider.isConfigured());
console.log('config.apiKey:', provider.config.apiKey ? 'SET' : 'NULL');
