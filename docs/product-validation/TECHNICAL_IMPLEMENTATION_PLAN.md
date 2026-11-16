# Webloom 2.0 — Technical Implementation Plan

## 1. Service Consolidation Map

### Current State: 46 Services in `apps/api/src/services/`

| # | Service | Lines | Status | Decision | Rationale |
|---|---------|-------|--------|----------|-----------|
| 1 | `AcquisitionResult.js` | 20k | Active | **REMAIN** | Core contract for provider results |
| 2 | `AIService.js` | 8k | Active | **REMAIN** | Single AI entry point, provider chain |
| 3 | `AssetGenerationService.js` | 15k | Active | **REMAIN** | PDF/asset generation for reports |
| 4 | `BrandStrategyService.js` | 8k | Active | **REMAIN** | Brand DNA, strategic recommendations |
| 5 | `BusinessDataExtractor.js` | 65k | Active | **CONSOLIDATE** | Merge into BusinessResearchService as internal implementation |
| 6 | `BusinessDataExtractorQualityAdapter.js` | 8k | Active | **DEPRECATE** | Replaced by CandidatePipeline quality boundary |
| 7 | `BusinessProfile.js` | 42k | Active | **REMAIN** | Provenance-tracked fact store (core) |
| 8 | `BusinessProfileValidator.js` | 6k | Active | **REMAIN** | Validation utilities |
| 9 | `BusinessResearchService.js` | 96k | Active | **REMAIN** | **Single extraction entry point (D-06)** |
| 10 | `CanonicalBusinessProfileService.js` | 56k | Active | **REMAIN** | Unified projection layer |
| 11 | `CanonicalizationService.js` | 20k | Active | **REMAIN** | Persistent canonical fields |
| 12 | `CandidatePipeline.js` | 27k | Active | **REMAIN** | Quality boundary with validation gates |
| 13 | `DesignIntelligenceService.js` | 40k | Active | **REMAIN** | Design system generation |
| 14 | `DigitalAuditService.js` | 14k | Active | **REMAIN** | Audit with degraded mode |
| 15 | `DiscoveryProvider.js` | 1k | Active | **CONSOLIDATE** | Move into BusinessResearchService |
| 16 | `EntityResolution.js` | 25k | Active | **REMAIN** | Cross-provider matching (P1.2 fix applied) |
| 17 | `EntityResolution 2.js.legacy` | 23k | Legacy | **DELETE** | Dead code |
| 18 | `EntityResolution 3.js.legacy` | 16k | Legacy | **DELETE** | Dead code |
| 19 | `EntityResolution 4.js.legacy` | 13k | Legacy | **DELETE** | Dead code |
| 20 | `EvidenceModels.js` | 9k | Active | **REMAIN** | Source/Evidence/Claim/Conflict models |
| 21 | `FactualDataValidator.js` | 6k | Active | **REMAIN** | AI copy sanitization |
| 22 | `FieldCandidate.js` | 10k | Active | **REMAIN** | Candidate representation |
| 23 | `FieldNormalizer.js` | 24k | Active | **REMAIN** | Normalization utilities |
| 24 | `FieldValidation.js` | 13k | Active | **REMAIN** | Type/format validation |
| 25 | `GeneratedSiteManager.js` | 13k | Active | **REMAIN** | Template, build, serve |
| 26 | `GoogleMapsFallbackExtractor.js` | 37k | Active | **DEPRECATE** | Superseded by BusinessDataExtractor CID extraction |
| 27 | `GoogleMapsReputationExtractor.js` | 24k | Active | **REMAIN** | Reputation with provenance |
| 28 | `GoogleMapsUrlParserProvider.js` | 8k | Active | **REMAIN** | URL parsing (IDENTIFIED provenance) |
| 29 | `LandingPageSpecService.js` | 8k | Active | **CONSOLIDATE** | Merge into LeadWebsiteSpecService |
| 30 | `LeadQualificationService.js` | 7k | Active | **DEPRECATE** | Not in MVP (D-05) |
| 31 | `LeadWebsiteSpecService.js` | 15k | Active | **REMAIN** | Website spec generation |
| 32 | `OfficialWebsiteProvider.js` | 10k | Active | **REMAIN** | VERIFIED provenance extraction |
| 33 | `QualityAssuranceService.js` | 5k | Active | **DEPRECATE** | Replaced by CandidatePipeline |
| 34 | `ReputationIntelligenceService.js` | 8k | Active | **DEPRECATE** | Superseded by GoogleMapsReputationExtractor |
| 35 | `ReResearchService.js` | 14k | Active | **DEPRECATE** | Not in MVP |
| 36 | `SalesOutreachService.js` | 5k | Active | **REMAIN** | Outreach email generation |
| 37 | `TemporalRelocationAnalyzer.js` | 7k | Active | **DEPRECATE** | Not in MVP |
| 38 | `UserProvidedDataProvider.js` | 2k | Active | **CONSOLIDATE** | Move into BusinessResearchService |
| 39 | `WebsiteCopywritingService.js` | 5k | Active | **CONSOLIDATE** | Merge into SalesOutreachService |
| 40 | `WebsiteGenerationService.js` | 26k | Active | **REMAIN** | Report/site generation |
| 41 | `WebsiteStrategyService.js` | 5k | Active | **DEPRECATE** | Superseded by BrandStrategyService |
| 42 | `WebsiteValidator.js` | 6k | Active | **DEPRECATE** | Not in MVP |
| 43 | `GoogleMapsUrlParserProvider.js` (dup) | 8k | Active | **DELETE** | Duplicate file |
| 44 | `providers/GeoapifyProvider.js` | 21k | Active | **REMAIN** | Places provider |
| 45 | `providers/ProviderAdapter.js` | 10k | Active | **REMAIN** | Provider normalization |
| 46 | `providers/WebExtractionProvider.js` | 8k | Active | **REMAIN** | Wraps BusinessDataExtractor |

