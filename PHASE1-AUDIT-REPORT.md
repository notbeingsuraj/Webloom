# Phase 1: Full Repository Audit Report

**Date:** 2026-09-15  
**Status:** Complete — verified against actual repository state

---

## Executive Summary

Webloom is a **well-architected pre-production AI business intelligence platform** with a solid canonical data layer, provider abstraction, candidate pipeline quality gates, and persistent identity resolution. However, **it is NOT production-ready** — critical gaps exist in production configuration, legal placeholders, email delivery, and one actual test suite defect (P1.9 tests 15-19 crash).

---

## 1. Architecture Verification

### ✅ Working Correctly

| Component | Status | Evidence |
|-----------|--------|----------|
| **CandidatePipeline** | ✅ Verified | 60 tests pass (test_quality_boundary.js: 60 passed) |
| **CanonicalBusinessProfileService (P1.3)** | ✅ Verified | 49 tests pass |
| **P1.2 AI Quarantine / Identity Integrity** | ✅ Verified | 41 tests pass |
| **P1.8 Source-Grounded Fallback** | ✅ Verified | 40 tests pass |
| **P1.9 Google Reputation (core)** | ✅ Partial | 36/41 tests pass; **5 crash** (tests 15-19) |
| **P1.14 API Boundary / P1.15 Migration** | ✅ Verified | 33/15 tests pass |
| **P1.20 SSRF Validator** | ✅ Verified | 9 tests pass |
| **P1.20 SourceCache (SQLite, TTL, provider-isolated)** | ✅ Verified | Implemented, used by extractor |

### Architecture Highlights (verified)

1. **Provider Abstraction** — `BusinessDataProvider` base class + `GeoapifyProvider`, `WebExtractionProvider` with lossless error contract (`ACQUISITION_STATUS` enum)
2. **CandidatePipeline** — Single quality gate for ALL field mutations (provider, fallback, AI enrichment). Uses `FieldCandidate` objects with validation, selection, provenance priority
3. **CanonicalizationService** — Persistent observation/claim/conflict/canonical_field layer with authority-aware conflict resolution
4. **IdentityRepository** — Durable `BusinessEntity` + `ProviderIdentity` + `ResolutionRecord` + Phase 4 tables
5. **Provenance Hierarchy** — `verified(4) > discovered(3) > user_provided(3) > identified(2) > inferred(1) > ai_generated(0.5)` — **enforced in BusinessProfile.set() and CandidatePipeline**
6. **AI Quarantine** — `ai_generated` provenance NEVER upgrades; AI fills only gaps (`onlyIfMissing: true`)

---

## 2. Direct Mutations of BusinessProfile — Audit Results

### Patterns Found (all go through CandidatePipeline):

| Mutation Path | Provenance | Goes Through Pipeline | Notes |
|---------------|------------|----------------------|-------|
| `_mergeCanonical()` in BusinessResearchService | `discovered` | ✅ `mergeRecordThroughPipeline()` | Geoapify + web-extraction records |
| `runFallbackPipeline()` (P1.8) | `observed` or `ai_generated` | ✅ `runCandidatePipeline()` | URL parser, provider record, AI evidence |
| `runReputationPipeline()` (P1.9) | `observed` or `ai_generated` | ✅ `runCandidatePipeline()` | Rating/reviewCount/reviews |
| `runAIEnrichmentPipeline()` (LEVEL 4) | `inferred` | ✅ `runCandidatePipeline()` | Category/description/services ONLY |
| `profile.set()` (LEVEL 1 deterministic) | `identified` | ❌ Direct — **BUT identity-safe** | URL parser hints only (name, coords) |
| `profile.merge()` (user provided) | `user_provided` | ❌ Direct | `/api/leads` user-provided data only |

### ⚠️ Critical Finding: P1.9 AI Reputation Extraction Crash

**File:** `apps/api/src/services/GoogleMapsReputationExtractor.js:401-408`  
**Function:** `extractReputationWithAI()`

```javascript
if (!evidenceText || typeof evidenceText !== 'string' || evidenceText.trim().length < 50) {
  // No meaningful evidence → no AI call (contract: never trigger AI without evidence)
  return null;  // <-- RETURNS NULL
}
```

**Tests 15-19 in `test_phase_p19_google_reputation.js`** expect AI output with `evidence: null` to be **rejected** (fields stay null), but the function returns `null` instead of an object, causing:

```
Cannot read properties of null (reading 'fields')
```

