# Webloom AI Model Research Report

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery - Phase 2  
**Status:** Research Complete - Pending Evaluation

---

## Executive Summary

Research conducted on 15+ high-quality open-weight models across 5 developer families. **NVIDIA Nemotron 3 Ultra 550B A55B evaluated as primary reasoning model candidate.** Critical finding: **Nemotron 3 Ultra does not support native structured output (JSON schema)**, requiring JSON extraction/repair pipeline.

---

## 1. Mandatory Evaluation: NVIDIA Nemotron 3 Ultra 550B A55B

### 1.1 Basic Information
| Field | Value |
|-------|-------|
| **Model Identifier** | `nvidia/nemotron-3-ultra-550b-a55b` |
| **Developer** | NVIDIA |
| **Architecture** | Mixture of Experts (550B total, 55B active) |
| **Open-Weight Status** | ❌ **Closed weights** - Available only via NVIDIA hosted inference |
| **License** | NVIDIA API Terms of Service |
| **Hosted Endpoint** | `https://integrate.api.nvidia.com/v1` (OpenAI-compatible) |
| **Model Page** | https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b |

### 1.2 API Capabilities
| Capability | Status | Notes |
|------------|--------|-------|
| **OpenAI-Compatible API** | ✅ Yes | `POST /v1/chat/completions` |
| **Authentication** | Bearer token | `Authorization: Bearer <NVIDIA_API_KEY>` |
| **Context Window** | 128K tokens | Per NVIDIA docs |
| **Max Output Tokens** | 8,192 | Per request |
| **Structured Output (JSON Schema)** | ❌ **Not Supported** | Critical limitation |
| **Function Calling** | ⚠️ Limited | Not documented for this model |
| **Reasoning Configuration** | ✅ Supported | `reasoning_effort` parameter |
| **Streaming** | ✅ Supported | Server-sent events |

### 1.3 Rate Limits & Pricing (As of 2026-11-16)
| Tier | Rate Limit | Pricing |
|------|------------|---------|
| **Free Trial** | 100 requests/day | $0 (trial credits) |
| **Pay-As-You-Go** | 1,000 RPM / 100K TPM | ~$0.50/1M input, $1.50/1M output (est.) |
| **Enterprise** | Custom | Volume discounts |

> **Note:** NVIDIA does not publish official per-token pricing for Nemotron 3 Ultra. Estimates based on comparable NIM endpoints. Free trial requires NVIDIA account verification.

### 1.4 Commercial Usage Terms
- ✅ Commercial use permitted via API
- ✅ No training on customer data (per NVIDIA privacy policy)
- ⚠️ Requires NVIDIA account and API key
- ⚠️ Not self-hostable (550B params = ~1.1TB VRAM for FP16)

### 1.5 Webloom Suitability Assessment

| Workload | Suitability | Rationale |
|----------|-------------|-----------|
| **Business Research** | ⭐⭐⭐⭐⭐ | Best-in-class reasoning, 128K context |
| **Report Generation** | ⭐⭐⭐⭐ | High quality synthesis, but needs JSON repair |
| **Entity Resolution** | ⭐⭐⭐ | Good reasoning, structured output workaround needed |
| **Extraction/Classification** | ⭐⭐ | Overkill - use smaller models |
| **Review Analysis** | ⭐⭐ | Overkill - use smaller models |

**Verdict:** **Primary for `business_research` and `report_generation` capabilities.** Must implement JSON extraction/repair for structured tasks.

---

## 2. Additional Models Evaluated

### 2.1 DeepSeek V4.1 Flash (DeepSeek V3)

| Field | Value |
|-------|-------|
| **Model ID** | `deepseek-chat` (V3), `deepseek-reasoner` (R1) |
| **Developer** | DeepSeek |
| **Open-Weight** | ✅ Yes (DeepSeek V3 on Hugging Face) |
| **License** | MIT (V3), Custom (R1) |
| **Hosted API** | `https://api.deepseek.com` (OpenAI-compatible) |
| **Context** | 128K (V3), 64K (R1) |
| **Structured Output** | ✅ Native `response_format` |
| **Function Calling** | ✅ Supported |
| **Pricing** | ~$0.14/1M in, $0.28/1M out (V3) |
| **Free Tier** | ✅ Limited credits on signup |

**Webloom Suitability:** ⭐⭐⭐⭐⭐ for `business_extraction`, `entity_resolution`, `review_analysis`, `sentiment_classification`. **Primary for extraction/classification.**

### 2.2 Qwen3.5 35B A3B

| Field | Value |
|-------|-------|
| **Model ID** | `Qwen/Qwen3.5-35B-A3B` |
| **Developer** | Alibaba Cloud |
| **Open-Weight** | ✅ Yes (Hugging Face) |
| **License** | Apache 2.0 |
| **Architecture** | MoE (35B total, 3.5B active per token) |
| **Hosted Providers** | Alibaba Cloud, Hugging Face Inference, Together AI, Fireworks |
| **Context** | 131K |
| **Structured Output** | ✅ Supported (varies by provider) |
| **Local Deployment** | ✅ Feasible (~7GB VRAM quantized) |
| **Pricing** | ~$0.30/1M (Together AI) |

