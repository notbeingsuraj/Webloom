# Webloom 2.0 — Quality & Evaluation Plan

## 1. Quality Dimensions & Metrics

### 1.1 Business Identity Correctness (Primary)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Name Accuracy** | ≥ 95% | Manual verification against official website / government registry |
| **Category Accuracy** | ≥ 90% | Cross-reference with Google Maps categories + official website |
| **Phone Accuracy (E.164)** | ≥ 95% | Dial test / cross-reference with official website |
| **Website Accuracy** | ≥ 95% | HTTP 200 + domain matches business name |
| **Address Accuracy** | ≥ 90% | Google Maps geocode verification |
| **Coordinates Accuracy** | ≤ 100m error | Haversine distance vs authoritative pin |

### 1.2 Duplicate Business Resolution

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **False Positive Rate (different entities merged)** | < 2% | Manual review of `same_entity` resolutions |
| **False Negative Rate (same entity split)** | < 5% | Known duplicate pairs in eval set |
| **Resolution Latency** | < 500ms | `EntityResolution.calculateMatchScore` p95 |

### 1.3 Missing Field Handling

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Unknown Rate (per field)** | Documented, not minimized | `BusinessProfile.getQualityCompleteness()` output |
| **AI-Generated on Identity** | 0% | Scan `provenance=ai_generated` on identity fields |
| **Synthetic Identity Injection** | 0% | No `'Unknown Business'` / `'Unknown'` in any output |

### 1.4 Source Provenance

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Provenance Coverage** | 100% of non-null fields | Every `BusinessProfile.set()` call includes provenance |
| **Provenance Accuracy** | ≥ 95% | Manual audit: tier matches actual source |
| **AI Quarantine Violations** | 0 | `ai_generated` never on identity fields in canonical projection |

### 1.5 AI Hallucination Prevention

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Unsupported Claim Rate** | < 1% | Claims without `EvidenceModels.Evidence` backing |
| **Evidence Gate Rejection Rate** | Tracked | `CandidatePipeline` rejection: `evidence_required` |
| **Confidence Calibration** | Brier score < 0.15 | Compare AI confidence vs ground truth |

### 1.6 Extraction Reliability

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Website Extraction Success** | ≥ 80% | `OfficialWebsiteProvider.extract()` success rate |
| **Google Maps Extraction Success** | ≥ 85% | `BusinessDataExtractor` + `WebExtractionProvider` success |
| **Geoapify Success** | ≥ 90% | `GeoapifyProvider.search()` success rate |
| **Partial Result Rate** | Tracked | `providerTrace` status = `partial` |

### 1.7 Rate Limit & Provider Outage Handling

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Graceful Degradation Rate** | 100% | No 500 errors when provider returns 429/503 |
| **Fallback Activation Rate** | Tracked | `providerTrace` shows fallback chain activation |
| **Cost per Prospect** | ≤ $0.10 | Token usage × provider pricing |

### 1.8 Report Generation Quality

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **HTML Report Render Success** | ≥ 99% | Astro build exit code 0 |
| **PDF Generation Success** | ≥ 95% | Puppeteer exit code 0, file size > 50KB |
| **Evidence Citation Coverage** | 100% of claims | Every claim in report links to `sourceId` |

---

## 2. Evaluation Dataset

### 2.1 Dataset Composition

**50 Manually Verified Businesses** across:

| Vertical | Count | Characteristics |
|----------|-------|-----------------|
| Restaurant / Cafe | 8 | High review volume, menus, hours |
| Professional Services (Legal, Dental, Consulting) | 8 | B2B, appointment-based |
| Retail / Local Shop | 8 | Physical products, local SEO critical |
| Home Services (Plumbing, HVAC, Landscaping) | 8 | Service-area businesses |
| Health & Wellness (Gym, Spa, Chiropractic) | 8 | Membership, booking |
| Automotive (Repair, Dealership, Detail) | 5 | Multi-location potential |
| Specialty (Bakery, Florist, Pet Services) | 5 | Niche categories |

**Geographic Diversity:**
- US: 30 (CA, TX, NY, FL, IL, WA, CO, GA, NC, AZ)
- CA: 10 (ON, BC, QC, AB)
- UK: 5 (London, Manchester, Birmingham)
- AU: 5 (Sydney, Melbourne, Brisbane)

