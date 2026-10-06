# Webloom AI — Architecture

This document describes the AI layer added as the foundation for a fine-tuned
Webloom model. Everything here is additive: the existing production pipeline
(`services/AIService.js`, `services/ai/*`, the field-candidate extractors) is
untouched except for one optional wiring point described in the
Hallucination-Guard section.

## Module layout

New code lives under `apps/api/src/ai/` (the AI task layer) plus repo-root
directories for data and training artifacts.

```
apps/api/src/ai/
├── WebloomAI.js        # single entry: task input → provider → validate → ground → result
├── tasks.js            # formal task registry (id, contract, prompt, grounding, postValidate)
├── instance.js         # shared singleton
├── contracts/
│   ├── common.js       # envelope schema, provenance vocab, AIInferenceResult schema
│   └── index.js        # seven task contracts (JSON Schema subset, no new deps)
├── prompts/            # versioned, pure prompt builders
├── providers/
│   ├── AIModelProvider.js          # base class (run + generate/extract/classify/analyze)
│   ├── ExternalLLMProvider.js      # wraps AIService chain (type "external")
│   ├── LocalFoundationModelProvider.js  # pins the local provider (type "baseline")
│   ├── WebloomFineTunedModelProvider.js # loads active fine-tuned model (type "webloom")
│   ├── FallbackProvider.js         # deterministic UNKNOWN envelopes (type "fallback")
│   └── index.js        # createProvider / resolveProviders ('auto')
├── grounding.js        # evidence grounding (hallucination guard, shared with legacy path)
├── confidence.js       # bands + offline calibration (ECE/Brier)
├── modelRegistry.js    # versioned model store → models/registry.json
└── hitl/correctionStore.js  # human corrections → datasets/corrections/

datasets/              # versioned train/holdout sets (see docs/ai/dataset-spec.md)
eval/ (apps/api/eval/) # benchmark runner (echo/fallback/baseline/live backends)
finetune/              # training configs + dataset formatter (see docs/ai/fine-tuning.md)
models/registry.json   # model version registry
```

## Data flow

```
task request (taskId + input)
   → task = tasks.js[id]            (contract, prompt version, grounding policy)
   → prompt = task.buildPrompt(input)   (pure, versioned)
   → providers = resolveProviders('auto')
        webloom fine-tuned  →  external LLM chain  →  (fallback via onFail='unknown')
   → provider.run({prompt, schema, temperature, maxTokens})
   → contract validation       (AIResponseValidator.validateSchema)
   → post-validation           (task-specific syntactic rules)
   → evidence grounding        (enforce for grounded tasks)
   → confidence banding        (overallConfidence)
   → AIInferenceResult         (validated against its own schema)
```

Every result carries `inference.{provider, model, modelId, promptVersion,
latencyMs, usage, confidence, grounding, generatedAt}` so any run is
reproducible and attributable.

## Provider resolution

`resolveProviders(spec)` returns an ordered list of provider instances:

| spec | order | type |
|------|-------|------|
| `auto` | Webloom fine-tuned (if configured) → external chain | webloom, external |
| `external` | external chain | external |
| `baseline` | pinned local foundation model | baseline |
| `webloom` | fine-tuned model (throws if not configured) | webloom |
| `fallback` | deterministic | fallback |

The first configured provider that returns a contract-valid, post-validated,
grounded output wins; failures are recorded in `__attempts` and the next
provider is tried. `onFail: 'unknown'` converts total failure into UNKNOWN
envelopes for envelope-shaped tasks (extraction/classification), which is what
production wants — a graceful "we don't know" instead of an exception or a
guess.

The `ExternalLLMProvider` and `LocalFoundationModelProvider` reuse the existing
`AIService` chain (`AIProviderFactory`, `AIResponseValidator`,
`AIServiceSingleton.buildResponseFormat`), so the proven timeouts, retries, key
routing, and budget logic are inherited — nothing is forked.

## Contracts

Task outputs are strict JSON Schemas. Every AI-sourced plural value uses the
envelope shape, and the contracts mirror what the existing downstream services
validate (`BrandStrategyService`, `DigitalAuditService`,
`LandingPageSpecService`, `WebsiteStrategyService`), so validated live output
is drop-in compatible during migration. Schemas deliberately omit
`additionalProperties: false` to match existing production schema behaviour
(some providers, notably Gemini, drop schemas that include it).

## Hallucination guard

Two complementary mechanisms:

1. **Snippet grounding** (`grounding.js`): any AI claim carrying an evidence
   snippet has that snippet verified as an actual substring of the evidence
   text the model was given. A quoted snippet that does not occur is
   `unsupported` and the field is rejected. Values whose snippets are too short
   to check are treated as unverifiable, not rejected.
2. **Optional wiring into the legacy fallback extractor**: when
   `config.ai.groundingEnforce` is on (default; disable with
   `AI_GROUNDING_ENFORCE=false`), `GoogleMapsFallbackExtractor.acceptField`
   rejects AI evidence snippets that do not occur in the supplied evidence
   text. This is the only change to existing runnable code. Regression suites
   `test_phase_p18_*`, `test_phase_p19_*` and the v2 benchmark must stay green
   (see `test_ai_foundation.js` and `benchmarks/v2`).

See `docs/ai/hallucination-prevention.md` for the full threat model and known
gaps that are deliberately documented rather than fixed in this phase.

## Confidence

Field confidence is a model-declared number in [0,1]; bands map to
HIGH/MEDIUM/LOW/UNSUPPORTED at 0.85/0.65/0.4. Calibration is measured offline
by the benchmark runner (`calibrationReport` → ECE, Brier, false-confidence
rate) and must match the gate defined in the model spec before a model is
promoted. A finer-tuned model is only trusted to the extent its self-reported
confidence has been *measured* to mean what it says.

## Compatibility notes and known risks

- The new `provenance` vocabulary reuses the existing pipeline kinds plus
  `unknown`. No new kind is invented.
- `CandidatePipeline.js` labels enrichment fields as `inferred`, not
  `ai_generated`; `test_quality_boundary.js` asserts the current label. We do
  **not** change that in this phase; the re-label is a Phase 2 migration item
  (see roadmap).
- The reputation extractor (`GoogleMapsReputationExtractor.js`) receives its
  evidence model-composed and is not snippet-grounded today; the per-review
  confidence threshold gap is documented in hallucination-prevention.md and
  tracked as a Phase 2 item.

## Minimal change surface

New files: everything under `apps/api/src/ai/`, `apps/api/eval/`, `datasets/`,
`finetune/`, `models/registry.json`. Changed existing files: exactly two —
`apps/api/src/config/env.js` (one new flag) and
`apps/api/src/services/GoogleMapsFallbackExtractor.js` (one grounding guard).
No dependency, schema, or route changes.