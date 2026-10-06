# Webloom AI — Baseline Failure Analysis

Root-cause analysis of the baseline benchmark (see
[baseline-benchmark](baseline-benchmark.md)). Every defect below is tied to a
data or tooling response so the learning loop is explicit
(production → failure → correction → dataset → evaluation).

Source of truth: `baseline/failures.json` (per-example), `baseline/analysis.json`,
`baseline/metrics.json` (aggregates).

## Failure taxonomy

`eval/analyze.js` classifies each failed row into one or more categories:

| category | meaning |
|---|---|
| `FORMAT_ERROR` | output unparseable (fenced, trailing prose) even after repair |
| `SCHEMA_ERROR` | parsed but violates the task contract or post-validation |
| `EXTRACTION_ERROR` | envelope mismatch: miss (FN), wrong value (FP), hallucination |
| `HALLUCINATION` | a valued claim whose evidence cannot be produced |
| `CONFIDENCE_ERROR` | high confidence on a wrong value (false confidence) |
| `ENTITY_RESOLUTION_ERROR` | conflated or multi-entity value in a single field |
| `EVIDENCE_ERROR` / `CLASSIFICATION_ERROR` | evidence-handling / category-level errors |
| `UNKNOWN_HANDLING_ERROR` | model surfaced a value when gold requires abstention |

## Observed distribution

```
SCHEMA_ERROR         15  (in every row; the dominant failure)
EXTRACTION_ERROR      5  (all envelope tasks)
CONFIDENCE_ERROR      4  (high-confidence wrong values)
HALLUCINATION         2
```

## Root causes

### 1. The extraction contract is FLAT, the model treats it as nested

Webloom's extraction gold uses **flat dotted keys** (`identity.name`,
`contact.website`) — a 20-field envelope bag. The 7B model actually produces
this flat shape correctly; where it struggles is discipline at the **edges**:

- `provenance`/`status` enum drift — the model emits values the contract does
  not know, e.g. provenance `"google_maps_page, official_website"` or status
  `"found"`. The repair layer (`baselineRepair.js`) historically mis-classified
  this as unparseable; fixed to run keyword/schema validation on the **parsed
  object** (not a re-parse of the object string), so enum drift now surfaces as
  `schemaCompliant: false` with the actual value still recoverable.
- ``` ``json ``` `` fences around the payload — `extractJSONText` and the
  repair fence-stripper both handle these; format errors were rare.

### 2. Generative tasks get the extraction envelope convention imposed on them

`brand.dna` and `strategy.website` gold is **nested** (`audience.primary`,
`services.core[]`, `conversionStrategy.primaryCTA.text`). The model instead
emitted envelope-wrapped fields (`audience: {value: null, ...}`), so
post-validation rejected every generative row:

```
audience.primary is required
services.core must be a non-empty array
conversionStrategy.primaryCTA.text is required
pages must be a non-empty array
primaryCTA requires text and action
pageTitle: expected type string, got object
```

The repair pass re-nests flat dotted keys (`flat-renest`), which *is* the right
transformation for extraction — but the raw model output for these tasks was
envelope-shaped, not flat, so repair could not help. **Root problem: shape
transfer between the extraction convention and the generative convention.**

### 3. Over-confidence without calibration

Mean confidence **0.9905** against accuracy **0.8571**; ECE **0.1333**,
false-confidence rate **0.127** (13 of the 63 valued fields were ≥ 0.85 and
wrong). The model cannot self-report usable uncertainty. The confidence gate
must not trust raw self-reports for the baseline.

### 4. Extraction misses and mild hallucination

- Missed fields (FN): `identity.categories`, `identity.business_type`,
  `identity.description`, `contact.website`, `identity.products` — the model
  under-extracts exactly the fields the existing pipeline already had trouble
  with (category lists, business-type, description length).
- Hallucination: e.g. `identity.products = handmade pasta` for a trattoria
  (value derivable from context but not stated); `social_links` invented from
  an Instagram handle. Grounding enforced **0 unsupported → there were never
  fabricated *sources*** — the invented *values* still escape the unverifiable
  bucket because the claims are plausible.

### 5. Nondeterminism at temperature 0

`ext-bella-001` failed one run and passed a later run of the identical prompt.
Drop-in "fix verification" on a single example is unreliable; decisions must be
made on corpora, and a row that passes after repair must still show *stable*
envelope behavior.

## Response (data + tooling)

| cause | tooling | data |
|---|---|---|
| enum drift / fences | repair runs on parsed objects; `shape` metadata propagated in `inference` | provenance-safe gold everywhere (`dataset_validate.js` vocabulary gate) |
| nested-vs-flat transfer | — | `dna-aster-001`, `strat-aster-website-001`, `strat-aster-landing-001` (train): correct nested generative gold |
| under-extraction | — | `ext-aster-001`, `ext-loft-001` (category lists, hours-as-string, description), `ext-redcedar-001` (abstention) |
| hallucinated values | grounding enforce recorded per row | `ext-redcedar-001`, `web-redcedar-001`: sparse/no-website gold teaching abstention |
| missing `websiteExists` | — | `web-redcedar-001` (`websiteExists: false` audit gold) |
| over-confidence | calibrationReport → ECE/Brier/false-confidence in `metrics.json` | high-confidence gold confirmed in curator pass |

Each failure is also promoted to the HITL correction store via
`npm run ai:corrections:baseline` (22 corrections, source `evaluation`,
deduplicated), ready for review and promotion into train splits.

## Open questions

- Should the generative contracts become sequence-aware (allow flat dotted
  keys for nested docs) or must we rely on prompt + few-shot anchoring?
  Decision deferred until a prompt-anchored rerun measures the delta.
- `UNKNOWN_HANDLING_ERROR` is classified but was added after this run's
  artifacts; a rerun of `eval/analyze.js` on the existing reports will add it
  to `categoryCounts`. Re-run the analysis before the next benchmark if counts
  matter to a promotion decision.