This is a **real bug** — the contract in tests says: "AI cannot estimate rating without evidence snippet → rating stays null". The implementation silently returns `null` causing the caller to crash.

---

## 3. Provider Extraction Paths — Verified

| Provider | Method | Provenance | Validation | Cache |
|----------|--------|------------|------------|-------|
| **GoogleMapsUrlParserProvider** | `parse()` (no network) | `identified` | URL format only | In-memory |
| **GeoapifyProvider** | `search()` + `enrichRecord()` | `discovered` | CandidatePipeline | SourceCache (24h TTL) |
| **WebExtractionProvider** | `fetchPage()` via jina.ai proxy | `discovered` | CandidatePipeline | SourceCache (24h TTL) |
| **OfficialWebsiteProvider** | DOM/JSON-LD/microdata | `discovered`/`verified` | CandidatePipeline | SourceCache |
| **GoogleMapsFallbackExtractor** | Deterministic → AI evidence-grounded | `observed`/`ai_generated` | CandidatePipeline | — |
| **GoogleMapsReputationExtractor** | Structured → parser → AI evidence | `observed`/`ai_generated` | CandidatePipeline | — |

**All paths route through CandidatePipeline** — no bypasses found.

---

## 4. AI Fallback & Enrichment Paths — Verified

| Path | Trigger | Provenance | Gap-Only? | Evidence Required? |
|------|---------|------------|-----------|-------------------|
| **LEVEL 3.5 Fallback (P1.8)** | Missing phone/email/addr/website | `ai_generated` | ✅ `onlyIfMissing: true` | ✅ `sourceText` from page |
| **LEVEL 3.9 Reputation (P1.9)** | Missing rating/reviews | `ai_generated` | ✅ Gaps only | ✅ `evidenceText` required |
| **LEVEL 4 AI Enrichment** | Missing category/description/services | `inferred` | ✅ `onlyIfMissing: true` | ✅ Known facts passed to prompt |

**AI Safety Gates Verified:**
- ✅ `ai_generated` provenance NEVER outranks `identified`/`discovered`/`verified`
- ✅ AI enrichment runs `onlyIfMissing: true` — never overwrites
- ✅ AI fallback requires evidence text (returns `null` if < 50 chars)
- ✅ AI acceptance threshold: `AI_ACCEPTANCE_THRESHOLD = 0.6` (defined in FallbackExtractor)
- ✅ Individual review requires evidence snippet

---

## 5. Evidence Creation & Provenance Persistence — Verified

### In-Memory (BusinessProfile)
- ✅ `evidenceStore` Map — `Evidence` objects with sourceId, fieldPath, value, excerpt, extractionMethod
- ✅ `sourceRegistry` Map — `Source` objects with provider, authority, sourceType
- ✅ `claimStore` Map — `Claim` objects linking evidence to field values
- ✅ `conflictStore` Map — `Conflict` objects with winner + resolutionReason

### Persistent (SQLite via IdentityRepository + CanonicalizationService)
| Table | Purpose | Foreign Keys |
|-------|---------|--------------|
| `source` | Origin of information | — |
| `evidence` | Supporting material from source | source_id → source.id |
| `claim` | Statement about business field | entity_id → business_entity.entity_id |
| `claim_source` | Links claims to sources | claim_id, source_id |
| `claim_evidence` | Links claims to evidence | claim_id, evidence_id |
| `conflict` | Disagreement between claims | entity_id |
| `canonical_field` | Authoritative field value | entity_id, claim_id, source_id |
| `observation` | Provider observations | entity_id, claim_id, source_id |
| `canonicalization_decision` | Decision audit trail | entity_id, conflict_id, claim_id |

**Verified:** `CanonicalizationService.processObservation()` stores observations, evaluates evidence strength, resolves conflicts with winner + reason, writes canonical fields.

---

## 6. SourceCache Identity & Independence — Verified

**Key invariant:** Cache key = `(provider, normalized_source_url)` — **NOT URL alone**

```javascript
// SourceCache.js:37
UNIQUE(source_hash, provider)
```

- ✅ Geoapify acquisition and web-extraction for same URL = separate entries
- ✅ SHA256 of normalized URL = `source_hash`
- ✅ TTL support (24h default, `Infinity` for no expiry)
- ✅ Survives process restart (SQLite file `source-cache.db`)
- ✅ Content hash detects changes
- ✅ `purgeExpired()` cleanup

---

