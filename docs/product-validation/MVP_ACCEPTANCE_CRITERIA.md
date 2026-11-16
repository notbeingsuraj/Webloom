# Webloom 2.0 — MVP Acceptance Criteria

## 1. Acceptance Criteria Framework

Each criterion is classified by priority:
- **P0** — Required before customer demonstrations (core value prop works)
- **P1** — Required before paid pilots (agency workflow complete)
- **P2** — Required after initial validation (scale + retention)
- **P3** — Future opportunities (new product lines)

**Verification Method:**
- **AUTO** — Automated test (unit/integration/E2E)
- **MANUAL** — Manual verification (demo, pilot feedback)
- **METRIC** — Measured against evaluation dataset

---

## 2. Feature A: Prospect Intelligence

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| A.1 | Single Google Maps URL extracts business identity (name, category, contact, location) with provenance | P0 | AUTO: `test_full_pipeline_e2e.js` + MANUAL: demo | ⬜ |
| A.2 | Official website URL extracts verified contact/location (provenance=verified) | P0 | AUTO: `test_official_website_provider.js` | ⬜ |
| A.3 | CSV upload (50 rows) creates bulk job, processes async, returns results | P1 | AUTO: `test_bulk_csv.js` + MANUAL: pilot | ⬜ |
| A.4 | Every output field has `provenance` (verified/discovered/identified/user_provided/inferred/ai_generated) + `confidence` (0-1) | P0 | AUTO: `BusinessProfile` unit tests + evaluation dataset | ⬜ |
| A.5 | **AI Quarantine:** `ai_generated` (0.5) NEVER overwrites `identified` (2) / `discovered` (3) / `verified` (4) on identity fields (name, phone, website, address, coordinates) | P0 | AUTO: `test_ai_quarantine.js` + `CandidatePipeline` tests | ⬜ |
| A.6 | **No Synthetic Identity:** `_persistIdentity()` returns `insufficient_evidence` instead of creating `'Unknown Business'` / `'Unknown'` | P0 | AUTO: `test_synthetic_identity.js` | ⬜ |
| A.7 | **Name Resolution Fixed:** `calculateMatchScore()` reads `business.name` (Geoapify) AND `identity.name` (WebExtraction) — cross-provider name matching works | P0 | AUTO: `test_p12_name_resolution.js` + P1.2 tests (41/41) | ⬜ |
| A.8 | Reputation extracted: rating, review_count, reviews with provenance (observed/discovered/ai_generated) | P0 | AUTO: `test_phase_p19_google_reputation.js` (36/36) | ⬜ |
| A.9 | Provider trace exposed: `geoapify`, `webExtraction`, `officialWebsite` with status, latency, record counts | P0 | AUTO: `BusinessResearchService` return value inspection | ⬜ |
| A.10 | Duplicate CSV rows deduplicated (key: placeId/cid/normalized URL), report shows `{processed, created, duplicates, failed}` | P1 | AUTO: `test_bulk_csv_dedup.js` | ⬜ |
| A.11 | CSV validation: rejects malformed rows, reports errors per row | P1 | AUTO: `test_bulk_csv_validation.js` | ⬜ |
| A.12 | Evaluation dataset: 50 businesses, name accuracy ≥ 95%, phone accuracy ≥ 95%, website accuracy ≥ 95% | P1 | METRIC: `test_evaluation_dataset.js` output | ⬜ |

---

