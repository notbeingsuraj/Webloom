# Provider Compatibility Matrix

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Status:** Based on Research & Implementation

---

## 1. Capability Support Matrix

| Capability | NVIDIA NIM | DeepSeek API | Hugging Face | Together AI | Fireworks AI | Gemini API | OpenRouter | Local (Ollama) | Self-Hosted |
|------------|------------|--------------|--------------|-------------|--------------|------------|------------|----------------|-------------|
| **business_extraction** | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **business_research** | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ No | ⚠️ Model-dependent |
| **entity_resolution** | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **review_analysis** | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **sentiment_classification** | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **competitor_analysis** | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ No | ⚠️ Model-dependent |
| **trend_classification** | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ No | ⚠️ Model-dependent |
| **report_generation** | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ No | ⚠️ Model-dependent |
| **structured_output** | ❌ **No** | ✅ Native | ⚠️ Varies | ✅ Native | ✅ Native | ⚠️ Limited | ✅ Native | ⚠️ Varies | ⚠️ Varies |

**Legend:**
- ✅ Full = Full support, production-ready
- ⚠️ Partial = Works with caveats (see notes)
- ❌ No = Not supported / not suitable
- ❌ **No** = Critical limitation

---

## 2. Technical Capability Details

### 2.1 Structured Output Support

| Provider | Native JSON Schema | JSON Object Mode | Repair Strategy |
|----------|-------------------|------------------|-----------------|
| **NVIDIA NIM** | ❌ Not supported | ❌ Not supported | Regex extraction + schema-guided repair |
| **DeepSeek API** | ✅ `response_format: json_schema` | ✅ `json_object` | Not needed |
| **Hugging Face** | ⚠️ Model-dependent | ✅ Most models | Provider-specific |
| **Together AI** | ✅ `response_format` | ✅ `json_object` | Not needed |
| **Fireworks AI** | ✅ `response_format` | ✅ `json_object` | Not needed |
| **Gemini API** | ⚠️ Limited subset | ✅ `json_object` | Schema simplification |
| **OpenRouter** | ✅ Pass-through | ✅ Pass-through | Depends on upstream |
| **Local (Ollama)** | ❌ Rejects `response_format` | ⚠️ Some models | Retry without format + repair |
| **Self-Hosted (vLLM)** | ✅ `guided_json` | ✅ `json_object` | Not needed |

### 2.2 Function Calling / Tool Use

| Provider | Function Calling | Parallel Calls | Notes |
|----------|-----------------|----------------|-------|
| NVIDIA NIM | ❌ Not documented | N/A | |
| DeepSeek API | ✅ Supported | ✅ | OpenAI-compatible |
| Hugging Face | ⚠️ Model-dependent | ⚠️ | Via `tools` parameter |
| Together AI | ✅ Supported | ✅ | OpenAI-compatible |
| Fireworks AI | ✅ Supported | ✅ | OpenAI-compatible |
| Gemini API | ✅ Native | ✅ | `tools` + `tool_config` |
| OpenRouter | ✅ Pass-through | ✅ | Depends on upstream |
| Local (Ollama) | ❌ Not supported | N/A | |
| Self-Hosted (vLLM) | ✅ Supported | ✅ | Via `tool_choice` |

### 2.3 Context Window & Output Limits

| Provider | Max Context | Max Output | Notes |
|----------|-------------|------------|-------|
| NVIDIA NIM (Nemotron) | 128K | 8,192 | |
| DeepSeek API | 128K (V3), 64K (R1) | 8,192 | |
| Hugging Face Serverless | 32K (varies) | 4,096 | Model-dependent |
| Together AI | 128K+ | 8,192+ | Model-dependent |
| Fireworks AI | 128K+ | 8,192+ | Model-dependent |
| Gemini API | 1M (1.5 Pro), 128K (1.5 Flash) | 8,192 | |
| OpenRouter | Model-dependent | Model-dependent | Pass-through |
| Local (Ollama) | Model-dependent | 4,096-8,192 | Hardware-limited |
| Self-Hosted (vLLM) | Model-dependent | Configurable | Hardware-limited |

