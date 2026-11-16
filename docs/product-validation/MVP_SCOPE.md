# Webloom 2.0 — MVP Scope

## 1. MVP Feature Definitions (A-E)

### Feature A: Prospect Intelligence
**Core capability: Multi-source business extraction with provenance**

| Aspect | Specification |
|--------|---------------|
| **Inputs** | Google Maps URL (validated by `validateGoogleMapsUrl` in `NewLead.tsx` + `BusinessDataExtractor.validateGoogleMapsUrl`), official website URL (optional override), CSV batch (new endpoint) |
| **Outputs** | **Identity:** `name`, `category`, `business_type`, `description`, `categories[]` |
| | **Contact:** `phone` (E.164 normalized), `email`, `website` (domain normalized) |
| | **Location:** `full_address`, `city`, `state`, `postal_code`, `country`, `coordinates{lat,lng}` |
| | **Reputation:** `rating` (0-5), `review_count`, `reviews[{author,rating,text,date}]` |
| | **Source Attribution:** `providerTrace{geoapify, webExtraction, officialWebsite}` with status, latency, record counts |
| | **Confidence/Verification:** Per-field `provenance` (verified/discovered/identified/user_provided/inferred/ai_generated) + `confidence` (0-1) from `BusinessProfile` |
| **Implementation** | `BusinessResearchService.extractBusinessIntelligenceWithProviders()` pipeline: |
| | - L1: `extractDeterministicHints()` → `GoogleMapsUrlParserProvider.parse()` (IDENTIFIED) |
| | - L2: `GeoapifyProvider.search()` → `selectBestRecord()` → `enrichRecord()` → `mapGeoapifyFeatureToProfile()` (DISCOVERED) |
| | - L3: `WebExtractionProvider` → `BusinessDataExtractor.extractFromGoogleMapsUrl()` (DISCOVERED + AI_GENERATED) |
| | - L3.5: `extractFromDirectGoogleMapsHtml()` fallback (DISCOVERED) |
| | - L3.8: `OfficialWebsiteProvider.extract()` (VERIFIED) |
| | - `CandidatePipeline.runCandidatePipeline()` → validation gates → `applyToProfile()` |
| | - `CanonicalBusinessProfileService.fromEntityData()` → unified projection |
| | - `EntityResolution.calculateMatchScore()` for cross-provider identity matching |
| **Provenance Requirement** | Every field in output has `provenance` + `confidence` from `BusinessProfile.set()` |
| | Provenance tiers (higher wins): `user_provided(5)` > `verified(4)` > `discovered(3)` > `identified(2)` > `inferred(1)` > `ai_generated(0.5)` |
| | **P1.2 AI Quarantine:** `ai_generated` (0.5) can NEVER overwrite `identified` (2) / `discovered` (3) / `verified` (4) for identity fields (name, phone, website, address, coordinates) — enforced in `BusinessProfile.merge()` conflict resolution |
| **No Manufacturing** | `BusinessProfile.set()` never promotes `ai_generated` above authoritative tiers |
| | `_persistIdentity()` never inserts `'Unknown Business'` / `'Unknown'` — returns insufficient evidence instead (P1.1 audit finding) |
| | `calculateMatchScore` reads `business.name` (Geoapify) AND `identity.name` (WebExtraction) — name gap fixed |

---

### Feature B: Digital Presence Audit
**Core capability: Evidence-based website assessment with honest degraded mode**