## 3. Feature B: Digital Presence Audit

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| B.1 | Audit analyzes 11 categories: design, mobile, navigation, conversion, trust, seo, localSeo, content, branding, performance, contactAccessibility | P0 | AUTO: `DigitalAuditService` schema validation | ⬜ |
| B.2 | Website exists → AI audit returns scores 0-10 per category with `verified` boolean | P0 | AUTO: `test_digital_audit.js` | ⬜ |
| B.3 | Website exists but AI fails → **Degraded Audit**: `status=degraded`, all categories `verified=false`, `overallScore=0`, honest "not scored" notes | P0 | AUTO: `test_degraded_audit.js` | ⬜ |
| B.4 | No website → **No Website Audit**: deterministic zeros, actionable recommendations, `localSeo` scores Google Maps presence | P0 | AUTO: `test_no_website_audit.js` | ⬜ |
| B.5 | Audit distinguishes: verified findings (provenance=verified), observations (discovered), inferences (inferred/ai_generated), recommendations, unknowns | P0 | MANUAL: inspect audit output structure | ⬜ |
| B.6 | **No Precise Scores Without Methodology:** Scoring methodology documented OR categories marked "needs defensible methodology" | P1 | MANUAL: review `DigitalAuditService` prompt + output | ⬜ |
| B.7 | Audit consumes shared `BusinessResearchDossier` (not re-fetching website) | P1 | AUTO: verify no duplicate fetches in `DigitalAuditService` | ⬜ |
| B.8 | Evidence citations: every audit finding references source (Google Maps, official website, extracted metadata) | P1 | MANUAL: inspect audit output for source references | ⬜ |
| B.9 | Reputation signals integrated: rating, review_count, sentiment, themes from `GoogleMapsReputationExtractor` | P0 | AUTO: `test_phase_p19_google_reputation.js` | ⬜ |

---

## 4. Feature C: Opportunity Identification

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| C.1 | Opportunities identified from: missing website, poor mobile, missing contact CTA, weak metadata, incomplete business info, poorly structured services, missing booking, weak reputation, no social proof | P1 | MANUAL: inspect `BrandStrategyService` + `DigitalAuditService` output | ⬜ |
| C.2 | Each opportunity has: `observedProblem`, `evidence` (source + excerpt), `businessImplication`, `suggestedImprovement`, `priority` (high/medium/low) | P1 | AUTO: `OpportunityInsights` component rendering test | ⬜ |
| C.3 | **No Fabrication:** Opportunities ONLY from actual audit findings (audit.opportunityGap, brandDNA.strategicRecommendations, audit.weaknesses, identifyUnknowns) | P1 | MANUAL: cross-reference opportunities with audit/brandDNA output | ⬜ |
| C.4 | Priority matrix applied: impact × effort → high/medium/low | P1 | AUTO: `BrandStrategyService` recommendation structure validation | ⬜ |
| C.5 | Quick wins identified: high impact + low effort → surfaced first | P1 | AUTO: `DigitalAuditService.identifyQuickWins()` test | ⬜ |
| C.6 | Opportunity synthesis service consumes shared dossier → unified opportunity list (not duplicate across brandDNA + audit) | P1 | MANUAL: inspect LeadDetail.tsx Outreach tab | ⬜ |

---

## 5. Feature D: Agency-Ready Reports

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| D.1 | Report sections: Overview, Verified Intel, Audit, Opportunities, Recommendations, Next Steps | P0 | MANUAL: generate report, inspect HTML | ⬜ |
| D.2 | **HTML Report:** Astro template builds successfully, renders with agency branding (logo, colors, typography) | P0 | AUTO: `test_report_generation.js` (HTML) | ⬜ |
| D.3 | **PDF Export:** Puppeteer generates PDF (A4, printBackground, header/footer with branding, page numbers) | P1 | AUTO: `test_report_generation.js` (PDF) | ⬜ |
| D.4 | Evidence citations in report link to `sourceId` → `EvidenceModels.Evidence` with excerpt, extractionMethod | P1 | MANUAL: click citation in PDF/HTML | ⬜ |
| D.5 | White-label: agency logo, primary color, agency name applied to report template | P1 | MANUAL: generate with custom branding | ⬜ |
| D.6 | Report generation < 60s (Astro build + PDF) | P1 | METRIC: `ReportGenerationService` latency logging | ⬜ |
| D.7 | Public share link: unguessable token, optional expiry/password, access log | P2 | AUTO: `test_report_sharing.js` | ⬜ |
| D.8 | Report data sourced from canonical projection + analysis metrics (not re-computed) | P0 | AUTO: verify `ReportGenerationService` input | ⬜ |

---