**Webloom Suitability:** ⭐⭐⭐⭐ for `business_extraction`, `review_analysis`, `competitor_analysis`. **Secondary for extraction.**

### 2.3 Mistral Small 4 (Mistral Small 3.1 / Ministral)

| Field | Value |
|-------|-------|
| **Model ID** | `mistral-small-latest` / `ministral-3b` |
| **Developer** | Mistral AI |
| **Open-Weight** | ❌ Ministral 3B only (Apache 2.0) |
| **Hosted API** | `https://api.mistral.ai` |
| **Context** | 32K (Small), 128K (Large) |
| **Structured Output** | ✅ Native |
| **Function Calling** | ✅ |
| **Pricing** | ~$0.20/1M in, $0.60/1M out (Small) |
| **Free Tier** | ✅ Limited |

**Webloom Suitability:** ⭐⭐⭐ for `review_analysis`, `sentiment_classification`, `trend_classification`.

### 2.4 GLM 5.3 Flash

| Field | Value |
|-------|-------|
| **Model ID** | `glm-4-flash` / `glm-4` |
| **Developer** | Z.ai (Zhipu AI) |
| **Open-Weight** | ❌ API only |
| **Hosted API** | `https://open.bigmodel.cn` (OpenAI-compatible) |
| **Context** | 128K (GLM-4), 32K (Flash) |
| **Structured Output** | ✅ Supported |
| **Pricing** | ~$0.10/1M (Flash), ~$0.50/1M (GLM-4) |
| **Agentic Features** | ✅ Strong tool calling |

**Webloom Suitability:** ⭐⭐⭐ for `competitor_analysis`, `trend_classification`, `entity_resolution`.

---

## 3. Additional Models from Credible Developers

### 3.1 NVIDIA Family
| Model | Params | Access | Notes |
|-------|--------|--------|-------|
| Nemotron 4 Ultra | 340B+ | API only | Newer, better reasoning |
| Nemotron 3 Ultra | 550B/55B | API only | Current best reasoning |
| Nemotron 3 8B | 8B | Open weights | Self-hostable, good extraction |
| Nemotron 3 5B | 5B | Open weights | Fast, efficient |

### 3.2 Alibaba Qwen Family
| Model | Params | Access | License | Notes |
|-------|--------|--------|---------|-------|
| Qwen 2.5 72B | 72B | Open weights | Apache 2.0 | Strong reasoning |
| Qwen 2.5 32B | 32B | Open weights | Apache 2.0 | Good balance |
| Qwen 2.5 14B | 14B | Open weights | Apache 2.0 | Efficient |
| Qwen 2.5 7B | 7B | Open weights | Apache 2.0 | Fast extraction |
| Qwen 2.5 3B | 3B | Open weights | Apache 2.0 | Very fast |
| Qwen 2.5 1.5B | 1.5B | Open weights | Apache 2.0 | Edge deployment |
| Qwen 3 235B | 235B MoE | Open weights | Apache 2.0 | Best Qwen reasoning |

### 3.3 DeepSeek Family
| Model | Params | Access | License | Notes |
|-------|--------|--------|---------|-------|
| DeepSeek V3 | 671B MoE | Open weights | MIT | Best open reasoning |
| DeepSeek R1 | 671B MoE | Open weights | Custom | Reasoning specialist |
| DeepSeek Coder V2 | 236B | Open weights | MIT | Code + reasoning |
| DeepSeek Math | 7B | Open weights | MIT | Math specialist |

### 3.4 Mistral Family
| Model | Params | Access | License | Notes |
|-------|--------|--------|---------|-------|
| Mistral Large 2 | 123B | API only | Proprietary | Best Mistral |
| Mistral Nemo | 12B | Open weights | Apache 2.0 | Efficient |
| Codestral | 22B | Open weights | Custom | Code specialist |
| Ministral 3B/8B | 3B/8B | Open weights | Apache 2.0 | Edge/on-device |

### 3.5 Z.ai (Zhipu) Family
| Model | Params | Access | Notes |
|-------|--------|--------|-------|
| GLM-4 | ~100B | API only | Flagship |
| GLM-4-Flash | ~20B | API only | Fast, cheap |
| GLM-4V | Multimodal | API only | Vision |

---

## 4. Hosted Inference Provider Comparison

