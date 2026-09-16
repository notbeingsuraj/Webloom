// Regression test: LeadDetail renders the live API payload.
//
// Guards against the "empty lead detail page" bug: rendering
// analysis.metrics.trustSignals entries raw as React children crashed the
// tree ("Objects are not valid as a React child") and unmounted LeadDetail.
//
// PASS criteria:
//   1. No page errors (React child crash would surface as pageerror)
//   2. Business name from the API payload is visible in the DOM
//   3. Opportunity score from the API payload is visible in the DOM
//   4. Trust-signal chips render (the exact thing that used to crash)
//
// Run: node test_lead_detail_render.mjs
// Requires: dev servers on :5173 (web) and :5001 (api).
import { chromium, firefox, webkit } from '/opt/homebrew/lib/node_modules/omniroute/node_modules/playwright/index.mjs';

// ─── Resolve the lead ID from the live API (single source of truth) ─────────
const API_BASE = 'http://localhost:5001/api';
const WEB_BASE = 'http://localhost:5173';

async function resolveLeadId() {
  const res = await fetch(`${API_BASE}/leads`);
  if (!res.ok) throw new Error(`GET /api/leads -> HTTP ${res.status}`);
  const body = await res.json();
  const leads = body.data;
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error('No leads found — create a lead first (POST /api/leads with a Google Maps URL).');
  }
  return leads[0];
}

async function run() {
  const lead = await resolveLeadId();
  const leadId = lead._id;
  const expectedName = lead.businessName;
  const expectedScore = lead.opportunityScore?.total;
  console.log(`Testing /leads/${leadId}`);
  console.log(`  payload businessName: "${expectedName}"`);
  console.log(`  payload opportunityScore.total: ${expectedScore}`);

  if (!expectedName) throw new Error('Fixture lead has no businessName — cannot assert.');
  if (expectedScore == null) throw new Error('Fixture lead has no opportunityScore.total — cannot assert.');

  const browser = await firefox.launch({
    headless: true,
    executablePath: '/Users/surajkumar/Library/Caches/ms-playwright/firefox-1543/firefox/Nightly.app/Contents/MacOS/firefox',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

  const pageErrors = [];
  const failedRequests = [];
  const trustSignalChips = [];

  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.url().includes('/api/leads/') && res.status() >= 400) {
      failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });

  await page.goto(`${WEB_BASE}/leads/${leadId}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const bodyText = await page.evaluate(() => document.body.innerText);

  // Trust signal chips are the previously-crashing element — "Source confidence"
  // block renders green badges with a CheckCircle icon.
  const chips = await page.evaluate(() =>
    Array.from(document.querySelectorAll('span')).filter((el) => el.textContent?.includes('rating')).map((el) => el.textContent),
  );

  const checks = [
    {
      name: 'no page errors (React child crash would appear here)',
      pass: pageErrors.length === 0,
      detail: pageErrors.length ? pageErrors[0] : 'clean',
    },
    {
      name: `business name rendered ("${expectedName}")`,
      pass: bodyText.includes(expectedName),
      detail: void 0,
    },
    {
      name: `opportunity score rendered (${expectedScore})`,
      pass: bodyText.includes(String(expectedScore)),
      detail: void 0,
    },
    {
      name: 'trust-signal chips rendered (rating …)',
      pass: chips.some((c) => c.includes('rating')),
      detail: chips.slice(0, 3).join(' | '),
    },
    {
      name: 'no failed / 4xx API requests',
      pass: failedRequests.length === 0,
      detail: failedRequests.join('; '),
    },
  ];

  console.log('\n==== RESULTS ====');
  let failed = 0;
  for (const check of checks) {
    console.log(`  ${check.pass ? '✓' : '✗'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    if (!check.pass) failed += 1;
  }

  await browser.close();

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed}/${checks.length} checks passed)`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});