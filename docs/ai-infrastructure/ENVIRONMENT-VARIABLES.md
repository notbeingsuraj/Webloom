# AI Infrastructure Environment Variables

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Purpose:** Complete reference for all AI-related environment variables

---

## 1. Provider Chain Configuration

```bash
# Core provider chain (ordered)
AI_PRIMARY_PROVIDER=openrouter          # Primary provider name
AI_SECONDARY_PROVIDER=gemini            # Secondary provider name  
AI_FALLBACK_PROVIDER=local              # Fallback provider name

# Legacy single-model overrides (deprecated - use capability routing)
# AI_PRIMARY_MODEL=anthropic/claude-3.5-sonnet
# AI_FALLBACK_MODEL=gemini-1.5-flash
```

---

## 2. Provider API Keys & Configuration

### 2.1 OpenRouter (Primary)
```bash
OPENROUTER_API_KEY=your_openrouter_key_here          # Required
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet         # Default model
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1     # API endpoint
OPENROUTER_TIMEOUT_MS=30000                          # Request timeout
OPENROUTER_APP_URL=https://webloom.dev               # Attribution (required for free models)
OPENROUTER_APP_NAME=Webloom                          # Attribution
```

#### Per-Operation Model Overrides (Optional)
```bash
OPENROUTER_EXTRACTION_MODEL=anthropic/claude-3.5-haiku
OPENROUTER_BRAND_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_AUDIT_MODEL=anthropic/claude-3.5-sonnet
```

### 2.2 NVIDIA NIM (Nemotron 3 Ultra)
```bash
NVIDIA_API_KEY=your_nvidia_key_here                  # Required
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b       # Model identifier
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1  # API endpoint
NVIDIA_TIMEOUT_MS=60000                              # Longer timeout for reasoning
```

### 2.3 DeepSeek API
```bash
DEEPSEEK_API_KEY=your_deepseek_key_here              # Required
DEEPSEEK_MODEL=deepseek-chat                         # or deepseek-reasoner
DEEPSEEK_BASE_URL=https://api.deepseek.com           # API endpoint
DEEPSEEK_TIMEOUT_MS=30000
```

### 2.4 Gemini API
```bash
GEMINI_API_KEY=your_gemini_key_here                  # Required
GEMINI_MODEL=gemini-1.5-flash                        # or gemini-1.5-pro
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_TIMEOUT_MS=30000
```

#### Per-Operation Model Overrides (Optional)
```bash
GEMINI_EXTRACTION_MODEL=gemini-1.5-flash
GEMINI_BRAND_MODEL=gemini-1.5-pro
GEMINI_AUDIT_MODEL=gemini-1.5-pro
```

### 2.5 Hugging Face Inference
```bash
HF_API_KEY=your_huggingface_key_here                 # Required
HF_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct       # Model repo ID
HF_BASE_URL=https://api-inference.huggingface.co     # Serverless endpoint
HF_TIMEOUT_MS=60000                                  # Longer for cold starts
```

### 2.6 Together AI
```bash
TOGETHER_API_KEY=your_together_key_here              # Required
TOGETHER_MODEL=meta-llama/Meta-Llama-3.1-70B-Instruct
TOGETHER_BASE_URL=https://api.together.xyz/v1
TOGETHER_TIMEOUT_MS=30000
```

### 2.7 Fireworks AI
```bash
FIREWORKS_API_KEY=your_fireworks_key_here            # Required
FIREWORKS_MODEL=accounts/fireworks/models/llama-v3p1-70b-instruct
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_TIMEOUT_MS=30000
```

### 2.8 Local / Self-Hosted (Ollama, vLLM, LM Studio)
```bash
LOCAL_AI_BASE_URL=http://localhost:11434/v1          # Ollama default
LOCAL_AI_MODEL=llama3.1:8b                           # Ollama model tag
LOCAL_AI_API_KEY=                                    # Usually empty for local
LOCAL_AI_TIMEOUT_MS=120000                           # Longer for local
LOCAL_AI_REQUIRES_API_KEY=false                      # Set true if your server requires auth
LOCAL_AI_LABEL=Local AI                              # Display name
```

