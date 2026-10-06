# Webloom AI — Hallucination Prevention

The core threat: pattern-completing models produce *plausible* business facts
(phone numbers, hours, services, reviews) that were never in the evidence.
For a lead-gen/sales platform that auto-fills business profiles, a fabricated
phone number or address is worse than a missing one — it routes a customer to
a stranger.

## Design

**The model proposes; the application verifies.**

1. **Strip the model of the ability to be authoritative.**
   - Prompts: "If a fact is not explicitly supported by the supplied input,
     return value: null... A null is always better than a plausible guess."
   - Every AI field must carry an evidence snippet quoting the input exactly.
   - Provenance is `ai_generated` for anything the model derives — never
     `verified` or `observed`. Consumers can then apply stricter rules to AI
     fields.
2. **Verify the snippet actually occurs.** `grounding.js` checks each claimed
   snippet against the evidence text the model was actually given.
   `groundField` returns `grounded | unsupported | unverifiable`. A snippet
   shorter than `MIN_CHECKABLE_SNIPPET_LENGTH` (8 chars) is `unverifiable`,
   never rejected. In **enforce** mode, an `unsupported` AI claim is replaced
   with the UNKNOWN envelope before the result leaves the layer.
3. **Grounding is applied to the legacy pipeline too.** Inside
   `GoogleMapsFallbackExtractor.acceptField`, an AI evidence snippet that does
   not occur in the supplied evidence text rejects the field
   (`config.ai.groundingEnforce`, default on; `AI_GROUNDING_ENFORCE=false` to
   disable). This is the only change to existing runnable code.
4. **Confidence is measured, not asserted.** `controller`: model confidence
   is banded (HIGH/MEDIUM/LOW/UNSUPPORTED) and *calibrated offline* by the
   benchmark (ECE/Brier/false-confidence-rate). A model may be restricted to
   HIGH-band writes only after calibration data supports it.
5. **Fail closed.** `onFail: 'unknown'` converts total provider failure into
   UNKNOWN envelopes — an empty field costs less than a fabricated one.

## What grounding does and does not catch

| case | grounding result |
|------|------------------|
| model quotes a real snippet from evidence | grounded |
| model invents a convincing quote | unsupported → rejected/null |
| model returns a value with no snippet, value not in evidence (factual-looking) | unsupported → rejected |
| model returns a normalized value (phone `+14154872600` from `(415) 487-2600`) with a real quote | grounded (quote is trusted) |
| value is too short or ambiguous to check | unverifiable — accepted at face value (documented residual risk) |
| generative content (brand.dna/strategy) statements | grounding covers *facts inside copy* downstream; the layer runs generative tasks with grounding `off` |

## Known residual risks (documented for Phase 2)

These are deliberately **not** fixed in the foundation phase — each is a
tracked migration item so the behavior change lands with its own tests.

1. **Reputation extractor is not snippet-grounded.** `GoogleMapsReputationExtractor`
   builds review/reply evidence model-composed and does not run `snippetVerdict`
   per quote. Also, individual reviews are accepted at the review-level
   threshold derived from ratings, not per-snippet. → Phase 2: apply
   `snippetVerdict` to each review quote + a `AI_ACCEPTANCE_THRESHOLD`-style
   conf gate per review; cover with `test_phase_p19_*` additions.
2. **`inferred` vs `ai_generated`.** `CandidatePipeline` labels enrichment
   fields `inferred`; a stricter policy would label model-derived fields
   `ai_generated`. Changing it today would break `test_quality_boundary.js`
   (asserts the existing label). → Phase 2 migration, with test updated in the
   same commit.
3. **Short-snippet acceptance.** Values whose quotes are < 8 chars are
   `unverifiable` and pass. A gated model could raise `MIN_CHECKABLE....`
   per field class; tune only with calibration data.
4. **Evidence is not persisted per field.** Unknown→unsupported rewrites leave
   the field empty; the *proof* (what the model claimed) is only in
   `__raw`/`__attempts` debug payloads. → Persist rejected-claim evidence so
   HITL can learn from near-misses.

## Operational controls

- `AI_GROUNDING_ENFORCE=false` — degrade to advisory (`report`) for
  experiments. Default is enforce.
- Benchmark reports `grounded/unsupported/unverifiable` counts per task and
  **hallucination rate** (fields valued where expected is null or evidence
  unsupported) as a hard promotion metric.
- Production wiring path for the fine-tuned model (`webloom` provider) keeps
  grounding on regardless of model trust: guards compose, they don't
  substitute.