| Aspect | Specification |
|--------|---------------|
| **Analyzes** | **Website availability:** `contact.website` exists (canonical projection) |
| | **Mobile usability:** `DesignIntelligenceService` viewport checks (responsive breakpoints) |
| | **Performance:** Core Web Vitals proxy (TTFB, resource sizes) — needs implementation |
| | **SEO fundamentals:** Meta tags, headings, structured data (extracted by `BusinessDataExtractor.extractMetadata()`) |
| | **Metadata:** JSON-LD (`extractJsonLd`), OpenGraph (`extractOpenGraph`), Microdata (`extractMicrodata`) |
| | **Content quality:** AI extraction completeness, readability, keyword coverage |
| | **Contact accessibility:** Phone/email/address visibility, click-to-call, maps link |
| | **Conversion opportunities:** CTA detection (buttons, forms, booking links), funnel clarity |
| | **Reputation signals:** `GoogleMapsReputationExtractor` — rating, review_count, review sentiment |
| | **Missing elements:** `identifyUnknowns()` → actionable gaps |
| **Distinguishes** | **Verified findings:** `provenance=verified` (official website crawl) |
| | **Observations:** `provenance=discovered` (Geoapify, Google Maps) |
| | **Inferences:** `provenance=inferred` / `ai_generated` (AI analysis) |
| | **Recommendations:** `strategicRecommendations` (BrandStrategyService) |
| | **Unknowns:** `identifyUnknowns()` output — explicitly not fabricated |
| **No Precise Scores Without Methodology** | `DigitalAuditService.auditDigitalPresence()` currently returns 0-10 scores per category |
| | **MVP requirement:** Document scoring methodology OR mark categories as "needs defensible methodology" |
| | Degraded mode: `generateDegradedAudit()` when AI fails but website exists — honest "not scored" |
| | No website: `generateNoWebsiteAudit()` — deterministic zeros with actionable recommendations |
| **Implementation** | `DigitalAuditService.auditDigitalPresence(businessData)` — currently independent AI call |
| | **MVP refactor:** Consume shared `BusinessResearchDossier` (unified extraction output) instead of re-fetching |
| | Prompt: `apps/api/src/prompts/digitalAudit.js` — `DIGITAL_AUDIT_PROMPT` |
| | Output schema: 11 categories + strengths/weaknesses/criticalIssues/recommendations/opportunityGap |

---

### Feature C: Opportunity Identification
**Core capability: Evidence-backed improvement recommendations with business impact**

| Aspect | Specification |
|--------|---------------|
| **Opportunity Types** | **Website missing:** `contact.website === null` (canonical) |
| | **Poor mobile:** `DesignIntelligenceService` responsive checks fail |
| | **Missing contact CTA:** `BusinessDataExtractor` CTA detection (buttons, tel: links, forms) |
| | **Weak metadata:** `metadata.hasJsonLd === false`, `hasOpenGraph === false`, `hasMicrodata === false` |
| | **Incomplete business info:** `unknowns` array from `identifyUnknowns()` — missing phone, hours, services |
| | **Poorly structured services:** `services` array empty or generic |
| | **Missing booking:** `booking_url === null`, no Calendly/Typeform/Form detected |
| | **Weak reputation:** `rating < 4.0` OR `review_count < 10` (GoogleMapsReputationExtractor) |
| | **No social proof:** `social_links` empty, no testimonials/reviews on site |
| **Recommendation Structure** | Each opportunity: |
| | - `observedProblem` — audit finding (e.g., "No meta description on homepage") |
| | - `evidence` — source + excerpt (e.g., "BusinessDataExtractor metadata: hasOpenGraph=false") |
| | - `businessImplication` — revenue/lead loss estimate (e.g., "Missing OG tags reduces social click-through ~30%") |
| | - `suggestedImprovement` — specific action (e.g., "Add og:title, og:description, og:image to homepage") |
| | - `priority` — high/medium/low based on impact × effort matrix |
| **No Fabrication** | Opportunities ONLY from actual audit findings: |
| | - `DigitalAuditService.audit.opportunityGap` |
| | - `BrandStrategyService.brandDNA.strategicRecommendations` |
| | - `DigitalAuditService.audit.weaknesses` + `criticalIssues` |
| | - `identifyUnknowns()` output |
| **Implementation** | `BrandStrategyService.generateBrandDNA()` → `strategicRecommendations[{recommendation, category, impact, effort}]` |
| | `DigitalAuditService.auditDigitalPresence()` → `audit.opportunityGap{description, businessImpact, competitivePosition}` |
| | **New:** Opportunity synthesis service consuming shared dossier → unified opportunity list |

---

### Feature D: Agency-Ready Reports
**Core capability: Branded, evidence-cited deliverables in HTML + PDF**