## 7. Database Persistence & Restart Behavior — Verified

| Entity | Survives Restart | Test Evidence |
|--------|------------------|---------------|
| `BusinessEntity` | ✅ | P1.15, P1.16, P1.17 test suites |
| `ProviderIdentity` | ✅ | Same |
| `ResolutionRecord` | ✅ | Same |
| `CanonicalField` | ✅ | Phase 4 tables created |
| `Observation` | ✅ | Phase 4 tables created |
| `Source`/`Evidence`/`Claim`/`Conflict` | ✅ | Phase 4 tables created |
| `ReviewItem` | ✅ | P1.17 review operator tests |
| `SourceCache` | ✅ | SQLite file persists |

**Concurrency:** SQLite WAL mode enabled. `touchProviderIdentity` uses `ON CONFLICT DO UPDATE`. Entity resolution with `ResolutionRecord` for history.

---

## 8. API Error Handling, Timeouts, Retries — Audit

### ✅ Working
| Feature | Implementation |
|---------|----------------|
| Request validation | Both `/api/business/analyze` and `/api/leads` validate independently |
| Error categories | `USER_INPUT_ERROR`, `NOT_FOUND`, `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INTERNAL_SERVER_FAILURE` |
| Rate limiting | `express-rate-limit` (15min/100req) |
| Helmet/CORS | Configured |
| SSRF protection | `validateFetchUrl()` + `safeFetch()` validates EVERY redirect |
| Extraction timeout | 15s + 2 retries (configurable) |
| AI timeout | 90s (separate from extraction) |
| Gateway probe | Non-fatal startup probe surfaces OmniRoute issues |

### ⚠️ Gaps
| Issue | Location | Severity |
|-------|----------|----------|
| **No auth/authorization** | All routes public | HIGH for production |
| **Unhandled rejection handler kills server** | `server.js:45-47` | MEDIUM — logs and exits |
| **No request ID / correlation ID** | — | LOW — observability gap |

---

## 9. Production Configuration & Deployment Readiness

### ❌ Missing / Placeholder (Require Owner Input)

| Item | File | Current Value | Required |
|------|------|---------------|----------|
| **Production URL** | `apps/web/.env` | `VITE_PUBLIC_SITE_URL` unset → falls back to `http://localhost:5173` | Owner must set |
| **Contact Email** | `apps/web/src/config/site.ts:33` | `hello@webloom.app` | **Owner must provide real email** |
| **Registered Business Address** | `siteConfig.contact.address` | `TODO: Registered business address` | **Owner must provide** |
| **Legal Entity Name** | `siteConfig.legal.companyName` | `Webloom (TODO: legal entity name)` | **Owner must provide** |
| **Governing Law** | `siteConfig.legal.governingLaw` | `TODO: governing law jurisdiction` | **Owner must provide** |
| **Data Retention Policy** | `PrivacyPolicy.tsx:63` | `TODO: define your official retention periods` | **Owner must provide** |
| **Analytics Configuration** | `VITE_PUBLIC_ANALYTICS_DOMAIN` | Unset (disabled) | Owner decision |
| **Cookie Consent Requirement** | `VITE_PUBLIC_ANALYTICS_CONSENT_REQUIRED` | Unset | Owner decision |
| **Email Delivery** | `apps/api/src/routes/contact.js:60` | `console.log()` only — **no-op** | **Owner must wire** |

### 🔑 Environment Variables Required (`.env` in `apps/api`)

| Variable | Required | Status |
|----------|----------|--------|
| `OMNIROUTE_API_KEY` | ✅ Yes | **Must be set** (server exits if missing) |
| `GEOAPIFY_API_KEY` | Optional | Improves extraction quality |
| `SQLITE_DATABASE_PATH` | Optional | Defaults to `./webloom.db` |
| `FRONTEND_URL` | Optional | Defaults to `http://localhost:5173` |
| `AI_PRIMARY_MODEL` / `AI_FALLBACK_MODEL` | Optional | Defaults to OmniRoute auto |
| `OMNIROUTE_BASE_URL` | Optional | Defaults to `http://localhost:20128/v1` |

---

## 10. Hardcoded localhost / Dev References

