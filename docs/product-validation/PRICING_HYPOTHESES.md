# Webloom 2.0 — Pricing Hypotheses

## 1. Pricing Model Comparison

| Model | Pros | Cons | Fit for Webloom |
|-------|------|------|-----------------|
| **Tiered Subscription (Monthly)** | Predictable revenue, low friction, standard for SaaS | Churn risk, value ceiling | ✅ PRIMARY — Agencies budget monthly |
| **Pay-per-Analysis** | Aligns cost with usage, low barrier | Unpredictable revenue, high friction per use | ⚠️ SECONDARY — Add-on for overages |
| **Pay-per-Report** | Clear deliverable | Doesn't capture ongoing value | ❌ |
| **Setup Fee + Monthly** | Captures implementation value | Higher barrier, complex | ❌ |
| **Annual Contract Discount** | Reduces churn, improves cashflow | Longer sales cycle | ✅ ADD-ON — 20% off annual |

**Decision: Tiered monthly subscription with pay-per-analysis overages + annual discount**

---

## 2. Cost Structure Analysis

### 2.1 Per-Analysis Costs (Current)
| Component | Cost | Notes |
|-----------|------|-------|
| Geoapify API | ~$0.005 | 1-2 requests/analysis |
| r.jina.ai proxy | Free | Unlimited |
| OpenRouter (Claude Sonnet 4.5) | ~$0.015 | Brand DNA: 6k tokens @ $3/1M |
| OpenRouter (Claude Sonnet 4.5) | ~$0.015 | Digital Audit: 5k tokens @ $3/1M |
| Gemini Flash-Lite | ~$0.001 | Fallback only |
| **Total AI/API** | **~$0.036** | Best case |
| **Total AI/API (with retries)** | **~$0.055** | Realistic |
| Infrastructure (CPU, DB, bandwidth) | ~$0.010 | Amortized |
| **Total Variable Cost** | **~$0.065** | Per analysis |

### 2.2 Fixed Monthly Costs
| Component | Monthly Cost |
|-----------|-------------|
| Server (2 vCPU, 4GB RAM) | $40 |
| Database (SQLite local, backup) | $5 |
| Monitoring (Grafana Cloud free tier) | $0 |
| Email (Transactional) | $10 |
| Domain/SSL | $2 |
| **Total Fixed** | **~$57** |

### 2.3 Break-Even Analysis
| Tier | Price | Analyses | Variable Cost | Contribution Margin | Break-Even Subscribers |
|------|-------|----------|---------------|---------------------|------------------------|
| Starter | $99 | 25 | $1.63 | $97.37 | 1 |
| Professional | $199 | 100 | $6.50 | $192.50 | 1 |
| Agency | $399 | 500 | $32.50 | $366.50 | 1 |

*Fixed costs covered at 1 subscriber on any tier*

---

## 3. Proposed Tier Structure

### 3.1 Core Tiers

| Feature | **Starter** $99/mo | **Professional** $199/mo | **Agency** $399/mo |
|---------|-------------------|-------------------------|-------------------|
| **Monthly Analyses** | 25 | 100 | 500 |
| **Overage Rate** | $4.00/analysis | $2.50/analysis | $1.50/analysis |
| **Team Seats** | 1 | 3 | 10 |
| **API Access** | ❌ | ✅ | ✅ |
| **CSV Bulk Upload** | ❌ | ✅ (500 rows) | ✅ (5,000 rows) |
| **HTML Reports** | ✅ | ✅ | ✅ |
| **PDF Reports** | ❌ | ✅ | ✅ |
| **White-Label Branding** | ❌ | ❌ | ✅ |
| **Custom Domain** | ❌ | ❌ | ✅ |
| **Webhook Notifications** | ❌ | ✅ | ✅ |
| **Priority Support** | Email (48h) | Email (24h) | Slack (4h) |
| **Founding Discount** | 50% off 3mo | 50% off 3mo | 50% off 3mo |

### 3.2 Annual Pricing (20% Discount)
| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Starter | $99 | $950/yr | $238 |
| Professional | $199 | $1,910/yr | $478 |
| Agency | $399 | $3,830/yr | $958 |