### Consolidation Actions

| Action | Files Affected | Effort |
|--------|----------------|--------|
| **Delete 4 legacy EntityResolution files** | EntityResolution 2/3/4.js.legacy | 0.5 day |
| **Delete duplicate GoogleMapsUrlParserProvider** | One of the two copies | 0.1 day |
| **Move DiscoveryProvider into BusinessResearchService** | DiscoveryProvider.js → BusinessResearchService | 1 day |
| **Move UserProvidedDataProvider into BusinessResearchService** | UserProvidedDataProvider.js → BusinessResearchService | 1 day |
| **Merge BusinessDataExtractorQualityAdapter into CandidatePipeline** | BusinessDataExtractorQualityAdapter.js, CandidatePipeline.js | 2 days |
| **Merge LandingPageSpecService into LeadWebsiteSpecService** | LandingPageSpecService.js, LeadWebsiteSpecService.js | 2 days |
| **Merge WebsiteCopywritingService into SalesOutreachService** | WebsiteCopywritingService.js, SalesOutreachService.js | 1 day |
| **Deprecate GoogleMapsFallbackExtractor** | GoogleMapsFallbackExtractor.js (mark deprecated, keep for reference) | 0.5 day |
| **Deprecate LeadQualificationService** | LeadQualificationService.js (mark deprecated) | 0.1 day |
| **Deprecate QualityAssuranceService** | QualityAssuranceService.js (mark deprecated) | 0.1 day |
| **Deprecate ReputationIntelligenceService** | ReputationIntelligenceService.js (mark deprecated) | 0.1 day |
| **Deprecate ReResearchService** | ReResearchService.js (mark deprecated) | 0.1 day |
| **Deprecate TemporalRelocationAnalyzer** | TemporalRelocationAnalyzer.js (mark deprecated) | 0.1 day |
| **Deprecate WebsiteStrategyService** | WebsiteStrategyService.js (mark deprecated) | 0.1 day |
| **Deprecate WebsiteValidator** | WebsiteValidator.js (mark deprecated) | 0.1 day |

**Total Consolidation Effort: ~10 days**

---

## 2. Canonical Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         WEBLOOM 2.0 CANONICAL DATA FLOW                             │
└─────────────────────────────────────────────────────────────────────────────────────┘

INPUT LAYER
──────────────────
Google Maps URL / CSV / Website URL
    │
    ▼
VALIDATION & NORMALIZATION
──────────────────
BusinessResearchService.extractBusinessIntelligenceWithProviders()
    │
    ├─► GoogleMapsUrlParserProvider.parse() → IDENTIFIED hints (name, coords)
    ├─► GeoapifyProvider.search() → DISCOVERED places
    ├─► WebExtractionProvider → BusinessDataExtractor
    │       ├─► r.jina.ai proxy → Google Maps HTML
    │       ├─► CID page (maps.google.com/?cid=) → DOM extraction (phone, address, rating, hours)
    │       ├─► Direct Google Maps HTML fallback
    │       └─► AI extraction (AI_GENERATED provenance) for unstructured fields
    ├─► Fallback extraction from source text (P1.8)
    └─► OfficialWebsiteProvider.extract() → VERIFIED contact/location
    │
    ▼
