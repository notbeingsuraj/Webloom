---
status: investigating
trigger: "Fix the empty Webloom lead results page. /leads/:id shows page but empty. Backend GET /api/leads/:id returns 200 with { success: true, data: { _id, leadName: 'Tundai Kababi', analysis: {}, brandDNA: {}, audit: {}, opportunityScore: {} } }"
created: 2026-09-16
updated: 2026-09-16
---

## Current Focus

hypothesis: "Data flow appears CORRECT end-to-end (axios → response.data → envelope.data → lead). Suspect the page may actually be rendering but appears empty due to a runtime crash in a child component, OR data was verified with a stale/wrong ID. Need live-render verification."
test: "Capture the actual hydrated DOM with a headless browser that waits for React to mount, and capture console errors."
expecting: "Either the page renders fully (bug in environment/stale server) or a specific console error pinpoints the crash."
next_action: "Run headless Firefox with a wait/harness to capture hydrated DOM + console errors for /leads/042e512c-aff9-4ff7-847a-084699c6272c"

## Symptoms

expected: "Opening /leads/:id displays 'Tundai Kababi' with address, phone, website, rating, audit, brand DNA, and opportunity score."
actual: "The results page appears but is empty."
errors: (none reported — page renders, just empty)
reproduction: "Open http://localhost:5173/leads/042e512c-aff9-4ff7-847a-084699c6272c"
started: "current"

## Eliminated

## Evidence

- timestamp: 2026-09-16
  checked: apps/api/src/routes/leads.js GET /:id (line 336)
  found: Returns res.json({ success: true, data: lead }) where lead = leadCache.get(id)
  implication: Axios response.data = envelope; envelope.data = lead object. Frontend must access response.data.data.
- timestamp: 2026-09-16
  checked: apps/web/src/services/leadService.ts getLead
  found: getLead returns `response.data` (the envelope { success, data }), NOT response.data.data
  implication: useQuery data = envelope. LeadDetail does `const lead = data?.data` → this LEVEL of unwrap looks correct IF envelope shape is { success, data }.
- timestamp: 2026-09-16
  checked: apps/web/src/App.tsx
  found: Route path "leads/:id" element={<LeadDetail />} — route param is `id`
  implication: useParams<{ id }>() matches route definition.
- timestamp: 2026-09-16
  checked: apps/web/vite.config.ts
  found: proxy /api → http://localhost:5001, changeOrigin true. api.ts baseURL = VITE_API_URL || http://localhost:5001/api
  implication: http://localhost:5001/api/leads/:id reachable; also proxied via /api/leads/:id.
- timestamp: 2026-09-16
  checked: LIVE curl http://localhost:5001/api/leads/042e512c-aff9-4ff7-847a-084699c6272c
  found: Full payload present: businessName='Tundai Kababi', location.address, contact.phone '+915224307223', contact.website 'https://www.tundaykababi.com/', businessData.rating 4.2, reviewCount 53110, opportunityScore.total 45 (complete), analysis.brandDNA fully populated (audience, positioning, brandPersonality, toneOfVoice, visualDirection, websiteObjectives, strategicRecommendations), analysis.audit.categories populated, metrics present.
  implication: Backend is NOT the problem. The user's shorthand `analysis: {}` was misleading — the real payload has full data.
- timestamp: 2026-09-16
  checked: LIVE curl through Vite proxy http://localhost:5173/api/leads/042e512c-aff9-4ff7-847a-084699c6272c
  found: HTTP 200, envelope keys ['success','data'], data keys include all business fields. Proxy works.
  implication: Browser reaching localhost:5173/api/leads/:id gets the same full envelope.
- timestamp: 2026-09-16
  checked: apps/web/.env files
  found: Only .env.example exists (VITE_API_URL=http://localhost:5001/api commented default). No local .env override.
  implication: api.ts baseURL = default 'http://localhost:5001/api' — direct call, CORS must allow localhost:5173. app.js CORS allows !origin || localhost:5173 OR dev localhost regex. OK.
- timestamp: 2026-09-16
  checked: LeadDetail.tsx render paths (full read)
  found: lead = data?.data. Header renders businessName/location.address/contact.phone/contact.website/businessCategory/location.city. Overview renders analysis.brandDNA (guard showDna), audit categories, ScoreIndicator(score.value), ReputationPanel(lead), intelligence renderers (all safe null-coalescing). WebsitePreview gets website={lead?.generatedWebsite} and NOT generatedAt (matches optional prop).
  implication: All child component accesses are optional-chained or guarded. No obvious crash. TypeScript compiles with no errors (npx tsc --noEmit clean; vite build clean).
- timestamp: 2026-09-16
  checked: Dashboard.tsx navigation
  found: Link to=`/leads/${lead._id}` — uses _id, matches route param.
  implication: Navigation path is correct.
- timestamp: 2026-09-16
  checked: git log
  found: HEAD bd18c48 "docs: add debug notes for empty lead detail page" — the debug file itself was committed. No code changes pending.
  implication: Repo is clean; running servers may be stale or the issue is environmental.
- timestamp: 2026-09-16
  checked: headless Firefox screenshot/dump of /leads/:id
  found: Screenshot 53KB produced but vision unavailable; --dump-dom returned only 72 bytes of headless noise (did not wait for hydration).
  implication: Need a hydrated DOM capture with wait + console error capture to confirm rendering.