## 6. Feature E: Personalized Sales Assets

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| E.1 | **Outreach Email:** `SalesOutreachService.generateOutreachEmail(lead)` returns personalized subject/body with business name, category, specific findings | P0 | AUTO: `test_sales_outreach.js` | ⬜ |
| E.2 | Email editable in UI → copy to clipboard / mailto: link | P0 | MANUAL: LeadDetail.tsx Outreach tab | ⬜ |
| E.3 | **Value Proposition:** Uses `brandDNA.positioning.statement` + `differentiation` → editable "For [audience] who [need]..." format | P0 | MANUAL: LeadDetail.tsx Outreach tab | ⬜ |
| E.4 | **Website Improvements:** `DigitalAuditService.recommendations` filtered by impact×effort, prioritized, each tied to evidence | P1 | MANUAL: LeadDetail.tsx Outreach tab | ⬜ |
| E.5 | **Website Mockup:** `LeadWebsiteSpecService` + `DesignIntelligenceService` → single-page concept (hero, services, proof, CTA) | P1 | AUTO: `test_website_mockup.js` | ⬜ |
| E.6 | **Grounding:** Every claim in assets references `EvidenceModels.Claim` with `sourceId` → `EvidenceModels.Evidence` | P1 | MANUAL: inspect asset output for evidence references | ⬜ |
| E.7 | No generic AI language: prompt templates use `{{EVIDENCE_PLACEHOLDERS}}` filled from dossier | P1 | MANUAL: inspect `apps/api/src/prompts/salesOutreach.js` | ⬜ |

---

## 7. Technical Foundation (P0-P1)

### 7.1 Service Consolidation

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| T.1 | **Single Extraction Entry Point:** All routes use `BusinessResearchService.extractBusinessIntelligenceWithProviders()` — `BusinessDataExtractor` direct calls deprecated | P0 | AUTO: grep for `BusinessDataExtractor.extractFromGoogleMapsUrl` in routes | ⬜ |
| T.2 | **Legacy EntityResolution files deleted:** `EntityResolution 2/3/4.js.legacy` removed, no broken imports | P0 | AUTO: `ls apps/api/src/services/EntityResolution*` | ⬜ |
| T.3 | **Duplicate GoogleMapsUrlParserProvider deleted** | P0 | AUTO: `ls apps/api/src/services/GoogleMapsUrlParserProvider*` | ⬜ |
| T.4 | **AI Overwrite Timing Fixed:** `_enrichMissingWithAI()` runs BEFORE `_persistIdentity()` | P0 | AUTO: code review `BusinessResearchService.js` line order | ⬜ |
| T.5 | **DiscoveryProvider** moved into `BusinessResearchService` | P1 | AUTO: grep for `DiscoveryProvider` imports | ⬜ |
| T.6 | **UserProvidedDataProvider** moved into `BusinessResearchService` | P1 | AUTO: grep for `UserProvidedDataProvider` imports | ⬜ |
| T.7 | **BusinessDataExtractorQualityAdapter** merged into `CandidatePipeline` | P1 | AUTO: `BusinessDataExtractorQualityAdapter.js` marked deprecated | ⬜ |
| T.8 | **LandingPageSpecService** merged into `LeadWebsiteSpecService` | P1 | AUTO: `LandingPageSpecService.js` marked deprecated | ⬜ |
| T.9 | **WebsiteCopywritingService** merged into `SalesOutreachService` | P1 | AUTO: `WebsiteCopywritingService.js` marked deprecated | ⬜ |
| T.10 | **GoogleMapsFallbackExtractor** deprecated (superseded by CID extraction) | P1 | AUTO: marked deprecated, no active imports | ⬜ |
| T.11 | **LeadQualificationService** deprecated (not in MVP) | P1 | AUTO: marked deprecated | ⬜ |
| T.12 | **QualityAssuranceService** deprecated (replaced by CandidatePipeline) | P1 | AUTO: marked deprecated | ⬜ |
| T.13 | **ReputationIntelligenceService** deprecated (superseded by GoogleMapsReputationExtractor) | P1 | AUTO: marked deprecated | ⬜ |
| T.14 | **ReResearchService** deprecated (not in MVP) | P1 | AUTO: marked deprecated | ⬜ |
| T.15 | **TemporalRelocationAnalyzer** deprecated (not in MVP) | P1 | AUTO: marked deprecated | ⬜ |
| T.16 | **WebsiteStrategyService** deprecated (superseded by BrandStrategyService) | P1 | AUTO: marked deprecated | ⬜ |
| T.17 | **WebsiteValidator** deprecated (not in MVP) | P1 | AUTO: marked deprecated | ⬜ |

