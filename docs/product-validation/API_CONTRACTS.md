# Webloom 2.0 — API Contracts

## 1. Overview

All endpoints require authentication via API Key (Bearer token). Team isolation enforced — users only access their team's data.

**Base URL:** `http://localhost:5001/api` (dev) / `https://api.webloom.dev` (prod)

**Headers:**
```
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Error Format:**
```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable description",
  "details": {}
}
```

---

## 2. Authentication

### GET /auth/me
**Get current user/team info**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_abc123",
      "email": "founder@agency.com",
      "name": "Jane Founder",
      "role": "owner"
    },
    "team": {
      "id": "tيم_xyz789",
      "name": "Acme Digital",
      "plan": "professional",
      "usage": {
        "analysesThisMonth": 47,
        "analysesLimit": 500
      }
    }
  }
}
```

---

## 3. Leads (Prospects)

### GET /leads
**List prospects with pagination & filters**

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page (max 100) |
| status | string | - | Filter: new/contacted/qualified/proposal/won/lost |
| category | string | - | Filter by business category |
| minScore | integer | - | Minimum opportunity score (0-100) |
| search | string | - | Search businessName, category, location |
| sort | string | -createdAt | Sort field: createdAt, updatedAt, opportunityScore, businessName |
| order | string | desc | asc/desc |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "lead_abc123",
      "businessName": "Joe's Bakery",
      "businessCategory": "Bakery",
      "status": "new",
      "opportunityScore": {
        "total": 72,
        "priority": "high",
        "status": "complete",
        "explanation": "Based on completed digital audit."
      },
      "location": {
        "city": "San Francisco",
        "state": "CA",
        "country": "US"
      },
      "contact": {
        "phone": "+1-415-555-0123",
        "email": "joe@bakery.com",
        "website": "joesbakery.com"
      },
      "createdAt": "2026-11-15T10:30:00.000Z",
      "updatedAt": "2026-11-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

### GET /leads/stats/dashboard
**Dashboard statistics**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalLeads": 47,
    "highPriority": 12,
    "websitesGenerated": 8,
    "contacted": 5,
    "byStatus": {
      "new": 15,
      "contacted": 10,
      "qualified": 8,
      "proposal": 7,
      "won": 5,
      "lost": 2
    },
    "byCategory": {
      "Bakery": 3,
      "Dental": 5,
      "Restaurant": 12
    }
  }
}
```

### POST /leads
**Create new prospect analysis**

**Request:**
```json
{
  "googleMapsUrl": "https://maps.google.com/place/ChIJ...",
  "leadName": "Joe's Bakery - Q4 Outreach",
  "internalNotes": "Referred by existing client",
  "customInstructions": "Focus on local SEO and review generation",
  "forceRefresh": true
}
```

**Validation:**
- `googleMapsUrl`: required, must match Google Maps host allowlist
- `leadName`: optional, max 200 chars
- `internalNotes`: optional, max 2000 chars
- `customInstructions`: optional, max 2000 chars
- `forceRefresh`: optional boolean, default true

**Response 201:**
```json
{
  "success": true,
  "data": {
    "_id": "lead_abc123",
    "businessName": "Joe's Bakery",
    "businessCategory": "Bakery",
    "leadName": "Joe's Bakery - Q4 Outreach",
    "status": "new",
    "source": {
      "googleMapsUrl": "https://maps.google.com/place/ChIJ...",
      "extractedAt": "2026-11-15T10:30:00.000Z"
    },
    "contact": {
      "phone": "+1-415-555-0123",
      "email": "joe@bakery.com",
      "website": "joesbakery.com"
    },
    "location": {
      "address": "123 Main St, San Francisco, CA 94102",
      "city": "San Francisco",
      "state": "CA",
      "country": "US",
      "coordinates": { "lat": 37.7749, "lng": -122.4194 }
    },
    "businessData": {
      "rating": 4.2,
      "reviewCount": 127,
      "services": ["Artisan Breads", "Pastries", "Custom Cakes"],
      "openingHours": {
        "monday": "07:00-19:00",
        "tuesday": "07:00-19:00"
      },
      "reputation": {
        "rating": 4.2,
        "reviewCount": 127,
        "reviews": [...],
        "reviewSummary": "Customers praise the sourdough...",
        "sentiment": "positive",
        "themes": ["Quality", "Service", "Atmosphere"],
        "provenance": "observed",
        "confidence": 0.92
      }
    },
    "analysis": {
      "businessData": {...},
      "metrics": {
        "trustSignals": [...],
        "facts": [...],
        "unknowns": ["email", "booking_url"],
        "digitalPresence": {...},
        "positioning": {...},
        "source": { "providers": {...} }
      },
      "brandDNA": {...},
      "audit": {...},
      "brandStrategyStatus": "ok",
      "extractedAt": "2026-11-15T10:30:00.000Z"
    },
    "opportunityScore": {
      "total": 72,
      "priority": "high",
      "status": "complete",
      "explanation": "Based on completed digital audit."
    },
    "createdAt": "2026-11-15T10:30:00.000Z",
    "updatedAt": "2026-11-15T10:30:00.000Z"
  }
}
```

**Error Responses:**
| Code | HTTP | Cause |
|------|------|-------|
| `INVALID_URL` | 400 | Google Maps URL format invalid |
| `PROVIDER_UNAVAILABLE` | 503 | All providers down, no URL identity |
| `RATE_LIMITED` | 429 | Team monthly limit exceeded |

### GET /leads/:id
**Get full prospect detail**

**Response 200:** Same as POST /leads response data

**Error 404:** `{ "success": false, "error": "NOT_FOUND", "message": "Prospect not found" }`

### PATCH /leads/:id
**Update prospect (status, notes)**

**Request:**
```json
{
  "status": "contacted",
  "internalNotes": "Called - interested in website package"
}
```

**Allowed fields:** `status`, `leadName`, `internalNotes`, `customInstructions`

**Response 200:** Updated lead object

### DELETE /leads/:id
**Delete prospect**

**Response 200:**
```json
{ "success": true, "message": "Prospect deleted successfully" }
```

### POST /leads/:id/brand-dna
**Regenerate brand DNA + digital audit**

**Response 200:** Full updated lead object (same as GET /leads/:id)

### POST /leads/:id/website-spec
**Generate website specification**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "slug": "joes-bakery-abc123",
    "spec": {
      "pages": ["home", "services", "about", "contact"],
      "designSystem": {...},
      "contentStrategy": {...}
    },
    "status": "running",
    "url": "http://localhost:4321/joes-bakery-abc123",
    "generatedAt": "2026-11-15T11:00:00.000Z"
  }
}
```

