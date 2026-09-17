// Visual verification: capture the redesigned Webloom surfaces.
// Run: node scripts/visual-verify.mjs
// Requires: dev servers on :5173 (web) and :5001 (api).
import { chromium } from '/opt/homebrew/lib/node_modules/omniroute/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const API_BASE = 'http://localhost:5001/api';
const WEB_BASE = 'http://localhost:5173';
const OUT = new URL('../visual-verify', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const shots = [];
let failures = 0;

// Resolve a real lead id from the live API.
let leadId = null;
try {
  const res = await fetch(`${API_BASE}/leads?limit=1&sort=-createdAt`);
  const json = await res.json();
  const leads = json?.data ?? json;
  leadId = Array.isArray(leads) ? leads[0]?._id : leads?.leads?.[0]?._id;
} catch (e) {
  console.warn('Could not resolve a lead id:', e.message);
}

const browser = await chromium.launch();

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1100 },
  { name: 'mobile', width: 320, height: 900 },
]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const targets = [
    { name: 'dashboard', url: '/' },
    { name: 'newlead', url: '/leads/new' },
    { name: 'pricing', url: '/pricing' },
    { name: 'websites', url: '/websites' },
    ...(leadId ? [{ name: 'leaddetail', url: `/leads/${leadId}` }] : []),
  ];

  for (const t of targets) {
    pageErrors.length = 0;
    consoleErrors.length = 0;
    await page.goto(`${WEB_BASE}${t.url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(900);

    const file = `${OUT}/${t.name}-${viewport.name}.png`;
    await page.screenshot({ path: file, fullPage: false });

    // Horizontal-overflow check: the document must not scroll sideways.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    const realErrors = pageErrors.filter((e) => !/ResizeObserver/.test(e));
    const ok = realErrors.length === 0 && overflow <= 2;
    if (!ok) failures++;

    shots.push({
      surface: t.name,
      viewport: viewport.name,
      file,
      overflowPx: overflow,
      pageErrors: realErrors,
      consoleErrors: consoleErrors.slice(0, 3),
      status: ok ? 'PASS' : 'FAIL',
    });
    console.log(`${ok ? '✓' : '✗'} ${t.name} @ ${viewport.name} — overflow ${overflow}px${realErrors.length ? ` — errors: ${realErrors.join(' | ')}` : ''}`);
  }

  await context.close();
}

await browser.close();

console.log(`\n==== SUMMARY ====`);
console.log(`${shots.length} captures, ${failures} failed`);
console.log(`Artifacts: ${OUT}`);
if (failures) process.exitCode = 1;
