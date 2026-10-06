/**
 * Public surface of the Webloom AI foundation.
 *
 * Existing production services keep calling services/AIService.js unchanged;
 * this module is the additive layer that new code (and the evaluation
 * harness) uses, and that the fine-tuned Webloom model will plug into.
 */

export { WebloomAI } from './WebloomAI.js';
export { default as webloomAI } from './instance.js';

export { TASKS, TASK_IDS, getTask, PROMPT_VERSION } from './tasks.js';

export {
  AIModelProvider,
  ExternalLLMProvider,
  LocalFoundationModelProvider,
  WebloomFineTunedModelProvider,
  FallbackProvider,
  createProvider,
  resolveProviders,
  PROVIDER_NAMES,
} from './providers/index.js';

export * as contracts from './contracts/index.js';
export * as grounding from './grounding.js';
export * as confidence from './confidence.js';
export * as modelRegistry from './modelRegistry.js';

export {
  PROVENANCE_KINDS,
  FIELD_STATUSES,
  CONFIDENCE_BANDS,
  unknownEnvelope,
  AI_INFERENCE_RESULT_SCHEMA,
  AI_MODEL_METADATA_SCHEMA,
  AI_CONFIDENCE_SCHEMA,
} from './contracts/common.js';

export * as paths from './paths.js';
