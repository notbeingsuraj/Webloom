# AI Infrastructure Migration Guide

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Purpose:** Guide for migrating existing AI-dependent services to the new AIOrchestrator

---

## 1. Migration Overview

### 1.1 What's Changing

| Old Pattern | New Pattern |
|-------------|-------------|
| `AIService.generate({ model: 'reasoning', ... })` | `AIOrchestrator.execute('business_research', input, options)` |
| `AIService.generate({ model: 'extraction', ... })` | `AIOrchestrator.execute('business_extraction', input, options)` |
| `AIService.generate({ model: 'brand', ... })` | `AIOrchestrator.execute('report_generation', input, options)` |
| `AIService.generate({ model: 'audit', ... })` | `AIOrchestrator.execute('review_analysis', input, options)` |
| Hardcoded provider chains | Capability-based routing |
| Manual error handling | Built-in circuit breakers, retries, fallbacks |
| No cost tracking | Built-in cost tracking & quota management |

### 1.2 Model Hint → Capability Mapping

| Old `model` Hint | New `capability` | Description |
|------------------|------------------|-------------|
| `'extraction'` | `'business_extraction'` | Structured field extraction |
| `'reasoning'` | `'business_research'` | Deep reasoning, synthesis |
| `'brand'` | `'report_generation'` | Brand DNA, strategy, reports |
| `'audit'` | `'review_analysis'` | Digital audit, sentiment, classification |
| `'coding'` | `'business_extraction'` | Code-related extraction |
| `'copywriting'` | `'report_generation'` | Content generation |
| `'vision'` | `'business_extraction'` | Image-based extraction (future) |

### 1.3 Backward Compatibility

The existing `AIService.generate()` method is **preserved** but internally routes through `AIOrchestrator`. Existing callers continue to work without changes.

---

## 2. Service-by-Service Migration

### 2.1 BusinessResearchService

**Before:**
```javascript
// apps/api/src/services/BusinessResearchService.js
const brandDNA = await AIService.generate({
  prompt: buildBrandStrategyPrompt(businessData),
  model: 'brand',
  schema: true,
  temperature: 0.7,
  maxTokens: 6000,
  operation: 'brand'
});

const audit = await AIService.generate({
  prompt: buildDigitalAuditPrompt(businessData),
  model: 'audit',
  schema: true,
  temperature: 0.5,
  maxTokens: 5000,
  operation: 'audit'
});
```

**After (Recommended):**
```javascript
const { AIOrchestrator } = await import('../ai/AIOrchestrator.js');
const orchestrator = new AIOrchestrator();

const brandDNA = await orchestrator.execute('business_research', {
  businessData,
  task: 'brand_dna'
}, {
  maxCost: 0.015,
  maxLatency: 60000,
  requireStructuredOutput: true
});

const audit = await orchestrator.execute('review_analysis', {
  businessData,
  task: 'digital_audit'
}, {
  maxCost: 0.008,
  maxLatency: 30000,
  requireStructuredOutput: true
});
```

**Minimal Change (Backward Compatible):**
```javascript
// Existing code continues to work - AIService.generate() now uses orchestrator internally
const brandDNA = await AIService.generate({
  prompt: buildBrandStrategyPrompt(businessData),
  model: 'brand',  // Maps to 'business_research' capability
  schema: true,
  temperature: 0.7,
  maxTokens: 6000,
  operation: 'brand'
});
```

### 2.2 BusinessDataExtractor

**Before:**
```javascript
const extraction = await AIService.generate({
  prompt: buildExtractionPrompt(html),
  model: 'extraction',
  schema: extractionSchema,
  temperature: 0.1,
  maxTokens: 4000,
  operation: 'extraction'
});
```

**After:**
```javascript
const extraction = await AIOrchestrator.execute('business_extraction', {
  html,
  sourceUrl: googleMapsUrl
}, {
  maxCost: 0.001,
  maxLatency: 10000,
  requireStructuredOutput: true,
  preferFree: true
});
```

### 2.3 DigitalAuditService

**Before:**
```javascript
const audit = await AIService.generate({
  prompt: buildDigitalAuditPrompt(businessData),
  model: 'audit',
  schema: auditSchema,
  temperature: 0.5,
  maxTokens: 5000,
  operation: 'audit'
});
```

