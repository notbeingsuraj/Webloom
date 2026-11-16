# Webloom 2.0 — Customer Validation Plan

## 1. Validation Strategy Overview

**Objective:** Prove commercial viability before building subscription billing infrastructure.

**Approach:** 14-day paid pilot experiment with boutique digital agencies.

**Success Criteria:**
- ≥ 3 discovery calls with qualified agency decision-makers
- ≥ 1 paid pilot commitment ($199 for 30 days)
- > 50% time saved per prospect (measured)
- Positive qualitative feedback on report quality & credibility

**Failure Criteria (Stop & Reassess):**
- < 3 discovery calls in 14 days
- 0 paid commitments after 3 pilot deliveries
- Core P0 fixes reveal fundamental data quality issues

---

## 2. Target Customer Profile (ICP)

### Primary: Boutique Digital Agencies (2–10 employees)

| Attribute | Detail |
|-----------|--------|
| **Role** | Founder/CEO, Sales Executive, Business Development Manager |
| **Services Sold** | Website development, Local SEO, GBP optimization, Reputation management, Digital marketing, Lead generation |
| **Current Workflow** | Manual Google Maps search → copy-paste into proposal → guess at audit (2-4 hrs/prospect) |
| **Pain Points** | Unverifiable data from scrapers, generic proposals, no evidence for discovery calls, losing deals to better-prepared competitors |
| **Tools Used** | Semrush, BrightLocal, Local Falcon, AgencyAnalytics, Vendasta, manual audits |
| **Budget** | $200-2000/mo for prospecting/sales tools |
| **Buying Trigger** | Losing deals, hiring sales person, new vertical expansion |

### Secondary: Local SEO Specialists & Freelance Consultants

| Attribute | Detail |
|-----------|--------|
| **Role** | SEO Lead, Local Search Specialist, Independent Consultant |
| **Pain Points** | Disconnected audit + proposal tools, clients don't understand ROI, can't scale across multi-location clients |

### Tertiary: Franchise/Multi-Location Marketing Teams

| Attribute | Detail |
|-----------|--------|
| **Role** | Marketing Director, Brand Manager, Field Marketing Lead |
| **Pain Points** | No centralized intelligence across 50+ locations, inconsistent audit quality, franchisee onboarding bottlenecks |

---

## 3. 14-Day Validation Experiment

### Day 1-2: Prospect Sourcing (Target: 50 Agencies)

**Sources:**
1. **LinkedIn Sales Navigator** — Search: "digital agency" + "founder" + "2-10 employees" + location (US/CA/UK/AU)
2. **Apollo.io / Clay** — Filter: industry=marketing/advertising, headcount=2-10, technologies=WordPress/HubSpot/Semrush
3. **Agency Directories** — Clutch.co, AgencySpotter, DesignRush, Sortlist
4. **Communities** — Agency Facebook groups, Slack (Agency Owners, Digital Agency Network), Reddit r/agency, r/seo
5. **Cold Email Databases** — Hunter.io, Snov.io for verified emails

**Qualification Criteria:**
- [ ] 2-10 employees (LinkedIn headcount)
- [ ] Sells website dev / local SEO / GBP / reputation management
- [ ] Founder/Sales/BD role (decision authority)
- [ ] Active outreach (mentions "prospecting", "pitches", "discovery calls" in profile/posts)
- [ ] Not enterprise (no Vendasta/white-label mention)

**Output:** `validation/prospects_<date>.csv` with: name, role, company, email, LinkedIn, employee_count, services, notes

### Day 3-4: Cold Outreach (Target: 15 Replies)

**Channel Mix:**
- 60% LinkedIn connection + DM (higher response)
- 30% Cold email (scale)
- 10% Twitter/X DM (if active)

**Message Template (LinkedIn):**
```
Hi {first_name},

Saw you're running {company_name} — respect the hustle building an agency at {employee_count} people.

I built a tool that turns a Google Maps URL into a verified digital audit + personalized website mockup in 5 minutes. Agencies use it to walk into discovery calls with evidence-backed insights instead of generic pitches.

No AI hallucination — every field cites its source (Google Maps, official website, Geoapify).

15-min demo this week? Happy to run it on one of your actual prospects.
```

