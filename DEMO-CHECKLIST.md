# Webloom Demo Checklist

**PRE-DEMO**

- [x] Frontend starts (`npm run dev` in apps/web)
- [x] Backend starts (`npm run dev` in apps/api)  
- [x] Database initializes (SQLite webloom.db)
- [x] Health endpoint passes (`GET /health` → status "ok")
- [x] Required environment variables present (OMNIROUTE_API_KEY, GEOAPIFY_API_KEY)
- [x] Providers configured (Geoapify ✅, WebExtraction ✅, AI Enrichment ✅)
- [x] Browser opens frontend (http://localhost:5173)
- [x] Test Google Maps URL works (Blue Bottle Coffee SF verified)

**DURING DEMO**

- [x] Paste Google Maps URL
- [x] Submit
- [x] Loading/progress visible (staged progress with timestamps)
- [x] Identity resolution visible (name extracted from URL)
- [x] Research completes (canonical business profile returned)
- [x] Canonical business data displayed (name, address, phone, website, category)
- [x] Provenance/source information visible (trust signals, extraction metadata)
- [x] Analysis/result displayed (digital audit, business DNA, opportunity score)

**FAILURE FALLBACK**

- [x] Backend restart procedure: `cd apps/api && npm run dev`
- [x] Frontend restart procedure: `cd apps/web && npm run dev`
- [x] Known-good business URL: https://maps.google.com/place/Blue+Bottle+Coffee/@37.7717,-122.4118,17z
- [x] Known-good business URL: https://maps.google.com/?cid=15586445979492199015
- [x] Known provider limitations: Geoapify rate limits at 5 req/s; AI enrichment may timeout
- [x] Known pre-existing test failures documented:
  1. test_canonicalization.js — 2 phone-format conflicts (expected, documented)
  2. test_phase8_api.js — GeoapifyProvider mock mismatch (expected, documented)

**VERIFIED DEMO URL FORMATS (15 tested)**

✅ Standard place URL (maps.google.com/place/Name/@lat,lng,17z)
✅ CID URL (maps.google.com/?cid=1234567890)
✅ Place ID in data path (0x...:0x...)
✅ Coordinates-only URL (maps.google.com/@lat,lng,17z)
✅ Share/copy-link (maps.app.goo.gl/abc123)
✅ Tracking params (utm_*, gclid, fbclid stripped)
✅ Search URL with query param
✅ Trailing slash variations
✅ Encoded business names (+ for spaces)
✅ Regional hosts (google.co.uk, google.de, google.fr, etc.)
✅ HTTP protocol
❌ Non-Google URLs (correctly rejected)
❌ Malformed URLs (correctly rejected)
❌ Missing protocol (correctly rejected)

**SMOKE TESTS**

- [x] LIVE demo smoke test: `node test_demo_smoke.js` (hits real providers)
- [x] CI deterministic smoke test: `node test_demo_smoke_deterministic.js` (no network)
- [x] Google Maps URL audit: `node test_demo_urls.js` (15 format tests pass)
- [x] P1.3 canonical profile tests: 49/49 pass
- [x] P1.4 API boundary tests: 15/15 pass
- [x] P1.2 identity tests: 41/41 pass
- [x] P1.5 consumer migration tests: 33/33 pass
- [x] Entity resolution: 20/20 pass
- [x] Identity integration: 11/11 pass
- [x] Identity repository: 22/22 pass
- [x] Phase 18: 49/49 pass
- [x] Phase 20: pass
- [x] Website generation: 36 pass (AI fallback as expected)
- [x] Providers: 22/22 pass