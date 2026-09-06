/**
 * PHASE 15 — Temporal Identity & Human Review Queue: focused harness
 *
 * ONE harness, ~12 labelled scenarios (A–K + one end-to-end seam), covering the
 * two objectives of this phase without touching scoring, canonicalization, or
 * the Phase 13/14 fixtures.
 *
 * OBJECTIVE A — Temporal relocation (pure analyzer over observedAt history):
 *   A  genuine relocation      : old->new over time + stable phone/website  -> relocated
 *   B  simultaneous branches    : two addresses at ~same time, DIFFERENT phones -> same_brand_different_location
 *   C  insufficient history     : <2 distinct addresses                     -> uncertain
 *   D  address-difference-alone : old->new over time, NO stable identifier  -> uncertain (NOT relocated)
 *   E  contradicted identifiers : old->new over time, phone ALSO changed    -> uncertain
 *   F  provider-span move       : same provider record spans old->new addr  -> relocated
 *   G  simultaneous, same phone : two addresses ~same time, one phone        -> uncertain (not a move, not a branch)
 *
 * OBJECTIVE B — Human review queue (persistent, idempotent, isolated):
 *   H  create + evidence round-trip + pending state + filtered listing
 *   I  idempotent dedupe (same context -> same row) + order-independent key
 *      + unrelated similar-named entities do NOT collapse into one review
 *   INT end-to-end seam: persisted observations -> analyzeEntityRelocation ->
 *      createReviewItem (the exact path Hook B uses), idempotent on re-analysis
 *   J  cross-restart persistence + idempotency-after-restart + resolve
 *      (two child processes sharing one SQLite file)
 *   K  reviewer resolution (pending -> approved) persists; canonical data is
 *      NEVER mutated; invalid status + unknown ids are rejected
 *
 * Best-effort discipline of the production hooks is not re-tested here (it is a
 * try/catch guard); this harness verifies the semantics the hooks rely on.
 *
 * Run: node test_phase15_temporal_review.js
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  analyzeTemporalRelocation,
  analyzeEntityRelocation,
  TEMPORAL_VERDICT,
} from './src/services/TemporalRelocationAnalyzer.js';
import { initializeDatabase, closeDatabase } from './src/db/client.js';
import { IdentityRepository, ValidationError, NotFoundError } from './src/db/IdentityRepository.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const REVIEW_DB = './test_phase15_review.db';
const RESTART_DB = process.env.SQLITE_DATABASE_PATH || './test_phase15_restart.db';

// Deterministic timestamps: T1 and T1b are 30s apart (inside the 5-min
// simultaneous window); T2 is ~31 days after T1 (clearly chronological).
const T1 = '2025-01-01T10:00:00.000Z';
const T1b = '2025-01-01T10:00:30.000Z';
const T2 = '2025-02-01T10:00:00.000Z';

function addr(value, observedAt, providerRecordId = null, normalizedValue = null) {
  return {
    fieldPath: 'location.full_address',
    value,
    normalizedValue: normalizedValue ?? value,
    observedAt,
    providerRecordId,
  };
}
function phoneObs(value, observedAt, normalizedValue = null) {
  // Use provided normalizedValue, or derive E.164 from raw US number for test fixtures
  const norm = normalizedValue || (value ? value.replace(/[^\d]/g, '').replace(/^1?/, '+1') : null);
  return { fieldPath: 'contact.phone', value, normalizedValue: norm, observedAt, providerRecordId: null };
}
function webObs(value, observedAt) {
  return { fieldPath: 'contact.website', value, normalizedValue: null, observedAt, providerRecordId: null };
}

function cleanupDbFiles() {
  for (const base of [REVIEW_DB, RESTART_DB]) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(base + suffix, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OBJECTIVE A — Temporal relocation analyzer (pure, deterministic)
// ---------------------------------------------------------------------------

function runAnalyzerScenarios() {
  console.log('\n[A] Genuine relocation: old->new over time, stable phone + website');
  {
    const r = analyzeTemporalRelocation([
      addr('740 Valencia St, SF', T1, 'rec-old'),
      phoneObs('415-349-0942', T1),
      webObs('dandelionchocolate.com', T1),
      addr('2600 16th St, SF', T2, 'rec-new'),
      phoneObs('415-349-0942', T2),
      webObs('dandelionchocolate.com', T2),
    ]);
    console.log(`     -> verdict=${r.verdict} chronological=${r.evidence.chronological} stablePhone=${r.evidence.stablePhone}`);
    check('A verdict = relocated', r.verdict === TEMPORAL_VERDICT.RELOCATED, r.verdict);
    check('A evidence chronological', r.evidence.chronological === true);
    check('A evidence stablePhone + stableWebsite', r.evidence.stablePhone === true && r.evidence.stableWebsite === true);
  }

  console.log('\n[B] Simultaneous two addresses, DIFFERENT phones -> branch, not a move');
  {
    const r = analyzeTemporalRelocation([
      addr('100 Main St, SF', T1, 'g-1'),
      phoneObs('415-111-1111', T1),
      addr('200 Broadway, Oakland', T1b, 'g-2'),
      phoneObs('510-222-2222', T1b),
    ]);
    console.log(`     -> verdict=${r.verdict} simultaneous=${r.evidence.simultaneous} multiPhone=${r.evidence.multiPhone}`);
    check('B verdict = same_brand_different_location', r.verdict === TEMPORAL_VERDICT.SAME_BRAND_DIFFERENT_LOCATION, r.verdict);
    check('B NOT relocated', r.verdict !== TEMPORAL_VERDICT.RELOCATED);
    check('B evidence simultaneous + multiPhone', r.evidence.simultaneous === true && r.evidence.multiPhone === true);
  }

  console.log('\n[C] Insufficient history (<2 distinct addresses) -> uncertain');
  {
    const single = analyzeTemporalRelocation([addr('1 Only St, SF', T1, 'x'), phoneObs('415-000-0000', T1)]);
    check('C single address -> uncertain', single.verdict === TEMPORAL_VERDICT.UNCERTAIN, single.verdict);
    check('C distinctAddressCount = 1', single.evidence.distinctAddressCount === 1);
    const empty = analyzeTemporalRelocation([]);
    check('C empty history -> uncertain', empty.verdict === TEMPORAL_VERDICT.UNCERTAIN, empty.verdict);
  }

  console.log('\n[D] Address-difference-alone (chronological, no stable id) -> uncertain');
  {
    const r = analyzeTemporalRelocation([
      addr('10 First St, SF', T1, 'prov-A'),
      addr('99 Second St, SF', T2, 'prov-B'),
    ]);
    console.log(`     -> verdict=${r.verdict} chronological=${r.evidence.chronological} providerSpan=${r.evidence.providerSpan}`);
    check('D verdict = uncertain (NOT relocated)', r.verdict === TEMPORAL_VERDICT.UNCERTAIN, r.verdict);
    check('D NOT relocated on address difference alone', r.verdict !== TEMPORAL_VERDICT.RELOCATED);
    check('D chronological true but no stable identity', r.evidence.chronological === true && r.evidence.providerSpan === false);
  }

  console.log('\n[E] Chronological but phone ALSO changed -> uncertain (contradicted)');
  {
    const r = analyzeTemporalRelocation([
      addr('10 First St, SF', T1, 'p'),
      phoneObs('415-111-1111', T1),
      addr('99 Second St, SF', T2, 'q'),
      phoneObs('415-999-9999', T2),
    ]);
    console.log(`     -> verdict=${r.verdict} multiPhone=${r.evidence.multiPhone}`);
    check('E verdict = uncertain', r.verdict === TEMPORAL_VERDICT.UNCERTAIN, r.verdict);
    check('E evidence multiPhone true', r.evidence.multiPhone === true);
    check('E NOT relocated', r.verdict !== TEMPORAL_VERDICT.RELOCATED);
  }

  console.log('\n[F] Provider record spans old->new address (no phone/website) -> relocated');
  {
    const SPID = 'ChIJ-stable-place';
    const r = analyzeTemporalRelocation([addr('740 Valencia St, SF', T1, SPID), addr('2600 16th St, SF', T2, SPID)]);
    console.log(`     -> verdict=${r.verdict} providerSpan=${r.evidence.providerSpan}`);
    check('F verdict = relocated (provider identity carried across move)', r.verdict === TEMPORAL_VERDICT.RELOCATED, r.verdict);
    check('F evidence providerSpan true', r.evidence.providerSpan === true);
  }

  console.log('\n[G] Simultaneous two addresses, SAME phone -> uncertain (neither move nor branch)');
  {
    const r = analyzeTemporalRelocation([
      addr('100 Main St, SF', T1, 'g-1'),
      phoneObs('415-111-1111', T1),
      addr('200 Broadway, Oakland', T1b, 'g-2'),
      phoneObs('415-111-1111', T1b),
    ]);
    console.log(`     -> verdict=${r.verdict} simultaneous=${r.evidence.simultaneous} multiPhone=${r.evidence.multiPhone}`);
    check('G verdict = uncertain', r.verdict === TEMPORAL_VERDICT.UNCERTAIN, r.verdict);
    check('G NOT relocated', r.verdict !== TEMPORAL_VERDICT.RELOCATED);
    check('G NOT branch (no differing phone to prove it)', r.verdict !== TEMPORAL_VERDICT.SAME_BRAND_DIFFERENT_LOCATION);
  }
}

// ---------------------------------------------------------------------------
// OBJECTIVE B — Human review queue (persistence, idempotency, isolation)
// ---------------------------------------------------------------------------

async function runDbScenarios() {
  const db = await initializeDatabase(REVIEW_DB);
  const repo = new IdentityRepository(db);

  console.log('\n[H] Create review item: evidence round-trip, pending state, filtered listing');
  const eH = repo.createEntity({ canonicalName: 'H Coffee', canonicalAddress: '1 H St' });
  const revH = repo.createReviewItem({
    entityId: eH.entityId,
    matchType: 'uncertain',
    matchScore: 0.7,
    reason: 'ambiguous pairwise resolution',
    evidence: { source: 'pairwise_resolution', matchType: 'uncertain', signals: ['name', 'phone'] },
    dedupeContext: { providerA: 'geoapify', providerRecordIdA: 'H-A', providerB: 'web_extraction', providerRecordIdB: 'H-B', matchType: 'uncertain' },
  });
  check('H review created with rev_ id', typeof revH.id === 'string' && revH.id.startsWith('rev_'), revH.id);
  check('H initial status = pending', revH.status === 'pending', revH.status);
  const fetchedH = repo.getReviewItem(revH.id);
  check('H persisted + retrievable by id', !!fetchedH);
  check(
    'H evidence round-trips as object',
    !!fetchedH.evidence && fetchedH.evidence.source === 'pairwise_resolution' && Array.isArray(fetchedH.evidence.signals) && fetchedH.evidence.signals.length === 2,
    JSON.stringify(fetchedH.evidence)
  );
  check('H listing filtered by entity', repo.getReviewItems({ entityId: eH.entityId }).length === 1);
  check('H listing filtered by status pending', repo.getReviewItems({ status: 'pending' }).some((r) => r.id === revH.id));

  console.log('\n[I] Idempotent dedupe + order-independent key + no collapse of similar names');
  const revH2 = repo.createReviewItem({
    entityId: eH.entityId,
    matchType: 'uncertain',
    dedupeContext: { providerA: 'geoapify', providerRecordIdA: 'H-A', providerB: 'web_extraction', providerRecordIdB: 'H-B', matchType: 'uncertain' },
  });
  check('I re-create same context -> same row id', revH2.id === revH.id, `${revH2.id} vs ${revH.id}`);
  check('I still exactly one review for entity', repo.getReviewItems({ entityId: eH.entityId }).length === 1);
  const kAB = repo.buildReviewDedupeKey({ providerA: 'geoapify', providerRecordIdA: 'H-A', providerB: 'web_extraction', providerRecordIdB: 'H-B', matchType: 'uncertain' });
  const kBA = repo.buildReviewDedupeKey({ providerA: 'web_extraction', providerRecordIdA: 'H-B', providerB: 'geoapify', providerRecordIdB: 'H-A', matchType: 'uncertain' });
  check('I pairwise dedupe key is order-independent', kAB === kBA, `${kAB} vs ${kBA}`);
  const eSim1 = repo.createEntity({ canonicalName: 'Bay Bakery', canonicalAddress: '1 Alpha St' });
  const eSim2 = repo.createEntity({ canonicalName: 'Bay Bakery', canonicalAddress: '2 Beta Ave' });
  const rSim1 = repo.createReviewItem({ entityId: eSim1.entityId, matchType: 'uncertain', dedupeContext: { providerA: 'geoapify', providerRecordIdA: 'sim-1', providerB: 'web_extraction', providerRecordIdB: 'sim-1b', matchType: 'uncertain' } });
  const rSim2 = repo.createReviewItem({ entityId: eSim2.entityId, matchType: 'uncertain', dedupeContext: { providerA: 'geoapify', providerRecordIdA: 'sim-2', providerB: 'web_extraction', providerRecordIdB: 'sim-2b', matchType: 'uncertain' } });
  check('I unrelated similar-named entities -> distinct reviews', rSim1.id !== rSim2.id);
  check('I reviews isolated per entity', repo.getReviewItems({ entityId: eSim1.entityId }).length === 1 && repo.getReviewItems({ entityId: eSim2.entityId }).length === 1);

  console.log('\n[INT] End-to-end seam: persisted observations -> analyzer -> review (Hook B path)');
  const eR = repo.createEntity({ canonicalName: 'Relocate Co', canonicalAddress: '740 Valencia St' });
  const mkObs = (fieldPath, value, normalizedValue, observedAt) =>
    repo.createObservation({ entityId: eR.entityId, provider: 'geoapify', providerRecordId: 'reloc-rec', fieldPath, value, normalizedValue, provenance: 'discovered', confidence: 0.9, observedAt });
  mkObs('location.full_address', '740 Valencia St, SF', '740 valencia st, sf', T1);
  mkObs('contact.phone', '415-349-0942', '4153490942', T1);
  mkObs('contact.website', 'dandelionchocolate.com', 'dandelionchocolate.com', T1);
  mkObs('location.full_address', '2600 16th St, SF', '2600 16th st, sf', T2);
  mkObs('contact.phone', '415-349-0942', '4153490942', T2);
  mkObs('contact.website', 'dandelionchocolate.com', 'dandelionchocolate.com', T2);
  const verdict = analyzeEntityRelocation(repo, eR.entityId);
  console.log(`     -> analyzer verdict=${verdict.verdict} from=${verdict.evidence.addressFrom} to=${verdict.evidence.addressTo}`);
  check('INT analyzer over persisted observations -> relocated', verdict.verdict === TEMPORAL_VERDICT.RELOCATED, verdict.verdict);
  const relocCtx = { entityId: eR.entityId, addressFrom: verdict.evidence.addressFrom, addressTo: verdict.evidence.addressTo, matchType: 'relocated_entity' };
  const revR = repo.createReviewItem({ entityId: eR.entityId, matchType: 'relocated_entity', reason: verdict.reason, evidence: { source: 'temporal_analysis', ...verdict.evidence }, dedupeContext: relocCtx });
  check('INT relocation review created + pending', revR.matchType === 'relocated_entity' && revR.status === 'pending');
  const revR2 = repo.createReviewItem({ entityId: eR.entityId, matchType: 'relocated_entity', evidence: { source: 'temporal_analysis', ...verdict.evidence }, dedupeContext: relocCtx });
  check('INT re-analysis of same transition is idempotent', revR2.id === revR.id, `${revR2.id} vs ${revR.id}`);
  check('INT exactly one relocation review for entity', repo.getReviewItems({ entityId: eR.entityId }).length === 1);

  console.log('\n[K] Reviewer resolution persists; canonical data untouched; bad inputs rejected');
  const eK = repo.createEntity({ canonicalName: 'K Diner', canonicalAddress: '5 K Blvd', canonicalPhone: '415-555-0000' });
  const canonicalBefore = repo.getEntityById(eK.entityId);
  const revK = repo.createReviewItem({ entityId: eK.entityId, matchType: 'same_brand_different_location', dedupeContext: { providerA: 'geoapify', providerRecordIdA: 'K-A', providerB: 'web_extraction', providerRecordIdB: 'K-B', matchType: 'same_brand_different_location' } });
  let invalidErr = null;
  try {
    repo.resolveReviewItem(revK.id, 'garbage');
  } catch (e) {
    invalidErr = e;
  }
  check('K invalid status rejected (ValidationError)', invalidErr instanceof ValidationError, String(invalidErr));
  const resolvedK = repo.resolveReviewItem(revK.id, 'approved', { resolvedBy: 'reviewer-1', note: 'confirmed branch' });
  check('K resolved status = approved', resolvedK.status === 'approved', resolvedK.status);
  check('K resolvedAt set', typeof resolvedK.resolvedAt === 'string' && resolvedK.resolvedAt.length > 0);
  check('K resolvedBy + note persisted', resolvedK.resolvedBy === 'reviewer-1' && resolvedK.resolutionNote === 'confirmed branch');
  const canonicalAfter = repo.getEntityById(eK.entityId);
  check(
    'K canonical entity NEVER mutated by resolution',
    canonicalAfter.canonicalName === canonicalBefore.canonicalName &&
      canonicalAfter.canonicalPhone === canonicalBefore.canonicalPhone &&
      canonicalAfter.canonicalAddress === canonicalBefore.canonicalAddress &&
      canonicalAfter.updatedAt === canonicalBefore.updatedAt,
    `${JSON.stringify(canonicalAfter)}`
  );
  const refetchK = repo.getReviewItem(revK.id);
  check('K resolution persisted on re-fetch', refetchK.status === 'approved' && refetchK.resolvedBy === 'reviewer-1');
  let nfErr = null;
  try {
    repo.resolveReviewItem('rev_does_not_exist', 'approved');
  } catch (e) {
    nfErr = e;
  }
  check('K resolve unknown id -> NotFoundError', nfErr instanceof NotFoundError, String(nfErr));
  let entErr = null;
  try {
    repo.createReviewItem({ entityId: 'ent_nope', matchType: 'uncertain', dedupeContext: { providerA: 'x', providerRecordIdA: '1', providerB: 'y', providerRecordIdB: '2', matchType: 'uncertain' } });
  } catch (e) {
    entErr = e;
  }
  check('K create review for unknown entity -> NotFoundError', entErr instanceof NotFoundError, String(entErr));

  closeDatabase();
}

// ---------------------------------------------------------------------------
// OBJECTIVE B (J) — cross-restart persistence via two child processes
// ---------------------------------------------------------------------------

// Fixed PAIRWISE context: its dedupe key does not depend on the (random)
// entityId, so process B can recompute the identical key after a cold restart.
const RESTART_CTX = { providerA: 'geoapify', providerRecordIdA: 'p15-restart-A', providerB: 'web_extraction', providerRecordIdB: 'p15-restart-B', matchType: 'uncertain' };

async function runProcessA_J() {
  const db = await initializeDatabase(RESTART_DB);
  const repo = new IdentityRepository(db);
  const e = repo.createEntity({ canonicalName: 'Restart Cafe', canonicalAddress: '1 Restart Rd' });
  const rev = repo.createReviewItem({
    entityId: e.entityId,
    matchType: 'uncertain',
    reason: 'ambiguous across restart',
    evidence: { source: 'pairwise_resolution' },
    dedupeContext: RESTART_CTX,
  });
  assert.equal(rev.status, 'pending');
  assert.equal(rev.dedupeKey, repo.buildReviewDedupeKey(RESTART_CTX));
  console.log(`  PROCESS A(J): entity=${e.entityId} review=${rev.id}`);
  closeDatabase();
}

async function runProcessB_J() {
  const db = await initializeDatabase(RESTART_DB);
  const repo = new IdentityRepository(db);
  const key = repo.buildReviewDedupeKey(RESTART_CTX);
  const survived = repo.getReviewItemByDedupeKey(key);
  assert.ok(survived, 'review must survive restart');
  assert.equal(survived.status, 'pending');
  const before = repo.getReviewItems({ entityId: survived.entityId }).length;
  const again = repo.createReviewItem({ entityId: survived.entityId, matchType: 'uncertain', dedupeContext: RESTART_CTX });
  assert.equal(again.id, survived.id); // idempotent across restart
  const after = repo.getReviewItems({ entityId: survived.entityId }).length;
  assert.equal(before, after);
  assert.equal(after, 1);
  const resolved = repo.resolveReviewItem(survived.id, 'approved', { resolvedBy: 'restart-reviewer', note: 'ok after restart' });
  assert.equal(resolved.status, 'approved');
  assert.ok(resolved.resolvedAt);
  console.log(`  PROCESS B(J): survived=${survived.id} idempotent=${again.id === survived.id} count=${after} resolved=${resolved.status}`);
  closeDatabase();
}

function runChild(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, PHASE15_MODE: mode, SQLITE_DATABASE_PATH: RESTART_DB },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Phase 15 child ${mode} exited with ${code}`))));
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function main() {
  const mode = process.env.PHASE15_MODE;
  if (mode === 'ja') return runProcessA_J();
  if (mode === 'jb') return runProcessB_J();

  console.log('='.repeat(72));
  console.log('PHASE 15 — Temporal Identity & Human Review Queue');
  console.log('='.repeat(72));

  cleanupDbFiles();

  runAnalyzerScenarios();
  await runDbScenarios();

  console.log('\n[J] Cross-restart persistence + idempotency-after-restart + resolve');
  try {
    await runChild('ja');
    await runChild('jb');
    check('J review survives restart, stays idempotent, and resolves', true);
  } catch (e) {
    check('J review survives restart, stays idempotent, and resolves', false, e.message);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`PHASE 15 RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(72));
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
