# Webloom 2.0 — Data Model

## 1. Canonical Business Profile (Runtime)

The unified business representation consumed by all intelligence services. Produced by `CanonicalBusinessProfileService.fromEntityData()`.

### Shape
```typescript
interface CanonicalBusinessProfile {
  // === IDENTITY (authoritative, never ai_generated) ===
  identity: {
    name: string | null;                    // Business name
    category: string | null;                // Primary category
    coordinates: { lat: number; lng: number } | null;  // Authoritative lat/lng
    phone: string | null;                   // E.164 normalized
    website: string | null;                 // Domain only (joesbakery.com)
    address: string | null;                 // Full formatted address
    addressComponents: {                    // Parsed components
      street: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      postalCode: string | null;
    } | null;
  };

  // === BUSINESS DATA (enrichment, may be ai_generated) ===
  business: {
    category: string | null;
    description: string | null;
    businessType: string | null;            // B2C, B2B, B2B2C
    services: string[];                     // Verified + discovered services
    hours: Record<string, string>;          // Opening hours by day
    reputation: ReputationBlock;            // Rating, reviews, sentiment
  };

  // === PROVIDER TRACE (audit trail) ===
  providers: ProviderTrace[];
}

interface ReputationBlock {
  rating: number | null;                    // 0-5
  reviewCount: number | null;
  reviews: Review[];                        // Up to 10 recent
  reviewSummary: string | null;             // AI-generated summary
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  themes: string[];                         // Extracted themes
  provenance: 'verified' | 'discovered' | 'observed' | 'inferred' | 'ai_generated';
  confidence: number;                       // 0-1
  status: 'complete' | 'partial' | 'unavailable';
}

interface Review {
  author: string;
  rating: number;                           // 1-5
  text: string;
  date: string;                             // ISO
  source: 'google_maps' | 'official_website';
}

interface ProviderTrace {
  provider: 'geoapify' | 'web_extraction' | 'official_website' | 'user_provided';
  status: 'success' | 'failed' | 'not_attempted';
  recordsFound?: number;
  latencyMs?: number;
  error?: string;
  providerRecordId?: string;                // placeId, CID, URL
}
```

### Provenance Rules
| Tier | Value | Sources | Can Overwrite |
|------|-------|---------|---------------|
| user_provided | 5 | Manual input | Everything |
| verified | 4 | Official website crawl | discovered, identified, inferred, ai_generated |
| discovered | 3 | Geoapify, Google Maps DOM | identified, inferred, ai_generated |
| identified | 2 | Google Maps URL parsing | inferred, ai_generated |
| inferred | 1 | Cross-field logic | ai_generated |
| ai_generated | 0.5 | AI extraction | Nothing (quarantined) |

**Identity fields** (name, phone, website, address, coordinates) **require provenance ≥ discovered (3)** to be accepted into canonical identity. AI-generated identity fields are stored as candidates but never promoted.

---

## 2. Persistent Schema (SQLite via Drizzle ORM)

### Core Tables

