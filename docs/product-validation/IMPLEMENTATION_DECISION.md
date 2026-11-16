# Webloom 2.0 — Implementation Decision

## 1. Executive Summary

**Decision: PROCEED with MVP build** — The audit verdict (PIVOT to Agency Prospect Intelligence) is validated by the existing technical foundation. The codebase contains a production-grade evidence-based extraction pipeline with provenance tracking, canonical identity resolution, and multi-provider AI chain. The pivot requires packaging this pipeline as a commercial product for boutique agencies, not rebuilding it.

**Investment:** ~14 days of focused engineering (P0 + P1) to reach paid pilot readiness.

**Risk:** Low technical risk (pipeline works), high commercial risk (zero customer validation to date). The 14-day validation experiment MUST complete before further engineering investment.

---

## 2. Task Classification

### P0 — Required Before Customer Demonstrations (Week 1)

| Task | Description | Files | Effort | Dependencies |
|------|-------------|-------|--------|--------------|
| **P0.1** | Fix `calculateMatchScore` to read `business.name` (Geoapify flat shape) | `EntityResolution.js:432` | 2 days | None |
| **P0.2** | Remove synthetic identity (`'Unknown Business'` / `'Unknown'`) from `_persistIdentity` | `BusinessResearchService.js:1038-1045` | 1 day | P0.1 |
| **P0.3** | Consolidate extraction: single entry point via `BusinessResearchService` | `leads.js`, `business.js`, deprecate direct `BusinessDataExtractor` calls | 3 days | P0.1, P0.2 |
| **P0.4** | Fix AI overwrite timing: move `_enrichMissingWithAI` BEFORE `_persistIdentity` | `BusinessResearchService.js` line order | 1 day | P0.2 |
| **P0.5** | Delete 4 legacy EntityResolution files | `EntityResolution 2/3/4.js.legacy` | 0.5 days | None |
| **P0.6** | Delete duplicate `GoogleMapsUrlParserProvider` | One of two copies | 0.1 days | None |
| **P0.7** | API key authentication + team isolation | New `auth.js`, `schema.js` (Team, ApiKey), middleware | 5 days | None |
| **P0.8** | Quality framework + evaluation dataset (50 businesses) | `test_evaluation_dataset.js`, `datasets/evaluation/ground_truth.json` | 3 days | P0.1-P0.4 |

**P0 Total: ~15.5 engineering days** (can parallelize P0.7 + P0.8 with P0.1-P0.4)

### P1 — Required Before Paid Pilots (Week 2)

| Task | Description | Files | Effort | Dependencies |
|------|-------------|-------|--------|--------------|
| **P1.1** | Bulk CSV endpoint + async job queue | `BulkAnalysisService.js`, `leads.js POST /leads/bulk`, `GET /leads/bulk/:jobId` | 4 days | P0.7 |
| **P1.2** | White-label PDF report generator | `ReportGeneratorService.js`, `reports.js`, Puppeteer, Astro template | 5 days | P0.3, P0.4 |
| **P1.3** | Frontend: Dashboard (stats, lead list, empty state) | `Dashboard.tsx` | 2 days | P0.7 |
| **P1.4** | Frontend: NewProspect (URL + CSV, progress, timeout) | `NewProspect.tsx` (replace `NewLead.tsx`) | 2 days | P0.7, P1.1 |
| **P1.5** | Frontend: ProspectDetail (4 tabs, mutations) | `ProspectDetail.tsx` (replace `LeadDetail.tsx`) | 2 days | P0.7 |
| **P1.6** | Frontend: Reports (generate, preview, PDF, share) | `Reports.tsx` | 1 day | P1.2 |
| **P1.7** | Deprecate non-MVP services (mark deprecated, remove imports) | 10 services (see TECHNICAL_IMPLEMENTATION_PLAN.md) | 2 days | P0.3 |
| **P1.8** | SSRF validation audit + prompt injection protection | `ssrfValidator.js`, sanitize `customInstructions` | 1 day | P0.7 |
| **P1.9** | Run 14-day validation experiment | `validation/` artifacts | 14 calendar days | P0.1-P0.4, P1.1-P1.6 |

**P1 Total: ~19 engineering days + 14 calendar days validation**

### P2 — Required After Initial Validation (Month 2+)

| Task | Description | Priority |
|------|-------------|----------|
| **P2.1** | CRM integrations (HubSpot first) | P2 |
| **P2.2** | Team seats (invite, roles) | P2 |
| **P2.3** | API access for Agency tier | P2 |
| **P2.4** | Multi-location batch (franchise) | P2 |
| **P2.5** | Advanced analytics (cohort, funnel) | P2 |
| **P2.6** | Proposal builder UI (drag-drop sections) | P2 |

### P3 — Future Opportunities (Month 3+)

