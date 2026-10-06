import { getTask, PROMPT_VERSION } from './tasks.js';
import { resolveProviders } from './providers/index.js';
import { AIError, AI_ERROR_CATEGORY } from '../services/ai/AIError.js';
import { groundOutput } from './grounding.js';
import { overallConfidence } from './confidence.js';
import { validateSchema } from '../services/ai/AIResponseValidator.js';
import { AI_INFERENCE_RESULT_SCHEMA } from './contracts/common.js';

/**
 * WebloomAI — the single entry point of the Webloom AI task layer.
 *
 *   task input → provider(s) → contract validation → post-validation →
 *   evidence grounding → confidence banding → AIInferenceResult
 *
 * Guarantees:
 *  - Provider-agnostic: works over the Webloom fine-tuned model, the
 *    external LLM chain, a pinned local foundation model, or the
 *    deterministic fallback — same call, same result shape.
 *  - Never returns unvalidated output: contract + post-validation gate every
 *    result. A provider that fails validation is recorded and the next
 *    provider is tried.
 *  - Hallucination guard: for grounded tasks, AI-sourced claims whose
 *    evidence does not occur in the supplied evidence text are replaced with
 *    UNKNOWN envelopes (enforce mode) before the result leaves the layer.
 *  - Every result carries model/prompt/confidence/grounding provenance for
 *    benchmarking and audit.
 */
export class WebloomAI {
  constructor({ providers = null, providerDeps = {} } = {}) {
    this._providers = providers;
    this.providerDeps = providerDeps;
  }

  /** Reset injected providers (tests). */
  resetProviders() {
    this._providers = null;
  }

  /**
   * Run one task.
   *
   * @param {string} taskId
   * @param {object} input  task input (see datasets/README.md per-task input shape)
   * @param {object} [options]
   * @param {string|string[]} [options.provider] 'auto'|'webloom'|'external'|'local-foundation'|'fallback' or ordered list
   * @param {'enforce'|'report'|'off'} [options.grounding] defaults to 'enforce' for grounded tasks
   * @param {string} [options.evidenceText] explicit evidence to ground against; defaults to input evidence/website text
   * @param {'throw'|'unknown'} [options.onFail] 'unknown' returns UNKNOWN envelopes (envelope contracts only) instead of throwing
   * @returns {Promise<object>} AIInferenceResult
   */
  async run(taskId, input, options = {}) {
    const task = getTask(taskId);
    const {
      provider = 'auto',
      onFail = 'throw',
      evidenceText = null,
      modelId = null,
    } = options;

    const groundingMode = options.grounding ?? (task.grounded ? 'enforce' : 'off');
    const prompt = task.buildPrompt(input ?? {});
    const resolvedEvidence = evidenceText ?? deriveEvidenceText(input);

    const providers = this._providers
      ?? resolveProviders(provider, { ...this.providerDeps, modelId }, onFail === 'unknown');

    const attempts = [];
    let lastError = null;

    for (const providerInstance of providers) {
      if (!providerInstance.isConfigured()) {
        attempts.push({ provider: providerInstance.name, ok: false, error: 'not configured' });
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await providerInstance.run({
          prompt,
          systemPrompt: options.systemPrompt ?? null,
          schema: task.contract,
          temperature: options.temperature ?? task.options.temperature,
          maxTokens: options.maxTokens ?? task.options.maxTokens,
          operation: options.operation ?? task.category,
          model: options.model ?? null,
        });

        const postErrors = task.postValidate ? task.postValidate(result.value) : [];
        if (postErrors.length > 0) {
          throw new AIError({
            category: AI_ERROR_CATEGORY.INVALID_SCHEMA,
            provider: providerInstance.name,
            message: `Task "${task.id}" failed post-validation: ${postErrors.join('; ')}`,
          });
        }

        const { report, output } = groundingMode === 'off' || !resolvedEvidence
          ? { report: emptyGroundingReport(groundingMode === 'off' ? 'off' : 'report', false), output: result.value }
          : groundOutput(result.value, resolvedEvidence, groundingMode === 'off' ? 'report' : groundingMode);

        const confidence = overallConfidence(output);

        const inferenceResult = {
          task: task.id,
          taskVersion: task.version,
          output,
          inference: {
            provider: result.provider,
            model: result.model ?? null,
            modelId: providerInstance.modelId ?? null,
            promptVersion: PROMPT_VERSION,
            latencyMs: result.latencyMs ?? (Date.now() - startedAt),
            usage: result.usage ?? null,
            shape: result.shape ?? null,
            confidence,
            grounding: {
              checked: report.checked,
              mode: report.mode,
              grounded: report.grounded,
              unsupported: report.unsupported,
              unverifiable: report.unverifiable,
            },
            generatedAt: new Date().toISOString(),
          },
        };

        const contractError = validateSchema(inferenceResult, AI_INFERENCE_RESULT_SCHEMA);
        if (contractError) {
          throw new AIError({
            category: AI_ERROR_CATEGORY.INVALID_SCHEMA,
            provider: providerInstance.name,
            message: `AIInferenceResult failed its own contract at ${contractError.path}: ${contractError.message}`,
          });
        }

        attempts.push({ provider: providerInstance.name, ok: true, latencyMs: inferenceResult.inference.latencyMs });
        attachRaw(inferenceResult, result.raw);
        inferenceResult.__attempts = Object.freeze(attempts);
        return inferenceResult;
      } catch (error) {
        const aiError = AIError.from(error, { provider: providerInstance.name });
        attempts.push({
          provider: providerInstance.name,
          ok: false,
          error: aiError.category,
          safeMessage: aiError.safeMessage,
          latencyMs: Date.now() - startedAt,
        });
        lastError = aiError;
      }
    }

    // Every configured provider failed.
    if (onFail === 'unknown') {
      const fallback = providers.find((p) => p.name === 'fallback');
      if (fallback) {
        try {
          const result = await fallback.run({
            prompt,
            schema: task.contract,
            operation: task.category,
          });
          const confidence = overallConfidence(result.value);
          const inferenceResult = {
            task: task.id,
            taskVersion: task.version,
            output: result.value,
            inference: {
              provider: result.provider,
              model: result.model,
              modelId: null,
              promptVersion: PROMPT_VERSION,
              latencyMs: 0,
              usage: null,
              confidence,
              grounding: emptyGroundingReport('off', false),
              generatedAt: new Date().toISOString(),
            },
          };
          inferenceResult.__attempts = Object.freeze(attempts);
          return inferenceResult;
        } catch {
          // fall through to the typed error below
        }
      }
    }

    throw lastError ?? new AIError({
      category: AI_ERROR_CATEGORY.ALL_PROVIDERS_FAILED,
      message: `No provider could serve task "${task.id}".`,
    });
  }
}

function deriveEvidenceText(input) {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.evidence) && input.evidence.length > 0) {
    return input.evidence
      .map((e) => (typeof e === 'string' ? e : [e?.source, e?.text, e?.url].filter(Boolean).join('\n')))
      .join('\n');
  }
  if (typeof input.websiteText === 'string' && input.websiteText.trim()) return input.websiteText;
  return null;
}

function emptyGroundingReport(mode, checked) {
  return { checked, mode, grounded: 0, unsupported: 0, unverifiable: 0 };
}

function attachRaw(result, raw) {
  try {
    Object.defineProperty(result, '__raw', {
      value: raw,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  } catch {
    // best-effort debug payload
  }
}

export default WebloomAI;