#### For vLLM / TGI / LM Studio
```bash
SELF_HOSTED_BASE_URL=http://localhost:8000/v1        # vLLM default
SELF_HOSTED_MODEL=meta-llama/Meta-Llama-3.1-70B-Instruct
SELF_HOSTED_API_KEY=your_key_if_needed
SELF_HOSTED_TIMEOUT_MS=60000
```

---

## 3. Orchestrator Configuration

```bash
# Capability-based routing
AI_COST_PHASE=free                    # free | controlled | production
AI_MONTHLY_BUDGET_USD=50              # Monthly spending limit (total)
AI_DISABLE_PAID_PROVIDERS=false       # Set true to disable all paid providers

# Capability-specific budgets (JSON or individual vars)
AI_MAX_COST_BUSINESS_EXTRACTION=0.001
AI_MAX_COST_BUSINESS_RESEARCH=0.010
AI_MAX_COST_ENTITY_RESOLUTION=0.0005
AI_MAX_COST_REVIEW_ANALYSIS=0.001
AI_MAX_COST_SENTIMENT_CLASSIFICATION=0.0003
AI_MAX_COST_COMPETITOR_ANALYSIS=0.005
AI_MAX_COST_TREND_CLASSIFICATION=0.003
AI_MAX_COST_REPORT_GENERATION=0.020
AI_MAX_COST_STRUCTURED_OUTPUT=0.001

# Latency SLA per capability (milliseconds)
AI_MAX_LATENCY_BUSINESS_EXTRACTION=5000
AI_MAX_LATENCY_BUSINESS_RESEARCH=30000
AI_MAX_LATENCY_ENTITY_RESOLUTION=3000
AI_MAX_LATENCY_REVIEW_ANALYSIS=5000
AI_MAX_LATENCY_SENTIMENT_CLASSIFICATION=2000
AI_MAX_LATENCY_COMPETITOR_ANALYSIS=20000
AI_MAX_LATENCY_TREND_CLASSIFICATION=15000
AI_MAX_LATENCY_REPORT_GENERATION=45000
AI_MAX_LATENCY_STRUCTURED_OUTPUT=5000
```

---

## 4. Core AI Service Configuration (Existing)

```bash
# Timeouts & Budgets
AI_TIMEOUT_MS=30000                    # Per-request timeout
AI_MAX_TOTAL_MS=90000                  # Total chain budget (all providers + retries)
AI_MAX_RETRIES=1                       # Per-provider retries (0 = no retry)
AI_MAX_TOKEN_DOWNGRADES=1              # 402 re-dispatch attempts
AI_PROBE_MAX_TOKENS=6000               # Health probe token ceiling
AI_PROBE_VERIFY_AUTH=true              # Verify auth on health probe

# Legacy model overrides (deprecated)
AI_PRIMARY_MODEL=                      # Override primary provider model
AI_FALLBACK_MODEL=                     # Override fallback provider model

# Enrichment & Grounding
AI_ENRICHMENT_OVERWRITE_BELOW=0.5      # Confidence floor for AI overwrite
AI_ENRICHMENT_MIN_CONFIDENCE=0.75      # Min confidence for AI factual writes
AI_GROUNDING_ENFORCE=true              # Enforce evidence grounding
AI_OFFICIAL_WEBSITE=true               # Crawl business website during enrichment
AI_OFFICIAL_WEBSITE_NAME_MATCH=0.75    # Min name similarity for website match
AI_OFFICIAL_WEBSITE_MAX_CANDIDATES=3   # Max AI-proposed domains to probe
```

---

## 5. Resilience Configuration

