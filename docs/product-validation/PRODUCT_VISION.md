# Webloom 2.0 — Product Vision

## 1. Product Positioning Statement

**Webloom is a Prospect Intelligence & Sales Enablement Platform for boutique digital agencies that turns business prospects into verified digital intelligence and personalized sales opportunities in minutes.**

## 2. Target Customer Profile

**Primary: Boutique Digital Agencies (2–10 employees)**
- **Roles:** Founder/CEO, Sales Executive, Business Development Manager, Account Director
- **Services they sell:** Website development, Local SEO, Google Business Profile optimization, Reputation management, Digital marketing, Lead generation, Growth consulting
- **Pain points:** Manual prospect research (2–4 hrs/prospect), unverifiable data from scrapers, generic proposals that don't differentiate, no evidence to back claims on discovery calls
- **Current tools:** Semrush, BrightLocal, Local Falcon, AgencyAnalytics, Vendasta, manual Google Maps + website audits

**Secondary: Local SEO Specialists & Freelance Consultants**
- **Roles:** SEO Lead, Local Search Specialist, Independent Consultant
- **Pain points:** Disconnected audit + proposal tools, clients don't understand ROI, can't scale across multi-location clients

**Tertiary: Franchise/Multi-Location Marketing Teams**
- **Roles:** Marketing Director, Brand Manager, Field Marketing Lead
- **Pain points:** No centralized intelligence across 50+ locations, inconsistent audit quality, franchisee onboarding bottlenecks

### How Webloom Already Tracks This
- `apps/web/src/pages/Dashboard.tsx` — Lead list with status, opportunity score, category, location
- `apps/api/src/routes/leads.js` — Lead persistence with `businessName`, `businessCategory`, `opportunityScore`, `status`, `contact`, `location`, `createdAt`
- `leadService.getDashboardStats()` returns `totalLeads`, `highPriority`, `websitesGenerated`, `contacted`

## 3. Core Promise

**"Turn business prospects into verified digital intelligence and personalized sales opportunities in minutes."**

| Word | Meaning | Implementation |
|------|---------|----------------|
| **verified** | Every field cites its source with provenance tier | `BusinessProfile.set(provenance: 'verified' \| 'discovered' \| 'identified' \| 'user_provided' \| 'inferred' \| 'ai_generated')` — provenance hierarchy enforced in `apps/api/src/services/BusinessProfile.js` (tiers: user_provided=5 > verified=4 > discovered=3 > identified=2 > inferred=1 > ai_generated=0.5) |
| **digital intelligence** | Multi-source extraction with reconciliation | `BusinessResearchService.extractBusinessIntelligenceWithProviders()` pipeline: L1 deterministic hints → L2 Geoapify places → L3 WebExtraction (BusinessDataExtractor via r.jina.ai + CID) → L3.5 fallback → L3.8 OfficialWebsiteProvider |
| **personalized sales opportunities** | Strategic recommendations tied to evidence | `BrandStrategyService.generateBrandDNA()` → `strategicRecommendations`, `DigitalAuditService.auditDigitalPresence()` → `opportunityGap`, `OpportunityInsights` component synthesis |
| **in minutes** | End-to-end pipeline < 60s typical | `NewLead.tsx` progress steps: 30s reading → 8s identity → 15s gathering → 20s reconciling → 25s DNA → 30s scoring → 35s preparing (total ~131s worst case, typical 30-60s) |

## 4. Core Workflow (8 Steps)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEBLOOM 2.0 CORE WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: IMPORT PROSPECT
  Input: Google Maps URL / CSV / Website URL
  → NewLead.tsx handleSubmit() validates URL (validateGoogleMapsUrl)
  → leadService.createLead({ googleMapsUrl, forceRefresh: true, ...formData })
  → POST /api/leads → apps/api/src/routes/leads.js router.post('/')

STEP 2: IDENTIFY BUSINESS (Deterministic)
  → BusinessResearchService L1: extractDeterministicHints() (ProviderAdapter.js)
  → GoogleMapsUrlParserProvider.parse() → placeId, placeName, coordinates
  → Provenance: IDENTIFIED (tier 2) — URL itself is authoritative for name + coords

STEP 3: GATHER INFORMATION (Multi-Source)
  L2: GeoapifyProvider.search() → nearby places with categories, ratings, contacts
  L3: WebExtractionProvider → BusinessDataExtractor.extractFromGoogleMapsUrl()
      ├─ r.jina.ai proxy fetches Google Maps HTML
      ├─ CID page (maps.google.com/?cid=) → deterministic DOM extraction (phone, address, rating, hours)
      ├─ Direct Google Maps HTML fallback
      └─ AI extraction (provenance: AI_GENERATED) for unstructured fields
  L3.5: Fallback extraction from source text (P1.8 source-grounded)
  L3.8: OfficialWebsiteProvider.extract() → VERIFIED provenance for contact/location

STEP 4: VERIFY INFORMATION (Provenance + Resolution)
  → BusinessProfile.merge() with provenance tracking (apps/api/src/services/BusinessProfile.js)
  → EntityResolution.calculateMatchScore() — cross-provider matching (name, phone, website, coords)
  → CandidatePipeline validation — evidence gates, type checking, confidence calibration
  → ai_generated (0.5) can NEVER overwrite identified (2) / discovered (3) / verified (4) identity fields

