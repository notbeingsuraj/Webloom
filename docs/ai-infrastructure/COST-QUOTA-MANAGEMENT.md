# Cost & Quota Management Documentation

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Component:** CostTracker, QuotaManager, CapabilityRouter

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AIOrchestrator.execute()                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  CapabilityRouter.select()                    │
│  • Filters by health, capability, cost, latency              │
│  • Returns ordered (provider, model) pairs                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  QuotaManager.canAfford()                     │
│  • Checks monthly budget per provider                        │
│  • Returns estimated cost vs remaining budget                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ProviderHealthMonitor.isHealthy()                │
│  • Checks circuit breaker, cooldown, error rate              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              RetryController.executeWithRetry()               │
│  • Bounded retries with exponential backoff + jitter         │
│  • Respects Retry-After headers                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              FallbackController.selectFallback()              │
│  • Prevents loops (max depth 3)                              │
│  • Selects best available alternative                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CostTracker.record()                             │
│  • Tracks tokens, cost, latency per request                  │
│  • Aggregates daily/monthly/per-capability                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cost Tracking

### 2.1 CostTracker Implementation

**File:** `apps/api/src/ai/CostTracker.js`

```javascript
class CostTracker {
  constructor() {
    this.records = []; // In-memory ring buffer (max 10000)
    this.aggregates = {
      daily: new Map(),     // date → { cost, tokens, requests }
      monthly: new Map(),   // YYYY-MM → { cost, tokens, requests }
      byCapability: new Map(), // capability → { cost, tokens, requests }
      byProvider: new Map(),   // provider → { cost, tokens, requests }
    };
  }

  record({ provider, model, capability, promptTokens, completionTokens, costUSD, latencyMs, success }) {
    const record = {
      timestamp: Date.now(),
      provider, model, capability,
      promptTokens, completionTokens, totalTokens: promptTokens + completionTokens,
      costUSD, latencyMs, success
    };
    
    this.records.push(record);
    if (this.records.length > 10000) this.records.shift();
    
    this._updateAggregates(record);
  }

  _updateAggregates(record) {
    const date = new Date(record.timestamp).toISOString().split('T')[0];
    const month = date.slice(0, 7);
    
    // Daily
    this._inc(this.aggregates.daily, date, record);
    // Monthly
    this._inc(this.aggregates.monthly, month, record);
    // By capability
    this._inc(this.aggregates.byCapability, record.capability, record);
    // By provider
    this._inc(this.aggregates.byProvider, record.provider, record);
  }

  _inc(map, key, record) {
    const existing = map.get(key) || { cost: 0, tokens: 0, requests: 0, failures: 0 };
    existing.cost += record.costUSD;
    existing.tokens += record.totalTokens;
    existing.requests += 1;
    if (!record.success) existing.failures += 1;
    map.set(key, existing);
  }

  getSummary(period = 'monthly') {
    return Object.fromEntries(this.aggregates[period]);
  }

  getProjection() {
    const monthly = this.aggregates.monthly;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const current = monthly.get(currentMonth) || { cost: 0, requests: 0 };
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const projected = (current.cost / dayOfMonth) * daysInMonth;
    return { current: current.cost, projected, daysElapsed: dayOfMonth, daysInMonth };
  }
}
```

### 2.2 Cost Estimation

**ModelRegistry provides cost metadata:**

```javascript
// Per-model cost metadata
{
  costPer1MInputTokensUSD: 0.14,
  costPer1MOutputTokensUSD: 0.28,
  freeTierAvailable: true,
  freeTierLimits: { tokensPerMonth: 1000000, requestsPerMinute: 1000 }
}
```

**Estimation Formula:**
```javascript
estimateCost(model, promptTokens, completionTokens) {
  const meta = ModelRegistry.get(model);
  if (!meta) return 0;
  
  const inputCost = (promptTokens / 1_000_000) * meta.costPer1MInputTokensUSD;
  const outputCost = (completionTokens / 1_000_000) * meta.costPer1MOutputTokensUSD;
  return inputCost + outputCost;
}
```

---

## 3. Quota Management

### 3.1 QuotaManager Implementation

**File:** `apps/api/src/ai/QuotaManager.js`

