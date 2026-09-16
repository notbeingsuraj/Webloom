---
status: investigating
trigger: "Fix the empty Webloom lead results page. /leads/:id shows page but empty. Backend GET /api/leads/:id returns 200 with { success: true, data: { _id, leadName: 'Tundai Kababi', analysis: {}, brandDNA: {}, audit: {}, opportunityScore: {} } }"
created: 2026-09-16
updated: 2026-09-16
---

## Current Focus

hypothesis: (forming)
test: (not yet)
expecting: (not yet)
next_action: "Verify the actual API response shape for lead 042e512c-aff9-4ff7-847a-084699c6272c and compare against what LeadDetail.tsx expects"

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