---

## 3. Free Tier & Pricing Comparison

| Provider | Free Tier | Pay-As-You-Go (per 1M tokens) | Enterprise |
|----------|-----------|-------------------------------|------------|
| **NVIDIA NIM** | 100 req/day trial | ~$0.50 in / $1.50 out (est.) | Custom |
| **DeepSeek API** | Signup credits | $0.14 in / $0.28 out (V3) | Volume discounts |
| **Hugging Face** | 30K tokens/mo (serverless) | $0.60-3.00/hr (endpoints) | Dedicated endpoints |
| **Together AI** | $5 credit | $0.10-0.90 (varies by model) | Dedicated, reserved |
| **Fireworks AI** | $10 credit | $0.20-1.00 (varies) | Reserved instances |
| **Gemini API** | 1.5 Flash: 1,500 RPM free | $0.075 in / $0.30 out (Flash) | Enterprise |
| **OpenRouter** | Free models (Llama 3.1 8B, etc.) | Model-dependent + 5% fee | Enterprise |
| **Local (Ollama)** | Hardware cost only | $0 marginal | Hardware + electricity |
| **Self-Hosted (vLLM)** | Hardware cost only | $0 marginal | Hardware + ops |

---

## 4. Rate Limits & Reliability

| Provider | Rate Limits | Retry-After Support | SLA |
|----------|-------------|---------------------|-----|
| **NVIDIA NIM** | 1,000 RPM / 100K TPM (paid) | ✅ | Enterprise only |
| **DeepSeek API** | 1,000 RPM / 50K TPM | ✅ | 99.9% (enterprise) |
| **Hugging Face** | 30 req/min (serverless) | ❌ | 99.5% (endpoints) |
| **Together AI** | 500 RPM / 100K TPM | ✅ | 99.9% (reserved) |
| **Fireworks AI** | 500 RPM / 200K TPM | ✅ | 99.9% (reserved) |
| **Gemini API** | 1,500 RPM (Flash free) | ✅ | 99.9% (enterprise) |
| **OpenRouter** | Model-dependent | ✅ (pass-through) | 99.9% |
| **Local** | Hardware-limited | N/A | N/A |

---

## 5. Model Availability by Provider

### 5.1 Reasoning Models (business_research, report_generation, competitor_analysis)

| Model | NVIDIA | DeepSeek | Together | Fireworks | HuggingFace | OpenRouter |
|-------|--------|----------|----------|-----------|-------------|------------|
| Nemotron 3 Ultra | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Nemotron 4 Ultra | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DeepSeek R1 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DeepSeek V3 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Qwen 3 235B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Qwen 2.5 72B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| GLM-4 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 5.2 Extraction/Classification Models (business_extraction, entity_resolution, review_analysis)

| Model | NVIDIA | DeepSeek | Together | Fireworks | HuggingFace | OpenRouter | Local |
|-------|--------|----------|----------|-----------|-------------|------------|-------|
| DeepSeek V3 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Qwen 2.5 32B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Qwen 2.5 14B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Qwen 2.5 7B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mistral Small | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mistral Nemo | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Llama 3.1 8B | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ministral 3B | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 6. Configuration Requirements

