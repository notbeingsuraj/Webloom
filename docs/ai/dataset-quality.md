# Dataset Quality — v0.1.0

Generated 2026-10-06 by `node eval/dataset_report.js`.

## Composite quality score: **0.986**

| Dimension | Score | Weight |
| --- | --- | --- |
| Contract + validation compliance | 1.000 | 0.30 |
| Gold self-grounding (extraction) | 1.000 | 0.20 |
| Evidence presence | 1.000 | 0.10 |
| UNKNOWN abstention coverage | 1.000 | 0.10 |
| Task balance (train) | 0.857 | 0.10 |
| Failure-category coverage | 1.000 | 0.10 |
| Split coverage (val + holdout) | 1.000 | 0.10 |

## Scale

- Training examples: **14**
- Validation examples: **6**
- Holdout examples: **6**
- Distinct businesses: **8**

| Task | Train | Validation | Holdout |
| --- | --- | --- | --- |
| brand.dna | 3 | 1 | 1 |
| extraction.business_profile | 4 | 2 | 2 |
| strategy.landing_page | 2 | 0 | 1 |
| strategy.website | 2 | 1 | 1 |
| website.analysis | 3 | 2 | 1 |

## Failure-category coverage (baseline → train)

- **schema-nested-generative** — Nested generative structure (brand.dna / strategy) that the baseline flattened or envelope-wrapped: dna-tartine-001, dna-manan-001, dna-aster-001, strat-tartine-website-001, strat-manan-landing-001, strat-aster-website-001, strat-aster-landing-001
- **category-list** — identity.categories as a list (baseline collapsed to a single value): ext-tartine-001, ext-manan-001, ext-bloom-001, ext-aster-001
- **hours-as-string** — hours expressed as a plain string (baseline schema drift): ext-tartine-001, ext-bloom-001, ext-aster-001
- **unknown-abstention** — Sparse evidence with honest UNKNOWN envelopes (baseline invented values): ext-tartine-001, ext-manan-001, ext-bloom-001, ext-aster-001
- **website-exists-false** — websiteExists=false audits (baseline missed or invented a site): web-manan-001
- **provenance-enum-discipline** — Grounding-consistent provenance on every valued field: ext-tartine-001, ext-manan-001, ext-bloom-001, ext-aster-001

## Gates

- `node eval/dataset_validate.js` must exit 0 (leakage FAILs, malformed UNKNOWN envelopes FAIL, ungrounded gold FAIL).
- Holdout v0.1.0 is frozen; training additions are corrections promoted from the baseline benchmark.

Regenerate this report with `npm run ai:dataset:report`.
