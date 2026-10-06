# AI Baseline Benchmark — Report

_2026-10-06T14:54:19.139Z_

## Snapshot

- Examples: **10/15 ok** (66.67%), 5 failed
- Average latency: 7805ms/example

## Schema compliance

- Contract-compliant: **0/15** (0%)
- Raw (unrepaired) consumer-ready: **0/15** (0%)

## Grounding (grounded tasks)

- checked across 5 task output(s): grounded 63, unsupported 0, unverifiable 37

## Value-level accuracy

| task | examples | ok | precision | recall | f1 |
| --- | --- | --- | --- | --- | --- |
| extraction.business_profile | 5 | 5/5 | 0.8571 | 0.8182 | 0.8372 |

## Calibration

- 63 confidence pair(s); accuracy 0.8571; ECE 0.1333; Brier 0.1314
- mean confidence 0.9905; false-confidence rate 0.127

## Failure categories

| category | count |
| --- | --- |
| SCHEMA_ERROR | 15 |
| EXTRACTION_ERROR | 5 |
| CONFIDENCE_ERROR | 4 |
| HALLUCINATION | 2 |

## Failures
- **ext-skyline-001** (extraction.business_profile) [HIGH] EXTRACTION_ERROR, SCHEMA_ERROR, CONFIDENCE_ERROR
  - missed identity.categories (expected Dentist)
  - missed identity.business_type (expected family dentistry)
  - wrong identity.description: got Skyline Dental Studio provides gentle family dentistry in Portland. New patient … expected Skyline Dental Studio provides gentle family dentistry in Portland.
  - wrong identity.services: got New patient exams,Whitening,Invisalign expected New patient exams,whitening,Invisalign
  - missed contact.website (expected https://skylinedental.example)
  - $.identity.name.provenance: value not in enum
- **ext-bella-001** (extraction.business_profile) [CRITICAL] HALLUCINATION, EXTRACTION_ERROR, SCHEMA_ERROR, CONFIDENCE_ERROR
  - missed identity.business_type (expected Italian restaurant)
  - missed identity.services (expected handmade pasta)
  - hallucinated identity.products = handmade pasta
  - wrong hours: got [object Object] expected Tue-Sun 5pm-10pm
  - $.identity.name.status: value not in enum
- **dna-skyline-001** (brand.dna) [HIGH] SCHEMA_ERROR
  - audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
  - error: Task "brand.dna" failed post-validation: audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
- **web-skyline-001** (website.analysis) [HIGH] SCHEMA_ERROR
  - $: missing required property "websiteExists"
- **strat-skyline-website-001** (strategy.website) [HIGH] SCHEMA_ERROR
  - pages must be a non-empty array; homepageSections must be a non-empty array; primaryCTA requires text and action
  - error: Task "strategy.website" failed post-validation: pages must be a non-empty array; homepageSections must be a non-empty array; primaryCTA requires text and action
- **strat-bella-landing-001** (strategy.landing_page) [HIGH] SCHEMA_ERROR
  - $.pageTitle: expected type string, got object
- **ext-tartine-001** (extraction.business_profile) [CRITICAL] HALLUCINATION, EXTRACTION_ERROR, SCHEMA_ERROR, CONFIDENCE_ERROR
  - wrong identity.categories: got Bakery expected Breakfast,Bakery,Cafe
  - missed identity.business_type (expected artisan bakery)
  - wrong identity.description: got Tartine Bakery is an artisan bakery in San Francisco. We bake country bread and … expected Artisan bakery known for country bread and morning buns
  - wrong hours: got [object Object] expected Monday to Sunday, 7:30am to 4pm
  - hallucinated social_links = [object Object]
  - $.identity.name.provenance: value not in enum
- **ext-manan-001** (extraction.business_profile) [HIGH] EXTRACTION_ERROR, SCHEMA_ERROR
  - missed identity.categories (expected Furniture store)
  - missed identity.business_type (expected Furniture store)
  - missed identity.description (expected Furniture store — sofas, beds, wardrobes, dining tables)
  - $.identity.name.status: value not in enum
- **ext-bloom-001** (extraction.business_profile) [HIGH] EXTRACTION_ERROR, SCHEMA_ERROR, CONFIDENCE_ERROR
  - missed identity.categories (expected Coffee shop)
  - missed identity.business_type (expected Coffee shop)
  - missed identity.products (expected single-origin coffee)
  - wrong hours: got [object Object] expected 8am to 10pm, all week
  - $.identity.name.provenance: value not in enum
- **dna-tartine-001** (brand.dna) [HIGH] SCHEMA_ERROR
  - audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
  - error: Task "brand.dna" failed post-validation: audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
- **dna-manan-001** (brand.dna) [HIGH] SCHEMA_ERROR
  - audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
  - error: Task "brand.dna" failed post-validation: audience.primary is required; services.core must be a non-empty array; conversionStrategy.primaryCTA.text is required
- **web-tartine-001** (website.analysis) [HIGH] SCHEMA_ERROR
  - $: missing required property "websiteExists"
- **web-manan-001** (website.analysis) [HIGH] SCHEMA_ERROR
  - $: missing required property "websiteExists"
- **strat-tartine-website-001** (strategy.website) [HIGH] SCHEMA_ERROR
  - pages must be a non-empty array; homepageSections must be a non-empty array
  - error: Task "strategy.website" failed post-validation: pages must be a non-empty array; homepageSections must be a non-empty array
- **strat-manan-landing-001** (strategy.landing_page) [HIGH] SCHEMA_ERROR
  - $.pageTitle: expected type string, got object
