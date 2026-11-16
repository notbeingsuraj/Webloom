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
  BaselineProvider,
  FallbackProvider,
  NVIDIAProvider,
  DeepSeekProvider,
  HuggingFaceProvider,
  TogetherAIProvider,
  FireworksAIProvider,
  SelfHostedProvider,
  createProvider,
  resolveProviders,
  PROVIDER_NAMES,
  getProviderCapabilities,
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

// New orchestrator components
export { AIOrchestrator } from './AIOrchestrator.js';
export { ModelRegistry } from './ModelRegistry.js';
export { ProviderRegistry } from './ProviderRegistry.js';
export { CapabilityRouter } from './CapabilityRouter.js';
export { ProviderHealthMonitor } from './ProviderHealthMonitor.js';
export { QuotaManager } from './QuotaManager.js';
export { CircuitBreaker } from './CircuitBreaker.js';
export { RetryController } from './RetryController.js';
export { OutputValidator } from './OutputValidator.js';
export { CostTracker } from './CostTracker.js';
export { AIExecutionLogger } from './AIExecutionLogger.js';
export { FallbackController } from './FallbackController.js';
export { CacheManager } from './CacheManager.js';
export { AIOrchestrator } from './AIOrchestrator.js';

// Re-export for convenience
export {
  AIOrchestrator as default,
} from './AIOrchestrator.js';