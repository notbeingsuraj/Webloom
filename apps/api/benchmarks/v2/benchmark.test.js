/**
 * Benchmark v2 — Entry Point
 * Run with: node benchmarks/v2/benchmark.test.js
 *
 * Deterministic, repeatable extraction-quality benchmark: mocked providers +
 * mocked AI, real orchestration path, full metric set.
 */

import { runBenchmark } from './runner.js';

console.log('Webloom Extraction Quality Benchmark (v2, deterministic)');
console.log('=========================================================\n');

try {
  const result = await runBenchmark();
  process.exit(result.failedFixtures > 0 ? 1 : 0);
} catch (error) {
  console.error('Benchmark failed:', error);
  process.exit(1);
}