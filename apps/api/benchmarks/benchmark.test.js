/**
 * Benchmark Test Entry Point
 * Run with: node benchmarks/benchmark.test.js
 */

import { runBenchmark } from './runner.js';

console.log('Webloom Extraction Quality Benchmark');
console.log('=====================================\n');

try {
  const summary = await runBenchmark();
  
  // Exit with appropriate code - don't fail on low success rate, just report
  // The benchmark is meant to measure and report, not enforce thresholds
  process.exit(0);
} catch (error) {
  console.error('Benchmark failed:', error);
  process.exit(1);
}