**Message Template (Email):**
```
Subject: {first_name} — verified prospect audits in 5 min

Hi {first_name},

Most agencies spend 2-4 hours researching a prospect before a discovery call — manually checking Google Maps, their website, reviews, then building a pitch deck from scratch.

Webloom does this in 5 minutes from a Google Maps URL:
- Verified business identity (name, category, contact, location) with source citations
- 11-category digital audit (mobile, SEO, conversion, trust, performance)
- Strategic recommendations tied to evidence
- Personalized website mockup for the proposal

Agencies using it report 60%+ time saved per prospect and higher close rates because they show up with evidence, not guesses.

Worth a 15-min demo on one of your current prospects?

Best,
Suraj
Webloom — Prospect Intelligence for Agencies
webloom.dev
```

**Tracking:** `validation/outreach_log_<date>.csv` — date, channel, prospect, sent, replied, call_booked, notes

### Day 5-8: Discovery Calls (Target: 10 Calls, 5 "Strong Interest")

**Call Structure (30 min):**

| Time | Segment | Questions |
|------|---------|-----------|
| 0-5 | Context | "Walk me through the last time you pitched a local business — what tools did you use?" |
| 5-10 | Pain | "How do you verify business info in proposals?" / "Ever lost a deal due to wrong data?" |
| 10-20 | Demo | Live: paste their prospect's Google Maps URL → show full output |
| 20-25 | Value | "How much would 3 hrs saved/prospect be worth monthly?" / "What would make you NOT trust an automated audit?" |
| 25-30 | Close | Pilot offer: "Free 30 days, 50 audits, we build 3 proposals together" |

**Interview Questions (from Audit Report Section 5.2):**
1. "Walk me through the last time you pitched a local business client — what tools did you use?"
2. "How do you verify the business information you include in proposals?"
3. "What's the most time-consuming part of creating a prospect audit?"
4. "Have you ever lost a deal because your audit/data was wrong? What happened?"
5. "How do you currently show 'before/after' digital presence to clients?"
6. "What would make you switch from your current prospecting tool?"
7. "How much would you pay for a tool that gives you a verified audit + website mockup in 5 minutes?"
8. "Who on your team would use this? How often?"
9. "What integrations would make this indispensable? (CRM, proposal software, project mgmt)"
10. "What's your current cost per qualified lead?"
11. "How do you handle multi-location clients today?"
12. "What's the biggest complaint clients have about your proposals?"
13. "If this tool saved you 3 hours per prospect, what would that be worth monthly?"
14. "What would make you NOT trust an automated audit?"
15. "Describe your ideal workflow from 'new lead' to 'signed contract'."

**Recording:** Audio (Otter.ai) + notes in `validation/calls/<prospect>_<date>.md`

**Scoring:**
- **Strong Interest:** "Would pay $199/mo", "When can I start?", "This solves [specific pain]"
- **Moderate Interest:** "Interesting", "Maybe later", "Need to discuss with partner"
- **Low Interest:** "Not our workflow", "Too expensive", "Happy with current tools"

### Day 9-10: Pilot Offer & Onboarding (Target: 3 Pilots Signed)

**Pilot Offer:**
```
Webloom Pilot — 30 Days Free
- 50 prospect analyses/month
- We co-build 3 custom proposals for your active prospects
- White-labeled HTML reports with your logo/colors
- Direct Slack access to founding team
- No credit card required

After 30 days: $199/mo for 100 analyses, cancel anytime.
```

**Onboarding Checklist:**
- [ ] Create team + API key in Webloom
- [ ] Share 5-10 prospect Google Maps URLs
- [ ] Schedule 30-min kickoff call
- [ ] Set success metrics: time saved, proposal quality, client feedback
- [ ] Schedule mid-pilot check-in (Day 20)

**Contract:** Simple email agreement (no legalese) — `validation/pilot_agreements/<company>_<date>.md`

### Day 11-13: Pilot Delivery & Measurement

