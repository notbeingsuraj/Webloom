# Webloom 2.0 — Planning State

## Current Phase
**Phase 1: Product Validation & MVP Definition** — Planning in progress

## Decisions Made

| ID | Decision | Source | Status |
|----|----------|--------|--------|
| D-01 | Pivot from AI Website Generator to Agency Prospect Intelligence & Sales Enablement Platform | Audit verdict (2026-11-16) | LOCKED |
| D-02 | Target customer: Boutique digital agencies (2-10 employees) | Audit / Product strategy | LOCKED |
| D-03 | Core workflow: Import → Identify → Gather → Verify → Audit → Opportunities → Report → Outreach → Mockup | Product definition | LOCKED |
| D-04 | MVP Features A-E only (Prospect Intelligence, Digital Audit, Opportunities, Reports, Sales Assets) | Scope decision | LOCKED |
| D-05 | Out of scope: CRM, integrations, team management, hosting, website builder, AI fine-tuning, autonomous outreach, marketplace, advanced analytics | Scope decision | LOCKED |
| D-06 | One canonical business data flow; consolidate competing pipelines | Technical architecture | LOCKED |
| D-07 | AI-generated info cannot overwrite authoritative business identity | Technical architecture | LOCKED |
| D-08 | Remove synthetic identity fallbacks; preserve deterministic extraction | Technical architecture | LOCKED |
| D-09 | Use AI only where it adds measurable value | Technical architecture | LOCKED |
| D-10 | 14-day execution schedule for MVP implementation | Timeline decision | LOCKED |
| D-11 | Pricing hypotheses: Starter $99, Growth $199, Agency $399 (experiments) | Commercial validation | LOCKED |
| D-12 | Paid pilot before subscription billing | Commercial validation | LOCKED |
| D-13 | No fabricated testimonials or case studies | Commercial validation | LOCKED |
| D-14 | Real evaluation dataset with manually verified expected results | Quality requirement | LOCKED |
| D-15 | Deliverables in docs/product-validation/ (10 specific documents) | Deliverable decision | LOCKED |

## Deferred Ideas
- Full deep research engine (iterative loop, evidence graph, competitor intelligence) — Phase 2+
- Multi-provider source discovery (Bing/Brave/DuckDuckGo) — Phase 2+
- Customer review intelligence (themes + evidence) — Phase 2+
- Competitor intelligence (semantic discovery + deep profiles) — Phase 2+
- Market intelligence (category norms, pricing) — Phase 2+
- Business Research Dossier canonical output — Phase 2+
- Generation safety gate — Phase 2+
- Full website generation pipeline completion — Phase 2+

## The agent's Discretion
- Specific file structure for docs/product-validation/
- Exact API contract shapes (within MVP feature boundaries)
- Evaluation dataset composition (which businesses, how many)
- Pilot outreach message wording
- Report template design (using existing styling system)
- Which existing services to consolidate vs. deprecate (based on code audit)

## Pending Todos
- [ ] Create PRODUCT_VISION.md
- [ ] Create MVP_SCOPE.md
- [ ] Create USER_WORKFLOWS.md
- [ ] Create TECHNICAL_IMPLEMENTATION_PLAN.md
- [ ] Create API_CONTRACTS.md
- [ ] Create DATA_MODEL.md
- [ ] Create QUALITY_AND_EVALUATION_PLAN.md
- [ ] Create CUSTOMER_VALIDATION_PLAN.md
- [ ] Create PRICING_HYPOTHESES.md
- [ ] Create MVP_ACCEPTANCE_CRITERIA.md
- [ ] Present implementation decision to founder for approval

## Blockers
- None — planning phase only, no implementation blockers

## Active Research
- Architecture audit complete (.planning/research/AUDIT-REPORT.md)
- No additional research needed for planning phase

## Phase Progress
- PROJECT.md: ✅ Created
- ROADMAP.md: ✅ Created
- STATE.md: ✅ Created
- CONTEXT.md: N/A (no discuss-phase run)
- RESEARCH.md: ✅ Exists (AUDIT-REPORT.md)
- PLAN.md files: ⏳ Pending creation