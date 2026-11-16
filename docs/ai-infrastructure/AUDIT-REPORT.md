# Webloom AI Infrastructure Audit Report

**Date:** 2026-11-16  
**Auditor:** AI Infrastructure Recovery Phase  
**Scope:** Complete AI provider adapters, orchestration, configuration, health checks, error handling, and all AI-dependent services

---

## Executive Summary

Webloom's AI infrastructure is **architecturally sound but operationally fragile**. The provider abstraction layer is well-designed with clean separation between the orchestration layer (`AIService`, `WebloomAI`) and provider implementations (`OpenRouterProvider`, `GeminiProvider`, `LocalProvider`). However, several critical issues exist:

1. **No support for modern open-weight models** (Nemotron 3 Ultra, DeepSeek V4, Qwen 3.5, etc.)
2. **Single provider chain** with limited fallback intelligence
3. **No cost tracking or quota management** leading to OpenRouter quota exhaustion
4. **Limited health monitoring** - configured ≠ healthy
5. **No circuit breakers or intelligent retry logic** for provider failures
6. **Structured output not supported for key models** (Nemotron 3 Ultra)

---

## 1. Provider Adapter Audit

### 1.1 Provider Inventory

| Provider | Class | Status | Base URL | Model Config | Structured Output |
|----------|-------|--------|----------|--------------|-------------------|
| OpenRouter | `OpenRouterProvider` | Primary | `https://openrouter.ai/api/v1` | Via `OPENROUTER_MODEL` | ✅ Native (`response_format`) |
| Gemini | `GeminiProvider` | Secondary | `https://generativelanguage.googleapis.com/v1beta` | Via `GEMINI_MODEL` | ⚠️ Limited (Gemini schema subset) |
| Local | `LocalProvider` | Fallback | `http://localhost:11434/v1` | Via `LOCAL_AI_MODEL` | ⚠️ Retries without `response_format` |
| Webloom Fine-tuned | `WebloomFineTunedModelProvider` | Opt-in | Via LocalFoundationModelProvider | Registry-based | Depends on backend |
| Baseline | `BaselineProvider` | Evaluation | Configurable | Registry-based | Configurable |
| Fallback | `FallbackProvider` | Deterministic | N/A | N/A | N/A |

### 1.2 Adapter Interface Compliance

All providers extend `AIModelProvider` (via `OpenAICompatibleProvider` or `AIProvider` base) and implement:
- ✅ `generate(request)` - Core inference
- ✅ `healthCheck()` / `runHealthCheck()` - Health probing
- ✅ `isConfigured()` - Configuration validation
- ✅ `getModel(operation)` - Per-operation model resolution
- ✅ `normalizeError(error)` - Provider-specific error classification

**Gap:** No `getModels()`, `getCapabilities()`, `classifyError()`, `getUsage()`, `validateConfiguration()` methods as required by the new `ProviderAdapterInterface`.

### 1.3 Provider-Specific Issues

#### OpenRouterProvider
- **Status:** Production primary
- **Issues:**
  - Model availability errors (404) correctly classified as `CONFIGURATION_ERROR`
  - Attribution headers required for free models
  - No free model auto-discovery
  - Cost tracking not implemented

#### GeminiProvider
- **Status:** Production secondary
- **Issues:**
  - `isGeminiCompatibleSchema()` rejects valid schemas (too restrictive)
  - Model deprecation handling (404 with "no longer available to new users") correctly classified
  - No support for Gemini 1.5 Flash/Pro structured output improvements
  - Thinking budget (Gemini 2.0) not supported

#### LocalProvider
- **Status:** Production fallback
- **Issues:**
  - Retries once without `response_format` on 400 - good fallback
  - No model discovery via `/v1/models`
  - Health check overrides `runHealthCheck()` but base `checkHealth()` unused

#### WebloomFineTunedModelProvider
- **Status:** Not configured (no active production model)
- **Issues:**
  - Depends on registry model with `status: 'active-production'`
  - Reuses LocalFoundationModelProvider backend
  - No independent health check

---

## 2. Configuration Audit

### 2.1 Environment Variables (`apps/api/src/config/env.js`)

**Provider Chain Definition:**
```javascript
primaryProvider: 'openrouter'      // via AI_PRIMARY_PROVIDER
secondaryProvider: 'gemini'        // via AI_SECONDARY_PROVIDER
fallbackProvider: 'local'          // via AI_FALLBACK_PROVIDER
```