STEP 5: DIGITAL PRESENCE AUDIT
  → DigitalAuditService.auditDigitalPresence(businessData) — AI analysis of website
  → Categories: design, mobile, navigation, conversion, trust, seo, localSeo, content, branding, performance, contactAccessibility
  → Degraded mode: if AI fails but website exists → generateDegradedAudit() (honest "not scored")
  → No website → generateNoWebsiteAudit() (deterministic zeros with actionable recommendations)

STEP 6: IDENTIFY OPPORTUNITIES
  → BrandStrategyService.generateBrandDNA() → strategicRecommendations (impact/effort/priority)
  → DigitalAuditService.audit.opportunityGap → competitivePosition, businessImpact
  → Synthesis: observedProblem + evidence + businessImplication + suggestedImprovement + priority

STEP 7: GENERATE REPORT
  → WebsiteGenerationService + GeneratedSiteManager repurposed for report generation
  → HTML template (Astro) → branded with agency logo/colors
  → PDF export via Puppeteer/Playwright
  → Sections: overview, verified intel, audit, opportunities, recommended services, next steps

STEP 8: SALES ASSETS
  → BrandStrategyService.generateBrandDNA() → positioning, personality, tone, CTA
  → SalesOutreachService (exists, minimal) → personalized outreach email
  → LeadWebsiteSpecService → DesignIntelligenceService → WebsiteGenerationService (simplified mockup)
  → Every claim references EvidenceModels Claim with sourceId
```

## 5. Commercial Validation Approach

### Paid Pilot Before Subscription (D-12)
- **Pilot offer:** $199 for 30 days, 50 analyses, 3 custom proposals co-built
- **Success criteria:** 1 paid conversion from 3 pilots, >50% time saved per prospect, positive client feedback
- **No fabricated testimonials** (D-13) — real pilot data only

### Pricing Hypotheses (D-11)
| Tier | Price | Analyses | Features |
|------|-------|----------|----------|
| Starter | $199/mo | 100 | Core intelligence, audit, HTML reports |
| Professional | $399/mo | 500 | + PDF export, white-label, opportunity scoring |
| Agency | $999/mo | Unlimited | + Team seats, API access, priority support |

### Validation Metrics
- **30 prospect profiles** for cold outreach (Google Maps URLs from target verticals)
- **Customer interview script** (15 questions in AUDIT-REPORT.md Section 5.2)
- **Value metrics:** hours saved/prospect, proposal win rate, client feedback score

## 6. Existing Foundation (What Already Works)

| Capability | Status | Evidence |
|------------|--------|----------|
| **Business extraction pipeline** | ✅ Production | `test_v2_generation.js` — 5/5 test businesses pass |
| **Provenance model** | ✅ Production | `BusinessProfile` 6-tier provenance, P1.2 quarantine tests pass (41/41) |
| **Entity resolution** | ✅ Production | `EntityResolution.calculateMatchScore` — cross-provider matching (name bug fixed in P1.2) |
| **Canonical projection** | ✅ Production | `CanonicalBusinessProfileService.fromEntityData()` unifies 4+ shapes |
| **Reputation extraction** | ✅ Production | `GoogleMapsReputationExtractor` — rating, review_count, reviews with provenance |
| **Digital audit** | ✅ Production | `DigitalAuditService` — 11 categories, degraded mode honesty |
| **Brand DNA** | ✅ Production | `BrandStrategyService` — audience, positioning, recommendations |
| **Website scaffold** | ✅ Production | `WebsiteGenerationService` + `GeneratedSiteManager` — Astro template copy, config, build |
| **Lead management** | ✅ Production | `leads.js` — CRUD, brand-dna refresh, website-spec, SQLite persistence |
| **Frontend flows** | ✅ Production | `NewLead.tsx` (submit, progress, timeout recovery), `LeadDetail.tsx` (4 tabs, mutations) |

---

## References

- `apps/api/src/services/BusinessResearchService.js` — Core pipeline `extractBusinessIntelligenceWithProviders()`
- `apps/api/src/services/BusinessProfile.js` — Provenance-tracked fact store
- `apps/api/src/services/CanonicalBusinessProfileService.js` — Unified projection layer
- `apps/api/src/services/DigitalAuditService.js` — Audit with degraded mode
- `apps/api/src/services/BrandStrategyService.js` — Strategic recommendations
- `apps/api/src/services/EntityResolution.js` — Cross-provider matching
- `apps/api/src/services/CandidatePipeline.js` — Quality boundary
- `apps/api/src/services/GoogleMapsReputationExtractor.js` — Reputation with provenance
- `apps/api/src/services/OfficialWebsiteProvider.js` — Verified contact/location
- `apps/api/src/services/WebsiteGenerationService.js` — Report/site generation
- `apps/api/src/services/GeneratedSiteManager.js` — Template, config, build, serve
- `apps/api/src/routes/business.js` — /analyze, /research endpoints
- `apps/api/src/routes/leads.js` — Lead CRUD, brand-dna, website-spec
- `apps/web/src/pages/Dashboard.tsx` — Lead list, stats
- `apps/web/src/pages/NewLead.tsx` — Import, progress, timeout handling
- `apps/web/src/pages/LeadDetail.tsx` — 4 tabs, mutations, preview
- `apps/web/src/services/leadService.ts` — Frontend API client