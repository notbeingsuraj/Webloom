# Webloom 2.0 — User Workflows

## 1. Dashboard (`apps/web/src/pages/Dashboard.tsx`)

### State: Empty
```
┌─────────────────────────────────────────────────────────────────┐
│  Webloom                    [Analyse Business] → /leads/new      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    [EmptyState Illustration]                                    │
│                                                                 │
│    No prospects yet                                             │
│    Start by analyzing a business to build your pipeline        │
│                                                                 │
│                          [Analyse Business]                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
- **Component:** `EmptyState` with CTA button
- **Action:** Click "Analyse Business" → navigate to `/leads/new`

### State: Populated
```
┌─────────────────────────────────────────────────────────────────┐
│  Webloom                    [Analyse Business] → /leads/new      │
├─────────────────────────────────────────────────────────────────┤
│  Stats:  [Total: 47] [High Priority: 12] [Sites: 8] [Contacted: 5]│
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Joe's Bakery          Bakery      San Francisco, CA     │  │
│  │ Status: new    ●●●○○ Score: 72    Updated: 2h ago       │  │
│  │ [Review] → /leads/abc123                                   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Smith Dental          Dental      Austin, TX            │  │
│  │ Status: contacted ●●●●○ Score: 85    Updated: 1d ago    │  │
│  │ [Review] → /leads/def456                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow
```
Dashboard Load
    ↓
leadService.getDashboardStats() → GET /api/leads/stats/dashboard
    → apps/api/src/routes/leads.js router.get('/stats/dashboard')
    → leadCache.values() → compute stats
    ↓
leadService.getLeads({sort: '-createdAt', limit: 20}) → GET /api/leads
    → apps/api/src/routes/leads.js router.get('/')
    → leadCache.values() → sort → paginate
    ↓
Render: LeadListItem (businessName, status badge, category, location.city, opportunityScore.total, updatedAt)
```

### Lead List Item
| Field | Source | Display |
|-------|--------|---------|
| `businessName` | `lead.businessName` | Primary text |
| `status` | `lead.status` | `StatusBadge` (new/contacted/qualified/proposal/won/lost) |
| `businessCategory` | `lead.businessCategory` | Secondary text |
| `location.city` | `lead.location.city` | Location badge |
| `opportunityScore.total` | `lead.opportunityScore.total` | `ScoreIndicator` conic gradient (0-100) |
| `updatedAt` | `lead.updatedAt` | Relative time |

### Actions
| Action | Handler | Navigation |
|--------|---------|------------|
| "Analyse Business" | `navigate('/leads/new')` | `/leads/new` |
| Click lead row | `navigate(`/leads/${lead._id}`)` | `/leads/{id}` |

### Loading & Error
- **Loading:** `wl-shimmer` skeleton per stat card + lead list row
- **Error:** Inline retry button → `queryClient.invalidateQueries({queryKey: ['leads']})`

---

## 2. New Prospect → `/leads/new` (`apps/web/src/pages/NewLead.tsx`)

### Input Form
```
┌─────────────────────────────────────────────────────────────────┐
│  Google Maps URL  [https://maps.google.com/place/...]  [Validate]│
│  Lead Name         [Business name or account]                   │
│  Internal Notes    [Customer notes, source details...]          │
│  Custom Instructions [Desired positioning, brand tone...]       │
│                                                                 │
│  [Cancel]                    [Analyse Business]                 │
└─────────────────────────────────────────────────────────────────┘
```

### Client-Side Validation (`validateGoogleMapsUrl`)
```typescript
// Valid hosts: maps.google.com, www.google.com, google.com, goo.gl, maps.app.goo.gl, maps.googleapis.com
// Returns error string or null
```

### Submission Flow
```
User clicks "Analyse Business"
    ↓
handleSubmit()
    ↓
validateGoogleMapsUrl(trimmed) → error? → show inline error : proceed
    ↓
analytics.startAnalysis()
    ↓
createLeadMutation.mutate({
    data: { googleMapsUrl: trimmed, forceRefresh: true, ...formData },
    signal: AbortController.signal,
    timeoutMs: 300_000  // REQUEST_TIMEOUT_MS
})
    ↓
POST /api/leads → apps/api/src/routes/leads.js router.post('/')
    ↓
BusinessResearchService.extractBusinessIntelligenceWithProviders()
    ↓
BrandStrategyService.generateBrandDNA()
    ↓
DigitalAuditService.auditDigitalPresence()
    ↓
persistLead() → SQLite
    ↓
201 Created → { success: true, data: lead }
```

