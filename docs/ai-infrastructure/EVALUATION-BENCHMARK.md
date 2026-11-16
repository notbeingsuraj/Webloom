# Webloom Model Evaluation Benchmark

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery - Phase 3  
**Status:** Framework Complete - Pending Model Access

---

## Executive Summary

This document defines the Webloom-specific evaluation framework for comparing AI models on tasks relevant to the business intelligence pipeline. **30 representative tasks across 12 categories** with manually verified ground truth.

---

## 1. Evaluation Dataset

### 1.1 Dataset Composition: 30 Tasks Across 12 Categories

| Category | Tasks | Description |
|----------|-------|-------------|
| **Business Information Extraction** | 3 | Extract identity, contact, location from Google Maps HTML / website |
| **Business Name & Identity Resolution** | 2 | Cross-provider matching, synthetic detection |
| **Service & Product Extraction** | 2 | Services from descriptions, products from menus |
| **Price Extraction** | 2 | Service pricing tiers, restaurant menus |
| **Contact Information Extraction** | 2 | Website contact pages, Google Maps place details |
| **Review Sentiment Classification** | 2 | Sentiment + confidence, theme extraction |
| **Complaint Clustering** | 2 | Negative review clustering, systemic issues |
| **Competitor Comparison** | 2 | Local competitor matrix, advantage identification |
| **Opportunity Identification** | 3 | Digital presence gaps, service opportunities, gap narrative |
| **Business Report Generation** | 3 | Prospect report, outreach email, value proposition |
| **Structured JSON Generation** | 2 | Schema-compliant JSON, multi-field with provenance |
| **Evidence-Grounded Summarization** | 2 | Cited answers, UNKNOWN handling |

**Total: 30 tasks**

### 1.2 Ground Truth Format

Stored in `datasets/evaluation/ground_truth.json`:

```json
{
  "task_id": "extraction_01",
  "category": "business_information_extraction",
  "description": "Extract business identity from Google Maps HTML",
  "input": {
    "html": "<html>...Google Maps page content...</html>",
    "source_url": "https://maps.google.com/place/ChIJ..."
  },
  "expected_output": {
    "identity": {
      "name": "Tartine Bakery",
      "category": "Bakery",
      "business_type": "B2C"
    },
    "contact": {
      "phone": "+1-415-555-0123",
      "email": "info@tartinebakery.com",
      "website": "tartinebakery.com"
    },
    "location": {
      "full_address": "600 Guerrero St, San Francisco, CA 94110",
      "city": "San Francisco",
      "state": "CA",
      "country": "US",
      "postal_code": "94110",
      "coordinates": { "lat": 37.7617, "lng": -122.4213 }
    },
    "hours": {
      "monday": "07:00-19:00",
      "tuesday": "07:00-19:00",
      "wednesday": "07:00-19:00",
      "thursday": "07:00-19:00",
      "friday": "07:00-19:00",
      "saturday": "08:00-18:00",
      "sunday": "closed"
    }
  },
  "evaluation_criteria": {
    "required_fields": ["identity.name", "contact.phone", "location.full_address"],
    "field_tolerance": {
      "phone": "e164_normalized",
      "address": "fuzzy_match_0.9",
      "coordinates": "haversine_100m"
    },
    "provenance_required": true
  }
}
```

### 1.3 Task Definitions

#### Category 1: Business Information Extraction (3 tasks)

**Task 1.1: Google Maps HTML Extraction**
- **Input:** Raw Google Maps place page HTML
- **Output:** Structured business profile (identity, contact, location, hours, ratings)
- **Ground Truth:** Manual extraction from official website + Google Maps verification
- **Metrics:** Field-level precision/recall, coordinate accuracy (≤100m), phone E.164 compliance

**Task 1.2: Official Website Extraction**
- **Input:** Business homepage HTML
- **Output:** Same structured profile + services, description
- **Ground Truth:** Manual verification
- **Metrics:** Field-level precision/recall, service array completeness

**Task 1.3: Multi-Source Reconciliation**
- **Input:** Two conflicting extractions (Geoapify flat + WebExtraction dotted)
- **Output:** Canonical profile with provenance per field
- **Ground Truth:** Manual resolution with evidence
- **Metrics:** Correct provenance assignment, identity resolution accuracy