**After:**
```javascript
const audit = await AIOrchestrator.execute('review_analysis', {
  businessData,
  auditType: 'digital_presence'
}, {
  maxCost: 0.008,
  maxLatency: 30000,
  requireStructuredOutput: true
});
```

### 2.4 BrandStrategyService

**Before:**
```javascript
const brandDNA = await AIService.generate({
  prompt: buildBrandStrategyPrompt(normalizedBusinessData),
  model: 'brand',
  schema: brandSchema,
  temperature: 0.7,
  maxTokens: 6000,
  operation: 'brand'
});
```

**After:**
```javascript
const brandDNA = await AIOrchestrator.execute('report_generation', {
  businessData: normalizedBusinessData,
  reportType: 'brand_dna'
}, {
  maxCost: 0.015,
  maxLatency: 60000,
  requireStructuredOutput: true
});
```

### 2.5 LandingPageSpecService / LeadWebsiteSpecService

**Before:**
```javascript
const spec = await AIService.generate({
  prompt: buildLandingPageSpecPrompt(businessData, brandDNA, audit),
  model: 'extraction',
  schema: specSchema,
  temperature: 0.3,
  maxTokens: 6000,
  operation: 'extraction'
});
```

**After:**
```javascript
const spec = await AIOrchestrator.execute('report_generation', {
  businessData,
  brandDNA,
  audit,
  reportType: 'landing_page_spec'
}, {
  maxCost: 0.01,
  maxLatency: 45000,
  requireStructuredOutput: true
});
```

### 2.6 SalesOutreachService

**Before:**
```javascript
const email = await AIService.generate({
  prompt: buildOutreachPrompt(lead),
  model: 'copywriting',
  schema: emailSchema,
  temperature: 0.7,
  maxTokens: 2000,
  operation: 'copywriting'
});
```

**After:**
```javascript
const email = await AIOrchestrator.execute('report_generation', {
  lead,
  assetType: 'outreach_email'
}, {
  maxCost: 0.002,
  maxLatency: 15000,
  requireStructuredOutput: true
});
```

### 2.7 DesignIntelligenceService

**Before:**
```javascript
const design = await AIService.generate({
  prompt: buildDesignPrompt(businessData, brandDNA),
  model: 'extraction',
  schema: designSchema,
  temperature: 0.5,
  maxTokens: 4000,
  operation: 'extraction'
});
```

**After:**
```javascript
const design = await AIOrchestrator.execute('structured_output', {
  businessData,
  brandDNA,
  outputType: 'design_intelligence'
}, {
  maxCost: 0.001,
  maxLatency: 15000,
  requireStructuredOutput: true
});
```

---

## 3. Provenance Handling Changes

### 3.1 Old: Manual Provenance
```javascript
// Old: Manual provenance attachment
const result = await AIService.generate({...});
result.__ai = { provider: 'openrouter', model: 'claude-3.5-sonnet', ... };
```

### 3.2 New: Automatic Provenance
```javascript
// New: Automatic provenance on every result
const result = await AIOrchestrator.execute('business_research', input, options);
// Result includes:
result.__provenance = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  capability: 'business_research',
  tokens: { prompt: 1200, completion: 800, total: 2000 },
  costUSD: 0.0008,
  latencyMs: 2100,
  fallbackCount: 0,
  attempts: [
    { provider: 'deepseek', model: 'deepseek-chat', success: true, latencyMs: 2100 }
  ],
  grounding: { checked: true, mode: 'enforce', grounded: 0.92, unsupported: 0.03 }
};
```

### 3.3 BusinessProfile Integration
```javascript
// Old: Manual merge with provenance
profile.merge(aiResult, 'ai_generated', 0.7);

// New: Automatic via CandidatePipeline
const pipelineResult = await runAIEnrichmentPipeline(profile, aiResult, sourceUrl, {
  overwriteBelowConfidence: 0.5,
  minIncomingConfidence: 0.75
});
// Provenance automatically attached as 'ai_generated' with confidence
```

---

## 4. Error Handling Changes

### 4.1 Old: Try/Catch with AIError
```javascript
try {
  const result = await AIService.generate({ model: 'brand', ... });
} catch (error) {
  const aiError = AIError.from(error);
  if (aiError.category === 'QUOTA_EXHAUSTED') {
    // Handle quota
  }
  throw error;
}
```