### Progress Visualization (7 Steps)
| Step | Label | Duration | Color |
|------|-------|----------|-------|
| 1 | Reading business location | 3s | Blue (#3B82F6) |
| 2 | Resolving business identity | 8s | Violet (#8B5CF6) |
| 3 | Gathering business information | 15s | Pink (#EC4899) |
| 4 | Reconciling sources | 20s | Orange (#F97316) |
| 5 | Building Business DNA | 25s | Green (#10B981) |
| 6 | Calculating opportunity score | 30s | Amber (#F59E0B) |
| 7 | Preparing analysis | 35s | Blue (#3B82F6) |

**Timer Logic:**
- `SOFT_LIMIT_WARNING_MS = 90_000` (90s) → "Still working — longer than expected" banner
- `REQUEST_TIMEOUT_MS = 300_000` (5 min) → `handleHardTimeout()` aborts + checks GET /api/leads for persisted lead

### State Machine
```
idle → submitting → processing → completed → navigate(/leads/{id})
                    ↓
              failed/timed_out
```

### Timeout Recovery (`handleHardTimeout`)
1. Abort in-flight request (`abortControllerRef.current?.abort()`)
2. Set status = 'timed_out'
3. GET `/api/leads?sort=-createdAt&limit=10`
4. Find lead created after request start ±5s
5. If found → show "View results for {leadName}" button → navigate to lead
6. If not found → "Analysis exceeded limit — retry shortly"

### Error Display
| State | Message |
|-------|---------|
| `timed_out` + lead found | "A lead was persisted while the analysis was running. View results for {name}" |
| `timed_out` + no lead | "The analysis exceeded the configured time limit. The backend may still be finishing — please retry shortly" |
| `beyondExpected` (90s+) | "Still working — this analysis can take a few minutes. The analysis performs provider extraction, source reconciliation, AI enrichment, a website audit, and opportunity scoring. Please keep this tab open." |
| `failed` | "Something went wrong: {errorMessage from mutation.response.data}" |

---

## 3. Prospect Detail → `/leads/{id}` (`apps/web/src/pages/LeadDetail.tsx`)

### Header
```
┌─────────────────────────────────────────────────────────────────┐
│  Joe's Bakery                                    [Status ▼] [🗑] │
│  ●●●○○ Score: 72    Category: Bakery    Location: San Francisco │
└─────────────────────────────────────────────────────────────────┘
│  [Overview] [Analysis] [Website] [Outreach]                      │
```

### Data Fetch
```typescript
useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadService.getLead(id)  // GET /api/leads/{id}
})
```
- `apps/api/src/routes/leads.js` router.get('/:id') → `leadCache.get(id)` || `fetchLeadFromStore(id)`

### Tab 1: Overview
```
┌─────────────────────────────────────────────────────────────────┐
│  Opportunity Insights (OpportunityInsights component)           │
│  ├─ Score: 72/100  "Strong opportunity with visible demand..." │
│  ├─ Top weaknesses: [No website, Weak metadata, Missing CTA]   │
│  └─ Top recommendations: [Build website, Optimize GBP, Add CTA] │
├─────────────────────────────────────────────────────────────────┤
│  Business Profile Cards (provenance badges on each field)       │
│  ├─ Location: 123 Main St, San Francisco, CA 94102  [VERIFIED] │
│  ├─ Phone: +1-415-555-0123  [DISCOVERED]                        │
│  ├─ Email: joe@bakery.com  [VERIFIED]                           │
│  ├─ Website: joesbakery.com  [VERIFIED]                         │
│  └─ Rating: 4.2 (127 reviews)  [OBSERVED]                       │
├─────────────────────────────────────────────────────────────────┤
│  Business DNA (brandStrategyStatus = 'ok')                      │
│  ├─ Audience: Local families seeking artisanal breads           │
│  ├─ Positioning: "For Bay Area foodies who value tradition..."  │
│  ├─ Personality: [Warm, Authentic, Craft-focused]               │
│  ├─ Tone: Conversational, knowledgeable, community-oriented     │
│  └─ Strategic Recommendations:                                  │
│     1. Build conversion-first website (High/Medium)             │
│     2. Optimize Google Business Profile (High/Low)              │
│     3. Launch review generation program (Medium/Low)            │
├─────────────────────────────────────────────────────────────────┤
│  Business Details & Evidence                                    │
│  ├─ Services: [Artisan Breads, Pastries, Custom Cakes, Coffee] │
│  ├─ Hours: Mon-Fri 7am-7pm, Sat 8am-6pm, Sun Closed            │
│  └─ Trust Signals:                                              │
│     ● Google Rating: 4.2 ★ [VERIFIED]                           │
│     ● 127 Reviews [VERIFIED]                                    │
│     ● 5 Years in Business [INFERRED]                            │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 2: Analysis
```
┌─────────────────────────────────────────────────────────────────┐
│  Digital Audit (DigitalAuditService results)                    │
│  ├─ Overall: 3.2/10  Categories:                                │
│  │  Design: 2/10  Mobile: 1/10  Navigation: 3/10              │
│  │  Conversion: 2/10  Trust: 3/10  SEO: 4/10                   │
│  │  Local SEO: 5/10  Content: 3/10  Branding: 2/10            │
│  │  Performance: 4/10  Contact: 6/10                          │
│  ├─ Strengths: [Google Business Profile exists]                 │
│  ├─ Weaknesses: [No website (critical), No mobile (critical)...]│
│  ├─ Critical Issues: [No website, No CTA, No analytics]         │
│  └─ Recommendations: [Build site (1), Mobile-first (1), GBP (2)]│
├─────────────────────────────────────────────────────────────────┤
│  Missing Intelligence (MissingIntelligence component)           │
│  ├─ Unknown: Business email, Hours, Services detail, Booking   │
│  └─ Source: identifyUnknowns() output                           │
├─────────────────────────────────────────────────────────────────┤
│  Reputation Panel (GoogleMapsReputationExtractor output)        │
│  ├─ Rating: 4.2  Review Count: 127                             │
│  ├─ Recent Reviews: [5★ "Best croissants!", 4★ "Great coffee"] │
│  ├─ Sentiment: Positive (78%)  Themes: [Quality, Service]      │
│  └─ Provenance: OBSERVED (Google Maps)                          │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 3: Website
```
┌─────────────────────────────────────────────────────────────────┐
│  Website Preview (WebsitePreview component)                     │
│  ├─ If generated: iframe of generated-sites/{slug}/             │
│  └─ If not: "Generate website specification" button            │
│                                                                 │
│  [Generate Website] → generateWebsiteMutation.mutate()          │
│      → POST /api/leads/{id}/website-spec                        │
│      → LeadWebsiteSpecService.generate(business, brandDNA, audit)│
│      → returns { slug, url, status: 'running' }                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 4: Outreach
```
┌─────────────────────────────────────────────────────────────────┐
│  Outreach Email (SalesOutreachService.generateOutreachEmail)    │
│  ├─ Subject: "Joe's Bakery — 3 quick wins for more foot traffic"│
│  ├─ Body: Personalized with audit findings + brandDNA          │
│  └─ [Edit] [Copy] [Send via Gmail]                              │
├─────────────────────────────────────────────────────────────────┤
│  Value Proposition (BrandStrategyService.brandDNA)             │
│  ├─ Positioning: "For [audience] who [need]..."                │
│  ├─ Differentiation: "Unlike templated agencies, we..."         │
│  └─ [Edit]                                                      │
├─────────────────────────────────────────────────────────────────┤
│  Website Improvements (DigitalAuditService.recommendations)     │
│  ├─ 1. Build conversion-first website (High/Medium)            │
│  ├─ 2. Mobile-responsive from day one (High/Low)               │
│  ├─ 3. Optimize Google Business Profile (Medium/Low)           │
│  └─ [Prioritize] [Export]                                       │
├─────────────────────────────────────────────────────────────────┤
│  Website Mockup (LeadWebsiteSpecService + DesignIntelligence)   │
│  ├─ Hero: "San Francisco's Favorite Artisan Bakery"            │
│  ├─ Services: [Breads, Pastries, Cakes, Coffee]                │
│  ├─ Proof: 4.2★ 127 reviews, "Best croissants in the Mission"  │
│  └─ CTA: "Order for Pickup" → tel:+14155550123                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mutations (All invalidate `['lead', id]`)
| Mutation | Endpoint | Service | UI Trigger |
|----------|----------|---------|------------|
| `updateStatusMutation` | PATCH /api/leads/{id} | `leadService.updateLead()` | Status dropdown |
| `generateDNAMutation` | POST /api/leads/{id}/brand-dna | `leadService.generateBrandDNA()` | "Refresh Analysis" |
| `generateWebsiteMutation` | POST /api/leads/{id}/website-spec | `leadService.generateWebsiteSpec()` | "Generate Website" |
| `deleteMutation` | DELETE /api/leads/{id} | `leadService.deleteLead()` | Trash icon |

---

## 4. Reports Flow

### Generate Report
```
User clicks "Generate Report" (Website/Outreach tab)
    ↓
ReportGenerationService.generate(leadId)
    ↓
Creates report config from:
  - CanonicalBusinessProfileService.fromEntityData(lead.analysis.businessData)
  - lead.analysis.audit
  - lead.analysis.brandDNA
  - lead.analysis.metrics (trustSignals, facts, unknowns)
    ↓
WebsiteGenerationService.generate(business, { designIntelligence: reportConfig })
    ↓
GeneratedSiteManager.copyTemplate(slug)
GeneratedSiteManager.writeConfig(slug, reportConfig)
GeneratedSiteManager.runBuild(slug)  // astro build
    ↓
Returns: { slug, path, url, status: 'running' }
```

### Preview
- `WebsitePreview` component → iframe of `http://localhost:{port}/`
- Or modal with generated HTML content

### Export PDF
```
User clicks "Download PDF"
    ↓
AssetGenerationService.generatePDF(slug)
    ↓
puppeteer.launch() → page.goto(url) → page.pdf({format: 'A4', printBackground: true})
    ↓
Returns blob → browser download
```

### Share
- Public link: `generated-sites/{slug}/public?token={unguessable}`
- Optional: expiry, password, access log

---

## 5. Sales Assets Flow

### Outreach Email
```
SalesOutreachService.generateOutreachEmail(lead)
    ↓
Input: lead.analysis.businessData + lead.analysis.audit + lead.analysis.brandDNA
    ↓
Prompt: apps/api/src/prompts/salesOutreach.js
    ↓
Output: { subject, body, personalizedFields }
    ↓
Frontend: Editable preview → [Copy] [Send via mailto:]
```

### Value Proposition
```
BrandStrategyService.brandDNA.positioning.statement
BrandStrategyService.brandDNA.differentiation
    ↓
Frontend: Editable text areas
```

### Website Improvements
```
DigitalAuditService.audit.recommendations
    → Filter by effort='low' + impact='high' (quick wins)
    → Sort by priority
    ↓
Frontend: Prioritized list with evidence badges
```

### Website Mockup
```
LeadWebsiteSpecService.generate(business, brandDNA, audit)
    → spec: { pages, components, designSystem, contentStrategy }
    ↓
DesignIntelligenceService.generateDesignIntelligence()
    → designSystem + contentStrategy
    ↓
Simplified WebsiteGenerationService.generate()
    → Single-page mockup (hero, services, proof, CTA)
    ↓
Preview in Outreach tab
```

---

## 6. API Call Mapping

| UI Action | Frontend Call | API Endpoint | Backend Handler | Key Services |
|-----------|---------------|--------------|-----------------|--------------|
| Dashboard load | `leadService.getDashboardStats()` | GET /api/leads/stats/dashboard | `leads.js` router.get('/stats/dashboard') | leadCache |
| Dashboard load | `leadService.getLeads()` | GET /api/leads | `leads.js` router.get('/') | leadCache |
| New Lead submit | `leadService.createLead()` | POST /api/leads | `leads.js` router.post('/') | BusinessResearchService, BrandStrategyService, DigitalAuditService, persistLead |
| Lead Detail load | `leadService.getLead(id)` | GET /api/leads/{id} | `leads.js` router.get('/:id') | leadCache / fetchLeadFromStore |
| Refresh Analysis | `leadService.generateBrandDNA(id)` | POST /api/leads/{id}/brand-dna | `leads.js` router.post('/:id/brand-dna') | BrandStrategyService, DigitalAuditService |
| Generate Website | `leadService.generateWebsiteSpec(id)` | POST /api/leads/{id}/website-spec | `leads.js` router.post('/:id/website-spec') | LeadWebsiteSpecService |
| Update Status | `leadService.updateLead(id, {status})` | PATCH /api/leads/{id} | `leads.js` router.patch('/:id') | persistLead |
| Delete Lead | `leadService.deleteLead(id)` | DELETE /api/leads/{id} | `leads.js` router.delete('/:id') | leadCache.delete, removeLead |

---

## 7. State Transitions & Edge Cases

### Partial Results
```
providerTrace: {
  geoapify: { status: 'success', recordsFound: 3, latencyMs: 1200 },
  webExtraction: { status: 'success', method: 'cid', latencyMs: 2400 },
  officialWebsite: { status: 'success', url: '...', latencyMs: 800 }
}
```
- UI shows available data per section
- Missing sections show "Provider temporarily unavailable" or "Not yet analyzed"

### Provider Failure (503)
```
leads.js PROVIDER_DOWN_STATUSES = new Set([
  'not_configured', 'provider_unavailable', 'authentication_failed',
  'rate_limited', 'quota_exhausted', 'timeout', 'network_error', 'internal_failure'
])
```
- If ALL providers down + no URL identity → 503 `provider_unavailable`
- If partial → return what we have with `providerTrace` showing failures

### Brand DNA Failure
```
leads.js lines 219-229:
try { brandDNA = await BrandStrategyService.generateBrandDNA(businessData); brandStrategyStatus = 'ok'; }
catch { brandStrategyStatus = 'failed'; brandDNA = null; }
// Extraction PRESERVED — lead still created
```
- UI: `brandStrategyStatus === 'failed'` → show "Analysis unavailable" with retry button

### Timeout Recovery
```
NewLead.tsx handleHardTimeout():
1. abortControllerRef.current?.abort()
2. GET /api/leads?sort=-createdAt&limit=10
3. Find lead created after requestStart ±5s
4. If found → navigate to lead
5. If not → show retry message
```

### CSV Deduplication (New)
- Dedup key: `placeId` || `cid` || normalized `googleMapsUrl`
- On duplicate: skip or merge (configurable)
- Report: `{ processed: 50, created: 47, duplicates: 3, failed: 0 }`

---

## References

- `apps/web/src/pages/Dashboard.tsx` — stats, lead list, empty state
- `apps/web/src/pages/NewLead.tsx` — form, validation, progress, timeout, state machine
- `apps/web/src/pages/LeadDetail.tsx` — 4 tabs, mutations, components
- `apps/web/src/components/OpportunityInsights.tsx` — score, weaknesses, recommendations
- `apps/web/src/components/MissingIntelligence.tsx` — unknowns display
- `apps/web/src/components/ReputationPanel.tsx` — Google reviews display
- `apps/web/src/components/WebsitePreview.tsx` — iframe preview
- `apps/web/src/services/leadService.ts` — all API calls
- `apps/api/src/routes/leads.js` — all lead endpoints, timeout handling, persistence
- `apps/api/src/services/BusinessResearchService.js` — extraction pipeline
- `apps/api/src/services/BrandStrategyService.js` — brand DNA, recommendations
- `apps/api/src/services/DigitalAuditService.js` — audit, degraded modes
- `apps/api/src/services/LeadWebsiteSpecService.js` — website spec
- `apps/api/src/services/SalesOutreachService.js` — outreach email
- `apps/api/src/services/GeneratedSiteManager.js` — template, build, serve
- `apps/api/src/services/ReportGenerationService.js` — (new) report orchestration
- `apps/api/src/services/AssetGenerationService.js` — PDF generation
- `apps/api/src/prompts/salesOutreach.js` — outreach prompt