# Webloom 2.0 — Project Context

## Project Overview

**Name:** Webloom 2.0  
**Pivot:** From AI Website Generator → Agency Prospect Intelligence & Sales Enablement Platform  
**Target Customer:** Boutique digital agencies (2-10 employees) selling website development, local SEO, digital marketing, online reputation management, business growth services  
**Primary User:** Agency founder, sales executive, business development manager  

## Core Promise

"Turn business prospects into verified digital intelligence and personalized sales opportunities in minutes."

## Current State (as of 2026-11-16)

### Existing Architecture (Production-Ready)
- **BusinessResearchService** — Multi-provider orchestration (Geoapify → WebExtraction → AI enrichment)
- **BusinessProfile** — Provenance-tracked fact store with evidence graph (Evidence, Source, Claim, Conflict models)
- **CanonicalBusinessProfileService** — Single canonical projection layer (P1.3)
- **EntityResolution** — Cross-provider identity matching with scoring
- **CandidatePipeline** — Quality foundation orchestrator with validation
- **AIService** — OmniRoute wrapper with retry/fallback, schema validation
- **BrandStrategyService** — Brand DNA generation
- **DigitalAuditService** — Digital presence audit
- **DesignIntelligenceService** — Design system + page architecture
- **WebsiteGenerationService** — Astro-based site generation (partial)
- **GeneratedSiteManager** — Local dev server management
- **GoogleMapsReputationExtractor** — Rating/review extraction from Google Maps
- **OfficialWebsiteProvider** — Business website crawl (homepage only currently)

### Key Strengths
- Stable extraction pipeline passing 5 test businesses end-to-end
- Strong provenance model per field
- Robust provider abstraction with graceful degradation
- Entity resolution with coordinate-anchor validation (P1.7)
- Source-grounded fallback extraction (P1.8)
- Reputation extraction from Google Maps (P1.9)
- Canonical projection layer preventing synthetic identity

### Critical Gaps (from Architecture Audit)
- Single-pass linear pipeline (no iterative research loop)
- Flat `facts[]` array (no evidence graph with conflicts/freshness)
- No conflict detection/preservation
- No source independence tracking
- Homepage-only website crawl (no deep multi-page research)
- Downstream services make independent AI calls (no shared research dossier)
- No knowledge-gap detection or follow-up research

## Product Vision (MVP)

### Feature A: Prospect Intelligence
- Input: Google Maps URL, official website, CSV
- Output: Business identity, category, address, contact, website, reputation, source attribution, confidence/verification status
- Every important field has provenance; never manufacture missing info

### Feature B: Digital Presence Audit
- Website availability, mobile usability, performance, SEO fundamentals, metadata, content quality, contact accessibility, conversion opportunities, reputation signals
- Distinguish: verified findings, observations, inferences, recommendations, unknowns
- No precise scores without defensible methodology

### Feature C: Opportunity Identification
- Business-specific improvement opportunities with: observed problem, evidence, business implication, suggested improvement, priority
- No fabricated problems

### Feature D: Agency-Ready Reports
- Professional branded reports (HTML/PDF): business overview, verified info, digital audit, evidence-backed findings, opportunities, recommended services, next steps

### Feature E: Personalized Sales Assets
- Outreach email, value proposition, website improvements, basic website concept/mockup
- All claims grounded in prospect's available information

## Out of Scope (Initial MVP)
- Full CRM, HubSpot/Pipedrive integration, advanced team management, complex RBAC
- Website hosting infrastructure, full website builder
- AI fine-tuning, autonomous outreach, marketplace, advanced analytics

## Technical Architecture Decision

**One canonical business data flow** — Consolidate competing extraction pipelines. AI-generated info cannot overwrite authoritative business identity. Resolve business.name matching issue. Remove synthetic identity fallbacks. Preserve deterministic extraction. Use AI only where it adds measurable value.

## Quality & Reliability Requirements

Before customer demos:
- Business identity correctness, duplicate resolution, missing field handling
- Source provenance, AI hallucination prevention
- Website extraction failures, rate limits, provider outages
- Partial analysis handling, CSV validation, duplicate rows
- Report generation, PDF rendering
- Prompt injection protection, SSRF protection, API cost tracking
- Real evaluation dataset with manually verified expected results
- Metrics: field-level precision/recall, incorrect identity rate, unsupported claim rate, analysis success rate, median processing time, cost per prospect

## Deliverables (docs/product-validation/)
1. PRODUCT_VISION.md
2. MVP_SCOPE.md
3. USER_WORKFLOWS.md
4. TECHNICAL_IMPLEMENTATION_PLAN.md
5. API_CONTRACTS.md
6. DATA_MODEL.md
7. QUALITY_AND_EVALUATION_PLAN.md
8. CUSTOMER_VALIDATION_PLAN.md
9. PRICING_HYPOTHESES.md
10. MVP_ACCEPTANCE_CRITERIA.md

## Implementation Classification

- **P0:** Required before customer demonstrations
- **P1:** Required before paid pilots
- **P2:** Required after initial validation
- **P3:** Future opportunities

## Target Timeline

14-day execution schedule for MVP. Realistic estimates based on existing implementation (not greenfield).