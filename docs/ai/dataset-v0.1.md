# Webloom AI — Dataset v0.1.0

State of the curated corpus after the baseline-driven growth pass.

## What changed in this pass

The v0.1.0 corpus grew from **9 train / 6 holdout** to **14 train / 6
validation / 6 holdout**:

- **+5 train** examples authored as corrections for the failures observed in
  the baseline benchmark (see [failure-analysis](failure-analysis.md)):
  - `ext-aster-001` — category list, `business_type`, hours-as-string, explicit
    UNKNOWNs (email/products/amenities) — targets under-extraction.
  - `dna-aster-001` — correct **nested** brand DNA (audience.primary,
    services.core[], conversionStrategy.primaryCTA) — targets shape transfer.
  - `web-aster-001` — `websiteExists: true` audit structure.
  - `strat-aster-website-001` / `strat-aster-landing-001` — correct
    `pages[]`, `homepageSections[]`, `primaryCTA{text, action}` and the five
    critical landing sections.
- **+6 validation** (new split `evaluation/validation/v0.1.0/`, businesses
  strictly disjoint from train **and** holdout):
  - `ext-loft-001` — clean, fully evidenced home-goods store.
  - `ext-redcedar-001` — **sparse** evidence (no website / email / description):
    gold is mostly UNKNOWN, teaching honest abstention.
  - `dna-redcedar-001` — nested DNA on sparse evidence.
  - `web-loft-001` — clean audit.
  - `web-redcedar-001` — `websiteExists: false` audit (the field the baseline
    dropped on every row).
  - `strat-loft-website-001` — corrected strategy structure.
- **22 corrections** recorded from the baseline failures into
  `datasets/corrections/corrections.jsonl` (source `evaluation`) via
  `npm run ai:corrections:baseline` — the raw material for future train
  promotion and fine-tuning.

The **holdout is untouched and frozen**.

## Composition

| task | train | validation | holdout |
|---|---|---|---|
| extraction.business_profile | 4 | 2 | 2 |
| brand.dna | 3 | 1 | 1 |
| website.analysis | 3 | 2 | 1 |
| strategy.website / strategy.landing_page | 4 | 1 | 2 |
| **total** | **14** | **6** | **6** |

Distinct businesses: 9 (5 train, 3 validation-only, 3 holdout, overlapping
across task files within a split; never across splits).

## Coverage of baseline failure categories

| category | train examples exercising it |
|---|---|
| schema-nested-generative | dna-aster, strat-aster-website, strat-aster-landing |
| category-list | ext-aster, ext-loft |
| hours-as-string | ext-aster, ext-loft |
| unknown-abstention | ext-redcedar, dna-redcedar (sparse) trained alongside aster corrections |
| website-exists-false | web-redcedar |
| provenance-enum-discipline | all extraction gold |

## Grounding rule (unchanged, enforced)

Every valued extraction field cites `evidence[0].text` that appears verbatim in
the example's input evidence. `ext-redcedar-001` demonstrates the abstention
form: fields the evidence cannot support are UNKNOWN envelopes
(`value: null, provenance: "unknown", status: "missing"`).

## Governance commands

```
npm run ai:dataset:validate    # structure + contract + grounding + leakage (FAILs on any error)
npm run ai:dataset:report      # quality score → docs/ai/dataset-quality.md (gate ≥ 0.85)
npm run ai:dataset:build       # deterministic generator for the 12 new examples
npm run ai:corrections:baseline# promote baseline failures → HITL store (idempotent)
```

Leakage is a hard failure: a business or exampleId in more than one split
aborts validation with a non-zero exit. Malformed UNKNOWN envelopes and
ungrounded gold also fail.

Current quality score: **0.986** (vs 0.85 gate) — see
[dataset-quality](dataset-quality.md).

## Known limitations

- Seed-scale: 26 examples is a format/harness proof, not a statistically
  meaningful holdout. The hallucination-rate gate (~0.02) needs thousands of
  field decisions (target ≈ 1,200+ examples in v0.2.0).
- Product-typed and geographic-non-US examples are still thin.
- Validation currently has no landing-page example and a single generative
  example per generative task.
- The strategy validation file mixes `strategy.website` only; a
  `strategy.landing_page` validation example should be added before v0.1.1.