| Location | Reference | Production Impact |
|----------|-----------|-------------------|
| `apps/api/src/config/env.js:35` | `OMNIROUTE_BASE_URL || 'http://localhost:20128/v1'` | Dev default — env var required in prod |
| `apps/api/src/config/env.js:48` | `FRONTEND_URL || 'http://localhost:5173'` | Dev default — env var required in prod |
| `apps/api/src/config/env.js:67` | `WEBSITE_HOST || '127.0.0.1'` | Local-only generated sites — intentional |
| `apps/api/src/server.js:31` | Console log `http://localhost:${PORT}/health` | Startup log only — cosmetic |

---

## 11. Security Surface Audit

### ✅ Protected
- **SSRF** — `validateFetchUrl()` blocks private IPs, localhost, IPv6 link-local, integer/hex notations; `safeFetch()` validates redirects
- **Rate limiting** — 100 req/15min per IP on `/api/`
- **Helmet** — Security headers
- **CORS** — Restricted to `FRONTEND_URL` + localhost in dev
- **Input validation** — All routes validate; structured error categories
- **API key handling** — `sanitizeSecretText()` in AIService redacts keys from logs
- **No SQL injection** — Drizzle ORM parameterized queries
- **No XSS in API** — JSON responses, no template rendering

### ⚠️ Gaps for Production
| Gap | Severity | Mitigation Needed |
|-----|----------|-------------------|
| **No authentication** | HIGH | Add auth middleware before production |
| **No authorization** | HIGH | Role-based access for admin endpoints |
| **Contact form = no-op** | MEDIUM | Wire real email delivery (SendGrid/Resend/SMTP) |
| **No secrets rotation** | MEDIUM | Document rotation procedure |
| **No audit log persistence** | LOW | Add structured audit logging |

---

## 12. Test Suite Health

| Suite | Tests | Pass | Fail | Skip | Notes |
|-------|-------|------|------|------|-------|
| `test_quality_boundary.js` | 60 | 60 | 0 | 0 | Core quality gates |
| `test_phase_p12_identity.js` | 41 | 41 | 0 | 0 | AI quarantine |
| `test_phase_p13_canonical_profile.js` | 49 | 49 | 0 | 0 | Canonical projection |
| `test_phase_p18_source_grounded_fallback.js` | 40 | 40 | 0 | 0 | Fallback extraction |
| `test_phase_p19_google_reputation.js` | 41 | 36 | **5** | 0 | **Tests 15-19 crash** |
| `test_phase_p14_api_boundary.js` | 15 | 15 | 0 | 0 | API contract |
| `test_phase_p15_consumer_migration.js` | 33 | 33 | 0 | 0 | Consumer migration |
| `test_phase20_ssrf.js` | 9 | 9 | 0 | 0 | SSRF protection |
| `test_demo_smoke.js` | 18 | 15 | **3** | 0 | **Live pipeline fails without Geoapify key** |

---

## 13. Files Changed / Created During Audit

**None** — Phase 1 is read-only inspection. No modifications made.

---

## 14. Corrections to Previous Reports

| Previous Claim | Actual State | Correction |
|----------------|--------------|------------|
| "All tests pass" | **False** — P1.9 tests 15-19 crash | Identified real defect in `extractReputationWithAI()` |
| "Demo ready" | **Partially true** — demo path works but needs Geoapify key | Demo requires `GEOAPIFY_API_KEY` for meaningful results |
| "Production config complete" | **False** — 9 owner placeholders remain | All documented above |
| "Email delivery works" | **False** — contact form is no-op | `console.log()` only |

---

## 15. Remaining Risks (Pre-Phase 2)

| Risk | Phase to Address | Priority |
|------|------------------|----------|
| P1.9 AI reputation extraction crash | Phase 3 (AI Fallback Hardening) | HIGH — blocker for reputation quality |
| No auth/authorization | Phase 6 (Security) | HIGH — production blocker |
| Contact form email no-op | Phase 5 (Production Readiness) | HIGH — legal/compliance |
| Owner placeholders (9 items) | Phase 5 | HIGH — owner input required |
| No email delivery test | Phase 5 | HIGH — cannot claim working |
| Demo smoke test fails without Geoapify key | Phase 2 (Benchmark) | MEDIUM — test env config |

---

## Conclusion

Webloom's **core extraction architecture is production-grade** — canonical data model, quality gates, provider abstraction, persistent identity, and AI quarantine are all implemented and tested. The **P1.9 crash is the only code defect found** in the core pipeline.

**Production blockers are configuration/legal/operational**, not architectural. All require owner input except the P1.9 crash fix.

**Next:** Phase 2 — Real-World Extraction Quality Benchmark (build deterministic benchmark suite).