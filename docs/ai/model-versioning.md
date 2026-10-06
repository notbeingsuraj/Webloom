# Webloom AI — Model Versioning

The registry (`models/registry.json`, managed by `apps/api/src/ai/modelRegistry.js`)
is the single source of truth for every Webloom AI model version: what it is,
what it was trained on, how it benchmarked, and whether it is allowed to serve
production.

## Registry entry

```json
{
  "id": "webloom-ai-baseline-0.1.0",
  "type": "baseline",
  "foundationModel": "Qwen/Qwen2.5-7B-Instruct",
  "provider": "ollama",
  "quantization": "Q4_K_M",
  "license": "Apache-2.0",
  "promptVersion": "webloom-tasks-v1",
  "datasetVersions": { "train": [], "evaluated": ["extraction@v0.1.0", "..."] },
  "trainingConfig": null,
  "loraConfig": null,
  "status": "configured",
  "registeredAt": "...",
  "knownWeaknesses": [],
  "benchmarks": []
}
```

Validation: `registerModel` enforces the `AIModelMetadataSchema` before
writing. Writes are atomic (tmp file + rename). No concurrent-writer story is
needed because the registry is authored by scripts/CI, not by request handlers.

## Lifecycle

```
configured                # registered, not yet benchmarked
   → evaluated            # after a real benchmark exists in benchmarks[]
      → active-baseline   # the model we compare against (promoted once)
      → active-production # serving the webloom provider (only one)
      → archived          # superseded; kept for comparison/reproducibility
```

Rules:

- At most one `active-production`. `setActiveModel('webloom-ai-finetune-0.2.0', 'production')`
  atomically demotes whatever was active before to `archived` (it stays
  `evaluated`/`active-baseline` semantics for comparison; the demotion targets
  the *production* role only).
- At most one `active-baseline`; used by benchmarks to know the comparison
  reference (`getActiveModel('baseline')`).
- A model may not go `active-production` without ≥ 1 recorded benchmark and a
  passing evaluation gate (see model-spec).

## Operations

```js
import { registerModel, setActiveModel, getActiveModel, listModels, compareModels } from '../src/ai/modelRegistry.js';

await registerModel({ id: 'webloom-ai-finetune-0.1.0', type: 'webloom', foundationModel: 'Qwen/Qwen2.5-7B-Instruct', status: 'evaluated', ... });
await setActiveModel('webloom-ai-finetune-0.1.0', 'production');   // becomes active-production; prior production → archived
await recordBenchmark(modelId, { reportId, backend, f1, hallucinationRate, ece, overallScoreMAE });
```

## Version bumping

`bumpVersion('webloom-ai-finetune', '0.1.0', 'patch')` → `0.1.1`. Version
semantics: `major` = prompt/contract-breaking change; `minor` = dataset/
behaviour change; `patch` = config/quantization tweak with the same training
data. A new training run is a new id; never mutate an existing model's
benchmarks or training data in place — append and supersede.

## Why

- Every production field must be traceable to the model that produced it
  (that's also why `AIInferenceResult.inference.modelId` is populated).
- Rollback = flip `active-production` back to the previous id with one call.
- Regression detection = `compareModels` over stored benchmark numbers.