### 7.2 Authentication & Multi-Tenancy

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| T.18 | API key auth: `Authorization: Bearer <key>` required on all `/api/*` routes | P0 | AUTO: `test_auth_isolation.js` | ⬜ |
| T.19 | Team isolation: Team A cannot read Team B leads, reports, jobs | P0 | AUTO: `test_auth_isolation.js` cross-team access | ⬜ |
| T.20 | Rate limits enforced per team: Starter 100/mo, Growth 500/mo, Agency unlimited | P1 | AUTO: `test_rate_limits.js` | ⬜ |
| T.21 | Usage tracking: `usage_log` table populated per request | P1 | AUTO: inspect `usage_log` after API calls | ⬜ |
| T.22 | Frontend: login page, team switcher, API key management | P1 | MANUAL: Dashboard.tsx auth flow | ⬜ |

### 7.3 Quality & Observability

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| T.23 | Evaluation dataset runs in CI: 50 businesses, metrics computed | P1 | AUTO: GitHub Actions `quality.yml` | ⬜ |
| T.24 | Cost tracking: token usage, provider costs logged per analysis | P1 | AUTO: `AIService.logAICall` + `usage_log` | ⬜ |
| T.25 | Latency percentiles: p50, p95, p99 per endpoint | P1 | AUTO: middleware timing + logging | ⬜ |
| T.26 | Error rates by provider/category: extraction, AI, audit, report | P1 | AUTO: structured error logging | ⬜ |
| T.27 | SSRF protection: `validateFetchUrl` on all outbound fetches | P0 | AUTO: `test_phase20_ssrf.js` | ⬜ |
| T.28 | Prompt injection protection: `customInstructions`/`internalNotes` sanitized | P1 | AUTO: `test_prompt_injection.js` | ⬜ |

---

## 8. Frontend Experience (P0-P1)

### 8.1 Dashboard

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| F.1 | Empty state: illustration + CTA "Analyse Business" → `/leads/new` | P0 | MANUAL: visit `/` with no leads | ⬜ |
| F.2 | Populated state: stats cards (Total, High Priority, Websites, Contacted) + lead list | P0 | MANUAL: visit `/` with leads | ⬜ |
| F.3 | Lead list item: businessName, status badge, category, city, opportunity score, updatedAt | P0 | MANUAL: inspect lead rows | ⬜ |
| F.4 | Click lead → `/leads/{id}` | P0 | MANUAL: click row | ⬜ |
| F.5 | Loading skeletons for stats + lead list | P0 | MANUAL: slow network throttle | ⬜ |
| F.6 | Error state: inline retry button | P0 | MANUAL: disconnect network | ⬜ |

### 8.2 New Prospect (`/leads/new`)

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| F.7 | Input: Google Maps URL (validated), Lead Name, Internal Notes, Custom Instructions | P0 | MANUAL: form interaction | ⬜ |
| F.8 | CSV upload: drag-drop, column mapping preview, validation errors per row | P1 | MANUAL: upload test CSV | ⬜ |
| F.9 | Progress visualization: 7 steps with semantic labels (not technical pipeline stages) | P0 | MANUAL: submit valid URL | ⬜ |
| F.10 | Soft warning at 90s: "Still working — longer than expected" | P0 | MANUAL: throttle backend | ⬜ |
| F.11 | Hard timeout at 5min: aborts, checks for persisted lead, offers recovery | P0 | AUTO: `test_timeout_recovery.js` | ⬜ |
| F.12 | Success: navigates to `/leads/{id}` with lead data | P0 | MANUAL: submit valid URL | ⬜ |
| F.13 | Failure: truthful error message, retry button | P0 | MANUAL: invalid URL / backend error | ⬜ |