#### Category 2: Business Name & Identity Resolution (2 tasks)

**Task 2.1: Cross-Provider Matching**
- **Input:** Two provider records (different shapes: Geoapify `business.name` vs WebExtraction `identity.name`)
- **Output:** Match score, match type (same_entity/uncertain/different_entity), identity decision
- **Ground Truth:** Manual verification of same business
- **Metrics:** Match accuracy, false positive/negative rates

**Task 2.2: Synthetic Identity Detection**
- **Input:** Records with "Unknown Business", address-as-name, CID-only, empty names
- **Output:** Correct rejection/flagging with reason
- **Ground Truth:** Manual classification
- **Metrics:** Precision/recall on synthetic detection

#### Category 3: Service & Product Extraction (2 tasks)

**Task 3.1: Service Extraction from Description**
- **Input:** Business category + description + website content
- **Output:** Array of specific services with evidence snippets
- **Ground Truth:** Manual service list from website
- **Metrics:** Service precision/recall, evidence quality

**Task 3.2: Product Extraction from Menu**
- **Input:** Restaurant menu page HTML
- **Output:** Structured products with prices, descriptions, categories
- **Ground Truth:** Manual menu parsing
- **Metrics:** Product precision/recall, price accuracy, category accuracy

#### Category 4: Price Extraction (2 tasks)

**Task 4.1: Service Pricing Tiers**
- **Input:** Service page with pricing tiers
- **Output:** Structured pricing with tiers, inclusions, currency
- **Ground Truth:** Manual price extraction
- **Metrics:** Price accuracy (±5%), tier completeness, inclusion accuracy

**Task 4.2: Restaurant Menu Prices**
- **Input:** Restaurant menu HTML
- **Output:** Items with prices, categories, modifiers
- **Ground Truth:** Manual menu parsing
- **Metrics:** Item precision/recall, price accuracy (±$0.50), category accuracy

#### Category 5: Contact Information Extraction (2 tasks)

**Task 5.1: Website Contact Page**
- **Input:** Contact page HTML
- **Output:** Phone (E.164), email, address, social links
- **Ground Truth:** Manual verification
- **Metrics:** Phone E.164 compliance, email format, address completeness

**Task 5.2: Google Maps Place Details**
- **Input:** Place details API response
- **Output:** Same contact fields with provenance
- **Ground Truth:** Cross-reference with website
- **Metrics:** Field accuracy, provenance correctness

#### Category 6: Review Sentiment Classification (2 tasks)

**Task 6.1: Sentiment + Confidence**
- **Input:** Review text + star rating
- **Output:** Sentiment (positive/neutral/negative) + confidence (0-1)
- **Ground Truth:** Human annotation (3 annotators, majority vote)
- **Metrics:** Accuracy, F1 per class, calibration (Brier score)

**Task 6.2: Theme Extraction**
- **Input:** 10+ reviews for same business
- **Output:** Clustered themes with example quotes, frequency
- **Ground Truth:** Human thematic analysis
- **Metrics:** Theme coverage, quote relevance, cluster quality

#### Category 7: Complaint Clustering (2 tasks)

**Task 7.1: Negative Review Clustering**
- **Input:** 20+ negative reviews (1-2 stars)
- **Output:** Complaint categories with frequency, severity, example quotes
- **Ground Truth:** Human clustering
- **Metrics:** Cluster purity, category coverage, severity accuracy

**Task 7.2: Systemic Issue Detection**
- **Input:** Reviews over 6-month period
- **Output:** Trending complaints, new vs recurring, temporal patterns
- **Ground Truth:** Human temporal analysis
- **Metrics:** Trend detection accuracy, novelty detection

#### Category 8: Competitor Comparison (2 tasks)

**Task 8.1: Local Competitor Matrix**
- **Input:** Target business + 3 competitor profiles
- **Output:** Comparison matrix (rating, reviews, services, pricing, digital presence)
- **Ground Truth:** Manual competitive analysis
- **Metrics:** Data accuracy, completeness, insight quality

**Task 8.2: Competitive Advantage Identification**
- **Input:** Business profile + market context
- **Output:** Verified advantages with evidence citations
- **Ground Truth:** Human competitive analysis
- **Metrics:** Advantage validity, evidence quality, differentiation clarity