QUALITY BOUNDARY (CandidatePipeline)
──────────────────
runCandidatePipeline({records, profileContext, options})
    │
    ├─► createCandidatesFromRecord() → FieldCandidate[]
    ├─► validateEvidence() → gates: evidence required for AI_GENERATED identity fields
    ├─► validateType() → type/format checking (phone, email, URL, coordinates, rating)
    ├─► selectBestCandidate() → provenance hierarchy: user_provided(5) > verified(4) > discovered(3) > identified(2) > inferred(1) > ai_generated(0.5)
    └─► applyToProfile() → BusinessProfile.merge()
    │
    ▼
CANONICAL PROJECTION
──────────────────
CanonicalBusinessProfileService.fromEntityData({record})
    │
    ├─► Reads from BusinessProfile (provenance-tracked)
    ├─► Reads from BusinessEntity (persisted canonical)
    ├─► Reads from ProviderIdentity (provider mappings)
    ├─► Reads from CanonicalField (field-level canonical)
    └─► Outputs unified shape:
        {
          identity: {name, category, coordinates, phone, website, address},
          business: {category, description, services, hours, reputation},
          providers: [{provider, providerRecordId, resolutionMethod, confidence}]
        }
    │
    ▼
PERSISTENCE LAYER
──────────────────
IdentityRepository (SQLite)
    │
    ├─► BusinessEntity: entityId, canonicalName, canonicalPhone, canonicalWebsite, canonicalAddress, canonicalLat/Lng, category
    ├─► ProviderIdentity: entityId, provider, providerRecordId, resolutionMethod, resolutionConfidence
    ├─► ResolutionRecord: entityId, matchScore, matchType, providerA/B, status
    ├─► CanonicalField: entityId, fieldPath, value, provenance, confidence, sourceId
    ├─► Observation: entityId, provider, providerRecordId, fieldPath, value, provenance, confidence
    ├─► Claim: entityId, fieldPath, value, claimType, confidence, verificationStatus
    ├─► Evidence: sourceId, fieldPath, value, excerpt, extractionMethod
    ├─► Source: url, domain, provider, sourceType, authority
    └─► Conflict: entityId, fieldPath, values[], status, resolutionStrategy
    │
    ▼
INTELLIGENCE LAYER (Consumes Canonical Projection)
──────────────────
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ BrandStrategy   │ DigitalAudit    │ Opportunity     │ Report/Asset    │
│ Service         │ Service         │ Synthesis       │ Generation      │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ generateBrandDNA│ auditDigital    │ synthesize      │ ReportGenerator │
│ (positioning,   │ Presence        │ (intel + audit  │ Service         │
│  personality,   │ (11 categories,  │  → opportunities)│  (HTML + PDF)   │
│  recommendations)│ degraded mode)  │                 │                 │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
    │
    ▼