### 8.3 Prospect Detail (`/leads/{id}`)

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| F.14 | Header: businessName, status dropdown, delete, score indicator | P0 | MANUAL: visit lead detail | ⬜ |
| F.15 | **Tab 1 - Overview:** OpportunityInsights (score, weaknesses, recommendations), Business Profile Cards (provenance badges), Business DNA, Business Details | P0 | MANUAL: click Overview tab | ⬜ |
| F.16 | **Tab 2 - Analysis:** Digital Audit (11 categories, scores, strengths/weaknesses/criticalIssues/recommendations), MissingIntelligence, ReputationPanel | P0 | MANUAL: click Analysis tab | ⬜ |
| F.17 | **Tab 3 - Website:** WebsitePreview (iframe of generated site) or "Generate Website" button | P0 | MANUAL: click Website tab | ⬜ |
| F.18 | **Tab 4 - Outreach:** Outreach Email (editable, copy, mailto), Value Proposition (editable), Website Improvements (prioritized), Website Mockup | P1 | MANUAL: click Outreach tab | ⬜ |
| F.19 | Mutations: Refresh Analysis, Generate Website, Update Status, Delete — all invalidate query cache | P0 | MANUAL: click each, verify UI updates | ⬜ |
| F.20 | Loading: skeletons per section | P0 | MANUAL: slow network | ⬜ |
| F.21 | Error: inline retry per section | P0 | MANUAL: disconnect network | ⬜ |

### 8.4 Reports

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| F.22 | "Generate Report" button in Website/Outreach tab | P1 | MANUAL: click button | ⬜ |
| F.23 | Format selector: HTML / PDF | P1 | MANUAL: dialog | ⬜ |
| F.24 | Branding picker: logo upload, color picker, agency name | P1 | MANUAL: dialog | ⬜ |
| F.25 | Section selector: checkboxes for each section | P1 | MANUAL: dialog | ⬜ |
| F.26 | Preview: modal with HTML report | P1 | MANUAL: click preview | ⬜ |
| F.27 | Download PDF: triggers browser download | P1 | MANUAL: click download | ⬜ |
| F.28 | Share: creates public link with token, optional expiry/password | P2 | MANUAL: click share | ⬜ |

---

## 9. API Contracts (P0-P1)

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| API.1 | `POST /api/leads` — creates lead, returns 201 with full lead object | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.2 | `GET /api/leads` — paginated, filtered, sorted list | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.3 | `GET /api/leads/stats/dashboard` — stats object | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.4 | `GET /api/leads/:id` — full lead detail | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.5 | `PATCH /api/leads/:id` — updates allowed fields | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.6 | `DELETE /api/leads/:id` — deletes lead | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.7 | `POST /api/leads/:id/brand-dna` — regenerates brandDNA + audit | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.8 | `POST /api/leads/:id/website-spec` — generates website spec | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.9 | `POST /api/leads/bulk` — accepts CSV, returns jobId | P1 | AUTO: `test_api_contracts.js` | ⬜ |
| API.10 | `GET /api/leads/bulk/:jobId` — job status + results | P1 | AUTO: `test_api_contracts.js` | ⬜ |
| API.11 | `POST /api/reports` — generates report, returns URLs | P1 | AUTO: `test_api_contracts.js` | ⬜ |
| API.12 | `GET /api/reports/:reportId/download` — file stream | P1 | AUTO: `test_api_contracts.js` | ⬜ |
| API.13 | `POST /api/reports/:reportId/share` — creates share link | P2 | AUTO: `test_api_contracts.js` | ⬜ |
| API.14 | `POST /api/sales-assets/outreach-email` — returns email | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.15 | `POST /api/sales-assets/value-proposition` — returns VP | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.16 | `POST /api/sales-assets/website-mockup` — returns mockup spec | P1 | AUTO: `test_api_contracts.js` | ⬜ |
| API.17 | `GET /api/health` / `/api/health/ai` — health checks | P0 | AUTO: `test_api_contracts.js` | ⬜ |
| API.18 | All endpoints: 401 without auth, 403 cross-team, 429 rate limited | P0 | AUTO: `test_auth_isolation.js` | ⬜ |
| API.19 | Error format: `{success: false, error, message, details}` | P0 | AUTO: inspect error responses | ⬜ |
| API.20 | Rate limit headers: `X-RateLimit-Limit`, `Remaining`, `Reset` | P1 | AUTO: inspect response headers | ⬜ |