| Aspect | Specification |
|--------|---------------|
| **Report Sections** | 1. **Business Overview** — canonical identity (name, category, location, contact) |
| | 2. **Verified Information** — fields with `provenance=verified/discovered`, source citations |
| | 3. **Digital Presence Assessment** — audit scores + methodology notes |
| | 4. **Evidence-Backed Findings** — `EvidenceModels.Claim` + `EvidenceModels.Evidence` with `sourceId` |
| | 5. **Improvement Opportunities** — Feature C output with priority |
| | 6. **Recommended Services** — mapped to agency offerings (website, SEO, GBP, reputation, content) |
| | 7. **Suggested Next Steps** — outreach sequence, timeline, owner |
| **Formats** | **HTML:** `WebsiteGenerationService` + `GeneratedSiteManager` repurposed |
| | - Astro template in `apps/api/templates/` → copy to `generated-sites/{slug}/` |
| | - `site.config.json` with report data → `npm install && astro build` |
| | - Served via `GeneratedSiteManager.start(slug, port)` for preview |
| | **PDF:** Puppeteer/Playwright from generated HTML |
| | - `puppeteer.launch()` → `page.pdf({format: 'A4', printBackground: true})` |
| | - Header/footer with agency branding, page numbers |
| **Branded** | Agency logo, colors, typography from `apps/web/tailwind.config.js` |
| | Custom CSS variables: `--primary`, `--ai`, `--verified`, `--opportunity` |
| | White-label: agency subdomain, custom domain (P2) |
| **Implementation** | **Repurpose:** `WebsiteGenerationService.generate(business, {designIntelligence: reportConfig})` |
| | **New:** `ReportGenerationService` orchestrates: |
| | - Dossier → report config → Astro build → HTML → PDF |
| | - `GeneratedSiteManager` handles template copy, config write, build, serve |
| | - `apps/api/src/services/AssetGenerationService.js` for PDF generation |

---

### Feature E: Personalized Sales Assets
**Core capability: Grounded, editable sales collateral**

| Aspect | Specification |
|--------|---------------|
| **Outreach Email** | `SalesOutreachService.generateOutreachEmail(lead)` — exists but minimal |
| | Personalized with: business name, category, specific findings (audit + opportunities) |
| | Editable preview → copy to clipboard / send via mailto |
| **Value Proposition** | `BrandStrategyService.brandDNA.positioning.statement` + `differentiation` |
| | Editable: "For [audience] who [need], [business] is [category] that [benefit] unlike [competition]" |
| **Website Improvements** | `DigitalAuditService.audit.recommendations` → prioritized by impact×effort |
| | `DesignIntelligenceService` suggestions for design system, UX, conversion |
| | Each tied to evidence: "Add meta description (source: BusinessDataExtractor metadata.hasOpenGraph=false)" |
| **Website Concept/Mockup** | `LeadWebsiteSpecService.generate(business, brandDNA, audit)` → spec |
| | `DesignIntelligenceService.generateDesignIntelligence()` → `designSystem` + `contentStrategy` |
| | Simplified `WebsiteGenerationService` → single-page mockup (hero, services, proof, CTA) |
| | NOT full site build — concept only for proposal |
| **Grounding** | Every claim references `EvidenceModels.Claim` with `sourceId` → `EvidenceModels.Evidence` |
| | No generic AI language: prompt templates in `apps/api/src/prompts/` use `{{EVIDENCE_PLACEHOLDERS}}` |
| **Implementation** | `SalesOutreachService` (extend), `BrandStrategyService` (reuse), `LeadWebsiteSpecService` (reuse) |
| | **New:** `SalesAssetService` orchestrates editable previews, versioning, export |

---

## 2. Explicit Out-of-Scope List (D-05)

| Item | Why Out of Scope | When It Might Return |
|------|------------------|----------------------|
| **Full CRM** | Core product is intelligence + sales assets, not pipeline management | P2 — after validation, if pilots demand deal tracking |
| **HubSpot/Pipedrive/Close Integration** | Integration surface area large; validate demand first | P2 — after 5+ pilots request specific CRM |
| **Advanced Team Management/RBAC** | MVP is single-user or simple team; complex perms premature | P3 — when >10 agencies on platform |
| **Website Hosting Infrastructure** | Different product (ops-heavy, commoditized); Webloom generates specs | P3 — if agencies ask "can you host this?" at scale |
| **Full Website Builder** | Different product (editor, CMS, themes); Webloom generates specs | P3 — if "generate spec" → "build it for me" demand emerges |
| **AI Fine-tuning** | Cost/benefit unclear; prompt engineering + RAG works for MVP | P3 — if >10K analyses/month and quality gap measured |
| **Autonomous Outreach** | Regulatory risk (CAN-SPAM, GDPR), brand safety | P3 — if explicit opt-in workflows designed |
| **Marketplace (agency ↔ freelancer)** | Two-sided marketplace complexity; focus on agency tool first | P3 — if network effects become primary value |
| **Advanced Analytics (cohort, funnel, attribution)** | MVP needs actionable reports, not dashboards | P2 — after agencies ask "which reports convert?" |