```javascript
class QuotaManager {
  constructor() {
    this.budgets = new Map(); // provider → { monthlyBudgetUSD, currentUsageUSD, dailyUsageUSD, lastReset }
    this.alerts = { warned: new Set(), critical: new Set() };
  }

  initialize(provider, monthlyBudgetUSD) {
    this.budgets.set(provider, {
      monthlyBudgetUSD,
      currentUsageUSD: 0,
      dailyUsageUSD: 0,
      lastReset: Date.now(),
      requestsThisMonth: 0,
      tokensThisMonth: 0
    });
  }

  canAfford(provider, estimatedTokens, model) {
    const budget = this.budgets.get(provider);
    if (!budget) return { allowed: true, reason: 'no_budget_set' };
    
    const estimatedCost = estimateCost(model, estimatedTokens);
    const projectedUsage = budget.currentUsageUSD + estimatedCost;
    
    if (projectedUsage > budget.monthlyBudgetUSD) {
      return { allowed: false, reason: 'budget_exceeded', remaining: budget.monthlyBudgetUSD - budget.currentUsageUSD };
    }
    
    return { allowed: true, estimatedCost, remaining: budget.monthlyBudgetUSD - projectedUsage };
  }

  recordUsage(provider, tokens, costUSD) {
    const budget = this.budgets.get(provider);
    if (!budget) return;
    
    budget.currentUsageUSD += costUSD;
    budget.tokensThisMonth += tokens;
    budget.requestsThisMonth += 1;
    
    // Check alert thresholds
    const usagePercent = budget.currentUsageUSD / budget.monthlyBudgetUSD;
    if (usagePercent >= 0.95 && !this.alerts.critical.has(provider)) {
      this._alert('critical', provider, usagePercent);
    } else if (usagePercent >= 0.80 && !this.alerts.warned.has(provider)) {
      this.alert('warning', provider, usagePercent);
    }
  }

  getRemainingBudget(provider) {
    const budget = this.budgets.get(provider);
    if (!budget) return { unlimited: true };
    return {
      budgetUSD: budget.monthlyBudgetUSD,
      usedUSD: budget.currentUsageUSD,
      remainingUSD: Math.max(0, budget.monthlyBudgetUSD - budget.currentUsageUSD),
      usedPercent: budget.currentUsageUSD / budget.monthlyBudgetUSD,
      requestsThisMonth: budget.requestsThisMonth,
      tokensThisMonth: budget.tokensThisMonth
    };
  }

  resetMonthly() {
    const now = Date.now();
    for (const [provider, budget] of this.budgets) {
      const lastReset = new Date(budget.lastReset);
      const nowDate = new Date(now);
      if (lastReset.getMonth() !== nowDate.getMonth() || lastReset.getFullYear() !== nowDate.getFullYear()) {
        budget.currentUsageUSD = 0;
        budget.dailyUsageUSD = 0;
        budget.requestsThisMonth = 0;
        budget.tokensThisMonth = 0;
        budget.lastReset = now;
        this.alerts.warned.delete(provider);
        this.alerts.critical.delete(provider);
      }
    }
  }
}
```

### 3.2 Budget Configuration

```bash
# Total monthly budget
AI_MONTHLY_BUDGET_USD=50

# Per-provider budgets (optional override)
AI_PROVIDER_BUDGETS='{"openrouter": 20, "deepseek": 15, "nvidia": 15, "gemini": 10}'

# Alert thresholds
AI_QUOTA_ALERT_THRESHOLD=0.80    # Warn at 80%
AI_QUOTA_CRITICAL_THRESHOLD=0.95 # Critical at 95%
```

---

## 4. Free Tier Optimization

### 4.1 Free Tier Tracking

```javascript
// Per-provider free tier metadata (in ModelRegistry)
{
  freeTierAvailable: true,
  freeTierLimits: {
    tokensPerMonth: 1000000,
    requestsPerMinute: 1000,
    requestsPerDay: 10000
  }
}
```

### 4.2 Free Tier Preference Logic

```javascript
// In CapabilityRouter
selectProvider(capability, context) {
  const policy = this.policies[capability];
  const candidates = this.getHealthyProviders(capability);
  
  // Free tier preference
  if (policy.preferFree) {
    candidates.sort((a, b) => {
      const aFree = this.modelRegistry.hasFreeTier(a.model);
      const bFree = this.modelRegistry.hasFreeTier(b.model);
      if (aFree && !bFree) return -1;
      if (!aFree && bFree) return 1;
      return 0;
    });
  }
  
  // Cost-aware selection
  candidates.sort((a, b) => {
    const costA = this.estimateCost(a.provider, a.model, policy.maxTokens);
    const costB = this.estimateCost(b.provider, b.model, policy.maxTokens);
    return costA - costB;
  });
  
  return candidates[0];
}
```

### 4.3 Free Tier Consumption Tracking

```javascript
// In QuotaManager
getFreeTierStatus(provider) {
  const budget = this.budgets.get(provider);
  const meta = ModelRegistry.get(provider);
  if (!meta?.freeTierAvailable) return { available: false };
  
  return {
    available: true,
    limit: meta.freeTierLimits.tokensPerMonth,
    used: budget.tokensThisMonth,
    remaining: Math.max(0, meta.freeTierLimits.tokensPerMonth - budget.tokensThisMonth),
    usedPercent: budget.tokensThisMonth / meta.freeTierLimits.tokensPerMonth
  };
}
```

---

## 5. Transition Strategy: Free → Controlled → Production

### 5.1 Phase Definitions

| Phase | AI_COST_PHASE | Budget | Providers | Use Case |
|-------|---------------|--------|-----------|----------|
| **Free Experimentation** | `free` | $0 | Only free tiers + local | Development, testing, MVP validation |
| **Controlled Paid** | `controlled` | $10-50/mo | Free tiers + critical paid (Nemotron) | Pilot launch, early customers |
| **Production** | `production` | $100-500/mo | Full suite, reserved capacity | General availability |

### 5.2 Phase Configuration