**Timeouts & Budgets:**
```javascript
timeoutMs: 30000              // Per-request timeout
maxTotalMs: 90000             // Total chain budget (all providers + retries)
maxRetries: 1                 // Per-provider retries
maxTokenDowngrades: 1         // 402 re-dispatch attempts
probeMaxTokens: 6000          // Health probe token ceiling
```

**Per-Provider Config:**
- OpenRouter: `baseUrl`, `model`, `timeoutMs`, `appUrl`, `appName`, `operationModels`
- Gemini: `baseUrl`, `model`, `timeoutMs`, `operationModels`
- Local: `baseUrl`, `model`, `timeoutMs`, `label`, `requiresApiKey`

**Issues:**
- No NVIDIA, Hugging Face, DeepSeek provider configs
- No cost tracking or monthly budget config
- No circuit breaker / cooldown config
- No cache config
- `operationModels` per provider but not per capability

### 2.2 Legacy Overrides
```javascript
primaryModel: AI_PRIMARY_MODEL      // Single model for all operations
fallbackModel: AI_FALLBACK_MODEL    // Single fallback model
```
These override per-operation model selection - **anti-pattern**.

---

## 3. Orchestration & Routing Audit

### 3.1 AIService (`apps/api/src/services/AIService.js`)

**Strengths:**
- Single entry point for all AI calls
- Ordered provider chain with strict fallback
- Wall-clock budget (`maxTotalMs`) across all providers
- Bounded retries with exponential backoff + jitter
- 402 credit handling with token clamp re-dispatch
- Structured output validation pipeline
- Comprehensive telemetry (non-secret)
- Provenance attachment (`__ai` non-enumerable property)

**Critical Issues:**
1. **No capability-based routing** - Uses `model` hint (`fast`/`reasoning`/`brand`/`audit`) mapped to operations, not capabilities
2. **No cost awareness** - Never considers token cost or budget
3. **No intelligent fallback** - Falls back on any error, no capability/health matching
4. **No caching** - Repeated identical requests hit providers every time
5. **No quota management** - Quota exhaustion discovered only at request time
6. **In-memory telemetry only** - Lost on restart, no persistence

### 3.2 WebloomAI (`apps/api/src/ai/WebloomAI.js`)

**Role:** Task-layer entry point with grounding and validation
- Task definitions in `apps/api/src/ai/tasks.js`
- Grounding enforcement via `groundOutput()`
- Confidence banding via `overallConfidence()`
- Contract validation via `AIResponseValidator`

**Issues:**
- Hardcoded to `WebloomAI` instance pattern
- Provider resolution via `resolveProviders()` - limited to 'auto', 'webloom', 'external', 'local-foundation', 'baseline', 'fallback'
- No capability-based routing

### 3.3 Provider Resolution (`apps/api/src/ai/providers/index.js`)

```javascript
resolveProviders('auto') → [webloom (if configured), external]
resolveProviders('external') → [external]
```
**Limitation:** No capability-aware provider selection.

---

## 4. Error Handling & Fallback Audit

### 4.1 Error Taxonomy (`apps/api/src/services/ai/AIError.js`)

**Categories (AI_ERROR_CATEGORY):**
- `AUTHENTICATION` - 401/403
- `QUOTA_EXHAUSTED` - 402, billing errors
- `RATE_LIMITED` - 429 with rate limit language
- `PROVIDER_UNAVAILABLE` - 5xx, connection errors
- `TIMEOUT` - 408, 504, timeout errors
- `INVALID_RESPONSE` - Empty, malformed, safety blocks
- `INVALID_SCHEMA` - Structured output validation failure
- `REQUEST_INVALID` - 400, 413
- `CONFIGURATION_ERROR` - 404 model, bad config
- `ALL_PROVIDERS_FAILED` - Chain exhausted

**Policy (POLICY):**
| Category | Retryable | Fallback |
|----------|-----------|----------|
| AUTHENTICATION | ❌ | ✅ |
| RATE_LIMITED | ✅ | ✅ |
| QUOTA_EXHAUSTED | ❌ | ✅ |
| TIMEOUT | ✅ | ✅ |
| PROVIDER_UNAVAILABLE | ✅ | ✅ |
| INVALID_RESPONSE | ❌ | ✅ |
| INVALID_SCHEMA | ❌ | ✅ |
| REQUEST_INVALID | ❌ | ❌ |
| CONFIGURATION_ERROR | ❌ | ❌ |

