# Webloom Model Routing Policy

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Status:** Approved for Implementation

---

## 1. Routing Philosophy

**Core Principle:** Route each AI request to the **optimal model** based on:
1. **Capability match** - Model excels at the specific task type
2. **Cost efficiency** - Prefer free/cheaper models for simple tasks
3. **Quality requirements** - Reserve expensive reasoning models for high-value tasks
4. **Availability** - Respect rate limits, quotas, and health status
5. **Latency constraints** - Meet per-capability SLA targets

**Never** hardcode provider/model names in application code. Use capability-based routing exclusively.

---

## 2. Capability Definitions

| Capability | Description | Typical Tasks | Quality Tier | Cost Sensitivity |
|------------|-------------|---------------|--------------|------------------|
| `business_extraction` | Structured field extraction from HTML/text | Google Maps parsing, website contact extraction, service lists | Standard | High (high volume) |
| `business_research` | Deep reasoning, synthesis, strategy | Brand DNA, competitive analysis, market positioning | **Premium** | Medium |
| `entity_resolution` | Cross-provider matching, deduplication | Name/phone/address matching, duplicate detection | Standard | Medium |
| `review_analysis` | Sentiment, themes, clustering | Sentiment classification, theme extraction, complaint clustering | Standard | High |
| `sentiment_classification` | Binary/ternary classification | Positive/neutral/negative + confidence | Standard | High |
| `competitor_analysis` | Strategic reasoning, differentiation | Competitive matrix, advantage identification | **Premium** | Low |
| `trend_classification` | Temporal pattern detection | Emerging complaints, seasonal patterns | **Premium** | Low |
| `report_generation` | Long-form synthesis | Prospect reports, outreach emails, value props | **Premium** | Medium |
| `structured_output` | Schema-constrained JSON | Any task requiring validated JSON | Standard | High |

---

## 3. Routing Policy Table

### 3.1 Primary/Secondary/Tertiary/Fallback Assignments

| Capability | Primary | Secondary | Tertiary | Fallback |
|------------|---------|-----------|----------|----------|
| `business_extraction` | **DeepSeek V3** (DeepSeek API) | Qwen 2.5 32B (Together AI) | Mistral Small (Fireworks) | Local (Ollama Llama 3.1 8B) |
| `business_research` | **Nemotron 3 Ultra** (NVIDIA NIM) | DeepSeek R1 (DeepSeek API) | Qwen 3 235B (Together AI) | DeepSeek V3 |
| `entity_resolution` | **DeepSeek V3** (DeepSeek API) | Qwen 2.5 32B (Together AI) | Mistral Small (Fireworks) | Local (Ollama) |
| `review_analysis` | **DeepSeek V3** (DeepSeek API) | Qwen 2.5 14B (Together AI) | Mistral Small (Fireworks) | Local (Ollama) |
| `sentiment_classification` | **DeepSeek V3** (DeepSeek API) | Qwen 2.5 7B (Together AI) | Mistral Small (Fireworks) | Local (Ministral 3B) |
| `competitor_analysis` | **Nemotron 3 Ultra** (NVIDIA) | DeepSeek R1 (DeepSeek API) | Qwen 3 235B (Together AI) | DeepSeek V3 |
| `trend_classification` | **Nemotron 3 Ultra** (NVIDIA) | GLM-4 Flash (Z.ai) | DeepSeek R1 | DeepSeek V3 |
| `report_generation` | **Nemotron 3 Ultra** (NVIDIA) | DeepSeek V3 | Qwen 2.5 72B (Together AI) | Deterministic template |
| `structured_output` | **DeepSeek V3** (native JSON schema) | Qwen 2.5 32B (Together AI) | Gemini 1.5 Flash | JSON repair pipeline |

### 3.2 Routing Rules

1. **Free Tier First** - When `preferFree: true` (default for extraction/classification), prefer providers with free tier availability
2. **Cost Ceiling** - Never exceed `maxCostPerRequest` for capability (see Section 4)
3. **Health Gate** - Never route to provider with `health.usable === false` or `circuitState === OPEN`
4. **Cooldown Respect** - Never route to provider in cooldown (`cooldownRemaining > 0`)
4. **Capability Match** - Provider must support capability (see Compatibility Matrix)
5. **Latency SLA** - Prefer providers meeting `maxLatencyMs` for capability
6. **Fallback Depth** - Maximum 3 fallbacks per request (configurable)

---

## 4. Cost & Quality Constraints

### 4.1 Per-Capability Budgets

| Capability | Max Tokens | Max Cost/Request | Max Latency (p50) | Prefer Free |
|------------|------------|------------------|-------------------|-------------|
| `business_extraction` | 2,000 | $0.001 | 5s | ✅ Yes |
| `business_research` | 6,000 | $0.010 | 30s | ❌ No |
| `entity_resolution` | 1,000 | $0.0005 | 3s | ✅ Yes |
| `review_analysis` | 1,500 | $0.001 | 5s | ✅ Yes |
| `sentiment_classification` | 500 | $0.0003 | 2s | ✅ Yes |
| `competitor_analysis` | 4,000 | $0.005 | 20s | ❌ No |
| `trend_classification` | 3,000 | $0.003 | 15s | ❌ No |
| `report_generation` | 8,000 | $0.020 | 45s | ❌ No |
| `structured_output` | 2,000 | $0.001 | 5s | ✅ Yes |