```bash
# Circuit Breaker
AI_CIRCUIT_BREAKER_THRESHOLD=5         # Failures before OPEN
AI_CIRCUIT_BREAKER_TIMEOUT=60000       # ms before HALF_OPEN probe
AI_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2 # Successes to CLOSE from HALF_OPEN

# Cooldown
AI_COOLDOWN_BASE_MS=30000              # Base cooldown (exponential backoff)
AI_COOLDOWN_MAX_MS=600000              # Max cooldown (10 min)
AI_COOLDOWN_MULTIPLIER=2               # Exponential multiplier

# Retry
AI_RETRY_BASE_DELAY_MS=250             # Base delay for exponential backoff
AI_RETRY_MAX_DELAY_MS=5000             # Max delay cap
AI_RETRY_JITTER_MS=250                 # Jitter range

# Quota Management
AI_QUOTA_ALERT_THRESHOLD=0.8           # Alert at 80% budget
AI_QUOTA_CRITICAL_THRESHOLD=0.95       # Critical at 95%
AI_QUOTA_DISABLE_AT_LIMIT=true         # Disable provider at 100%
```

---

## 6. Cost & Free Tier Configuration

```bash
# Cost Phase
AI_COST_PHASE=free                     # free | controlled | production

# Budgets
AI_MONTHLY_BUDGET_USD=50               # Total monthly budget
AI_PROVIDER_BUDGETS='{}'               # JSON: {"openrouter": 20, "deepseek": 15, "nvidia": 15}

# Free Tier
AI_PREFER_FREE_TIER=true               # Prefer free-tier models
AI_FREE_TIER_ALERT_THRESHOLD=0.8       # Alert at 80% free tier consumption

# Cost Tracking
AI_COST_TRACKING_ENABLED=true
AI_COST_ALERT_THRESHOLD_USD=10         # Alert when daily cost exceeds
AI_COST_PROJECTION_ENABLED=true
```

---

## 6. Health Monitoring Configuration

```bash
# Health Checks
AI_HEALTH_PROBE_TTL_MS=30000           # Cache TTL for health results
AI_HEALTH_PROBE_VERIFY_AUTH=true       # Verify auth on probe
AI_HEALTH_PROBE_MAX_TOKENS=10          # Minimal tokens for probe
AI_HEALTH_LATENCY_PERCENTILES=50,95,99 # Percentiles to track
AI_HEALTH_FAILURE_RATE_WINDOW=100      # Sliding window for failure rate

# Diagnostics
AI_DIAGNOSTIC_RATE_LIMIT=10            # Per minute per IP
AI_DIAGNOSTIC_TIMEOUT_MS=30000         # Diagnostic timeout
```

---

## 7. Feature Flags

```bash
# Feature Toggles
AI_OFFICIAL_WEBSITE=true               # Enable website crawling
AI_GROUNDING_ENFORCE=true              # Evidence grounding enforcement
AI_COST_PHASE=free                     # free | controlled | production
AI_DISABLE_PAID_PROVIDERS=false        # Emergency kill switch
AI_DEBUG_BUSINESS_ANALYSIS=false       # Verbose AI logging
```

---

## 8. Baseline Evaluation (Existing)

```bash
AI_BASELINE_PROVIDER=local             # local | openrouter
AI_BASELINE_MODEL=                     # Override baseline model
AI_BASELINE_FORMAT=none                # none | json_object | json_schema
```

---

## 9. Complete .env.example