**Data Quality Spectrum:**
- 15: Full website + rich Google Maps profile
- 15: Basic website + minimal Google Maps
- 10: No website, Google Maps only
- 10: Ambiguous / multiple candidates (chain vs franchise)

### 2.2 Ground Truth Collection

For each business, manual verification of:

```
identity.name                    → Official website / government registry
identity.category                → Google Maps primary category + website content
contact.phone (E.164)            → Dial test + website footer
contact.website (domain)         → HTTP 200 + SSL cert CN match
location.full_address            → Google Maps geocode + website contact page
location.coordinates             → Google Maps pin (authoritative)
ratings.rating                   → Google Maps public rating
ratings.review_count             → Google Maps public count
business.services                → Website services/menu page
business.hours                   → Website hours + Google Maps hours
```

### 2.3 Evaluation Scripts

```bash
# Run evaluation
node apps/api/test_evaluation_dataset.js

# Output: JSON with per-field precision/recall/F1
```

**test_evaluation_dataset.js** responsibilities:
1. Load 50 ground truth records from `datasets/evaluation/ground_truth.json`
2. Run `BusinessResearchService.extractBusinessIntelligenceWithProviders()` for each
3. Compare canonical projection output vs ground truth
4. Compute per-field metrics
5. Output `evaluation_results_<timestamp>.json`

---

## 3. Test Coverage Requirements

### 3.1 Unit Tests (Existing — Must Pass)

| Test Suite | Current | Required |
|------------|---------|----------|
| `P1.2 Identity Integrity` | 41/41 | 41/41 |
| `P1.3 Canonical Business Profile` | 49/49 | 49/49 |
| `P1.4 Canonical API Boundary` | 15/15 | 15/15 |
| `P1.5 Consumer Migration` | 12/12 | 12/12 |
| `P1.8 Source-Grounded Fallback` | 40/40 | 40/40 |
| `P1.9 Google Reputation` | 36/36 | 36/36 |
| `Quality Boundary` | 39/39 | 39/39 |
| `AI Provider Chain` | 71/71 | 71/71 |
| `AI Provenance` | 6/6 | 6/6 |
| `AI Dataset Integrity` | 113/113 | 113/113 |
| `AI Foundation` | 38/38 | 38/38 |
| `AI Eval` | 17/17 | 17/17 |

### 3.2 New Integration Tests (MVP Requirement)

| Test | Description | File |
|------|-------------|------|
| **Full Pipeline E2E** | URL → canonical profile → brand DNA → audit → report | `test_full_pipeline_e2e.js` |
| **Bulk CSV Processing** | 50-row CSV → job → results | `test_bulk_csv.js` |
| **Report Generation** | Lead → HTML report → PDF | `test_report_generation.js` |
| **Auth Isolation** | Team A cannot access Team B leads | `test_auth_isolation.js` |
| **Timeout Recovery** | 5-min timeout → persisted lead recovery | `test_timeout_recovery.js` |
| **Degraded Audit** | AI failure → honest degraded output | `test_degraded_audit.js` |

### 3.3 Playwright E2E Tests (Frontend)

| Test | Page | Critical Path |
|------|------|---------------|
| **Dashboard Load** | `/` | Stats + lead list render < 1s |
| **New Prospect Submit** | `/leads/new` | Valid URL → progress → navigate to detail |
| **Lead Detail Tabs** | `/leads/:id` | All 4 tabs render, mutations work |
| **Report Generate** | `/leads/:id` | Click generate → PDF downloads |
| **CSV Upload** | `/leads/new` | Drag CSV → job status → results |

---

## 4. Continuous Evaluation Pipeline

### 4.1 Pre-Merge Checks (GitHub Actions)

```yaml
# .github/workflows/quality.yml
jobs:
  evaluation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test                    # All unit tests
      - run: npm run test:evaluation     # 50-business evaluation
      - run: npm run test:integration    # E2E integration tests
      - run: npx playwright test         # Frontend E2E
```

### 4.2 Evaluation Gates