#### Category 9: Opportunity Identification (3 tasks)

**Task 9.1: Digital Presence Gaps**
- **Input:** Digital audit results (11 categories)
- **Output:** Prioritized opportunities with evidence, business impact, effort
- **Ground Truth:** Human opportunity analysis
- **Metrics:** Opportunity relevance, prioritization accuracy, evidence quality

**Task 9.2: Service/Marketing Opportunities**
- **Input:** Business profile + audit + competitor analysis
- **Output:** Specific recommendations with reasoning
- **Ground Truth:** Human recommendation
- **Metrics:** Recommendation relevance, specificity, feasibility

**Task 9.3: Opportunity Gap Narrative**
- **Input:** All analysis results
- **Output:** Executive summary with competitive position
- **Ground Truth:** Human narrative
- **Metrics:** Narrative coherence, insight depth, actionability

#### Category 10: Business Report Generation (3 tasks)

**Task 10.1: Prospect Intelligence Report**
- **Input:** Complete business profile + audit + opportunities
- **Output:** Structured report (overview, verified intel, audit, opportunities, recommendations, next steps)
- **Ground Truth:** Human-written report
- **Metrics:** Section completeness, evidence citation accuracy, actionability

**Task 10.2: Personalized Outreach Email**
- **Input:** Business profile + specific findings
- **Output:** Email with subject, body, personalized fields
- **Ground Truth:** Human-written email
- **Metrics:** Personalization accuracy, tone appropriateness, CTA clarity

**Task 10.3: Value Proposition Statement**
- **Input:** Brand DNA + positioning
- **Output:** "For [audience] who [need], [business] is [category] that [benefit] unlike [competition]"
- **Ground Truth:** Human-crafted statement
- **Metrics:** Template compliance, differentiation clarity, audience fit

#### Category 11: Structured JSON Generation (2 tasks)

**Task 11.1: Schema-Compliant JSON**
- **Input:** Prompt + complex JSON Schema (nested objects, arrays, enums, required fields)
- **Output:** Valid JSON matching schema
- **Ground Truth:** Valid reference JSON
- **Metrics:** Schema validity (100% required), field completeness, type correctness

**Task 11.2: Multi-Field Extraction with Provenance**
- **Input:** Business description + extraction schema
- **Output:** Each field with value, confidence, evidence snippet, provenance
- **Ground Truth:** Human extraction with evidence
- **Metrics:** Field completeness, provenance accuracy, confidence calibration

#### Category 12: Evidence-Grounded Summarization (2 tasks)

**Task 12.1: Cited Answer Generation**
- **Input:** Source text (2000+ chars) + question
- **Output:** Answer with inline citations [source_id:char_range]
- **Ground Truth:** Human answer with citations
- **Metrics:** Answer accuracy, citation precision/recall, citation correctness

**Task 12.2: UNKNOWN Handling**
- **Input:** Partial business data + question unanswerable from source
- **Output:** UNKNOWN envelope with reason (unsupported/missing/hallucinated)
- **Ground Truth:** Human UNKNOWN classification
- **Metrics:** UNKNOWN precision/recall, reason accuracy

---

## 2. Evaluation Metrics

### 2.1 Per-Task Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Extraction Correctness** | Field-level precision/recall vs ground truth | ≥90% |
| **Hallucination Rate** | Unsupported claims / total claims | ≤5% |
| **JSON Validity** | Schema validation pass rate | 100% |
| **Schema Compliance** | Required fields present, types correct | 100% |
| **Instruction Following** | Constraint adherence (format, length, style) | ≥95% |
| **Reasoning Quality** | Human-rated (1-5) on logic, coherence | ≥4.0 |
| **Latency (p50/p95)** | End-to-end request time | <30s / <60s |
| **Token Consumption** | Input + output tokens per task | Tracked |
| **Cost per Task** | Estimated USD per successful completion | Tracked |
| **Failure Rate** | Errors / total attempts | ≤10% |

### 2.2 Aggregate Metrics

| Metric | Calculation |
|--------|-------------|
| **Overall Correctness** | Mean field-level F1 across all extraction tasks |
| **Overall Hallucination Rate** | Total unsupported claims / total claims |
| **Capability Score** | Weighted average per capability category |
| **Cost Efficiency** | Cost per correct extraction |
| **Reliability** | 1 - failure rate |