#### BusinessEntity
```sql
CREATE TABLE business_entity (
  entity_id TEXT PRIMARY KEY,           -- 'ent_abc123'
  canonical_name TEXT NOT NULL,         -- Authoritative name
  canonical_phone TEXT,                 -- E.164
  canonical_website TEXT,               -- Domain
  canonical_address TEXT NOT NULL,      -- Full address
  canonical_latitude REAL,              -- Authoritative lat
  canonical_longitude REAL,             -- Authoritative lng
  category TEXT,                        -- Primary category
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | MERGED | DEPRECATED
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### ProviderIdentity
```sql
CREATE TABLE provider_identity (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,               -- 'geoapify' | 'web_extraction' | 'google_maps' | 'user_provided'
  provider_record_id TEXT NOT NULL,     -- ChIJ..., cid:..., URL
  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution_method TEXT NOT NULL,      -- 'first_observation' | 'same_entity_match' | 'manual'
  resolution_confidence REAL,           -- 0-1
  UNIQUE(provider, provider_record_id)
);
```

#### ResolutionRecord
```sql
CREATE TABLE resolution_record (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  match_score REAL NOT NULL,            -- -1.0 to 1.0
  match_type TEXT NOT NULL,             -- 'same_entity' | 'uncertain' | 'different_entity' | 'same_brand_different_location'
  provider_a TEXT NOT NULL,
  provider_record_id_a TEXT,
  provider_b TEXT NOT NULL,
  provider_record_id_b TEXT,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending_review', -- 'pending_review' | 'confirmed' | 'dismissed' | 'merged'
  confidence REAL,                      -- 0-1
  notes TEXT
);
```

#### CanonicalField (Phase 4)
```sql
CREATE TABLE canonical_field (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,             -- 'identity.name', 'contact.phone', etc.
  value TEXT NOT NULL,
  provenance TEXT NOT NULL,             -- 'verified' | 'discovered' | 'identified' | 'user_provided' | 'inferred'
  confidence REAL NOT NULL,
  source_id TEXT REFERENCES source(id) ON DELETE SET NULL,
  claim_id TEXT REFERENCES claim(id) ON DELETE SET NULL,
  resolved_at TEXT,
  superseded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_id, field_path)
);
```

#### Observation (Phase 4)
```sql
CREATE TABLE observation (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_record_id TEXT,
  field_path TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT,
  provenance TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_id TEXT REFERENCES source(id) ON DELETE SET NULL,
  claim_id TEXT REFERENCES claim(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### Source (Phase 4)
```sql
CREATE TABLE source (
  id TEXT PRIMARY KEY,
  url TEXT,
  domain TEXT,
  provider TEXT,
  source_type TEXT NOT NULL DEFAULT 'other',  -- 'official_website' | 'structured_provider' | 'search_result' | 'directory' | 'review_platform' | 'news' | 'social' | 'user_provided' | 'ai_inference' | 'other'
  authority REAL NOT NULL DEFAULT 0.5,        -- 0-1
  is_primary INTEGER NOT NULL DEFAULT 0,
  retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  updated_at TEXT,
  metadata TEXT  -- JSON
);
```

#### Evidence (Phase 4)
```sql
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  value TEXT NOT NULL,
  excerpt TEXT,
  location TEXT,                         -- JSON: {xpath, cssSelector, lineNumber}
  extracted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  extraction_method TEXT NOT NULL DEFAULT 'unknown',  -- 'schema.org' | 'microdata' | 'openGraph' | 'visibleText' | 'aiExtraction' | 'apiResponse'
  metadata TEXT                          -- JSON
);
```

#### Claim (Phase 4)
```sql
CREATE TABLE claim (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT,
  claim_type TEXT NOT NULL DEFAULT 'fact',    -- 'fact' | 'observation' | 'inference'
  confidence REAL NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified',  -- 'verified' | 'supported' | 'unverified' | 'conflicted' | 'refuted'
  temporal_retrieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  temporal_published_at TEXT,
  temporal_observed_at TEXT,
  temporal_last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### Conflict (Phase 4)
```sql
CREATE TABLE conflict (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  values TEXT NOT NULL,                  -- JSON: [{value, source, provider, provenance, confidence, sourceId, claimId}]
  status TEXT NOT NULL DEFAULT 'conflicted',  -- 'conflicted' | 'resolved' | 'dismissed'
  resolution_strategy TEXT,              -- 'authority_wins' | 'most_recent' | 'highest_confidence' | 'manual_review' | 'preserve_all'
  resolution_reason TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### ReviewItem (Phase 15)
```sql
CREATE TABLE review_item (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,       -- Deterministic: provider records + entity + matchType
  entity_id TEXT NOT NULL REFERENCES business_entity(entity_id) ON DELETE CASCADE,
  related_entity_id TEXT,
  provider TEXT,
  provider_record_id TEXT,
  related_provider TEXT,
  related_provider_record_id TEXT,
  match_type TEXT NOT NULL,              -- 'same_brand_different_location' | 'relocated_entity' | 'uncertain'
  match_score REAL,
  reason TEXT,
  evidence TEXT,                         -- JSON: structured signals
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT
);
```

#### Lead (Application)
```sql
CREATE TABLE lead (
  id TEXT PRIMARY KEY,                   -- UUID
  payload TEXT NOT NULL,                 -- Full lead JSON
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### Team & Auth (New for MVP)
```sql
CREATE TABLE team (
  id TEXT PRIMARY KEY,                   -- 'tim_abc123'
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',  -- 'starter' | 'professional' | 'agency'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_member (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,                 -- 'usr_xyz789'
  role TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'admin' | 'member'
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

CREATE TABLE api_key (
  id TEXT PRIMARY KEY,                   -- 'key_abc123'
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,                -- bcrypt hash
  prefix TEXT NOT NULL,                  -- 'wl_live_abc...' (first 12 chars for display)
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE usage_log (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  api_key_id TEXT REFERENCES api_key(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Intelligence Output Schemas

### Brand DNA (BrandStrategyService.generateBrandDNA)
```typescript
interface BrandDNA {
  businessIdentity: {
    name: string;
    category: string;
    subcategory: string | null;
    businessModel: 'B2C' | 'B2B' | 'B2B2C';
    stage: 'startup' | 'growing' | 'established';
    essence: string;                      // One-line description
  };
  audience: {
    primary: {
      segment: string;
      demographics: { ageRange: string | null; income: string | null; location: string };
      psychographics: { values: string[]; lifestyle: string | null };
      confidence: number;                 // 0-1
    };
    secondary: Array<{ segment: string; importance: 'low' | 'medium' | 'high' }>;
  };
  customerIntent: Array<{
    intent: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    frequency: 'one-time' | 'recurring' | 'seasonal';
  }>;
  painPoints: Array<{
    pain: string;
    severity: 'low' | 'medium' | 'high';
    source: 'inferred' | 'verified';
  }>;
  purchaseTriggers: Array<{
    trigger: string;
    type: 'emotional' | 'practical' | 'social' | 'urgent';
    strength: 'weak' | 'moderate' | 'strong';
  }>;
  services: {
    core: Array<{ service: string; description: string; verified: boolean }>;
    highValue: Array<{ service: string; reasoning: string; estimatedValue: string | null }>;
    suggested: Array<{ service: string; rationale: string; confidence: number }>;
  };
  competitiveAdvantages: Array<{
    advantage: string;
    category: 'quality' | 'price' | 'convenience' | 'expertise' | 'trust';
    verified: boolean;
    evidence: string | null;
  }>;
  trustSignals: Array<{
    signal: string;
    type: 'rating' | 'reviews' | 'certification' | 'years' | 'social_proof';
    value: any;
    verified: boolean;
    source: string;
  }>;
  brandPersonality: {
    primary: string[];                    // 3-5 traits
    secondary: string[];                  // 2-3 traits
    avoid: string[];                      // Traits to avoid
    archetype: string | null;             // Hero, Caregiver, Creator, etc.
  };
  toneOfVoice: {
    characteristics: string[];
    doUse: string[];
    dontUse: string[];
    formality: 'casual' | 'conversational' | 'professional' | 'formal';
  };
  visualDirection: {
    mood: string;
    colorPalette: { primary: string | null; secondary: string | null; reasoning: string };
    imagery: { style: string; subjects: string[]; avoid: string[] };
    typography: { style: string; reasoning: string };
  };
  positioning: {
    statement: string;                    // "For [target] who [need], [business] is [category] that [benefit] unlike [competition]"
    differentiation: string;
    pricePosition: 'budget' | 'value' | 'premium' | 'luxury';
    marketPosition: 'challenger' | 'leader' | 'niche' | 'specialist';
  };
  websiteObjectives: Array<{
    objective: string;
    priority: 'primary' | 'secondary' | 'tertiary';
    metrics: string[];
  }>;
  conversionStrategy: {
    primaryCTA: { action: string; text: string; reasoning: string; placement: string[] };
    secondaryCTA: { action: string; text: string; reasoning: string };
    microConversions: Array<{ action: string; purpose: string }>;
  };
  strategicRecommendations: Array<{
    recommendation: string;
    category: 'digital' | 'branding' | 'service' | 'marketing';
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
  }>;
  confidence: {
    overall: number;                      // 0-1
    notes: string;
  };
  metadata: {
    generatedAt: string;
    version: string;
    latency: number;
    sourceDataQuality: { score: number; rating: string; missingData: string[] };
  };
}
```

### Digital Audit (DigitalAuditService.auditDigitalPresence)
```typescript
interface DigitalAudit {
  websiteExists: boolean;
  websiteUrl: string | null;
  lastChecked: string;                    // ISO
  overallScore: number;                   // 0-10 (mean of categories)
  categories: {
    design: CategoryScore;
    mobile: CategoryScore;
    navigation: CategoryScore;
    conversion: CategoryScore;
    trust: CategoryScore;
    seo: CategoryScore;
    localSeo: CategoryScore;
    content: CategoryScore;
    branding: CategoryScore;
    performance: CategoryScore;
    contactAccessibility: CategoryScore;
  };
  strengths: Array<{ area: string; description: string; impact: 'high' | 'medium' | 'low' }>;
  weaknesses: Array<{ area: string; description: string; severity: 'critical' | 'high' | 'medium' | 'low' }>;
  criticalIssues: Array<{ issue: string; impact: string; recommendation: string; priority: 'immediate' | 'urgent' | 'high' }>;
  recommendations: Array<{ category: string; recommendation: string; expectedImpact: 'high' | 'medium' | 'low'; effort: 'low' | 'medium' | 'high'; priority: number }>;
  opportunityGap: {
    description: string;
    businessImpact: string;
    competitivePosition: 'behind' | 'average' | 'ahead';
  };
  dataLimitations: string[];
  metadata: {
    auditedAt: string;
    version: string;
    latency: number;
    hasWebsite: boolean;
    degraded?: boolean;
    degradedReason?: string;
  };
}

interface CategoryScore {
  score: number;                          // 0-10
  notes: string;
  verified: boolean;                      // true = based on verified evidence
}
```

### Website Spec (LeadWebsiteSpecService.generate)
```typescript
interface WebsiteSpec {
  slug: string;
  pages: string[];                        // ['home', 'services', 'about', 'contact']
  designSystem: {
    style: string;
    colorPalette: { primary: string; secondary: string; accent: string; background: string; surface: string; text: string; muted: string };
    typography: { headingFont: string; bodyFont: string };
    borderRadius: string;
    spacing: string;
  };
  contentStrategy: {
    hero: { headline: string; subheadline: string; cta: { text: string; action: string } };
    services: Array<{ name: string; description: string; icon: string }>;
    proof: { rating: number; reviewCount: number; testimonial: string };
    about: { story: string; values: string[] };
    contact: { phone: string; email: string; address: string; hours: Record<string, string> };
  };
  metadata: {
    generatedAt: string;
    version: string;
  };
}
```

### Report (ReportGenerationService)
```typescript
interface Report {
  reportId: string;
  leadId: string;
  format: 'pdf' | 'html';
  sections: ReportSection[];
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    agencyName: string;
  };
  generatedAt: string;
  expiresAt: string;
}

type ReportSection = 
  | { type: 'overview'; data: CanonicalBusinessProfile }
  | { type: 'verifiedIntel'; data: VerifiedIntelSection }
  | { type: 'audit'; data: DigitalAudit }
  | { type: 'opportunities'; data: Opportunity[] }
  | { type: 'recommendations'; data: Recommendation[] }
  | { type: 'nextSteps'; data: NextStep[] };

interface VerifiedIntelSection {
  fields: Array<{
    path: string;                         // 'identity.name', 'contact.phone'
    value: any;
    provenance: string;
    confidence: number;
    source: string;
  }>;
}

interface Opportunity {
  observedProblem: string;
  evidence: { source: string; excerpt: string };
  businessImplication: string;
  suggestedImprovement: string;
  priority: 'high' | 'medium' | 'low';
}

interface Recommendation {
  category: string;
  recommendation: string;
  expectedImpact: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  priority: number;
}

interface NextStep {
  step: number;
  action: string;
  owner: string;
  timeline: string;
}
```

---

## 4. Request/Response Schemas (Referenced from API_CONTRACTS.md)

### POST /leads Request
```json
{
  "googleMapsUrl": "string (required, Google Maps URL)",
  "leadName": "string (optional, max 200)",
  "internalNotes": "string (optional, max 2000)",
  "customInstructions": "string (optional, max 2000)",
  "forceRefresh": "boolean (optional, default true)"
}
```

### POST /leads/bulk Request
```csv
googleMapsUrl,leadName,internalNotes,customInstructions
https://maps.google.com/place/ChIJ...,Joe's Bakery,Referral,Focus on SEO
```

### POST /reports Request
```json
{
  "leadId": "string (required)",
  "format": "pdf|html",
  "branding": {
    "logoUrl": "string (optional)",
    "primaryColor": "string (optional, hex)",
    "agencyName": "string (optional)"
  },
  "sections": "string[] (optional, default all)"
}
```

---

## 5. Field Mapping: Runtime → Persistent → API

| Runtime (Canonical) | Persistent (BusinessEntity) | API Response |
|---------------------|----------------------------|--------------|
| `identity.name` | `canonical_name` | `businessName` |
| `identity.category` | `category` | `businessCategory` |
| `identity.coordinates` | `canonical_latitude`, `canonical_longitude` | `location.coordinates` |
| `identity.phone` | `canonical_phone` | `contact.phone` |
| `identity.website` | `canonical_website` | `contact.website` |
| `identity.address` | `canonical_address` | `location.address` |
| `identity.addressComponents` | — | `location.city/state/country/postalCode` |
| `business.reputation` | — | `businessData.reputation` |
| `business.services` | — | `businessData.services` |
| `business.hours` | — | `businessData.openingHours` |
| `providers[]` | `provider_identity` join | `analysis.metrics.source.providers` |

---

## 6. Migration Notes

### From Current (P1.3) to MVP
- `BusinessProfile` → remains runtime canonical store
- `CanonicalBusinessProfileService.fromEntityData()` → unchanged, reads from `BusinessEntity` + `CanonicalField`
- `EvidenceModels` (Source/Evidence/Claim/Conflict) → extended for Phase 4 audit trail
- `lead` table → add `team_id` foreign key
- New tables: `team`, `team_member`, `api_key`, `usage_log`

### Backwards Compatibility
- `BusinessProfile.toObject()` → still works for existing consumers
- `lead` payload JSON → unchanged structure, new fields optional
- API v1 endpoints → deprecated but functional for 90 days

---

## References

- `apps/api/src/services/BusinessProfile.js` — Runtime provenance store
- `apps/api/src/services/CanonicalBusinessProfileService.js` — Projection
- `apps/api/src/services/EvidenceModels.js` — Phase 4 models
- `apps/api/src/services/EntityResolution.js` — Resolution logic
- `apps/api/src/services/BrandStrategyService.js` — Brand DNA output
- `apps/api/src/services/DigitalAuditService.js` — Audit output
- `apps/api/src/services/LeadWebsiteSpecService.js` — Website spec output
- `apps/api/src/db/schema.js` — Drizzle schema definitions
- `apps/api/src/routes/leads.js` — Lead persistence
- `AUDIT-REPORT.md` — P1.1 canonical profile audit findings