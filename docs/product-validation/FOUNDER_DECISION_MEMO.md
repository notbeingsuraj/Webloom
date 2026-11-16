# Founder Decision Memo — Webloom 2.0 MVP

**Date:** 2026-11-16  
**Decision Required:** Approve 14-day MVP build + validation experiment

---

## The Ask

**Approve 14 days of focused engineering** to package the existing evidence-based extraction pipeline as a commercial **Agency Prospect Intelligence Platform**, then run a **14-day paid pilot experiment** with boutique digital agencies.

**No code changes until you sign off.**

---

## What We Have (Audit Verdict: Technically Strong, Commercially Unproven)

| Asset | Status | Evidence |
|-------|--------|----------|
| **Multi-source extraction pipeline** | ✅ Production | Geoapify + CID DOM extraction + AI fallback + official website crawl |
| **Provenance tracking (6 tiers)** | ✅ Production | `BusinessProfile.set()` enforces hierarchy: user_provided > verified > discovered > identified > inferred > ai_generated |
| **Canonical identity resolution** | ✅ Production | `EntityResolution.calculateMatchScore()` cross-provider matching (P1.2 bug identified) |
| **Unified projection layer** | ✅ Production | `CanonicalBusinessProfileService.fromEntityData()` unifies 4+ data shapes |
| **Digital audit (11 categories)** | ✅ Production | Degraded mode honesty, no-website deterministic audit |
| **Brand DNA + recommendations** | ✅ Production | Positioning, personality, strategic recommendations |
| **Website spec + Astro template** | ✅ Production | `GeneratedSiteManager` builds, serves, deploys |
| **Lead management + persistence** | ✅ Production | SQLite, CRUD, refresh, website-spec endpoints |
| **Frontend flows** | ✅ Production | Dashboard, NewLead (progress, timeout recovery), LeadDetail (4 tabs) |

**Technical Score: 7/10** — Clean architecture, good tests, proper error handling.

**Business Score: 4/10** — No customer validation, AI website generator positioning in red ocean.

---

## The Pivot (Validated by Audit)

| From | To |
|------|-----|
| AI Website Generator from Google Maps URL | **Agency Prospect Intelligence & Sales Enablement Platform** |
| "We build websites in 30 seconds" | **"Turn prospects into verified audits + personalized proposals in 5 minutes"** |
| SMBs buying websites | **Boutique agencies (2-10) selling websites, SEO, GBP, reputation** |
| Commodity market (Durable, 10Web, Wix ADI) | **Blue ocean: evidence-backed prospecting** |

**Why this wins:** Agencies pay $200-2000/mo for prospecting tools. They waste 2-4 hrs/prospect on manual research. Webloom delivers verified intelligence with source citations they can show on discovery calls. Competitors hallucinate; Webloom evidences.

---

## MVP Scope (Locked — Features A-E Only)

| Feature | What It Does | Priority |
|---------|--------------|----------|
| **A. Prospect Intelligence** | Google Maps URL / CSV → verified identity, contact, location, reputation with provenance | P0 |
| **B. Digital Presence Audit** | 11-category audit (mobile, SEO, conversion, trust, performance...) with honest degraded mode | P0 |
| **C. Opportunity Identification** | Evidence-backed recommendations: missing website, weak metadata, no CTA, poor reputation... | P1 |
| **D. Agency-Ready Reports** | White-label HTML/PDF with branding, evidence citations, actionable next steps | P1 |
| **E. Personalized Sales Assets** | Outreach email, value prop, website improvements, single-page mockup — all grounded | P1 |

**Explicitly OUT OF SCOPE (Do Not Build):**
- Full CRM, HubSpot/Pipedrive integration, RBAC, website hosting, website builder, AI fine-tuning, autonomous outreach, marketplace, advanced analytics

---

## 14-Day Plan

### Week 1: Technical Foundation (P0)
- Fix name resolution bug (Geoapify `business.name` vs WebExtraction `identity.name`)
- Remove synthetic `'Unknown Business'` fallbacks
- Consolidate to single extraction entry point (`BusinessResearchService`)
- Fix AI overwrite timing (enrichment BEFORE persist)
- API key auth + team isolation
- **50-business evaluation dataset** (ground truth for precision/recall)

