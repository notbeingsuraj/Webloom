import dotenv from 'dotenv';
dotenv.config();

import { config } from './src/config/env.js';
import { resolveProviderOrder } from './src/services/ai/AIProviderFactory.js';

console.log('config.ai:', Object.keys(config.ai));
console.log('config.ai.providers:', Object.keys(config.ai.providers));
console.log('config.ai.providers.mercury:', config.ai.providers.mercury);
console.log('config.ai.providers.nvidia:', config.ai.providers.nvidia);

const order = resolveProviderOrder(config.ai);
console.log('order:', order);

order.forEach(name => {
  const p = config.ai.providers[name];
  console.log(`  ${name}:`, p);
});
