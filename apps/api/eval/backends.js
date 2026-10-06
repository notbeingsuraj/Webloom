/**
 * Benchmark backends — the "brains" that produce a prediction for an example.
 *
 *   echo     — returns the example's expected output verbatim. Sanity backend:
 *              proves the runner, metrics, and report pipeline behave, and pins
 *              a perfect-score baseline the real models can never beat.
 *   fallback — runs the deterministic WebloomAI fallback provider (UNKNOWN
 *              envelopes). Exercises the harness against the real task layer
 *              with no network.
 *   baseline — runs the registered baseline foundation model (default
 *              config.baselineProvider 'local'), e.g. Ollama qwen2.5:7b.
 *              Requires a running model server.
 *   live     — runs the production provider chain via WebloomAI 'auto'
 *              (webloom fine-tuned if configured, else external chain).
 *              Requires API keys / endpoints.
 *
 * Never use echo/fallback numbers to claim real model quality.
 */

import { getTask } from '../src/ai/tasks.js';
import { PROMPT_VERSION } from '../src/ai/prompts/index.js';
import { overallConfidence } from '../src/ai/confidence.js';

function envelopeTask(task) {
  const contract = task.contract;
  return contract && contract.properties
    && Object.entries(contract.properties).some(
      ([, schema]) => schema && schema.properties && 'value' in schema.properties,
    );
}

function groundingMode(task, { enforce = true, override = null } = {}) {
  if (override) return override;
  if (!task.grounded) return 'off';
  return enforce ? 'enforce' : 'report';
}

export function echoRunner(example) {
  const task = getTask(example.task);
  const output = example.expectedOutput || {};
  return Promise.resolve({
    result: {
      task: example.task,
      taskVersion: task.version,
      output,
      inference: {
        provider: 'echo',
        model: 'echo (expected output)',
        modelId: null,
        promptVersion: PROMPT_VERSION,
        latencyMs: 0,
        usage: null,
        confidence: overallConfidence(output),
        grounding: { checked: false, mode: 'off', grounded: 0, unsupported: 0, unverifiable: 0 },
        generatedAt: new Date().toISOString(),
      },
    },
  });
}

export function makeFallbackRunner(webloomAI, { grounding = null } = {}) {
  return async (example) => {
    const task = getTask(example.task);
    try {
      const result = await webloomAI.run(example.task, example.input, {
        provider: 'fallback',
        onFail: 'unknown',
        grounding: groundingMode(task, { override: grounding }),
      });
      return { result };
    } catch (error) {
      return { error: error?.message ?? String(error) };
    }
  };
}

export function makeBaselineRunner(webloomAI, { grounding = null } = {}) {
  return async (example) => {
    const task = getTask(example.task);
    const mode = groundingMode(task, { override: grounding });
    try {
      const result = await webloomAI.run(example.task, example.input, {
        provider: 'baseline',
        // Baseline must never be masked by the deterministic fallback — a
        // genuine model failure is a recorded finding, not a silent UNKNOWN.
        onFail: 'throw',
        grounding: mode,
      });
      return { result };
    } catch (error) {
      // Capture the model's own raw output for failure analysis and training
      // data, even when post-validation rejected it. One extra direct call;
      // the captured value is never counted as a success.
      let failure = { parsed: null, raw: null };
      try {
        const { BaselineProvider } = await import('../src/ai/providers/BaselineProvider.js');
        const bp = new BaselineProvider();
        const r = await bp.run({
          prompt: task.buildPrompt(example.input),
          systemPrompt: null,
          schema: task.contract,
          temperature: task.options.temperature,
          maxTokens: task.options.maxTokens,
          operation: task.category,
        });
        failure = {
          parsed: r.value && typeof r.value === 'object' ? r.value : null,
          raw: r.raw,
          shape: r.shape ?? null,
        };
      } catch {
        // shape-provider failure: keep only the error message
      }
      return { error: error?.message ?? String(error), failure };
    }
  };
}

export function makeLiveRunner(webloomAI, { grounding = null } = {}) {
  return async (example) => {
    const task = getTask(example.task);
    try {
      const result = await webloomAI.run(example.task, example.input, {
        provider: 'auto',
        onFail: 'unknown',
        grounding: groundingMode(task, { override: grounding }),
      });
      return { result };
    } catch (error) {
      return { error: error?.message ?? String(error) };
    }
  };
}

export function createBackend(backend, { webloomAI = null, grounding = null } = {}) {
  switch (backend) {
    case 'echo':
      return { name: 'echo', runner: echoRunner };
    case 'fallback':
      if (!webloomAI) throw new Error('fallback backend requires webloomAI');
      return { name: 'fallback', runner: makeFallbackRunner(webloomAI, { grounding }) };
    case 'baseline':
      if (!webloomAI) throw new Error('baseline backend requires webloomAI');
      return { name: 'baseline', runner: makeBaselineRunner(webloomAI, { grounding }) };
    case 'live':
      if (!webloomAI) throw new Error('live backend requires webloomAI');
      return { name: 'live', runner: makeLiveRunner(webloomAI, { grounding }) };
    default:
      throw new Error(`Unknown backend "${backend}". Use echo|fallback|baseline|live`);
  }
}

export { envelopeTask };