### Week 2: Product Completion (P1)
- Bulk CSV endpoint (50 rows → async job)
- White-label PDF report generator
- Frontend rebuild: Dashboard, NewProspect (URL+CSV), ProspectDetail (4 tabs), Reports
- Security: SSRF audit, prompt injection protection

### Week 3: Validation Experiment (14 Calendar Days)
| Days | Activity | Target |
|------|----------|--------|
| 1-2 | Source 50 agencies, send outreach | 15 replies |
| 3-4 | Book 10 discovery calls | 5 "strong interest" |
| 5-8 | Run calls, demo on their prospects | 3 pilots signed |
| 9-10 | Onboard pilots, deliver 50 analyses each | 3 custom proposals |
| 11-13 | Measure: time saved, proposal quality, feedback | >50% time saved |
| 14 | Ask for paid conversion ($199/mo) | **≥ 1 paid commitment** |

---

## Investment Required

| Resource | Week 1 | Week 2 | Week 3 |
|----------|--------|--------|--------|
| **Backend Engineer** | 1.0 FTE | 1.0 FTE | 0.5 FTE (pilot support) |
| **Frontend Engineer** | 0.2 FTE | 1.0 FTE | 0.2 FTE |
| **Founder** | 0.3 FTE | 0.5 FTE | **1.0 FTE** (calls, pilots, close) |

**Total: ~35 engineering days + 14 calendar days validation**

---

## Unit Economics (Validated by Audit)

| Tier | Price | Analyses/Mo | COGS | Margin |
|------|-------|-------------|------|--------|
| Starter | $99 | 100 | $36 | 64% |
| Growth | $199 | 500 | $80 | 60% |
| Agency | $399 | Unlimited | $227 | 43% |

**AI Cost:** ~$0.055/analysis (11k tokens @ $5/M blended)  
**Geoapify:** ~$0.05/analysis  
**Infrastructure:** ~$40/mo base

---

## Go/No-Go Gates

### Gate 1: End of Week 1 (Technical)
- [ ] P0 tasks complete, evaluation dataset: name accuracy ≥ 95%, AI quarantine 0 violations
- **If FAIL:** STOP, reassess data quality

### Gate 2: End of Week 2 (Product)
- [ ] P1 tasks complete, frontend functional, auth enforced
- **If FAIL:** Extend Week 2, do not launch validation

### Gate 3: Day 14 (Commercial)
- [ ] ≥ 3 discovery calls with qualified agencies
- [ ] ≥ 3 pilots signed, > 50% time saved measured
- [ ] **≥ 1 paid conversion ($199 pilot → $199/mo commitment)**
- **If FAIL:** STOP, document learnings, reassess ICP/value prop

---

## What I Need From You

**Explicit approval on these 5 points:**

1. **Pivot Accepted** — Webloom = Agency Prospect Intelligence (not AI website generator)
2. **ICP Locked** — Boutique agencies (2-10) selling websites, local SEO, GBP, reputation
3. **MVP Scope Locked** — Features A-E only, out-of-scope list respected
4. **Validation Experiment** — 14-day protocol executed as written, failure criteria binding
5. **Resource Commitment** — Engineering time allocated, Founder owns Week 3 validation

---

## Sign-Off

```
☐ APPROVED — Proceed with 14-day build + validation
☐ REVISE — Changes needed (specify below)
☐ REJECT — Do not proceed

Founder: _________________________  Date: ______________
```

---

## If Approved — Immediate Next Steps (Today)

1. **Backend:** Start P0.1 (name resolution fix) + P0.2 (synthetic identity removal)
2. **Founder:** Begin sourcing 50 agency prospects (LinkedIn, Apollo, directories)
3. **Both:** Review `IMPLEMENTATION_DECISION.md` for full task breakdown

---

**Bottom Line:** The pipeline works. The market exists. The differentiation is real. We need 14 days to package it commercially and 14 days to prove agencies will pay. If we can't get 1 paid pilot from 3 attempts, we stop.

**Your call.**