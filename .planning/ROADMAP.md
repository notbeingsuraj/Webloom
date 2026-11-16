# Webloom 2.0 — Roadmap

## Project Vision

**Pivot:** From AI Website Generator → Agency Prospect Intelligence & Sales Enablement Platform

**Core Promise:** "Turn business prospects into verified digital intelligence and personalized sales opportunities in minutes."

**Target Customer:** Boutique digital agencies (2-10 employees) selling website development, local SEO, digital marketing, online reputation management, business growth services.

---

## Milestone 1: Product Validation & MVP Definition

**Phase 1: Product Validation & MVP Definition**  
**Goal:** Define and validate the smallest product that demonstrates real commercial value to boutique digital agencies. Produce 10 deliverable documents in `docs/product-validation/` and a clear implementation decision with P0/P1/P2/P3 classification and 14-day execution schedule.

**Requirements:** [MVP-01, MVP-02, MVP-03, MVP-04, MVP-05, MVP-06, MVP-07, MVP-08, MVP-09, MVP-10, MVP-11, MVP-12, MVP-13, MVP-14, MVP-15]

**Plans:** 4 plans

### Plans Created

- [ ] 01-01-PLAN.md — Product Definition & Scope Documentation (PRODUCT_VISION.md, MVP_SCOPE.md, USER_WORKFLOWS.md)
- [ ] 01-02-PLAN.md — Technical Architecture & Data Model (TECHNICAL_IMPLEMENTATION_PLAN.md, API_CONTRACTS.md, DATA_MODEL.md)
- [ ] 01-03-PLAN.md — Quality, Evaluation & Customer Validation (QUALITY_AND_EVALUATION_PLAN.md, CUSTOMER_VALIDATION_PLAN.md, PRICING_HYPOTHESES.md)
- [ ] 01-04-PLAN.md — Acceptance Criteria & Implementation Decision (MVP_ACCEPTANCE_CRITERIA.md)

---

### Phase 1 Plans

#### Plan 1: Product Definition & Scope Documentation
**Objective:** Create PRODUCT_VISION.md, MVP_SCOPE.md, USER_WORKFLOWS.md defining the product, MVP boundaries, and user workflows with explicit in/out of scope decisions.

**Requirements:** MVP-01, MVP-02, MVP-03

#### Plan 2: Technical Architecture & Data Model
**Objective:** Create TECHNICAL_IMPLEMENTATION_PLAN.md, API_CONTRACTS.md, DATA_MODEL.md mapping existing Webloom services to new MVP workflow, identifying consolidation/deprecation, establishing canonical data flow.

**Requirements:** MVP-04, MVP-05, MVP-06, MVP-07

#### Plan 3: Quality, Evaluation & Customer Validation
**Objective:** Create QUALITY_AND_EVALUATION_PLAN.md, CUSTOMER_VALIDATION_PLAN.md, PRICING_HYPOTHESES.md with evaluation dataset, metrics, demo script, pilot pricing, outreach materials.

**Requirements:** MVP-08, MVP-09, MVP-10, MVP-11, MVP-12, MVP-13

#### Plan 4: Acceptance Criteria & Implementation Decision
**Objective:** Create MVP_ACCEPTANCE_CRITERIA.md with P0/P1/P2/P3 task classification, 14-day execution schedule, risk assessment, and final implementation go/no-go decision.

**Requirements:** MVP-14, MVP-15

---

## Requirement Definitions