```bash
# ===========================================
# Webloom AI Infrastructure Configuration
# ===========================================
# Copy this file to .env and fill in your values
# NEVER commit real API keys to version control!
# ===========================================

# -------------------------------------------
# Provider Chain
# -------------------------------------------
AI_PRIMARY_PROVIDER=openrouter
AI_SECONDARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=local

# -------------------------------------------
# OpenRouter (Primary)
# -------------------------------------------
OPENROUTER_API_KEY=your_openrouter_key_here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=30000
OPENROUTER_APP_URL=https://webloom.dev
OPENROUTER_APP_NAME=Webloom

# Per-operation models (optional)
# OPENROUTER_EXTRACTION_MODEL=anthropic/claude-3.5-haiku
# OPENROUTER_BRAND_MODEL=anthropic/claude-3.5-sonnet
# OPENROUTER_AUDIT_MODEL=anthropic/claude-3.5-sonnet

# -------------------------------------------
# NVIDIA NIM - Nemotron 3 Ultra (Reasoning)
# -------------------------------------------
NVIDIA_API_KEY=your_nvidia_key_here
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_TIMEOUT_MS=60000

# -------------------------------------------
# DeepSeek API (Extraction & Reasoning)
# -------------------------------------------
DEEPSEEK_API_KEY=your_deepseek_key_here
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=30000

# -------------------------------------------
# Gemini API (Secondary)
# -------------------------------------------
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-1.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_TIMEOUT_MS=30000

# -------------------------------------------
# Together AI (Open-weight hosting)
# -------------------------------------------
TOGETHER_API_KEY=your_together_key_here
TOGETHER_MODEL=meta-llama/Meta-Llama-3.1-70B-Instruct
TOGETHER_BASE_URL=https://api.together.xyz/v1
TOGETHER_TIMEOUT_MS=30000

# -------------------------------------------
# Local / Self-Hosted (Ollama, vLLM, LM Studio)
# -------------------------------------------
LOCAL_AI_BASE_URL=http://localhost:11434/v1
LOCAL_AI_MODEL=llama3.1:8b
LOCAL_AI_API_KEY=
LOCAL_AI_TIMEOUT_MS=120000
LOCAL_AI_REQUIRES_API_KEY=false
LOCAL_AI_LABEL=Local AI

# -------------------------------------------
# Core AI Service
# -------------------------------------------
AI_PRIMARY_PROVIDER=openrouter
AI_SECONDARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=local
AI_TIMEOUT_MS=30000
AI_MAX_TOTAL_MS=90000
AI_MAX_RETRIES=1
AI_MAX_TOKEN_DOWNGRADES=1
AI_PROBE_MAX_TOKENS=6000
AI_PROBE_VERIFY_AUTH=true

# -------------------------------------------
# Orchestrator & Cost
# -------------------------------------------
AI_COST_PHASE=free
AI_MONTHLY_BUDGET_USD=50
AI_DISABLE_PAID_PROVIDERS=false

# Capability budgets (optional, override defaults)
# AI_MAX_COST_BUSINESS_EXTRACTION=0.001
# AI_MAX_COST_BUSINESS_RESEARCH=0.010
# AI_MAX_COST_ENTITY_RESOLUTION=0.0005
# AI_MAX_COST_REVIEW_ANALYSIS=0.001
# AI_MAX_COST_SENTIMENT_CLASSIFICATION=0.0003
# AI_MAX_COST_COMPETITOR_ANALYSIS=0.005
# AI_MAX_COST_TREND_CLASSIFICATION=0.003
# AI_MAX_COST_REPORT_GENERATION=0.020
# AI_MAX_COST_STRUCTURED_OUTPUT=0.001

# -------------------------------------------
# Resilience
# -------------------------------------------
AI_CIRCUIT_BREAKER_THRESHOLD=5
AI_CIRCUIT_BREAKER_TIMEOUT=60000
AI_CIRCUIT_BREAKER_SUCCESS_THRESHOLD=2
AI_COOLDOWN_BASE_MS=30000
AI_COOLDOWN_MAX_MS=600000
AI_COOLDOWN_MULTIPLIER=2
AI_RETRY_BASE_DELAY_MS=250
AI_RETRY_MAX_DELAY_MS=5000
AI_RETRY_JITTER_MS=250

# -------------------------------------------
# Cost & Free Tier
# -------------------------------------------
AI_COST_PHASE=free
AI_MONTHLY_BUDGET_USD=50
AI_DISABLE_PAID_PROVIDERS=false
AI_PREFER_FREE_TIER=true
AI_FREE_TIER_ALERT_THRESHOLD=0.8
AI_COST_TRACKING_ENABLED=true
AI_COST_ALERT_THRESHOLD_USD=10
AI_COST_PROJECTION_ENABLED=true

# -------------------------------------------
# Health Monitoring
# -------------------------------------------
AI_HEALTH_PROBE_TTL_MS=30000
AI_HEALTH_PROBE_VERIFY_AUTH=true
AI_HEALTH_PROBE_MAX_TOKENS=10
AI_HEALTH_LATENCY_PERCENTILES=50,95,99
AI_HEALTH_FAILURE_RATE_WINDOW=100
AI_DIAGNOSTIC_RATE_LIMIT=10
AI_DIAGNOSTIC_TIMEOUT_MS=30000

# -------------------------------------------
# Feature Flags
# -------------------------------------------
AI_OFFICIAL_WEBSITE=true
AI_GROUNDING_ENFORCE=true
AI_COST_PHASE=free
AI_DISABLE_PAID_PROVIDERS=false
AI_DEBUG_BUSINESS_ANALYSIS=false

# -------------------------------------------
# Baseline Evaluation
# -------------------------------------------
AI_BASELINE_PROVIDER=local
AI_BASELINE_MODEL=
AI_BASELINE_FORMAT=none

# -------------------------------------------
# Enrichment & Grounding
# -------------------------------------------
AI_ENRICHMENT_OVERWRITE_BELOW=0.5
AI_ENRICHMENT_MIN_CONFIDENCE=0.75
AI_GROUNDING_ENFORCE=true
AI_OFFICIAL_WEBSITE=true
AI_OFFICIAL_WEBSITE_NAME_MATCH=0.75
AI_OFFICIAL_WEBSITE_MAX_CANDIDATES=3

# -------------------------------------------
# Geoapify & Extraction (Existing)
# -------------------------------------------
GEOAPIFY_API_KEY=your_geoapify_key_here
GEOAPIFY_BASE_URL=https://api.geoapify.com/v2/places
GEOAPIFY_GEOCODE_URL=https://api.geoapify.com/v1/geocode/search
GEOAPIFY_PLACE_DETAILS_URL=https://api.geoapify.com/v2/place-details
GEOAPIFY_TIMEOUT=10000
GEOAPIFY_MAX_RESULTS=5

# -------------------------------------------
# Rate Limiting (Existing)
# -------------------------------------------
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# -------------------------------------------
# Frontend & Website Gen (Existing)
# -------------------------------------------
FRONTEND_URL=http://localhost:5173
WEBSITE_TEMPLATES_DIR=
GENERATED_SITES_DIR=
WEBSITE_HOST=127.0.0.1
WEBSITE_BASE_PORT=4321
WEBSITE_MAX_PORT=4330
WEBSITE_RUN_INSTALL=true
```