---

## 3. Priority Classification Framework

| Priority | Definition | MVP Examples |
|----------|------------|--------------|
| **P0** | Required before customer demonstrations (core value prop works) | Single extraction (A), Digital audit (B), HTML report (D), Basic outreach email (E) |
| **P1** | Required before paid pilots (agency workflow complete) | CSV import, PDF export, Branded reports, Opportunity scoring (C), Website mockup (E) |
| **P2** | Required after initial validation (scale + retention) | CRM-lite, CRM integrations, Team seats, API access, Advanced analytics |
| **P3** | Future opportunities (new product lines) | Hosting, Builder, Marketplace, Fine-tuning, Autonomous outreach |

---

## 4. Cross-Feature Dependencies

```
A (Intelligence) ──┬──→ B (Audit) ──┬──→ C (Opportunities) ──┬──→ D (Reports)
                   │                │                        │
                   └──→ E (Assets) ←┘                        │
                                                          ↓
                                                    E (Assets) ←── D (Reports)
```

- **A → B:** Audit consumes shared dossier (not re-fetch)
- **A + B → C:** Opportunities synthesized from intelligence + audit
- **A + B + C → D:** Reports compose all findings
- **A + B + C → E:** Assets use same evidence base

---

## 5. Acceptance Criteria Per Feature

| Feature | Must Pass |
|---------|-----------|
| **A** | 5/5 test businesses extract with correct provenance; `ai_generated` never on identity; CSV 50 rows processes |
| **B** | Audit returns 11 categories; degraded mode honest; no website → actionable recs; methodology documented |
| **C** | Every opportunity has evidence + businessImplication; no fabricated gaps; priority matrix applied |
| **D** | HTML report renders with agency branding; PDF exports; evidence citations link to sources |
| **E** | Outreach email editable; value prop uses brandDNA; website mockup single-page; all claims grounded |

---

## References

- `apps/api/src/services/BusinessResearchService.js` — `extractBusinessIntelligenceWithProviders`, `extractDeterministicHints`, `_mergeCanonical`, `_enrichMissingWithAI`, `_persistIdentity`
- `apps/api/src/services/BusinessProfile.js` — `set()`, `merge()`, `getProvenanceBreakdown()`, `getCompleteness()`, conflict resolution
- `apps/api/src/services/CanonicalBusinessProfileService.js` — `fromEntityData()` projection
- `apps/api/src/services/EntityResolution.js` — `calculateMatchScore()`, `normalizePhone()`, `resolvePhoneSignal()`
- `apps/api/src/services/CandidatePipeline.js` — `runCandidatePipeline()`, validation gates
- `apps/api/src/services/DigitalAuditService.js` — `auditDigitalPresence()`, `generateDegradedAudit()`, `generateNoWebsiteAudit()`
- `apps/api/src/services/BrandStrategyService.js` — `generateBrandDNA()`, `assessDataQuality()`, `extractKeyInsights()`
- `apps/api/src/services/GoogleMapsReputationExtractor.js` — `extract()`, structured reputation
- `apps/api/src/services/OfficialWebsiteProvider.js` — `extract()`, VERIFIED provenance
- `apps/api/src/services/WebsiteGenerationService.js` — `generate()`, `assembleConfig()`, `extractFacts()`
- `apps/api/src/services/GeneratedSiteManager.js` — `copyTemplate()`, `writeConfig()`, `runBuild()`, `start()`
- `apps/api/src/services/LeadWebsiteSpecService.js` — `generate()`
- `apps/api/src/services/SalesOutreachService.js` — `generateOutreachEmail()`
- `apps/api/src/services/DesignIntelligenceService.js` — `generateDesignIntelligence()`
- `apps/api/src/services/AssetGenerationService.js` — asset pipeline
- `apps/api/src/services/EvidenceModels.js` — `Source`, `Evidence`, `Claim`, `Conflict`
- `apps/api/src/prompts/digitalAudit.js` — `DIGITAL_AUDIT_PROMPT`
- `apps/api/src/prompts/brandStrategy.js` — `BRAND_STRATEGY_PROMPT`
- `apps/web/src/pages/NewLead.tsx` — `validateGoogleMapsUrl`, `handleSubmit`, progress steps
- `apps/web/src/pages/LeadDetail.tsx` — tabs, mutations, `OpportunityInsights`, `MissingIntelligence`
- `apps/web/src/components/OpportunityInsights.tsx` — opportunity rendering