**Issues:**
- `QUOTA_EXHAUSTED` not retryable but fallback allowed - correct for OpenRouter 402
- No distinction between rate limit (retryable) and quota exhaustion (not retryable) in all cases
- No `COOLDOWN_ACTIVE` or `CIRCUIT_OPEN` categories

### 4.2 Fallback Logic (`AIService.generate()`)

**Current Behavior:**
1. Try primary provider with retries
2. On failure, check `shouldFallback` (policy-based)
3. If fallback allowed, increment `fallbackCount`, try next provider
4. Repeat until chain exhausted or success

**Critical Gaps:**
- No capability-aware fallback (e.g., don't fallback to Local for `business_research`)
- No health-aware fallback (falls back to unhealthy provider)
- No cost-aware fallback (falls back to expensive provider)
- No circuit breaker - retries failed provider indefinitely within budget
- No cooldown tracking - immediately retries failed provider

---

## 5. Health Monitoring Audit

### 5.1 AIHealthService (`apps/api/src/services/ai/AIHealthService.js`)

**Four-Fact Health Model:**
1. `configured` - Local config exists
2. `reachable` - Host answered
3. `authenticated` - Credentials accepted
4. `usable` - Real request succeeded

**Current Output:**
```json
{
  "status": "healthy|degraded|unavailable|unconfigured",
  "usableProviders": ["openrouter"],
  "configuredProviders": ["openrouter", "gemini"],
  "providers": {
    "openrouter": {
      "configured": true,
      "reachable": true,
      "authenticated": true,
      "usable": true,
      "detail": "ok"
    }
  }
}
```

**Critical Gaps:**
- ❌ No latency metrics (p50, p95, p99)
- ❌ No failure rate
- ❌ No cooldown state
- ❌ No quota state
- ❌ No circuit breaker state
- ❌ No active provider per capability
- ❌ No fallback status
- ❌ Configured API key = healthy (false positive risk)

### 5.2 Health Endpoints (`apps/api/src/routes/health.js`)

- `GET /health` - Basic service health
- `GET /health/ai` - AIHealthService output
- **Missing:** Provider diagnostic endpoint, capability health, cost summary

---

## 6. AI-Dependent Services Audit

### 6.1 Services Using AI

| Service | Operations | Model Hints | Fallback Behavior |
|---------|------------|-------------|-------------------|
| `BusinessResearchService` | Brand DNA, Digital Audit, Enrichment | `brand`, `audit`, `extraction` | Graceful degradation (preserves extraction) |
| `BusinessDataExtractor` | Google Maps HTML extraction | `extraction` | AI fallback for unstructured fields |
| `DigitalAuditService` | Website audit | `audit` (reasoning) | Degraded/no-website audit modes |
| `BrandStrategyService` | Brand DNA generation | `brand` (reasoning) | Fails gracefully, returns null |
| `LandingPageSpecService` | Landing page spec | `extraction` | N/A |
| `WebsiteStrategyService` | Website strategy | `extraction` | N/A |
| `WebsiteGenerationService` | Site generation | `extraction` | N/A |
| `LeadWebsiteSpecService` | Website spec | `extraction` | N/A |
| `SalesOutreachService` | Outreach email | `copywriting` | N/A |
| `DesignIntelligenceService` | Design system | `extraction` | N/A |

### 6.2 Model Hint Mapping (`AIService.resolveOperation()`)

| Hint | Operation | Used By |
|------|-----------|---------|
| `fast` | `extraction` | BusinessDataExtractor, WebsiteGeneration, etc. |
| `reasoning` | `brand` | BrandStrategy, DigitalAudit |
| `coding` | `extraction` | (unused) |
| `copywriting` | `extraction` | SalesOutreach |
| `vision` | `extraction` | (unused) |
| `brand` | `brand` | BrandStrategy |
| `audit` | `audit` | DigitalAudit |
| `extraction` | `extraction` | Default |

**Issue:** No `business_research`, `entity_resolution`, `review_analysis`, `sentiment_classification`, `competitor_analysis`, `trend_classification`, `report_generation`, `structured_output` capabilities defined.

---

## 7. Data Integrity & Provenance Audit

### 7.1 Provenance Hierarchy (BusinessProfile.js)

```javascript
provenancePriority = {
  verified: 4,
  discovered: 3,
  user_provided: 3,
  identified: 2,
  inferred: 1,
  ai_generated: 0.5
}
```

**Enforcement:** `BusinessProfile.set()` refuses `ai_generated` (0.5) overwrite of `identified` (2)+ - **Correctly implemented**.

### 7.2 Candidate Pipeline (`CandidatePipeline.js`)

- Evidence gate: `ai_generated` identity fields require evidence snippet
- Type/format validation for phone, email, URL, coordinates, rating
- `onlyIfMissing` and `overwriteBelowConfidence` options

### 7.3 AI Quarantine in Entity Resolution

- `canonicalIdentityField()` reads both `business.name` (Geoapify) and `identity.name` (WebExtraction)
- AI-generated fields treated as lower confidence

---

## 8. Provider Failure Matrix

| Failure Mode | OpenRouter | Gemini | Local | Webloom FT | Severity |
|--------------|------------|--------|-------|------------|----------|
| **Quota Exhaustion (402)** | ✅ Handled (token clamp) | ❌ Not tested | N/A | N/A | Critical |
| **Rate Limit (429)** | ✅ Retry + fallback | ✅ Retry + fallback | ❌ No retry | N/A | High |
| **Model Unavailable (404)** | ✅ CONFIG_ERROR | ✅ CONFIG_ERROR | N/A | N/A | High |
| **Auth Failure (401/403)** | ✅ Fallback | ✅ Fallback | ❌ No fallback | N/A | High |
| **Timeout** | ✅ Retry + fallback | ✅ Retry + fallback | ✅ Retry + fallback | N/A | Medium |
| **5xx Errors** | ✅ Fallback | ✅ Fallback | ✅ Fallback | N/A | Medium |
| **Malformed JSON** | ❌ INVALID_RESPONSE | ❌ INVALID_RESPONSE | ✅ Retry w/o format | N/A | High |
| **Structured Output Fail** | ❌ Schema error | ⚠️ Schema subset | ✅ Retry w/o format | ❌ Not supported | Critical |
| **Quota Exhaustion Silent** | ❌ Possible | ❌ Possible | N/A | N/A | Critical |
| **Model Deprecation** | ✅ Detected | ✅ Detected | N/A | N/A | High |
| **Circuit Breaker** | ❌ None | ❌ None | ❌ None | ❌ None | Critical |
| **Cooldown Tracking** | ❌ None | ❌ None | ❌ None | ❌ None | High |
| **Cost Tracking** | ❌ None | ❌ None | N/A | N/A | High |
| **Health = Configured** | ❌ False positive | ❌ False positive | ❌ False positive | ❌ False positive | Critical |

---

## 9. Root Cause Analysis

### 9.1 OpenRouter Quota Exhaustion
**Root Cause:** No quota tracking, no cost awareness, no monthly budget enforcement. Requests continue until 402, then token clamp re-dispatch helps but doesn't prevent recurrence.

### 9.2 Gemini 429/503 Errors
**Root Cause:** No rate limit awareness in routing. Requests hammer Gemini until 429, then fallback. No token bucket or rate limit awareness.

### 9.3 Model Availability Issues
**Root Cause:** Model identifiers hardcoded in env, no model discovery. When provider deprecates model, 404 treated as config error but operator must manually update env.

### 9.4 Long Inference Timeouts
**Root Cause:** `maxTotalMs=90000` allows 3 providers × 2 retries × 30s = 180s theoretical max. No per-capability timeout budgets.

### 9.5 Inconsistent Fallback Behavior
**Root Cause:** Fallback policy based only on error category, not capability match, health, or cost. Local provider (no structured output) falls back for `business_research` tasks requiring JSON.

### 9.6 AI-Dependent Service Failures
**Root Cause:** Services catch AI errors and degrade gracefully, but degradation mode loses AI-enhanced fields. No shared research dossier - each service makes independent AI calls.

---

## 10. Prioritized Recommendations

### P0 - Critical (Block Production)
1. **Add Circuit Breakers** - Prevent cascade failures
2. **Add Quota Management** - Track monthly budgets, alert at 80%
3. **Implement Capability-Based Routing** - Match tasks to appropriate models
4. **Add Cost Tracking** - Per-request, per-capability, monthly budgets
5. **Fix Structured Output for Nemotron** - JSON extraction/repair pipeline

### P1 - High (Before Pilot)
1. **Provider Health Monitoring** - Latency, failure rate, cooldown, quota, circuit state
2. **Intelligent Fallback** - Capability-aware, health-aware, cost-aware
3. **Cooldown Tracking** - Provider-specific exponential backoff
4. **Response Caching** - Deterministic extractions
6. **Provider Diagnostic Endpoint** - Independent health testing

### P2 - Medium (Post-Launch)
1. **Model Discovery** - Auto-detect available models
2. **Free Tier Optimization** - Prefer free models for simple tasks
3. **Redis Shared State** - Circuit breaker/cooldown persistence for serverless
4. **Model Evaluation Benchmark** - Webloom-specific test suite

### P3 - Future
1. **Multi-Provider Source Discovery** - Bing, Brave, DuckDuckGo
2. **Competitor Intelligence** - Semantic discovery + deep profiles
3. **Market Intelligence** - Category norms, pricing benchmarks

---

## 11. Files Requiring Changes

### Core Infrastructure (New Files)
- `apps/api/src/ai/AIOrchestrator.js`
- `apps/api/src/ai/ModelRegistry.js`
- `apps/api/src/ai/ProviderRegistry.js`
- `apps/api/src/ai/CapabilityRouter.js`
- `apps/api/src/ai/ProviderHealthMonitor.js`
- `apps/api/src/ai/QuotaManager.js`
- `apps/api/src/ai/CircuitBreaker.js`
- `apps/api/src/ai/RetryController.js`
- `apps/api/src/ai/OutputValidator.js`
- `apps/api/src/ai/CostTracker.js`
- `apps/api/src/ai/AIExecutionLogger.js`
- `apps/api/src/ai/FallbackController.js`
- `apps/api/src/ai/CacheManager.js`
- `apps/api/src/ai/providers/ProviderAdapterInterface.js`
- `apps/api/src/ai/providers/NVIDIAProvider.js`
- `apps/api/src/ai/providers/HuggingFaceProvider.js`
- `apps/api/src/ai/providers/DeepSeekProvider.js`
- `apps/api/src/ai/providers/SelfHostedProvider.js`

### Existing Files to Modify
- `apps/api/src/config/env.js` - Add all new config
- `apps/api/src/services/AIService.js` - Migrate to orchestrator
- `apps/api/src/services/ai/AIError.js` - New categories
- `apps/api/src/services/ai/AIHealthService.js` - Enhanced health
- `apps/api/src/services/ai/AIProviderFactory.js` - New providers
- `apps/api/src/ai/providers/index.js` - Export new providers
- `apps/api/src/ai/providers/GeminiProvider.js` - Enhance
- `apps/api/src/ai/providers/OpenRouterProvider.js` - Enhance
- `apps/api/src/ai/providers/LocalProvider.js` - Enhance
- `apps/api/src/routes/health.js` - Enhanced `/health/ai`
- `apps/api/src/ai/index.js` - Export orchestrator
- `.env.example` - All new variables

### Documentation (New)
- `docs/ai-infrastructure/AUDIT-REPORT.md` (this file)
- `docs/ai-infrastructure/MODEL-RESEARCH.md`
- `docs/ai-infrastructure/EVALUATION-BENCHMARK.md`
- `docs/ai-infrastructure/PROVIDER-COMPATIBILITY-MATRIX.md`
- `docs/ai-infrastructure/MODEL-ROUTING-POLICY.md`
- `docs/ai-infrastructure/ENVIRONMENT-VARIABLES.md`
- `docs/ai-infrastructure/DEPLOYMENT-INSTRUCTIONS.md`
- `docs/ai-infrastructure/COST-QUOTA-MANAGEMENT.md`
- `docs/ai-infrastructure/MIGRATION-GUIDE.md`
- `docs/ai-infrastructure/FINAL-ENGINEERING-DECISION.md`

---

## 12. Conclusion

The current AI infrastructure is a **well-architected but incomplete foundation**. The provider abstraction and error handling are solid, but the system lacks:

1. **Intelligence** - No capability-based routing, cost awareness, or health-aware fallback
2. **Resilience** - No circuit breakers, cooldown tracking, or quota management
3. **Observability** - Health checks report configured ≠ healthy, no latency/failure metrics
4. **Modern Model Support** - No adapters for Nemotron, DeepSeek, Qwen, Mistral, GLM
5. **Cost Control** - Zero cost tracking, quota exhaustion discovered at request time

The 11-phase implementation plan addresses all gaps systematically, prioritizing production reliability while enabling the open-weight model strategy.