---

## 10. Variable Categories Summary

| Category | Count | Required for MVP |
|----------|-------|------------------|
| Provider Chain | 3 | Yes |
| OpenRouter | 5+ | Yes (primary) |
| NVIDIA NIM | 4 | No (reasoning) |
| DeepSeek | 4 | Yes (extraction) |
| Gemini | 4 | Yes (secondary) |
| Together AI | 4 | No (scaling) |
| Local/Self-Hosted | 5 | Yes (fallback) |
| Core AI Service | 7 | Yes |
| Orchestrator/Cost | 5 | Yes |
| Resilience | 6 | Yes |
| Cost/Free Tier | 5 | Yes |
| Health Monitoring | 5 | Yes |
| Feature Flags | 5 | Yes |
| Baseline | 3 | No |
| Enrichment/Grounding | 5 | Yes |

**Total: ~80 variables** (most optional with sensible defaults)

---

## 11. Validation Rules

| Variable | Validation |
|----------|------------|
| `*_API_KEY` | Non-empty string, no whitespace |
| `*_BASE_URL` | Valid URL, ends with `/v1` or `/v1beta` |
| `*_MODEL` | Non-empty, matches provider's model list |
| `*_TIMEOUT_MS` | Integer > 0, ≤ 300000 |
| `AI_MONTHLY_BUDGET_USD` | Number ≥ 0 |
| `AI_COST_PHASE` | Enum: `free`, `controlled`, `production` |
| `AI_CIRCUIT_BREAKER_THRESHOLD` | Integer ≥ 1 |
| `AI_HEALTH_PROBE_TTL_MS` | Integer ≥ 5000 |

---

## 12. Security Notes

1. **Never commit `.env` to git** - Add to `.gitignore`
2. **Use different keys per environment** - Dev/Staging/Prod
3. **Rotate keys quarterly** - Set calendar reminder
4. **Monitor usage** - Check provider dashboards weekly
5. **Revoke immediately** if key exposed
6. **Use provider-specific keys** - Don't reuse keys across providers