---

## 3. Evaluation Harness

### 3.1 Test Runner: `apps/api/test_model_evaluation.js`

```javascript
// Usage:
node apps/api/test_model_evaluation.js --model deepseek-chat --provider deepseek
node apps/api/test_model_evaluation.js --all-models
node apps/api/test_model_evaluation.js --capability business_extraction
```

### 3.2 Features
- Loads ground truth from `datasets/evaluation/ground_truth.json`
- Iterates over available models (from ModelRegistry)
- Runs each task with each model
- Collects all metrics
- Outputs comparison report (JSON + Markdown)
- Marks UNTESTED models when credentials unavailable

### 3.3 Execution Modes
| Mode | Description |
|------|-------------|
| `--mock` | Mock all HTTP calls (default, fast, no credentials) |
| `--live` | Call real APIs (requires credentials) |
| `--model <id>` | Test specific model |
| `--capability <name>` | Test specific capability |
| `--output <path>` | Custom report output path |

---

## 4. Model Comparison Report Format

### 4.1 Per-Model Summary

```markdown
## Model: deepseek-chat (DeepSeek V3)

### Overall Scores
| Metric | Score |
|--------|-------|
| Overall Correctness | 0.92 |
| Hallucination Rate | 0.03 |
| JSON Validity | 1.00 |
| Schema Compliance | 0.98 |
| Avg Latency (p50) | 2.1s |
| Cost per Task | $0.0012 |

### Per-Capability Breakdown
| Capability | Correctness | Hallucination | Latency | Cost/Task |
|------------|-------------|---------------|---------|-----------|
| business_extraction | 0.95 | 0.02 | 1.8s | $0.0008 |
| entity_resolution | 0.91 | 0.04 | 2.3s | $0.0011 |
| review_analysis | 0.89 | 0.05 | 2.0s | $0.0009 |
| report_generation | 0.87 | 0.06 | 4.2s | $0.0035 |

### Per-Task Details
[Table with 30 rows: task_id, category, correctness, hallucination, latency, tokens, cost, status]

### UNTESTED Capabilities
- business_research: No Nemotron access
- competitor_analysis: No Nemotron access
```

---

## 5. Current Status

| Model | Provider | Status | Tested Capabilities |
|-------|----------|--------|---------------------|
| `deepseek-chat` | DeepSeek API | ✅ Ready | extraction, entity_resolution, review_analysis, sentiment_classification |
| `deepseek-reasoner` | DeepSeek API | ✅ Ready | business_research, competitor_analysis, trend_classification |
| `gemini-1.5-flash` | Gemini API | ✅ Ready | extraction, audit, classification |
| `gemini-1.5-pro` | Gemini API | ✅ Ready | research, report_generation |
| `nvidia/nemotron-3-ultra-550b-a55b` | NVIDIA NIM | ⚠️ **Needs API Key** | business_research, report_generation, competitor_analysis |
| `qwen/qwen3.5-35b-a3b` | Together AI | ⚠️ Needs Credentials | extraction, review_analysis |
| `mistral-small-latest` | Mistral API | ⚠️ Needs Credentials | classification, sentiment |
| Local (Ollama) | Self-hosted | ✅ Ready | fallback, privacy |

---

## 6. Next Steps

1. **Obtain API credentials** for NVIDIA NIM, Together AI, Mistral AI
2. **Run full evaluation** with `node apps/api/test_model_evaluation.js --all-models --live`
3. **Generate comparison report** and update `MODEL-ROUTING-POLICY.md`
4. **Document UNTESTED models** clearly in all reports
4. **No fabricated scores** - only report actual measurements

---

## 7. Quality Gates

| Gate | Requirement |
|------|-------------|
| **Minimum Correctness** | ≥85% field-level F1 for extraction tasks |
| **Maximum Hallucination** | ≤5% unsupported claims |
| **JSON Validity** | 100% schema compliance |
| **Latency** | p50 < 30s for all tasks |
| **Cost** | < $0.01/task for extraction, < $0.05 for research |

Models failing any gate are marked **NOT RECOMMENDED** for production.