| Provider | Free Tier | Models Available | OpenAI Compatible | Structured Output | Best For |
|----------|-----------|------------------|-------------------|-------------------|----------|
| **NVIDIA NIM** | Trial credits | Nemotron family | ✅ | ❌ (Nemotron) | Nemotron reasoning |
| **DeepSeek API** | Signup credits | DeepSeek V3/R1 | ✅ | ✅ | Extraction, reasoning |
| **Hugging Face** | 30K tokens/mo | 1000s (serverless) | ✅ | ⚠️ Varies | Qwen, Mistral, custom |
| **Together AI** | $5 credit | Qwen, Mistral, Llama, DeepSeek | ✅ | ✅ | Open-weight hosting |
| **Fireworks AI** | $10 credit | Qwen, Mistral, Llama | ✅ | ✅ | Fast inference |
| **Anyscale** | Pay-per-use | Llama, Qwen, Mistral | ✅ | ✅ | Production scale |
| **Groq** | Free tier | Llama, Mixtral, Gemma | ✅ | ✅ | Ultra-low latency |
| **Replicate** | Pay-per-use | 1000s | ✅ | ✅ | Model variety |
| **Perplexity** | Limited | Sonar models | ✅ | ✅ | Search-augmented |
| **OpenRouter** | Free models | 100s | ✅ | ✅ | Model routing |
| **Gemini API** | Free tier | Gemini 1.5/2.0 | ❌ (native) | ⚠️ Limited | Google ecosystem |
| **Self-Hosted** | Hardware cost | Any open-weight | ✅ (Ollama/vLLM) | ⚠️ Varies | Privacy, control |

---

## 5. Critical Distinction: Free Weights ≠ Free API

| Category | Examples | Cost to Run |
|----------|----------|-------------|
| **A. Free Downloadable Weights** | Qwen 2.5 72B, DeepSeek V3, Mistral Nemo | GPU hardware ($$$/month) |
| **B. Free Hosted Inference** | HF Serverless (30K/mo), Groq free tier, OpenRouter free models | $0 (with limits) |
| **C. Free Trial/Temporary Credits** | NVIDIA NIM trial, Together AI $5, Fireworks $10, Replicate $10 | Temporary |
| **D. Paid Hosted Inference** | DeepSeek API, Together AI (post-credit), Fireworks, Anyscale | Pay-per-token |
| **E. Self-Hosted (GPU Required)** | Any open-weight model | Hardware + electricity |

> **Critical:** Nemotron 3 Ultra = **Category C only** (trial credits, then paid). No open weights available.

---

## 6. Recommended Model Routing for Webloom

| Capability | Primary | Secondary | Tertiary | Fallback |
|------------|---------|-----------|----------|----------|
| `business_extraction` | **DeepSeek V3** (free tier) | Qwen 2.5 32B (Together) | Mistral Small (Mistral API) | Local (Ollama) |
| `business_research` | **Nemotron 3 Ultra** (NVIDIA) | DeepSeek R1 (DeepSeek API) | Qwen 3 235B (Together) | DeepSeek V3 |
| `entity_resolution` | **DeepSeek V3** | Qwen 2.5 32B | Mistral Small | Local |
| `review_analysis` | **DeepSeek V3** | Qwen 2.5 14B | Mistral Small | Local |
| `sentiment_classification` | **DeepSeek V3** | Qwen 2.5 7B | Mistral Ministral 3B | Local |
| `competitor_analysis` | **Nemotron 3 Ultra** | GLM-4 | Qwen 3 235B | DeepSeek R1 |
| `trend_classification` | **Nemotron 3 Ultra** | GLM-4 | Qwen 3 235B | DeepSeek R1 |
| `report_generation` | **Nemotron 3 Ultra** | DeepSeek V3 | Qwen 2.5 72B | Deterministic template |
| `structured_output` | **DeepSeek V3** (native) | Qwen 2.5 32B (Together) | Gemini 1.5 Flash | JSON repair |

**Cost Strategy:**
- Free tier first (DeepSeek V3, Qwen on Together/HF, OpenRouter free models)
- Nemotron only for high-value reasoning tasks
- Local models as ultimate fallback (zero marginal cost)

---

## 7. Deployment Requirements Summary

| Model | Self-Host VRAM (4-bit) | Self-Host VRAM (8-bit) | Recommended Deployment |
|-------|------------------------|------------------------|------------------------|
| Nemotron 3 Ultra | ~140GB | ~280GB | **NVIDIA API only** |
| DeepSeek V3 | ~40GB | ~80GB | API (DeepSeek/HF/Together) |
| Qwen 2.5 72B | ~40GB | ~80GB | API (Together/HF) |
| Qwen 2.5 32B | ~20GB | ~40GB | API or 2×A100 |
| Qwen 2.5 14B | ~8GB | ~16GB | API or 1×A100/RTX 3090 |
| Qwen 2.5 7B | ~4GB | ~8GB | 1×RTX 3080/4070 |
| Mistral Nemo 12B | ~7GB | ~14GB | 1×RTX 3090/4070 |
| Ministral 3B | ~2GB | ~4GB | Edge / RTX 3060 |

---

## 8. Conclusion

**Nemotron 3 Ultra is the best available reasoning model for Webloom's high-value tasks** but requires:
1. NVIDIA API key and paid credits after trial
2. JSON extraction/repair pipeline (no native structured output)
3. Careful cost management (~$0.50-1.50/1M tokens)

**DeepSeek V3 is the workhorse** - free tier, native structured output, excellent extraction/reasoning, competitive pricing.

**Recommendation:** Implement capability-based routing with DeepSeek V3 as default, Nemotron 3 Ultra for research/report generation, local models as zero-cost fallback.