| ID | Description |
|----|-------------|
| MVP-01 | Product vision document with positioning, target customer, core promise, core workflow |
| MVP-02 | MVP scope document with Features A-E (in scope) and explicit out-of-scope list |
| MVP-03 | User workflows document: Dashboard → New Prospect → Prospect Detail → Reports → Sales Assets |
| MVP-04 | Technical implementation plan: service consolidation map, canonical data flow, migration strategy |
| MVP-05 | API contracts: request/response schemas for all MVP endpoints |
| MVP-06 | Data model: canonical business profile, evidence graph, report/asset schemas |
| MVP-07 | Service audit: which services remain/consolidate/deprecate, with file references |
| MVP-08 | Quality & evaluation plan: evaluation dataset, metrics (precision/recall/identity rate/etc.), test strategy |
| MVP-09 | Customer validation plan: demo script, 3 sample reports, landing page VP, pilot pricing ($99/$199/$399), 30 prospect profiles, outreach message, interview script, value metrics |
| MVP-10 | Pricing hypotheses document with paid pilot recommendation |
| MVP-11 | Prompt injection / SSRF / cost tracking mitigations |
| MVP-12 | Report generation (HTML/PDF) architecture using existing capabilities |
| MVP-13 | Personalized sales assets generation architecture |
| MVP-14 | MVP acceptance criteria with measurable P0/P1/P2/P3 classification |
| MVP-15 | 14-day execution schedule with realistic effort estimates, dependencies, risks |

---

## Milestone 2: AI Infrastructure Recovery

**Phase 2: AI Infrastructure Recovery — Open-Weight Model Strategy, Free Inference, Provider Resilience and Production Reliability**  
**Goal:** Build a reliable AI execution infrastructure that prioritizes high-quality open-weight models, uses free hosted inference endpoints, avoids unnecessary paid API dependencies, supports multiple independent inference providers, automatically handles provider failures, uses different models for different workloads, preserves Webloom's evidence/provenance architecture, and can eventually support paid production inference without architectural rewrites.

**Requirements:** [AIR-01, AIR-02, AIR-03, AIR-03, AIR-04, AIR-05, AIR-06, AIR-07, AIR-08, AIR-09, AIR-10, AIR-11, AIR-12]

**Plans:** 11 plans

### Plans Created

- [ ] 02-01-PLAN.md — Phase 1: Complete Existing Infrastructure Audit
- [ ] 02-02-PLAN.md — Phase 2: Open-Weight Model Research and Selection
- [ ] 02-03-PLAN.md — Phase 3: Create a Model Evaluation Benchmark
- [ ] 02-04-PLAN.md — Phase 4: Design a Central AI Orchestrator
- [ ] 02-05-PLAN.md — Phase 5: Provider Adapters
- [ ] 02-06-PLAN.md — Phase 6: Failure Handling and Resilience
- [ ] 02-07-PLAN.md — Phase 7: Output Validation and Webloom Data Integrity
- [ ] 02-08-PLAN.md — Phase 8: Cost and Free-Tier Optimisation
- [ ] 02-09-PLAN.md — Phase 9: Health Monitoring
- [ ] 02-10-PLAN.md — Phase 10: Testing
- [ ] 02-11-PLAN.md — Phase 11: Implementation and Deliverables

### Phase 2 Plans

#### Plan 1: Complete Existing Infrastructure Audit
**Objective:** Inspect the entire repository. Locate and inspect AI provider adapters, provider configuration, existing AI gateway integrations, OmniRoute integrations, OpenRouter integrations, Gemini integrations, model identifiers and base URLs, AI orchestration and routing logic, environment variable handling, health-check endpoints, retry and timeout logic, and all AI-dependent services. Trace real requests from application entry points to actual provider response. Identify broken adapters, invalid model identifiers, invalid endpoints, authentication failures, unsupported request formats, incorrect response parsing, missing environment variables, quota exhaustion, rate limits, provider outages, unnecessary gateway dependencies, duplicate implementations, incorrect error handling, silent failures. Create a provider failure matrix with verified evidence.

**Requirements:** AIR-01

#### Plan 2: Open-Weight Model Research and Selection
**Objective:** Research and evaluate high-quality open-weight models and their available inference providers. Mandatory evaluation of NVIDIA Nemotron 3 Ultra 550B A55B. Evaluate additional candidates: DeepSeek V4.1 Flash, Qwen3.5 35B A3B, Mistral Small 4, GLM 5.3 Flash, and other relevant models from NVIDIA, Alibaba Qwen, DeepSeek, Mistral, Z.ai. Document exact model identifier, developer, open-weight status, license, hosted inference providers, free inference availability, rate limits, context length, tool-calling support, structured output support, latency, expected inference cost, production suitability, deployment requirements. Distinguish between free downloadable weights vs free hosted inference vs free trial credits vs paid hosted inference vs self-hosted GPU infrastructure.

