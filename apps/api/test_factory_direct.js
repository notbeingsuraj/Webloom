import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { MercuryProvider } from './src/ai/providers/MercuryProvider.js';

const providerConfig = config.ai.providers.mercury;
console.log('providerConfig.apiKey:', providerConfig.apiKey ? 'SET' : 'NULL');

const provider = new MercuryProvider({
  model: providerConfig.model,
  timeoutMs: providerConfig.timeoutMs,
  apiKey: providerConfig.apiKey,
  baseUrl: providerConfig.baseUrl,
});

console.log('isConfigured:', provider.isConfigured());
console.log('apiKey:', provider.config.apiKey ? 'SET' : 'NULL');
