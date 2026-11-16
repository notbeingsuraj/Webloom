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

## Future Phases (Post-MVP Validation)

### Phase 2: Core Prospect Intelligence Engine (P0 Implementation)
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