| Task | Description | Priority |
|------|-------------|----------|
| **P3.1** | AI fine-tuning for extraction (cost reduction) | P3 |
| **P3.2** | Generated site deployment (Vercel/Netlify) | P3 |
| **P3.3** | Full website builder | P3 |
| **P3.4** | Marketplace (agency ↔ freelancer) | P3 |
| **P3.5** | Autonomous outreach (with opt-in workflows) | P3 |

---

## 3. 14-Day Execution Schedule

### Week 1: Technical Foundation (P0)

| Day | Focus | Tasks | Owner | Verification |
|-----|-------|-------|-------|--------------|
| **Mon** | Identity Fixes | P0.1 (name resolution), P0.2 (synthetic identity), P0.5 (delete legacy), P0.6 (delete duplicate) | Backend | P1.2 tests pass (41/41), no `'Unknown Business'` in output |
| **Tue** | Extraction Consolidation | P0.3 (single entry point), P0.4 (AI overwrite timing) | Backend | All routes use `BusinessResearchService`; AI never on identity at persist |
| **Wed** | Auth Foundation | P0.7 (API keys, teams, middleware) — start | Backend | 401 without key, 403 cross-team |
| **Thu** | Auth Completion + Quality | P0.7 complete, P0.8 (evaluation dataset) — start | Backend | 50 ground truth businesses defined |
| **Fri** | Quality Completion | P0.8 complete, run evaluation dataset | Backend | Name accuracy ≥ 95%, AI quarantine 0 violations |
| **Sat** | Buffer / Integration Test | Full pipeline E2E test | Backend | `test_full_pipeline_e2e.js` passes |
| **Sun** | **Rest / Validation Prep** | Prepare outreach list, message templates | Founder | 50 prospects sourced |

### Week 2: Product Completion + Validation Launch (P1)

| Day | Focus | Tasks | Owner | Verification |
|-----|-------|-------|-------|--------------|
| **Mon** | Bulk CSV + Reports Backend | P1.1 (bulk endpoint), P1.2 (PDF reports) — start | Backend | 50-row CSV → job → results |
| **Tue** | Reports Completion | P1.2 complete, P1.7 (deprecate services) | Backend | HTML + PDF with branding |
| **Wed** | Frontend: Dashboard + NewProspect | P1.3, P1.4 | Frontend | Loads < 1s, submits URL + CSV |
| **Thu** | Frontend: ProspectDetail + Reports | P1.5, P1.6 | Frontend | All 4 tabs render, mutations work |
| **Fri** | Security + Integration | P1.8 (SSRF, prompt injection), full integration test | Backend | `test_auth_isolation.js`, `test_phase20_ssrf.js` pass |
| **Sat** | **Validation Launch** | Day 1-2: Source 50 agencies, send outreach | Founder | `validation/prospects.csv`, `outreach_log.csv` |
| **Sun** | **Validation Continue** | Day 3-4: Outreach follow-up, book calls | Founder | 15+ replies, 10 calls booked |

### Week 3: Validation Execution (Calendar Days 8-14)

| Day | Focus | Tasks | Owner | Verification |
|-----|-------|-------|-------|--------------|
| **Mon-Thu** | Discovery Calls | Days 5-8: 10 calls, run interview script | Founder | 5 "strong interest", notes in `validation/calls/` |
| **Fri** | Pilot Signing | Days 9-10: 3 pilots signed, onboard | Founder | `validation/pilot_agreements/` |
| **Sat-Sun** | Pilot Delivery | Days 11-13: Deliver 50 analyses each, 3 proposals | Founder + Backend | `validation/pilot_metrics_<company>.csv` |
| **Mon** | **Conversion Ask** | Day 14: Ask for paid commitment | Founder | ≥ 1 paid conversion |

---

## 4. Resource Allocation

| Role | Week 1 | Week 2 | Week 3 |
|------|--------|--------|--------|
| **Backend Engineer** | 1.0 FTE (P0.1-P0.8) | 1.0 FTE (P1.1, P1.2, P1.7, P1.8) | 0.5 FTE (pilot support) |
| **Frontend Engineer** | 0.2 FTE (review) | 1.0 FTE (P1.3-P1.6) | 0.2 FTE (pilot UI fixes) |
| **Founder** | 0.3 FTE (validation prep) | 0.5 FTE (validation launch) | 1.0 FTE (calls, pilots, conversion) |

**Total Engineering:** ~35 engineering days over 2 weeks (parallelizable)

---

## 5. Dependencies & Risks

### Critical Path Dependencies

```
P0.1 → P0.2 → P0.3 → P0.4 → P0.8 (evaluation)
                    ↓
P0.7 (auth) ←───────┘ (parallel)
                    ↓
P1.1 (bulk) ← P0.7
P1.2 (reports) ← P0.3, P0.4
P1.3-P1.6 (frontend) ← P0.7, P1.1, P1.2
                    ↓
P1.9 (validation) ← P0.1-P0.4, P1.1-P1.6
```

### Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **P0.1-P0.4 reveal fundamental data quality issues** | LOW | CRITICAL | Run evaluation dataset early (Day 3); if name accuracy < 90%, STOP |
| **Auth migration breaks frontend** | MEDIUM | HIGH | Feature flag auth; test with existing leads first; keep v1 endpoints |
| **PDF generation fails on CI** | MEDIUM | MEDIUM | Puppeteer with `--no-sandbox`; fallback to HTML-only for demo |
| **Bulk CSV timeout on large files** | MEDIUM | MEDIUM | Async job queue with status polling; 500 row limit |
| **Frontend rebuild introduces regressions** | HIGH | HIGH | Playwright E2E tests for each page; visual regression |
| **0 discovery calls in 14 days** | MEDIUM | CRITICAL | Pre-qualify 50 prospects; message-market fit test before Day 1 |
| **Founder rejects pivot after validation** | LOW | CRITICAL | Data-driven memo with audit evidence; pilot commitments |

---

## 6. Go/No-Go Decision Points

### Gate 1: End of Week 1 (Technical P0 Complete)
- [ ] All P0 tasks complete and verified
- [ ] Evaluation dataset runs: name accuracy ≥ 95%, AI quarantine 0 violations
- [ ] Full pipeline E2E test passes
- **Decision:** PROCEED to Week 2 / STOP & reassess

### Gate 2: End of Week 2 (Product P1 Complete)
- [ ] All P1.1-P1.8 complete
- [ ] Frontend: Dashboard, NewProspect, ProspectDetail, Reports all functional
- [ ] Auth enforced on all endpoints
- [ ] 50 prospects sourced, outreach templates ready
- **Decision:** LAUNCH validation / STOP & reassess

### Gate 3: Day 14 (Validation Complete)
- [ ] ≥ 3 discovery calls with qualified agencies
- [ ] ≥ 3 pilots signed and onboarded
- [ ] ≥ 1 paid conversion ($199 pilot → $199/mo commitment)
- [ ] > 50% time saved measured in pilot
- **Decision:** PROCEED to P2 build / ITERATE (feature gaps) / STOP (no market)

---

## 7. Founder Decision Required

**Please confirm the following before any production code changes:**

### Strategic Confirmation
- [ ] **Pivot Accepted:** Webloom = Agency Prospect Intelligence Platform (not AI website generator)
- [ ] **ICP Confirmed:** Boutique digital agencies (2-10 employees) selling websites, local SEO, GBP, reputation
- [ ] **Differentiator Locked:** "Only prospecting tool that cites its sources" — provenance-backed intelligence
- [ ] **MVP Scope Locked:** Features A-E only (Intelligence, Audit, Opportunities, Reports, Assets)
- [ ] **Out of Scope Confirmed:** No CRM, HubSpot, RBAC, hosting, builder, fine-tuning, autonomous outreach, marketplace

### Commercial Confirmation
- [ ] **Pilot Price:** $199 for 30 days, 50 analyses, 3 co-built proposals
- [ ] **Subscription Hypotheses:** Starter $99/100, Growth $199/500, Agency $399/unlimited
- [ ] **Validation Experiment:** 14-day protocol will be executed as written
- [ ] **Failure Criteria Accepted:** < 3 calls or 0 paid after 3 pilots = STOP

### Execution Confirmation
- [ ] **14-Day Schedule Accepted:** Week 1 P0, Week 2 P1, Week 3 Validation
- [ ] **Resource Commitment:** Backend 1.0 FTE, Frontend 1.0 FTE (Week 2), Founder 1.0 FTE (Week 3)
- [ ] **No Production Changes Without Explicit Approval:** This document is the contract

---

## 8. Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Founder / CEO** | | | |
| **Technical Lead** | | | |

---

## 9. Document References

- `WEBLOOM_AUDIT_REPORT.md` — Source audit (Sections 7.1, 7.2, 8.1, 8.2)
- `docs/product-validation/PRODUCT_VISION.md` — Positioning, workflow, pricing
- `docs/product-validation/MVP_SCOPE.md` — Features A-E, out-of-scope, priorities
- `docs/product-validation/USER_WORKFLOWS.md` — Dashboard, NewProspect, ProspectDetail, Reports, Assets
- `docs/product-validation/TECHNICAL_IMPLEMENTATION_PLAN.md` — Service consolidation, data flow, migration
- `docs/product-validation/API_CONTRACTS.md` — All endpoints, auth, rate limits
- `docs/product-validation/DATA_MODEL.md` — Canonical profile, SQLite schema, output schemas
- `docs/product-validation/QUALITY_AND_EVALUATION_PLAN.md` — Metrics, dataset, tests, monitoring
- `docs/product-validation/CUSTOMER_VALIDATION_PLAN.md` — 14-day experiment, outreach, pilots
- `docs/product-validation/PRICING_HYPOTHESES.md` — Tiers, unit economics, pilot pricing
- `docs/product-validation/MVP_ACCEPTANCE_CRITERIA.md` — P0-P3 criteria per feature, gates