### POST /leads/bulk
**Bulk analyze prospects from CSV**

**Request:** `multipart/form-data`
- `file`: CSV file (max 500 rows, 1MB)
- `columnMapping`: JSON string mapping CSV columns to fields

**CSV Format:**
```csv
googleMapsUrl,leadName,internalNotes,customInstructions
https://maps.google.com/place/ChIJ...,Joe's Bakery,Referral,Focus on SEO
https://maps.google.com/place/ChIJ...,Smith Dental,Cold outreach,Emphasize reviews
```

**Response 202 (Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "status": "processing",
    "totalRows": 50,
    "processed": 0,
    "created": 0,
    "duplicates": 0,
    "failed": 0,
    "startedAt": "2026-11-15T11:00:00.000Z"
  }
}
```

### GET /leads/bulk/:jobId
**Get bulk job status**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "status": "completed",
    "totalRows": 50,
    "processed": 50,
    "created": 47,
    "duplicates": 3,
    "failed": 0,
    "results": [
      { "row": 1, "leadId": "lead_abc123", "status": "created" },
      { "row": 2, "leadId": "lead_def456", "status": "created" }
    ],
    "completedAt": "2026-11-15T11:05:00.000Z"
  }
}
```

---

## 4. Reports

### POST /reports
**Generate report for prospect**

**Request:**
```json
{
  "leadId": "lead_abc123",
  "format": "pdf",  // or "html"
  "branding": {
    "logoUrl": "https://cdn.webloom.dev/teams/team_xyz/logo.png",
    "primaryColor": "#2563eb",
    "agencyName": "Acme Digital"
  },
  "sections": ["overview", "verifiedIntel", "audit", "opportunities", "recommendations", "nextSteps"]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "reportId": "rpt_abc123",
    "leadId": "lead_abc123",
    "format": "pdf",
    "url": "https://reports.webloom.dev/team_xyz/rpt_abc123.pdf",
    "htmlUrl": "https://reports.webloom.dev/team_xyz/rpt_abc123.html",
    "expiresAt": "2026-12-15T11:00:00.000Z",
    "generatedAt": "2026-11-15T11:00:00.000Z"
  }
}
```

### GET /reports/:reportId
**Get report metadata**

**Response 200:** Report object (same as POST response)

### GET /reports/:reportId/download
**Download report file (PDF/HTML)**

**Response:** File stream with `Content-Disposition: attachment`

### POST /reports/:reportId/share
**Create public share link**

**Request:**
```json
{
  "expiresInDays": 30,
  "password": "optional-password",
  "allowDownload": true
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "shareId": "shr_abc123",
    "url": "https://reports.webloom.dev/s/shr_abc123",
    "expiresAt": "2026-12-15T11:00:00.000Z"
  }
}
```

---

## 5. Sales Assets

### POST /sales-assets/outreach-email
**Generate personalized outreach email**

