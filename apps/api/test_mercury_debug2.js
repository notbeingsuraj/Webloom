import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

console.log('MERCURY_API_KEY:', process.env.MERCURY_API_KEY ? 'SET' : 'NOT SET');

import { MercuryProvider } from './src/ai/providers/MercuryProvider.js';

const provider = new MercuryProvider({
  apiKey: process.env.MERCURY_API_KEY,
  model: process.env.MERCURY_MODEL,
  baseUrl: process.env.MERCURY_BASE_URL,
  timeoutMs: parseInt(process.env.MERCURY_TIMEOUT_MS)
});

console.log('Provider config:', JSON.stringify(provider.config, null, 2));
console.log('isConfigured:', provider.isConfigured());
console.log('getModel:', provider.getModel('default'));
console.log('enabled:', provider.config.enabled);
console.log('model:', provider.config.model);
console.log('apiKey:', provider.config.apiKey ? 'SET' : 'NULL');
