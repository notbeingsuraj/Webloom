import dotenv from 'dotenv';
dotenv.config();

console.log('Before config import - MERCURY_API_KEY:', process.env.MERCURY_API_KEY ? 'SET' : 'NOT SET');

import { config } from './src/config/env.js';

console.log('After config import - MERCURY_API_KEY:', process.env.MERCURY_API_KEY ? 'SET' : 'NOT SET');
console.log('config.ai.providers.mercury:', config.ai.providers.mercury);