| Provider | Required Env Vars | Optional Env Vars |
|----------|-------------------|-------------------|
| **NVIDIA NIM** | `NVIDIA_API_KEY`, `NVIDIA_MODEL` | `NVIDIA_BASE_URL`, `NVIDIA_TIMEOUT_MS` |
| **DeepSeek API** | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | `DEEPSEEK_BASE_URL`, `DEEPSEEK_TIMEOUT_MS` |
| **Hugging Face** | `HF_API_KEY`, `HF_MODEL` | `HF_BASE_URL`, `HF_TIMEOUT_MS` |
| **Together AI** | `TOGETHER_API_KEY`, `TOGETHER_MODEL` | `TOGETHER_BASE_URL`, `TOGETHER_TIMEOUT_MS` |
| **Fireworks AI** | `FIREWORKS_API_KEY`, `FIREWORKS_MODEL` | `FIREWORKS_BASE_URL`, `FIREWORKS_TIMEOUT_MS` |
| **Gemini API** | `GEMINI_API_KEY`, `GEMINI_MODEL` | `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS` |
| **OpenRouter** | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL`, `OPENROUTER_APP_URL`, `OPENROUTER_APP_NAME` |
| **Local (Ollama)** | `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` | `LOCAL_AI_API_KEY`, `LOCAL_AI_TIMEOUT_MS` |
| **Self-Hosted (vLLM)** | `SELF_HOSTED_BASE_URL`, `SELF_HOSTED_MODEL` | `SELF_HOSTED_API_KEY`, `SELF_HOSTED_TIMEOUT_MS` |

---

## 7. Webloom Capability-to-Provider Mapping (Recommended)

| Capability | Primary | Secondary | Tertiary | Fallback |
|------------|---------|-----------|----------|----------|
| `business_extraction` | DeepSeek API | Together AI (Qwen 2.5 32B) | Fireworks (Mistral) | Local (Ollama) |
| `business_research` | NVIDIA NIM (Nemotron) | DeepSeek R1 | Together (Qwen 3 235B) | DeepSeek V3 |
| `entity_resolution` | DeepSeek API | Together (Qwen 2.5 32B) | Fireworks (Mistral) | Local |
| `review_analysis` | DeepSeek API | Together (Qwen 2.5 14B) | Fireworks (Mistral) | Local |
| `sentiment_classification` | DeepSeek API | Together (Qwen 2.5 7B) | Fireworks (Mistral) | Local (Ministral) |
| `competitor_analysis` | NVIDIA (Nemotron) | DeepSeek R1 | Together (Qwen 3 235B) | DeepSeek V3 |
| `trend_classification` | NVIDIA (Nemotron) | GLM-4 (if available) | DeepSeek R1 | DeepSeek V3 |
| `report_generation` | NVIDIA (Nemotron) | DeepSeek V3 | Together (Qwen 72B) | Deterministic template |
| `structured_output` | DeepSeek API | Together (Qwen 32B) | Gemini 1.5 Flash | JSON repair |

---

## 8. Known Limitations & Workarounds

| Limitation | Affected Providers | Workaround |
|------------|-------------------|------------|
| **No structured output** | NVIDIA NIM (Nemotron) | JSON extraction + schema repair pipeline |
| **Schema too restrictive** | Gemini API | Simplify schema, use `json_object` + post-validation |
| **Cold start latency** | Hugging Face Serverless | Use dedicated endpoints or prefer Together/Fireworks |
| **No function calling** | NVIDIA NIM, Local | Use structured output + post-processing |
| **Free tier exhausted** | All free tiers | Automatic fallback to paid or next provider |
| **Model deprecation** | All | Model discovery + config validation at startup |

---

## 9. Decision Matrix: When to Use Each Provider

| Scenario | Recommended Provider | Reason |
|----------|---------------------|--------|
| **Maximum reasoning quality** | NVIDIA NIM (Nemotron 3 Ultra) | Best-in-class reasoning, 128K context |
| **Best extraction + structured output** | DeepSeek API | Native JSON schema, free tier, fast |
| **Cost-sensitive high-volume** | Together AI / Fireworks | Competitive pricing, reserved instances |
| **Zero marginal cost / privacy** | Local (Ollama/vLLM) | No API costs, data never leaves |
| **Model variety / routing** | OpenRouter | Access to 100+ models via single API |
| **Google ecosystem integration** | Gemini API | Native Vertex AI integration |
| **Ultra-low latency** | Groq / Local | Hardware-accelerated inference |
| **Enterprise SLA required** | NVIDIA / DeepSeek / Together (reserved) | 99.9% SLA with dedicated capacity |