### 4.2 New: Structured Result with Fallback
```javascript
const result = await AIOrchestrator.execute('business_research', input, {
  onFail: 'unknown'  // Returns UNKNOWN envelopes instead of throwing
});

// Result always returned (unless onFail: 'throw')
if (result.output.someField?.unknownReason) {
  // Handle UNKNOWN envelopes
}

// Full attempt chain available
result.__provenance.attempts.forEach(attempt => {
  console.log(`${attempt.provider}: ${attempt.success ? 'success' : attempt.error}`);
});
```

### 4.3 Fallback Behavior
```javascript
// Automatic fallback chain
const result = await AIOrchestrator.execute('business_research', input);

// If all AI providers fail:
if (result.fallback === 'deterministic') {
  // Result contains deterministic template with extracted facts
  // No AI-generated content, safe to use
}
```

---

## 5. Configuration Migration

### 5.1 Environment Variables

| Old Variable | New Variable | Notes |
|--------------|--------------|-------|
| `AI_PRIMARY_MODEL` | Capability routing | Deprecated - use capability policies |
| `AI_FALLBACK_MODEL` | Capability routing | Deprecated |
| `AI_PRIMARY_PROVIDER` | `AI_PRIMARY_PROVIDER` | Still used for chain order |
| `AI_SECONDARY_PROVIDER` | `AI_SECONDARY_PROVIDER` | Still used |
| `AI_FALLBACK_PROVIDER` | `AI_FALLBACK_PROVIDER` | Still used |
| `AI_TIMEOUT_MS` | `AI_TIMEOUT_MS` | Per-request timeout |
| `AI_MAX_TOTAL_MS` | `AI_MAX_TOTAL_MS` | Total chain budget |
| `AI_MAX_RETRIES` | `AI_MAX_RETRIES` | Per-provider retries |

### 5.2 New Required Variables
```bash
# Cost management
AI_COST_PHASE=controlled
AI_MONTHLY_BUDGET_USD=50

# Capability budgets (optional)
AI_MAX_COST_BUSINESS_EXTRACTION=0.001
AI_MAX_COST_BUSINESS_RESEARCH=0.010

# Resilience
AI_CIRCUIT_BREAKER_THRESHOLD=5
AI_COOLDOWN_BASE_MS=30000

# Cost phase
AI_COST_PHASE=controlled  # free | controlled | production
```

---

## 5. Testing Migration

### 5.1 Run Existing Tests
```bash
cd apps/api
npm test
# All 477+ existing tests should pass
```

### 5.2 Test New Orchestrator
```bash
# Test orchestrator directly
node -e "
const { AIOrchestrator } = require('./src/ai/AIOrchestrator.js');
const orchestrator = new AIOrchestrator();
const result = await orchestrator.execute('business_extraction', {
  html: '<html>Test business</html>'
}, { maxCost: 0.001 });
console.log(result);
"
```

### 5.3 Verify Provenance
```javascript
const result = await AIOrchestrator.execute('business_extraction', { html: '...' });
console.log('Provenance:', result.__provenance);
console.log('Output:', result.output);
```

---

## 6. Rollback Plan

If issues arise:

1. **Feature Flag:** Set `AI_USE_ORCHESTRATOR=false` to use legacy `AIService.generate()` directly
2. **Revert Config:** Remove new env vars, restore old `AI_PRIMARY_MODEL`
3. **Code Revert:** Git revert the migration commits

```bash
# Emergency rollback
export AI_USE_ORCHESTRATOR=false
# Restart API server
```

---

## 6. Verification Checklist

- [ ] All existing tests pass (477+ tests)
- [ ] New orchestrator tests pass
- [ ] Provenance attached to all results
- [ ] Fallback chain works (test with invalid API keys)
- [ ] Cost tracking records per-request
- [ ] Quota enforcement works (test with low budget)
- [ ] Circuit breaker opens/closes correctly
- [ ] Health endpoint shows all providers
- [ ] Diagnostic endpoint works
- [ ] Free tier preference works
- [ ] Deterministic fallback activates on total failure
- [ ] BusinessProfile provenance hierarchy enforced
- [ ] No data corruption on AI failure

---

## 7. Support

| Issue | Contact |
|-------|---------|
| Migration blockers | GitHub Issues |
| Provider integration | Respective provider support |
| Performance tuning | Check `/health/ai` metrics |
| Cost optimization | Review `/health/ai` telemetry |