| Gate | Threshold | Blocking |
|------|-----------|----------|
| **All Unit Tests Pass** | 100% | YES |
| **Name Accuracy** | ≥ 95% | YES |
| **Phone Accuracy** | ≥ 95% | YES |
| **AI Quarantine** | 0 violations | YES |
| **Synthetic Identity** | 0 occurrences | YES |
| **Duplicate Resolution FPR** | < 2% | YES |
| **Cost per Prospect** | ≤ $0.10 | WARNING |
| **Report PDF Success** | ≥ 95% | YES (P1) |

### 4.3 Monitoring Dashboard (Production)

| Metric | Alert Threshold |
|--------|-----------------|
| **Extraction Success Rate** | < 80% for 10 min |
| **AI Provider Error Rate** | > 10% for 5 min |
| **Median Latency (p50)** | > 60s |
| **Cost per Prospect (rolling 1h)** | > $0.15 |
| **Report Generation Failure** | > 5% for 1h |

---

## 5. Specific Test Cases for Critical Bugs (Regression)

### 5.1 P1.2 Name Resolution Bug

```javascript
// test_p12_name_resolution.js
// Geoapify returns flat { business: { name: "Joe's Bakery" } }
// WebExtraction returns dotted { identity: { name: "Joe's Bakery" } }
// calculateMatchScore MUST read both and score 1.0
```

### 5.2 Synthetic Identity Prevention

```javascript
// test_synthetic_identity.js
// _persistIdentity() called with record having NO real name
// Must return { status: 'insufficient_evidence' }
// Must NOT create entity with 'Unknown Business'
```

### 5.3 AI Overwrite Prevention

```javascript
// test_ai_quarantine.js
// BusinessProfile.set('identity.name', 'AI Guess', 'ai_generated', 0.8)
// Then set('identity.name', 'Real Name', 'discovered', 0.9)
// Final value MUST be 'Real Name' (discovered wins)
```

### 5.4 Degraded Audit Honesty

```javascript
// test_degraded_audit.js
// DigitalAuditService.generateDegradedAudit() with website
// Every category MUST have verified: false
// overallScore MUST be 0
// status MUST be 'degraded'
```

---

## 6. Evaluation Artifacts

### 6.1 Required Outputs

| Artifact | Location | Frequency |
|----------|----------|-----------|
| **Evaluation Results** | `evaluation_results_<timestamp>.json` | Per PR / daily |
| **Precision/Recall Table** | `docs/evaluation/metrics_<date>.md` | Weekly |
| **Cost Analysis** | `docs/evaluation/cost_<date>.md` | Weekly |
| **Regression Test Log** | `test-results/regression_<timestamp>.xml` | Per PR |

### 6.2 Evaluation Report Template

```markdown
# Evaluation Report — <DATE>

## Summary
- Businesses evaluated: 50
- Pipeline version: <git sha>
- AI provider chain: OpenRouter → Gemini → Local

## Field-Level Metrics
| Field | Precision | Recall | F1 | Samples |
|-------|-----------|--------|-----|---------|
| identity.name | 0.96 | 0.94 | 0.95 | 50 |
| contact.phone | 0.97 | 0.92 | 0.94 | 48 |
| contact.website | 0.98 | 0.89 | 0.93 | 45 |
| location.full_address | 0.91 | 0.88 | 0.89 | 50 |
| ratings.rating | 0.99 | 0.95 | 0.97 | 47 |

## Quality Gates
| Gate | Result | Threshold |
|------|--------|-----------|
| All Unit Tests | ✅ PASS | 100% |
| Name Accuracy | ✅ 96% | ≥ 95% |
| AI Quarantine | ✅ 0 violations | 0 |
| Synthetic Identity | ✅ 0 | 0 |

## Issues Found
- [ ] Issue 1: ...
- [ ] Issue 2: ...

## Recommendations
1. ...
2. ...
```

---

## 7. References

- `apps/api/test_evaluation_dataset.js` — Main evaluation runner (to be created)
- `datasets/evaluation/ground_truth.json` — 50 verified businesses (to be created)
- `apps/api/src/services/BusinessProfile.js` — `getQualityCompleteness()`, provenance
- `apps/api/src/services/CandidatePipeline.js` — Evidence gates
- `apps/api/src/services/EntityResolution.js` — `calculateMatchScore()`
- `apps/api/src/services/DigitalAuditService.js` — Degraded audit
- `apps/api/src/services/BusinessResearchService.js` — `_persistIdentity()`, `_enrichMissingWithAI()`