**Deliverables per Pilot:**
1. **50 analyses** — CSV upload or individual URLs
2. **3 Custom Proposals** — We generate reports, they customize messaging
3. **Weekly Check-in** — 15 min: "What worked? What didn't? What's missing?"

**Measurement:**
| Metric | Target | Method |
|--------|--------|--------|
| Time saved/prospect | > 50% | Self-reported vs previous workflow |
| Proposal quality | Positive | Client feedback / internal rating |
| Report credibility | "Trustworthy" | "Evidence citations make this credible" |
| Feature gaps | Documented | "Missing: CRM export, team comments" |
| Willingness to pay | "Yes, $199/mo" | Direct ask at check-in |

**Tracking:** `validation/pilot_metrics_<company>.csv`

### Day 14: Paid Conversion Ask

**Conversion Script:**
```
"Based on the pilot, you've analyzed {N} prospects, saved ~{hours} hours, and {client_feedback}. 

The Starter plan is $199/mo for 100 analyses with PDF export and white-label reports. 

Ready to continue? I'll send a Stripe link — cancel anytime, no annual commitment."
```

**Outcomes:**
- **Paid Conversion** → Proceed to P1 build
- **"Would Pay" (3+)** → Proceed with clear feature requests
- **No Conversion** → Stop, reassess ICP/value prop

---

## 4. Sample Prospect Reports (Pre-Pilot)

**Create 3 polished reports for demo calls:**

| Business Type | Location | Key Findings |
|---------------|----------|--------------|
| Artisan Bakery | San Francisco, CA | No website, 4.2★ 127 reviews, missing GBP optimization, strong reputation |
| Family Dental | Austin, TX | Outdated website (not mobile), 3.8★ 45 reviews, weak local SEO, no booking |
| HVAC Contractor | Denver, CO | No website, 4.5★ 89 reviews, service-area business, missing contact CTAs |

**Report Generation:**
```bash
# For each sample business
node scripts/generate_sample_report.js --url "https://maps.google.com/place/..." --output "validation/sample_reports/"
```

**Report Checklist:**
- [ ] Business overview with canonical identity
- [ ] Verified information table (provenance badges)
- [ ] Digital audit (11 categories, honest scoring)
- [ ] Evidence-backed findings (source citations)
- [ ] Improvement opportunities (priority matrix)
- [ ] Recommended services mapped to agency offerings
- [ ] Suggested next steps (outreach sequence)
- [ ] Agency branding (logo, colors)
- [ ] PDF export working

---

## 5. Landing Page Value Proposition

**Hero:**
> **Turn Google Maps URLs into verified prospect audits & personalized proposals in 5 minutes.**
> 
> The only prospecting tool that cites its sources. Every field — name, phone, rating, address — traces back to Google Maps, the official website, or Geoapify. No AI hallucination. Evidence you can show on a discovery call.

**Sub-hero:**
> Agencies waste 2-4 hours/prospect on manual research. Webloom delivers a complete digital audit, opportunity score, and website mockup before your coffee gets cold.

**Proof Points:**
- ✅ **Verified Intelligence** — 6-tier provenance (user_provided > verified > discovered > identified > inferred > ai_generated)
- ✅ **11-Category Audit** — Mobile, SEO, Conversion, Trust, Performance, Local SEO, Content, Branding, Navigation, Design, Contact Accessibility
- ✅ **Personalized Assets** — Outreach email, value proposition, website concept, all grounded in evidence
- ✅ **Agency-Ready Reports** — White-label HTML/PDF with your branding

**CTA:** "Analyze Your First Prospect Free" → `/leads/new`

**Social Proof (Post-Pilot):**
- "[Agency Name] saves 3 hrs/prospect and closed 2 deals from pilot reports"
- "Finally, an audit I can put my name on — every claim has a source"

---

## 6. Outreach Message Library

### LinkedIn Connection Request
```
Hi {first_name}, building {company_name} at {size} people is no joke. Connecting to share something that saves agencies 3+ hrs/prospect on research. No pitch — just a demo if relevant.
```