### 4.2 Monthly Budget Allocation

| Tier | Monthly Budget | Capabilities Covered |
|------|----------------|---------------------|
| **Free Experimentation** | $0 | All extraction/classification via free tiers |
| **Controlled Paid** | $50/mo | + Nemotron for research/report generation |
| **Production** | $200/mo | Full capability suite, reserved capacity |

---

## 5. Routing Algorithm

```python
def route(capability, context):
    policy = CAPABILITY_POLICIES[capability]
    candidates = []

    for tier in ['primary', 'secondary', 'tertiary', 'fallback']:
        model_id = policy[tier]
        if not model_id:
            continue

        provider, model = resolve_model(model_id)
        
        # Health gate
        if not health.is_healthy(provider):
            continue
        if health.in_cooldown(provider):
            continue
        if health.circuit_open(provider):
            continue

        # Capability gate
        if not compatibility.supports(provider, capability):
            continue

        # Cost gate
        estimated_cost = estimate_cost(provider, model, policy.max_tokens)
        if estimated_cost > policy.max_cost:
            continue

        # Latency gate
        if health.latency_p50(provider) > policy.max_latency:
            continue

        # Free tier preference
        score = calculate_score(provider, model, capability, context)
        candidates.append((score, provider, model))

    if not candidates:
        return FALLBACK_RESULT  # Deterministic template or error

    return select_best(candidates)
```

### Scoring Factors
| Factor | Weight | Description |
|--------|--------|-------------|
| **Capability Quality** | 40% | Model benchmark score for capability |
| **Cost Efficiency** | 25% | Cost per quality unit |
| **Latency** | 15% | Inverse of p50 latency |
| **Availability** | 10% | 1 - failure_rate |
| **Free Tier Bonus** | 10% | +10% if free tier available |

---

## 6. Override Mechanisms

### 6.1 Per-Request Overrides
```javascript
AIOrchestrator.execute('business_research', input, {
  preferredProvider: 'nvidia',      // Force provider
  preferredModel: 'nemotron-3-ultra', // Force model
  maxCost: 0.02,                    // Override budget
  maxLatency: 60000,                // Override latency
  requireStructuredOutput: true,    // Force JSON schema
  preferFree: false                 // Disable free-tier preference
})
```

### 6.2 Capability Policy Overrides (Config)
```javascript
// In env.js or config file
capabilityPolicies: {
  business_research: {
    primary: 'nvidia:nemotron-3-ultra',
    secondary: 'deepseek:deepseek-reasoner',
    maxCost: 0.015,
    maxLatency: 60000,
    preferFree: false
  }
}
```

---

## 6. Fallback Behavior Specification

### 6.1 Fallback Chain
```
Primary → Secondary → Tertiary → Fallback → Deterministic Template
```

### 6.2 Fallback Triggers
| Trigger | Action |
|---------|--------|
| Provider unhealthy (circuit OPEN, cooldown, unusable) | Skip to next |
| Provider returns error (429, 5xx, timeout) | Retry per policy, then fallback |
| Cost estimate exceeds budget | Skip to cheaper provider |
| Latency SLA breach risk | Skip to faster provider |
| Capability not supported | Skip to next |
| All AI providers fail | Deterministic fallback |

### 6.3 Deterministic Fallbacks
| Capability | Fallback Behavior |
|------------|-------------------|
| `business_extraction` | Regex-based extraction from HTML |
| `business_research` | Template with extracted facts only |
| `entity_resolution` | Exact string matching only |
| `review_analysis` | Star-rating based heuristics |
| `report_generation` | Pre-written template with extracted facts |

---

## 7. Monitoring & Alerting

### 7.1 Routing Metrics
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Primary selection rate | > 70% | < 50% |
| Fallback rate | < 10% | > 20% |
| Deterministic fallback rate | < 1% | > 5% |
| Cost per capability | Within budget | > 120% of budget |
| Latency p50 | Within SLA | > 150% of SLA |

### 7.2 Routing Health Checks
- **Daily:** Primary selection rates per capability
- **Hourly:** Fallback chain depth distribution
- **Real-time:** Circuit breaker states, cooldown status
- **Weekly:** Cost per capability vs budget

---

## 8. Policy Evolution

### 8.1 Update Triggers
- New model release with better benchmark scores
- Provider pricing changes
- Free tier limit changes
- Capability benchmark re-evaluation (quarterly)
- Production incident caused by routing

### 8.2 Change Process
1. Update `MODEL-ROUTING-POLICY.md`
2. Update capability policies in config
3. Run evaluation benchmark on affected capabilities
4. Deploy with feature flag
5. Monitor routing metrics for 48h
6. Rollback if metrics degrade

---

## 9. Current Policy Version

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-11-16 | Initial policy based on Phase 2-3 research |

**Next Review:** 2027-02-16 (quarterly)