**Request:**
```json
{
  "leadId": "lead_abc123",
  "tone": "conversational",  // conversational, professional, direct
  "focus": "website"  // website, seo, reviews, gbp, all
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "subject": "Joe's Bakery — 3 quick wins for more foot traffic",
    "body": "Hi Joe,\n\nI noticed your bakery on Google Maps...",
    "personalizedFields": {
      "businessName": "Joe's Bakery",
      "category": "Bakery",
      "city": "San Francisco",
      "rating": 4.2,
      "reviewCount": 127,
      "website": null,
      "topOpportunity": "No website — losing 40% of local search traffic"
    }
  }
}
```

### POST /sales-assets/value-proposition
**Generate value proposition statement**

**Request:**
```json
{
  "leadId": "lead_abc123"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "positioning": "For San Francisco foodies who crave authentic sourdough, Joe's Bakery is the neighborhood artisan that bakes fresh daily unlike industrial bakeries that ship frozen dough.",
    "differentiation": "Unlike templated agencies, we build conversion-first websites grounded in your actual business data — not generic templates.",
    "primaryCTA": "See your personalized website concept",
    "supportingPoints": [
      "Verified 4.2★ rating from 127 Google reviews",
      "Zero website = losing 40%+ local search traffic",
      "Review generation program adds 20+ reviews/month"
    ]
  }
}
```

### POST /sales-assets/website-mockup
**Generate single-page website concept**

**Request:**
```json
{
  "leadId": "lead_abc123",
  "theme": "warm-editorial"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "slug": "joes-bakery-mockup-abc123",
    "url": "http://localhost:4321/joes-bakery-mockup-abc123",
    "spec": {
      "hero": {
        "headline": "San Francisco's Favorite Artisan Bakery",
        "subheadline": "Fresh sourdough, pastries & custom cakes baked daily since 2018",
        "cta": { "text": "Order for Pickup", "action": "tel:+14155550123" }
      },
      "services": [...],
      "proof": { "rating": 4.2, "reviewCount": 127, "testimonial": "Best croissants in the Mission!" },
      "contact": { "phone": "+1-415-555-0123", "address": "123 Main St, SF, CA 94102" }
    }
  }
}
```

---

## 6. Health & Diagnostics

### GET /health
**System health**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "2.0.0",
    "uptime": 3600,
    "database": "connected",
    "providers": {
      "geoapify": "configured",
      "openrouter": "configured",
      "gemini": "configured"
    }
  }
}
```

### GET /health/ai
**AI provider health**

**Response 200:**
```json
{
  "success": true,
  "data": {
    "chain": {
      "primary": { "name": "openrouter", "configured": true, "usable": true, "model": "anthropic/claude-sonnet-4.5" },
      "secondary": { "name": "gemini", "configured": true, "usable": true, "model": "gemini-3.1-flash-lite-preview" },
      "fallback": { "name": "local", "configured": false, "usable": false }
    },
    "totalBudgetMs": 90000,
    "probeMaxTokens": 6000
  }
}
```

---

## 7. Webhooks (P2)

### POST /webhooks/lead.created
**Fired when lead analysis completes**

**Payload:**
```json
{
  "event": "lead.created",
  "timestamp": "2026-11-15T10:30:00.000Z",
  "data": { "leadId": "lead_abc123", "businessName": "Joe's Bakery", "opportunityScore": 72 }
}
```

### POST /webhooks/report.generated
**Fired when report completes**

**Payload:**
```json
{
  "event": "report.generated",
  "timestamp": "2026-11-15T11:00:00.000Z",
  "data": { "reportId": "rpt_abc123", "leadId": "lead_abc123", "format": "pdf", "url": "..." }
}
```

---

## 8. Rate Limits

| Tier | Analyses/Month | Burst | Concurrent |
|------|----------------|-------|------------|
| Starter | 100 | 5/min | 2 |
| Professional | 500 | 20/min | 5 |
| Agency | Unlimited | 50/min | 10 |

**Headers on all responses:**
```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 453
X-RateLimit-Reset: 1700000000
```

---

## 9. Versioning

- **v1** — Current (lead-centric, single analysis)
- **v2** — Team-centric, bulk, reports, assets (this spec)

**Header:** `Accept: application/vnd.webloom.v2+json`

---

## References

- `apps/api/src/routes/leads.js` — Current lead endpoints
- `apps/api/src/routes/business.js` — /analyze, /research endpoints
- `apps/api/src/services/BusinessResearchService.js` — Extraction pipeline
- `apps/api/src/services/BrandStrategyService.js` — Brand DNA
- `apps/api/src/services/DigitalAuditService.js` — Audit
- `apps/api/src/services/LeadWebsiteSpecService.js` — Website spec
- `apps/api/src/services/SalesOutreachService.js` — Outreach email
- `apps/api/src/services/ReportGenerationService.js` — Reports (new)
- `apps/api/src/services/AssetGenerationService.js` — PDF generation
- `apps/web/src/services/leadService.ts` — Frontend client