### Follow-up (No Reply, Day 3)
```
{first_name} — circling back. Happy to run it on one of your current prospects so you see the output on real data. 15 min?
```

### Follow-up (No Reply, Day 7)
```
Last note — if prospect research isn't a pain point right now, no worries. Here if that changes.
```

### Post-Demo Email
```
{first_name},

Great talking today. As promised, here's the report for [Prospect Business] we generated live: [link]

Key things to notice:
- Every field has a provenance badge (Google Maps / Official Website / Geoapify)
- Audit scores 11 categories with methodology notes
- Website mockup uses their actual photos, reviews, services

Pilot offer: 30 days free, 50 analyses, we build 3 proposals together. Interested?

[Calendly link for pilot kickoff]
```

---

## 7. Customer Interview Script (Structured)

**Pre-Call:** Review their website, services, recent case studies.

**Opening (2 min):**
> "Thanks for the time. I'm building Webloom — a prospect intelligence tool for agencies. This isn't a sales call; I'm trying to understand your workflow deeply so we build the right thing. Everything you share stays confidential."

**Workflow Questions (10 min):**
1. "Walk me through the last prospect you pitched — from 'found them' to 'sent proposal'."
2. "What tools did you use at each step?"
3. "Where did you spend the most time?"
4. "What information was hardest to get?"

**Pain & Value (10 min):**
5. "How do you verify business info? Ever included wrong data in a proposal?"
6. "What's your current cost per qualified lead (time + tools)?"
7. "If you had a verified audit + website mockup in 5 min, what would that be worth?"
8. "What would make you NOT trust an automated audit?"

**Tool Evaluation (5 min):**
9. "What do you use today? (Semrush, BrightLocal, manual, etc.)"
10. "What's missing from your current stack?"
11. "What integrations are non-negotiable?"

**Closing (3 min):**
12. "Describe your ideal 'new lead to signed contract' workflow."
13. "Who else on your team would use this?"
14. "If we built exactly what you described, what's the decision process?"
15. "Anything I should have asked but didn't?"

**Post-Call:** Write up in `validation/calls/<company>_<date>.md` within 1 hour.

---

## 8. Success Metrics Dashboard

**Track in `validation/metrics_dashboard_<date>.md`:**

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Prospects sourced | 50 | | ⬜ |
| Outreach sent | 50 | | ⬜ |
| Reply rate | 30% (15) | | ⬜ |
| Discovery calls booked | 10 | | ⬜ |
| Strong interest | 5 | | ⬜ |
| Pilots signed | 3 | | ⬜ |
| Pilot analyses delivered | 150 (3×50) | | ⬜ |
| Time saved/prospect | > 50% | | ⬜ |
| Paid conversions | ≥ 1 | | ⬜ |
| Feature requests documented | 10+ | | ⬜ |

---

## 9. Go/No-Go Decision Framework

### PROCEED (Green) — All of:
- [ ] ≥ 1 paid pilot conversion
- [ ] ≥ 3 "would pay $199/mo" from discovery calls
- [ ] > 50% time saved measured in pilot
- [ ] No fundamental data quality blockers
- [ ] Clear feature requests for P1 (not pivot signals)

### ITERATE (Yellow) — Any of:
- [ ] 0 paid but ≥ 3 "would pay" + clear feature gaps
- [ ] Time saved < 50% but qualitative feedback strong
- [ ] Data quality issues identified but fixable in 2 weeks
- [ ] ICP needs refinement (different segment responding)

### STOP (Red) — Any of:
- [ ] < 3 discovery calls in 14 days
- [ ] 0 paid + 0 "would pay" after 3 pilots
- [ ] Core P0 fixes reveal fundamental data quality issues
- [ ] Founder unwilling to pivot from "AI website generator" positioning

---

## 10. References

- `WEBLOOM_AUDIT_REPORT.md` Section 5 — Customer Validation Strategy
- `docs/product-validation/PRODUCT_VISION.md` — Positioning & pricing
- `docs/product-validation/MVP_SCOPE.md` — Feature definitions
- `validation/` — All experiment artifacts (to be created)
- `scripts/generate_sample_report.js` — Sample report generator (to be created)