### 3.3 Overage Protection
- Hard cap at 2x tier limit (e.g., Pro max 200/mo)
- Beyond cap: requires upgrade or enterprise quote
- Alert at 80%, 95%, 100% usage

---

## 4. Competitive Anchoring

| Competitor | Model | Price | What You Get | Webloom Advantage |
|------------|-------|-------|--------------|-------------------|
| **Semrush Agency** | Tiered | $200-500/mo | SEO, PPC, content, reporting | Local focus, evidence citations, prospecting |
| **BrightLocal** | Tiered | $35-350/mo | Local SEO, citations, reviews | Website mockup, sales assets, bulk |
| **Vendasta** | Tiered | $300-3000/mo | White-label platform | Modern UX, evidence-based, no bloat |
| **AgencyAnalytics** | Tiered | $60-400/mo | Reporting dashboards | Prospecting + audit + assets |
| **Local Falcon** | Tiered | $100-500/mo | Rank tracking | Full intelligence + proposal |
| **Durable/10Web** | Tiered | $12-60/mo | AI website builder | Agency workflow, not DIY |

**Positioning:** "Semrush for prospecting" — between BrightLocal ($35) and Vendasta ($300)

---

## 5. Pricing Experiments

### 5.1 Experiment 1: Tier Boundaries (Weeks 1-4)
| Variant | Starter | Professional | Agency |
|---------|---------|--------------|--------|
| A (Control) | 25 / $99 | 100 / $199 | 500 / $399 |
| B | 50 / $99 | 200 / $199 | 1000 / $399 |
| C | 15 / $79 | 75 / $159 | 300 / $319 |

**Metric:** Conversion rate, ARPU, churn at 30 days  
**Sample:** 30 pilots per variant (90 total)

### 5.2 Experiment 2: Annual Discount (Weeks 5-8)
| Variant | Monthly | Annual | Discount |
|---------|---------|--------|----------|
| A (Control) | $199 | $1,910 | 20% |
| B | $199 | $1,670 | 30% |
| C | $199 | $2,150 | 10% |

**Metric:** Annual uptake %, LTV, cashflow

### 5.3 Experiment 3: Overage Pricing (Weeks 9-12)
| Variant | Included | Overage |
|---------|----------|---------|
| A (Control) | 100 | $2.50 |
| B | 100 | $1.50 |
| C | 100 | $0.50 (soft cap) |

**Metric:** Overage revenue, upgrade rate, satisfaction

---

## 6. Revenue Projections

### 6.1 Conservative (12 Months)
| Month | Starter | Professional | Agency | Total MRR |
|-------|---------|--------------|--------|-----------|
| 1 | 3 | 2 | 0 | $695 |
| 2 | 5 | 3 | 0 | $1,092 |
| 3 | 8 | 5 | 1 | $2,187 |
| 4 | 10 | 8 | 2 | $3,176 |
| 5 | 12 | 12 | 3 | $4,463 |
| 6 | 15 | 15 | 5 | $6,041 |
| 7 | 18 | 18 | 7 | $7,718 |
| 8 | 20 | 22 | 10 | $9,698 |
| 9 | 22 | 25 | 12 | $11,069 |
| 10 | 25 | 28 | 15 | $13,046 |
| 11 | 28 | 30 | 18 | $14,819 |
| 12 | 30 | 33 | 20 | $16,295 |
| **Year 1 ARR** | | | | **~$100K** |

### 6.2 Base Case (12 Months)
| Month | Starter | Professional | Agency | Total MRR |
|-------|---------|--------------|--------|-----------|
| 1 | 5 | 3 | 1 | $1,292 |
| 2 | 10 | 6 | 2 | $2,587 |
| 3 | 15 | 10 | 4 | $4,286 |
| 4 | 22 | 15 | 6 | $6,871 |
| 5 | 30 | 20 | 10 | $9,965 |
| 6 | 40 | 28 | 14 | $14,447 |
| 7 | 50 | 35 | 18 | $18,531 |
| 8 | 60 | 42 | 22 | $22,814 |
| 9 | 70 | 50 | 28 | $27,998 |
| 10 | 80 | 58 | 35 | $34,086 |
| 11 | 90 | 65 | 40 | $39,578 |
| 12 | 100 | 72 | 45 | $45,175 |
| **Year 1 ARR** | | | | **~$270K** |

