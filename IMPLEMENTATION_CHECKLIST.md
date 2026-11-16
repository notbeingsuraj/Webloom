# Webloom AI Infrastructure - Implementation Checklist

## Phase 1: Core Orchestrator Components (New Files)

- [ ] `apps/api/src/ai/AIOrchestrator.js` - Main capability-based orchestrator
- [ ] `apps/api/src/ai/ModelRegistry.js` - Model registry for all models
- [ ] `apps/api/src/ai/ProviderRegistry.js` - Provider registry
- [ ] `apps/api/src/ai/CapabilityRouter.js` - Capability-based routing
- [ ] `apps/api/src/ai/ProviderHealthMonitor.js` - Health monitoring with Redis support
- [ ] `apps/api/src/ai/QuotaManager.js` - Quota management with monthly budgets
- [ ] `apps/api/src/ai/CircuitBreaker.js` - Circuit breaker with Redis support
- [ ] `apps/api/src/ai/RetryController.js` - Retry controller with exponential backoff
- [ ] `apps/api/src/ai/OutputValidator.js` - Output validation with JSON repair
- [ ] `apps/api/src/ai/CostTracker.js` - Cost tracking and projection
- [ ] `apps/api/src/ai/AIExecutionLogger.js` - Execution logging
- [ ] `apps/api/src/ai/FallbackController.js` - Fallback controller with loop prevention
- [ ] `apps/api/src/ai/CacheManager.js` - Cache manager for deterministic results

## Phase 2: New Provider Adapters (apps/api/src/ai/providers/)

- [ ] `NVIDIAProvider.js` - NVIDIA NIM for Nemotron 3 Ultra
- [ ] `DeepSeekProvider.js` - DeepSeek API (V3, R1)
- [ ] `HuggingFaceProvider.js` - Hugging Face Inference (serverless + endpoints)
- [ ] `TogetherAIProvider.js` - Together AI
- [ ] `FireworksAIProvider.js` - Fireworks AI
- [ ] `SelfHostedProvider.js` - Self-hosted (Ollama, vLLM, LM Studio, TGI)

## Phase 3: Integration & Configuration Updates

- [ ] Update `apps/api/src/ai/index.js` - Export new components
- [ ] Update `apps/api/src/ai/providers/index.js` - Export new providers
- [ ] Update `apps/api/src/config/env.js` - Add new config variables
- [ ] Update `apps/api/src/services/AIService.js` - Integrate with AIOrchestrator
- [ ] Update `apps/api/src/routes/health.js` - Enhanced /health/ai endpoint
- [ ] Update `apps/api/src/ai/providers/index.js` - Export new providers

## Phase 4: Evaluation & Testing

- [ ] `apps/api/test_model_evaluation.js` - Benchmark runner for 30-task benchmark
- [ ] `apps/api/test_provider_adapters.js` - Provider adapter tests (mocked)
- [ ] `apps/api/test_orchestrator_resilience.js` - Failure scenario tests
- [ ] `apps/api/test_data_integrity.js` - Data integrity tests
- [ ] `apps/api/test_cost_optimization.js` - Cost/quota tests
- [ ] `apps/api/test_health_monitoring.js` - Health endpoint tests
- [ ] Run existing test suite (477+ tests)

## Phase 5: Evaluation Benchmark (30 Tasks)

- [ ] Create `datasets/evaluation/ground_truth.json` with 30 tasks
- [ ] Create `apps/api/test_model_evaluation.js` benchmark runner
- [ ] Run evaluation against available models
- [ ] Generate comparison report

## Phase 5: Failure Recovery Tests

- [ ] Primary provider unavailable
- [ ] Primary provider rate-limited (429)
- [ ] Primary provider returns 503
- [ ] Invalid API credentials (401/403)
- [ ] Invalid model identifier (404)
- [ ] Malformed JSON response
- [ ] Timeout
- [ ] Secondary provider succeeds
- [ ] All providers fail
- [ ] Provider recovers after cooldown
- [ ] No infinite retries or fallback loops

## Phase 6: Data Integrity Verification

- [ ] Verified data never overwritten by AI-generated
- [ ] Missing info remains missing (UNKNOWN envelopes)
- [ ] No synthetic business identities
- [ ] No fabricated prices/services/feedback
- [ ] Provenance preserved
- [ ] Partial results preserved when AI unavailable
- [ ] Deterministic extraction functional

## Phase 7: Vercel Deployment & Redis

- [ ] Upstash Redis integration for shared state
- [ ] Circuit breaker state persistence
- [ ] Provider cooldown tracking
- [ ] Quota state persistence
- [ ] Graceful degradation when Redis unavailable

## Phase 6: Cost Controls

- [ ] Monthly AI spending limits
- [ ] Per-task token limits
- [ ] Provider-specific usage tracking
- [ ] Free-tier preference logic
- [ ] Caching for deterministic results
- [ ] Retry cost accounting
- [ ] Configurable paid-provider activation
- [ ] $50/month budget enforcement

## Phase 7: Documentation & Final Report

- [ ] Update `.env.example` (done)
- [ ] Deployment instructions
- [ ] Migration guide
- [ ] Final production-readiness assessment
