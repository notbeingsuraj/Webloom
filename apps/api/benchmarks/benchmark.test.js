/**
 * Benchmark Test Entry Point
 * Run with: node benchmarks/benchmark.test.js
 */

import { runBenchmark } from './runner.js';

console.log('Webloom Extraction Quality Benchmark');
console.log('=====================================\n');

try {
  const summary = await runBenchmark();
  
  // Exit with appropriate code
  const overallSuccess = summary.overall.extractionSuccessRate > 0.7;
  process.exit(overallSuccess ? 0 : 1);
} catch (error) {
  console.error('Benchmark failed:', error);
  process.exit(1);
}