### 6.3 Aggressive (12 Months)
| Month | Starter | Professional | Agency | Total MRR |
|-------|---------|--------------|--------|-----------|
| 1 | 10 | 5 | 2 | $2,187 |
| 2 | 20 | 12 | 5 | $5,166 |
| 3 | 35 | 22 | 10 | $9,639 |
| 4 | 50 | 35 | 18 | $15,515 |
| 5 | 70 | 50 | 25 | $22,895 |
| 6 | 90 | 70 | 35 | $33,575 |
| 7 | 110 | 90 | 45 | $44,455 |
| 8 | 130 | 110 | 55 | $54,935 |
| 9 | 150 | 130 | 70 | $67,215 |
| 10 | 175 | 155 | 85 | $82,390 |
| 11 | 200 | 180 | 100 | $97,570 |
| 12 | 225 | 200 | 120 | $113,355 |
| **Year 1 ARR** | | | | **~$650K** |

---

## 7. Unit Economics

### 7.1 LTV/CAC Targets
| Metric | Target | Calculation |
|--------|--------|-------------|
| **LTV** | > $2,000 | ARPU × gross margin % / monthly churn |
| **CAC** | < $500 | Sales + marketing spend / new customers |
| **LTV/CAC** | > 4:1 | |
| **Payback Period** | < 6 months | CAC / (ARPU × gross margin) |

### 7.2 Churn Assumptions
| Tier | Monthly Churn | Annual Churn |
|------|---------------|--------------|
| Starter | 8% | 63% |
| Professional | 5% | 46% |
| Agency | 3% | 31% |

### 7.3 Margin Analysis (Professional Tier)
```
Revenue: $199/mo
Variable Cost (100 analyses): $6.50
Fixed Cost Allocation: $5.70 (at 100 customers)
Gross Profit: $186.80
Gross Margin: 93.9%
```

---

## 8. Pricing Page Copy (For Validation)

### 8.1 Headline
> **Prospect intelligence that cites its sources.**
> Turn Google Maps URLs into verified audits + personalized proposals in minutes.

### 8.2 Tier Cards

**Starter — $99/mo**
> *For solo consultants & new agencies*
> - 25 analyses/month
> - HTML reports
> - 1 team seat
> - Email support

**Professional — $199/mo** ⭐ Most Popular
> *For growing agencies with regular prospecting*
> - 100 analyses/month
> - HTML + PDF reports
> - 3 team seats
> - API access + CSV bulk upload
> - White-label branding
> - 24h email support

**Agency — $399/mo**
> *For established agencies at scale*
> - 500 analyses/month
> - Custom domain + full white-label
> - 10 team seats
> - Webhooks + priority Slack support
> - Dedicated success manager

### 8.3 FAQ
> **What counts as an analysis?**
> One Google Maps URL → full intelligence + audit + assets.
>
> **Can I try before buying?**
> Yes — 30-day pilot: $199 for 50 analyses + 3 co-built proposals.
>
> **What if I need more analyses?**
> Overage at $2.50/analysis (Pro) or upgrade tier. Hard cap at 2x.
>
> **Is there a contract?**
> Month-to-month. Annual saves 20%. Cancel anytime.

---

## 9. Validation Questions for Pilot

1. "At $199/mo for 100 analyses, does this feel expensive, fair, or a steal?"
2. "What would make you upgrade to Agency tier?"
3. "Would you prefer pay-per-analysis instead of monthly?"
4. "Is PDF export worth $100/mo more (Starter → Pro)?"
5. "Is white-label worth $200/mo more (Pro → Agency)?"
6. "What's the max you'd pay for unlimited analyses?"
7. "Would annual billing at 20% off change your decision?"

---

## References

- `AUDIT-REPORT.md` Section 4 — Business model audit
- `PRODUCT_VISION.md` Section 5 — Pricing hypotheses
- `CUSTOMER_VALIDATION_PLAN.md` Section 5.1 — Pilot pricing
- `MVP_ACCEPTANCE_CRITERIA.md` — Revenue validation gates