```javascript
// In CapabilityRouter
getPolicy(capability) {
  const phase = process.env.AI_COST_PHASE || 'free';
  const basePolicy = BASE_POLICIES[capability];
  
  if (phase === 'free') {
    return { ...basePolicy, preferFree: true, maxCost: 0 };
  }
  if (phase === 'controlled') {
    return { ...basePolicy, preferFree: true, maxCost: basePolicy.maxCost * 0.5 };
  }
  return basePolicy; // production: full budgets
}
```

### 5.3 Transition Checklist

| Step | Free → Controlled | Controlled → Production |
|------|-------------------|-------------------------|
| 1 | Set `AI_COST_PHASE=controlled` | Set `AI_COST_PHASE=production` |
| 2 | Set `AI_MONTHLY_BUDGET_USD=50` | Set `AI_MONTHLY_BUDGET_USD=200` |
| 3 | Enable Nemotron (add NVIDIA_API_KEY) | Reserve capacity for critical providers |
| 4 | Monitor free tier consumption daily | Set up reserved capacity / dedicated endpoints |
| 5 | Alert at 80% free tier usage | Negotiate enterprise SLAs |

---

## 6. Cost Projection & Monitoring

### 6.1 Daily/Monthly Reports

```javascript
// CostTracker.getProjection()
{
  current: 12.45,      // USD spent this month
  projected: 37.35,    // Projected at current rate
  daysElapsed: 10,     // Days into month
  daysInMonth: 30,
  dailyAverage: 1.245
}
```

### 6.2 Health Endpoint Cost Summary

```json
// GET /health/ai
{
  "telemetry": {
    "totalRequests": 1250,
    "successRate": 0.97,
    "avgLatencyMs": 1450,
    "totalCostUSD": 12.45,
    "cacheHitRate": 0.34
  },
  "providers": {
    "deepseek": { "quotaUsedPercent": 0.15, "costUSD": 2.30 },
    "nvidia": { "quotaUsedPercent": 0.45, "costUSD": 8.90 },
    "gemini": { "quotaUsedPercent": 0.05, "costUSD": 0.12 }
  }
}
```

### 6.3 Alerting

```javascript
// Alert triggers
if (dailyCost > AI_COST_ALERT_THRESHOLD_USD) alert('daily_cost_exceeded');
if (monthlyProjected > monthlyBudget * 1.2) alert('budget_projection_exceeded');
if (freeTierUsedPercent > 0.9) alert('free_tier_exhaustion_imminent');
if (providerCost > capabilityBudget * 1.5) alert('capability_over_budget');
```

---

## 7. Integration Points

### 7.1 In AIOrchestrator.execute()

```javascript
async execute(capability, input, options) {
  // 1. Route to providers
  const candidates = this.router.route(capability, context);
  
  // 2. Check quota for each candidate
  for (const { provider, model } of candidates) {
    const quotaCheck = this.quota.canAfford(provider, estimatedTokens, model);
    if (!quotaCheck.allowed) continue; // Skip to next candidate
  }
  
  // 3. Execute with retry/fallback
  const result = await this.retry.executeWithRetry(async () => {
    const result = await provider.generate(request);
    
    // Record success
    this.costTracker.record({ provider, model, capability, ... });
    this.quota.recordUsage(provider, tokens, costUSD);
    this.health.recordSuccess(provider, latency);
    
    return result;
  });
  
  // 4. On failure
  this.costTracker.record({ ..., success: false });
  this.health.recordFailure(provider, error);
  this.circuitBreaker.recordFailure(provider);
  this.quota.recordUsage(provider, 0, 0); // Track failed attempt
}
```

---

## 8. Testing Cost & Quota

```javascript
// test_cost_optimization.js
describe('CostTracker', () => {
  it('records per-request cost', () => {});
  it('aggregates daily/monthly', () => {});
  it('projects monthly cost', () => {});
});

describe('QuotaManager', () => {
  it('enforces monthly budget', () => {});
  it('allows free tier when budget exceeded', () => {});
  it('alerts at 80% and 95%', () => {});
});

describe('CapabilityRouter', () => {
  it('prefers free tier for extraction', () => {});
  it('uses Nemotron for research', () => {});
  it('respects cost ceiling', () => {});
});
```

---

## 9. Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_COST_PHASE` | `free` | `free`, `controlled`, `production` |
| `AI_MONTHLY_BUDGET_USD` | `50` | Total monthly budget |
| `AI_PROVIDER_BUDGETS` | `{}` | Per-provider overrides (JSON) |
| `AI_QUOTA_ALERT_THRESHOLD` | `0.80` | Warn at 80% budget |
| `AI_QUOTA_CRITICAL_THRESHOLD` | `0.95` | Critical at 95% |
| `AI_DISABLE_PAID_PROVIDERS` | `false` | Kill switch for paid APIs |
| `AI_PREFER_FREE_TIER` | `true` | Prefer free-tier models |
| `AI_COST_TRACKING_ENABLED` | `true` | Enable cost tracking |
| `AI_COST_ALERT_THRESHOLD_USD` | `10` | Daily cost alert threshold |
| `AI_COST_PROJECTION_ENABLED` | `true` | Enable monthly projection |