**Requirements:** AIR-02

#### Plan 3: Create a Model Evaluation Benchmark
**Objective:** Build a Webloom-specific evaluation dataset with at least 30 representative tasks covering business information extraction, identity resolution, service/product extraction, price extraction, contact extraction, review sentiment classification, complaint clustering, competitor comparison, opportunity identification, business report generation, structured JSON generation, evidence-grounded summarization. Use same inputs across all candidate models. Evaluate extraction correctness, hallucination rate, JSON validity, schema compliance, instruction following, reasoning quality, latency, token consumption, cost per successful task, failure rate. Create model comparison report.

**Requirements:** AIR-03

#### Plan 4: Design a Central AI Orchestrator
**Objective:** Implement a provider-independent AI orchestration layer with ModelRegistry, ProviderRegistry, CapabilityRouter, ProviderHealthMonitor, QuotaManager, CircuitBreaker, RetryController, OutputValidator, CostTracker, AIExecutionLogger, FallbackController. Application requests capabilities (business_extraction, business_research, entity_resolution, review_analysis, sentiment_classification, competitor_analysis, trend_classification, report_generation, structured_output) rather than hardcoding provider names. Each capability has its own model selection policy with primary/secondary/tertiary/fallback providers.

**Requirements:** AIR-04

#### Plan 5: Provider Adapters
**Objective:** Create consistent provider adapter interface with generate(), healthCheck(), getModels(), getCapabilities(), classifyError(), getUsage(), validateConfiguration(). Support OpenAI-compatible endpoints. Prioritize adapters for: NVIDIA NIM/hosted inference, Hugging Face Inference Providers, other verified free/low-cost hosted inference, DeepSeek API, Gemini API, OpenRouter as optional routing layer, self-hosted OpenAI-compatible endpoints. Providers independently configurable and removable.

**Requirements:** AIR-05

#### Plan 6: Failure Handling and Resilience
**Objective:** Implement provider health checks, circuit breakers, bounded retries, exponential backoff with jitter, provider-specific cooldown periods, quota-aware routing, request timeouts, fallback selection, response validation, failure logging, provider recovery detection. Classify errors correctly: 400 (invalid request - no blind retry), 401/403 (credentials - disable provider), 404 (invalid endpoint/model - config problem), 429 (rate limit/quota - respect retry headers), 500/502/503 (provider failure - try another), timeout (bounded retry/failover), malformed JSON (validate, attempt repair, or switch provider). No repeated calls to exhausted provider, no fallback loops, no single provider blocking others. Account for concurrent requests and serverless execution with Redis/shared state.

**Requirements:** AIR-06

#### Plan 7: Output Validation and Webloom Data Integrity
**Objective:** Preserve Webloom's evidence and provenance architecture. AI cannot overwrite verified business information. AI-generated data must be labelled appropriately. Missing fields remain missing. Unsupported information not fabricated. Source provenance preserved. Failed AI requests must not corrupt previously extracted records. Every structured output validated against schema. Provider-specific response formats normalized. For models without native structured output, implement reliable JSON extraction, parsing, and schema validation.

**Requirements:** AIR-07

#### Plan 8: Cost and Free-Tier Optimisation
**Objective:** Minimize operating expenses. Priorities: genuinely free inference where suitable, smaller models for simple classification/extraction, reserve large reasoning models for difficult tasks, cache deterministic/repeatable results, avoid unnecessary repeated inference, track token consumption and estimated cost, per-task token and cost budgets, prevent runaway retries, configurable monthly spending limits, allow paid providers to be disabled entirely. Explicit transition strategy from free experimentation to controlled paid production inference.

**Requirements:** AIR-08

#### Plan 9: Health Monitoring
**Objective:** Implement meaningful /health/ai endpoint exposing provider configuration status, availability, model identifiers, last successful request, last error, latency, failure rate, cooldown state, quota state, active provider per capability, fallback status. No secrets exposed. Configured API key does not automatically mean healthy. Include provider-level diagnostic command/endpoint for independent testing.

