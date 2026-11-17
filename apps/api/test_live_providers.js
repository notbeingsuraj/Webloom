import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.staging' });

import { MercuryProvider } from './src/ai/providers/MercuryProvider.js';
import { NVIDIAProvider } from './src/ai/providers/NVIDIAProvider.js';

async function testMercury() {
  console.log('\n=== MERCURY 3 LIVE TEST ===');
  const provider = new MercuryProvider({
    apiKey: process.env.MERCURY_API_KEY,
    model: process.env.MERCURY_MODEL,
    baseUrl: process.env.MERCURY_BASE_URL,
    timeoutMs: parseInt(process.env.MERCURY_TIMEOUT_MS)
  });
  
  console.log('Provider:', provider.label);
  console.log('Type:', provider.type);
  console.log('Model:', provider.getModel('default'));
  console.log('Configured:', provider.isConfigured());
  console.log('Capabilities:', provider.getCapabilities());
  
  // Test 1: Health check
  console.log('\n--- Health Check ---');
  const health = await provider.runHealthCheck();
  console.log('Health:', JSON.stringify(health, null, 2));
  
  // Test 2: Simple completion
  console.log('\n--- Simple Completion ---');
  const start = Date.now();
  try {
    const result = await provider.complete({
      model: provider.getModel('default'),
      prompt: 'Say "Hello from Mercury 3" and nothing else.',
      maxTokens: 50,
      temperature: 0,
      timeoutMs: 30000
    });
    console.log('Latency:', Date.now() - start, 'ms');
    console.log('Content:', result.content);
    console.log('Model:', result.model);
    console.log('Usage:', result.usage);
    console.log('Finish Reason:', result.finishReason);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Category:', error.category);
    console.error('HTTP Status:', error.httpStatus);
  }
  
  // Test 3: Structured output
  console.log('\n--- Structured Output ---');
  try {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        value: { type: 'number' }
      },
      required: ['name', 'value'],
      additionalProperties: false
    };
    
    const result = await provider.complete({
      model: provider.getModel('default'),
      prompt: 'Return JSON with name "test" and value 42',
      maxTokens: 100,
      temperature: 0,
      responseFormat: { type: 'json_schema', json_schema: { name: 'test', strict: true, schema } },
      timeoutMs: 30000
    });
    console.log('Structured Result:', result.content);
  } catch (error) {
    console.error('Structured Output Error:', error.message);
  }
  
  // Test 4: Token usage tracking
  console.log('\n--- Token Usage ---');
  try {
    const result = await provider.complete({
      model: provider.getModel('default'),
      prompt: 'Count to 10.',
      maxTokens: 100,
      temperature: 0,
      timeoutMs: 30000
    });
    console.log('Usage:', result.usage);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function testNVIDIA() {
  console.log('\n=== NVIDIA NEMOTRON 3 ULTRA LIVE TEST ===');
  const provider = new NVIDIAProvider({
    name: 'nvidia',
    config: {
      enabled: true,
      apiKey: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL,
      baseUrl: process.env.NVIDIA_BASE_URL,
      timeoutMs: parseInt(process.env.NVIDIA_TIMEOUT_MS),
      requiresApiKey: true,
    },
    defaultTimeoutMs: parseInt(process.env.NVIDIA_TIMEOUT_MS),
    probeMaxTokens: 6000
  });
  
  console.log('Provider:', provider.label);
  console.log('Type:', provider.type);
  console.log('Model:', provider.getModel('default'));
  console.log('Configured:', provider.isConfigured());
  console.log('Capabilities:', provider.getCapabilities());
  
  // Test 1: Health check
  console.log('\n--- Health Check ---');
  const health = await provider.runHealthCheck();
  console.log('Health:', JSON.stringify(health, null, 2));
  
  // Test 2: Simple completion
  console.log('\n--- Simple Completion ---');
  const start = Date.now();
  try {
    const result = await provider.complete({
      model: provider.getModel('default'),
      prompt: 'Say "Hello from Nemotron 3 Ultra" and nothing else.',
      maxTokens: 50,
      temperature: 0,
      timeoutMs: 60000
    });
    console.log('Latency:', Date.now() - start, 'ms');
    console.log('Content:', result.content);
    console.log('Model:', result.model);
    console.log('Usage:', result.usage);
    console.log('Finish Reason:', result.finishReason);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Category:', error.category);
    console.error('HTTP Status:', error.httpStatus);
  }
  
  // Test 3: Structured output (Nemotron doesn't support native)
  console.log('\n--- Structured Output (JSON Repair) ---');
  try {
    const result = await provider.complete({
      model: provider.getModel('default'),
      prompt: 'Return valid JSON only: {"name": "test", "value": 42}',
      maxTokens: 100,
      temperature: 0,
      timeoutMs: 60000
    });
    console.log('Result:', result.content);
  } catch (error) {
    console.error('Structured Output Error:', error.message);
  }
}

async function testFailover() {
  console.log('\n=== FAILOVER TESTS ===');
  
  console.log('\n--- Mercury Timeout Simulation ---');
  const mercury = new MercuryProvider({
    apiKey: process.env.MERCURY_API_KEY,
    model: process.env.MERCURY_MODEL,
    baseUrl: process.env.MERCURY_BASE_URL,
    timeoutMs: 1 // 1ms timeout to force timeout
  });
  
  try {
    await mercury.complete({
      model: mercury.getModel('default'),
      prompt: 'This should timeout',
      maxTokens: 50,
      temperature: 0,
      timeoutMs: 1
    });
  } catch (error) {
    console.log('Timeout Error Category:', error.category);
    console.log('Timeout Error Message:', error.message);
  }
  
  console.log('\n--- Mercury Invalid Output Simulation ---');
  try {
    await mercury.complete({
      model: mercury.getModel('default'),
      prompt: 'Return invalid JSON: {{{',
      maxTokens: 50,
      temperature: 0,
      timeoutMs: 30000
    });
  } catch (error) {
    console.log('Invalid Output Error Category:', error.category);
    console.log('Invalid Output Error Message:', error.message);
  }
}

async function main() {
  await testMercury();
  await testNVIDIA();
  await testFailover();
  console.log('\n=== ALL LIVE TESTS COMPLETE ===');
}

main().catch(console.error);