OUTPUT LAYER
──────────────────
Frontend: Dashboard → NewProspect → ProspectDetail → Reports → SalesAssets
API: /leads, /leads/{id}, /leads/{id}/brand-dna, /leads/{id}/website-spec, /leads/bulk, /reports
```

---

## 3. Migration Sequence

### Phase 1: P0 Technical Debt (Week 1) — Plan 01
| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 1 | Fix `calculateMatchScore` to read `business.name` | `EntityResolution.js:330` | P1.2 tests pass (41/41) |
| 2 | Remove synthetic identity (`'Unknown Business'`) | `BusinessResearchService._persistIdentity` | No `'Unknown Business'` in any output |
| 3 | Consolidate extraction: single entry point | `BusinessResearchService`, deprecate `BusinessDataExtractor` direct calls | All routes use `BusinessResearchService` |
| 4 | Fix AI overwrite timing | Move `_enrichMissingWithAI` BEFORE `_persistIdentity` | AI never on identity at persist |
| 5 | Delete 4 legacy EntityResolution files | `EntityResolution 2/3/4.js.legacy` | Files gone, no imports broken |

### Phase 2: Auth + Quality (Week 1-2) — Plans 02, 06
| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 6-7 | API key auth + team isolation | `auth.js`, `schema.js` (Team, ApiKey), all routes | 401 without key, 403 cross-team |
| 8-9 | Quality framework + eval dataset | `test_evaluation_dataset.js`, 50 real businesses | Precision/recall measured |

### Phase 3: Bulk + Reports (Week 2) — Plans 03, 04
| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 10-11 | Bulk CSV endpoint + async queue | `BulkAnalysisService.js`, `leads.js` POST `/leads/bulk` | 50 URLs → job → results |
| 12-13 | White-label PDF reports | `ReportGeneratorService.js`, `reports.js`, Puppeteer | HTML + PDF with branding |

### Phase 4: Frontend Rebuild (Week 2-3) — Plan 05
| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 14-15 | Dashboard (stats, lead list, empty state) | `Dashboard.tsx` | Loads < 1s, skeletons |
| 16-17 | NewProspect (URL + CSV, progress, timeout) | `NewProspect.tsx` | Submits, shows progress |
| 18-19 | ProspectDetail (4 tabs, mutations) | `ProspectDetail.tsx` | All tabs render, mutations work |
| 20 | Reports (generate, preview, PDF, share) | `Reports.tsx` | PDF downloads, share links |

### Phase 5: Validation Docs + Decision (Week 3) — Plans 07, 08
| Day | Task | Files | Verification |
|-----|------|-------|--------------|
| 21-22 | 9 validation documents | All `.md` in `docs/product-validation/` | All exist, specific |
| 23 | Integration test + pilot prep | End-to-end test | 3 pilot agencies ready |
| 24 | Founder approval | `IMPLEMENTATION_DECISION.md`, `FOUNDER_DECISION_MEMO.md` | Explicit sign-off |

---

## 4. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Extraction consolidation breaks existing tests** | HIGH | HIGH | Run full test suite after each consolidation; keep `BusinessDataExtractor` as internal class |
| **Auth migration breaks frontend** | MEDIUM | HIGH | Feature flag auth; test with existing leads first |
| **PDF generation fails on CI** | MEDIUM | MEDIUM | Puppeteer with `--no-sandbox`; fallback to HTML-only |
| **Bulk CSV timeout on large files** | MEDIUM | MEDIUM | Async job queue with status polling; 500 row limit |
| **Frontend rebuild introduces regressions** | HIGH | HIGH | Playwright E2E tests for each page; visual regression |
| **Eval dataset biased** | MEDIUM | HIGH | 50 diverse businesses (verticals, sizes, locations); blind evaluation |
| **Founder rejects pivot** | LOW | CRITICAL | Data-driven memo with audit evidence; pilot commitments |

---

## 5. Key Implementation Decisions (Locked)

| ID | Decision | Source |
|----|----------|--------|
| D-01 | Pivot to Agency Prospect Intelligence Platform | Audit Section 8 |
| D-02 | Target: Boutique agencies (2-10 employees) | Audit Section 5.1 |
| D-03 | Differentiator: "Only prospecting tool that cites its sources" | Audit Section 6 |
| D-04 | MVP = Features A-E only | Audit Section 7.1 |
| D-05 | Out of scope: CRM, HubSpot, RBAC, hosting, builder, fine-tuning | Audit Section 7.1 |
| D-06 | Single extraction entry point: BusinessResearchService | Audit Section 7.1 |
| D-07 | API key auth + team isolation required | Audit Section 7.1 |
| D-08 | Bulk CSV for agency workflow | Audit Section 7.1 |
| D-09 | White-label PDF reports | Audit Section 7.1 |
| D-10 | Frontend = business outcomes, not pipeline steps | Audit Section 7.1 |
| D-11 | Real eval dataset (50+ businesses), no synthetic tests | Audit Section 7.1 |
| D-12 | Paid pilot before subscription billing | Audit Section 7.1 |
| D-13 | 14-day schedule (P0 week 1, P1 week 2) | Audit Section 7.2 |
| D-14 | Founder approval before production changes | Audit Section 8.2 |

---

## References

- `apps/api/src/services/BusinessResearchService.js` — Consolidation target
- `apps/api/src/services/BusinessDataExtractor.js` — To be internalized
- `apps/api/src/services/EntityResolution.js` — P1.2 fix location
- `apps/api/src/services/BusinessProfile.js` — Provenance core
- `apps/api/src/services/CandidatePipeline.js` — Quality boundary
- `apps/api/src/services/CanonicalBusinessProfileService.js` — Projection
- `apps/api/src/routes/leads.js` — Route consolidation target
- `apps/api/src/db/schema.js` — Persistence schema
- `apps/web/src/pages/Dashboard.tsx` — Frontend rebuild target
- `apps/web/src/pages/NewLead.tsx` — Frontend rebuild target
- `apps/web/src/pages/LeadDetail.tsx` — Frontend rebuild target
- `.planning/PROJECT.md` — Project definition
- `.planning/STATE.md` — Locked decisions
- `AUDIT-REPORT.md` — Source audit findings