**Requirements:** AIR-09

#### Plan 10: Testing
**Objective:** Test failure scenarios: all providers unavailable, primary returns 429/503, invalid credentials, invalid model identifier, incorrect endpoint, provider timeout, malformed JSON, incomplete output, fallback succeeds, all providers fail, provider recovers after cooldown, concurrent requests during outage, quota exhaustion, deterministic fallback activates, verified data unchanged after AI failure. Test every adapter independently. Add integration tests for actual provider endpoints only when credentials configured. Don't make entire test suite depend on live API availability.

**Requirements:** AIR-10

#### Plan 11: Implementation and Deliverables
**Objective:** After audit and documentation, implement approved architecture in small verifiable stages. Don't rewrite working services unnecessarily. Deliver: root-cause investigation report, model comparison/benchmark report, provider compatibility matrix, recommended model-routing policy, central AI orchestration implementation, provider adapters, environment variable documentation, health monitoring endpoint, unit/integration tests, deployment instructions, cost/quota management documentation, migration guide for existing AI-dependent services. Update .env.example with variable names and safe placeholders only. Never expose real API keys. Run complete existing test suite after implementation. Conclude with final engineering decision: which providers work, which models passed tests, primary model per capability, genuinely usable free inference endpoints, which providers to retain/remove, expected cost at 100/1000/10000 tasks, behavior when all providers fail, production readiness.

**Requirements:** AIR-11

---

## Requirement Definitions

| ID | Description |
|----|-------------|
| AIR-01 | Complete infrastructure audit with provider failure matrix |
| AIR-02 | Open-weight model research and selection with mandatory Nemotron 3 Ultra evaluation |
| AIR-03 | Webloom-specific model evaluation benchmark (30+ tasks) |
| AIR-04 | Central AI orchestrator with capability-based routing |
| AIR-05 | Provider adapters for NVIDIA, HF, DeepSeek, Gemini, OpenRouter, self-hosted |
| AIR-06 | Failure handling: circuit breakers, retries, fallbacks, quota awareness |
| AIR-07 | Output validation preserving Webloom provenance architecture |
| AIR-08 | Cost optimization: free inference, model sizing, caching, budgets |
| AIR-09 | Health monitoring: /health/ai endpoint with provider diagnostics |
| AIR-10 | Comprehensive testing of failure scenarios and adapter tests |
| AIR-11 | Implementation deliverables and final engineering decision |

---

## Future Phases (Post-MVP Validation)

### Phase 3: Core Prospect Intelligence Engine (P0 Implementation)
- Google Maps URL / CSV / website input handling
- Business identity resolution with provenance
- Multi-source verification (Geoapify + web extraction + official website)
- Evidence graph integration

### Phase 3: Digital Presence Audit & Opportunity Identification
- Website crawl (multi-page, business-type prioritized)
- Audit checks: availability, mobile, performance, SEO, metadata, content, contact, conversion, reputation
- Opportunity identification with evidence-backed recommendations

### Phase 4: Agency-Ready Reports & Sales Assets
- Branded report generation (HTML → PDF)
- Personalized outreach email, value proposition, website mockup
- Controlled public sharing links

### Phase 5: Dashboard & User Experience Polish
- Dashboard with prospect stats, recent activity, report access
- New Prospect input flow (URL, website, CSV)
- Prospect Detail view with all tabs
- Loading/partial/failure states

### Phase 6: Pilot Launch & Iteration
- Deploy for pilot agencies
- Collect feedback, measure value metrics
- Iterate based on real usage

---

## Success Criteria for Phase 1

- [ ] All 10 documents created in `docs/product-validation/`
- [ ] Each document references existing Webloom source files and implementation details
- [ ] No generic templates — all content specific to Webloom codebase
- [ ] Clear P0/P1/P2/P3 classification for every proposed task
- [ ] Realistic 14-day schedule based on actual existing implementation
- [ ] Explicit go/no-go decision presented for founder approval
- [ ] No implementation code written — only planning deliverables