---

## 10. Data Model Integrity (P0)

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| DM.1 | `BusinessEntity` canonical_name never synthetic ('Unknown Business', 'Unknown', 'N/A') | P0 | AUTO: `test_synthetic_identity.js` + DB query | ⬜ |
| DM.2 | `ProviderIdentity` unique on (provider, providerRecordId) | P0 | AUTO: Drizzle schema + insert test | ⬜ |
| DM.3 | `ResolutionRecord` captures matchScore, matchType, both providers | P0 | AUTO: `EntityResolution` integration test | ⬜ |
| DM.4 | `CanonicalField` unique on (entityId, fieldPath), provenance preserved | P0 | AUTO: `CanonicalizationService` test | ⬜ |
| DM.5 | `Observation` links to Source + Evidence + Claim | P0 | AUTO: `EvidenceModels` integration test | ⬜ |
| DM.6 | `lead` table has `team_id` foreign key | P1 | AUTO: Drizzle schema | ⬜ |
| DM.7 | `team`, `team_member`, `api_key`, `usage_log` tables exist | P1 | AUTO: Drizzle schema | ⬜ |

---

## 11. Commercial Validation Gates (P0-P1)

| ID | Criterion | Priority | Verification | Status |
|----|-----------|----------|--------------|--------|
| CV.1 | 14-day experiment executed: 50 prospects sourced, 15 replies, 10 calls, 3 pilots, 1 paid | P0 | MANUAL: `validation/metrics_dashboard_<date>.md` | ⬜ |
| CV.2 | 3 sample prospect reports generated and polished for demos | P0 | MANUAL: `validation/sample_reports/` | ⬜ |
| CV.3 | Landing page value proposition live at `/` | P0 | MANUAL: visit homepage | ⬜ |
| CV.4 | Pilot pricing ($199/30 days) documented and used | P0 | MANUAL: `validation/pilot_agreements/` | ⬜ |
| CV.5 | Customer interview script used on all calls | P0 | MANUAL: `validation/calls/` | ⬜ |
| CV.6 | Paid conversion conversation held with all pilot agencies | P1 | MANUAL: `validation/pilot_metrics_<company>.csv` | ⬜ |
| CV.7 | Feature requests from pilots documented and prioritized | P1 | MANUAL: `validation/feature_requests.md` | ⬜ |

---

## 12. Go/No-Go Decision

**Final Gate (Day 24): All P0 criteria PASS + ≥ 1 paid pilot conversion**

| Gate | Requirement | Status |
|------|-------------|--------|
| **Technical P0** | All P0 criteria in Sections 2-10 PASS | ⬜ |
| **Commercial P0** | CV.1-CV.4 complete, CV.5 executed | ⬜ |
| **Paid Conversion** | ≥ 1 agency pays $199 for pilot → commits to $199/mo | ⬜ |
| **Founder Approval** | Explicit sign-off on `IMPLEMENTATION_DECISION.md` | ⬜ |

**If ANY gate FAILS → Stop, document learnings, reassess.**

---

## 13. References

- `WEBLOOM_AUDIT_REPORT.md` — Source audit findings
- `docs/product-validation/PRODUCT_VISION.md` — Core workflow
- `docs/product-validation/MVP_SCOPE.md` — Feature definitions
- `docs/product-validation/TECHNICAL_IMPLEMENTATION_PLAN.md` — Migration sequence
- `docs/product-validation/QUALITY_AND_EVALUATION_PLAN.md` — Evaluation dataset
- `docs/product-validation/CUSTOMER_VALIDATION_PLAN.md` — 14-day experiment
- `apps/api/test_*.js` — Test files referenced above
- `apps/web/src/pages/*.tsx` — Frontend pages