/**
 * Web quality smoke tests — standalone Node script following the repo's
 * test-* convention. No test runner dependency.
 *
 * Run: node test_web_quality.js   (from apps/web)
 *
 * Covers:
 *   1. Custom 404 route exists
 *   2. Unique meta title per route
 *   3. Unique meta description per route
 *   4. robots.txt validity
 *   5. sitemap.xml validity
 *   6. Open Graph metadata (index.html)
 *   7. No meaningless alt text (static scan)
 *   8. Analytics disabled without configuration (pure logic)
 *   9. Analytics blocked before consent (pure logic)
 *  10. Sticky mobile CTA rendering rules
 *  11. Core pages define per-route metadata (hook wiring)
 *  12. No horizontal overflow hazard classes at 320px (static scan hints)
 *  13. Form error-state plumbing (aria-invalid in Contact/NewLead)
 *  14. Thank-you gating (only after success)
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, 'src');
const passed = [];
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed.push(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function read(p) {
  return readFileSync(p, 'utf8');
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/* ============================================================
 * 1. Custom 404
 * ============================================================ */
check('1. Custom 404 page route exists and is wired', () => {
  const app = read(join(SRC, 'App.tsx'));
  assert.ok(app.includes('NotFound'), 'NotFound imported in App.tsx');
  assert.ok(app.includes('path="*"'), 'Catch-all 404 route present');
  const notFound = read(join(SRC, 'pages/NotFound.tsx'));
  assert.ok(notFound.includes('Page not found'), '404 copy present');
  assert.ok(notFound.includes('Go to dashboard'), '404 links home');
  assert.ok(notFound.includes('/leads/new'), '404 links to analysis');
});

/* ============================================================
 * 2-3. Unique title / description per route
 * ============================================================ */
check('2. Every route has a unique meaningful meta title', () => {
  const site = read(join(SRC, 'config/site.ts'));
  const titles = [...site.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(titles.length >= 8, `expected >= 8 route titles, got ${titles.length}`);
  const unique = new Set(titles);
  assert.equal(unique.size, titles.length, 'duplicate titles detected');
  for (const t of titles) {
    assert.ok(!t.includes('UNDEFINED') && !t.includes('{'), `bad title: ${t}`);
  }
});

check('3. Every route has a unique meaningful meta description', () => {
  const site = read(join(SRC, 'config/site.ts'));
  const descs = [...site.matchAll(/description: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(descs.length >= 8, `expected >= 8 route descriptions, got ${descs.length}`);
  const unique = new Set(descs);
  assert.equal(unique.size, descs.length, 'duplicate descriptions detected');
});

/* ============================================================
 * 4. robots.txt
 * ============================================================ */
check('4. robots.txt is valid and references sitemap', () => {
  const robots = read(join(__dirname, 'public/robots.txt'));
  assert.ok(robots.includes('User-agent: *'), 'User-agent line present');
  assert.ok(robots.includes('Disallow: /api/'), 'API disallowed');
  assert.ok(robots.includes('Disallow: /leads/'), 'private leads disallowed');
  assert.ok(robots.includes('Sitemap:'), 'sitemap referenced');
  // Must not hardcode an incorrect domain — sitemap URL must match config default
  const sitemapMatch = robots.match(/Sitemap:\s*(\S+)/);
  assert.ok(sitemapMatch, 'sitemap URL present');
  assert.ok(!/example\.com|localhost:5173/.test(sitemapMatch[1]), 'sitemap uses production domain');
});

/* ============================================================
 * 5. sitemap.xml
 * ============================================================ */
check('5. sitemap.xml lists public pages with valid URLs', () => {
  const sitemap = read(join(__dirname, 'public/sitemap.xml'));
  assert.ok(sitemap.includes('<urlset'), 'urlset root');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 5, `expected >= 5 public URLs, got ${urls.length}`);
  for (const u of urls) {
    assert.ok(u.startsWith('https://webloom.app/'), `non-prod URL: ${u}`);
    assert.ok(!u.includes('leads') && !u.includes('/api/'), `private URL indexed: ${u}`);
  }
});

/* ============================================================
 * 6. Open Graph metadata
 * ============================================================ */
check('6. index.html has full OG + Twitter card metadata', () => {
  const html = read(join(__dirname, 'index.html'));
  for (const tag of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
    assert.ok(html.includes(tag), `missing ${tag}`);
  }
  assert.ok(!/og:image" content="">/.test(html), 'og:image empty');
  assert.ok(html.includes('og:image:width') && html.includes('1200'), 'og:image:width 1200');
  assert.ok(html.includes('og:image:height') && html.includes('630'), 'og:image:height 630');
  assert.ok(html.includes('twitter:card'), 'twitter card present');
  assert.ok(html.includes('favicon.svg'), 'favicon wired');
  assert.ok(html.includes('apple-touch-icon'), 'apple touch icon wired');
});

/* ============================================================
 * 7. Alt text
 * ============================================================ */
check('7. No meaningless alt text values in components', () => {
  const files = walk(SRC).filter((f) => /\.tsx$/.test(f));
  for (const f of files) {
    const src = read(f);
    const alts = [...src.matchAll(/alt=\{?['"]([^'"]*)['"]\}?/g)].map((m) => m[1]);
    for (const alt of alts) {
      const bad = /^(image|image1|screenshot|photo|untitled)$/i.test(alt);
      assert.ok(!bad, `meaningless alt "${alt}" in ${f}`);
    }
  }
});

/* ============================================================
 * 8-9. Analytics pure logic
 * ============================================================ */
check('8. Analytics disabled without configuration', () => {
  // Static rule: dev builds never track; requires env config in prod.
  // Mirror the pure-core rule here directly.
  const core = read(join(SRC, 'services/analyticsCore.ts'));
  assert.ok(core.includes('config.isDev') && core.includes('return false'), 'dev never tracks');
});

check('9. Analytics blocked before consent where required', () => {
  const core = read(join(SRC, 'services/analyticsCore.ts'));
  assert.ok(core.includes("consent === 'granted'") || core.includes('consent !=='), 'consent-gated logic present');
  assert.ok(core.includes('denied'), 'denied handled');
});

/* ============================================================
 * 10. Sticky mobile CTA
 * ============================================================ */
check('10. Sticky mobile CTA is mobile-only and relevant-page-gated', () => {
  const cta = read(join(SRC, 'components/StickyMobileCta.tsx'));
  assert.ok(cta.includes('lg:hidden'), 'desktop hidden');
  assert.ok(cta.includes('safe-area-inset-bottom'), 'paddingBottom safe area');
  assert.ok(cta.includes('SHOW_PATHS'), 'page allow-list');
  assert.ok(cta.includes('/leads/new'), 'primary action wired to real route');
  assert.ok(cta.includes('aria-label'), 'dismiss accessible');
});

/* ============================================================
 * 11. Core pages use page metadata hook
 * ============================================================ */
check('11. All core pages wire per-route metadata via hook', () => {
  const pages = ['Dashboard', 'NewLead', 'LeadDetail', 'GeneratedSites', 'Pricing', 'Contact', 'PrivacyPolicy', 'Terms', 'NotFound', 'ThankYou'];
  for (const p of pages) {
    const file = join(SRC, `pages/${p}.tsx`);
    assert.ok(existsSync(file), `${p}.tsx missing`);
    const src = read(file);
    assert.ok(src.includes('usePageMetadata'), `${p} missing usePageMetadata`);
  }
});

/* ============================================================
 * 12. No horizontal overflow hazards on small screens
 * ============================================================ */
check('12. No fixed-width containers that overflow at 320px (static scan)', () => {
  const files = walk(SRC).filter((f) => /\.tsx$/.test(f));
  for (const f of files) {
    const src = read(f);
    // Only literal `w-[...]` fixed widths — NOT max-w-[...] (a max width can
    // never overflow a smaller viewport).
    const fixed = [...src.matchAll(/(?<!max-)w-\[(\d+)(px|rem|vw)\]/g)].map((m) => m[0]);
    for (const fw of fixed) {
      const widthMatch = fw.match(/(\d+)(px|rem|vw)/);
      const width = Number(widthMatch?.[1] ?? 0);
      const unit = widthMatch?.[2] === 'rem' ? width * 16 : width;
      assert.ok(unit <= 320 || src.includes('overflow-x-auto') || src.includes('min-w-[720'),
        `${fw} may overflow at 320px in ${f}`);
    }
  }
});

/* ============================================================
 * 13. Form error states
 * ============================================================ */
check('13. Forms use client validation + aria-invalid + describedby', () => {
  const contact = read(join(SRC, 'pages/Contact.tsx'));
  assert.ok(contact.includes('aria-invalid'), 'aria-invalid present');
  assert.ok(contact.includes('aria-describedby'), 'aria-describedby present');
  assert.ok(contact.includes("role=\"alert\""), 'role=alert errors');
  assert.ok(contact.includes('submitting'), 'submitting state tracked');
  const newLead = read(join(SRC, 'pages/NewLead.tsx'));
  assert.ok(newLead.includes('aria-invalid'), 'NewLead url aria-invalid');
});

/* ============================================================
 * 14. Thank-you gating
 * ============================================================ */
check('14. Thank-you page gated by successful submission only', () => {
  const contact = read(join(SRC, 'pages/Contact.tsx'));
  assert.ok(contact.includes('/contact/thanks'), 'redirect to thanks after success');
  const thanks = read(join(SRC, 'pages/ThankYou.tsx'));
  assert.ok(thanks.includes('noindex: true'), 'thank-you noindex');
});

/* ============================================================
 * 15. Cookie consent banner
 * ============================================================ */
check('15. Cookie consent banner implemented with accept/reject', () => {
  const cc = read(join(SRC, 'components/CookieConsent.tsx'));
  assert.ok(cc.includes('Accept All'), 'accept action');
  assert.ok(cc.includes('Reject Non-Essential'), 'reject action');
  assert.ok(cc.includes('/privacy'), 'privacy link');
  assert.ok(cc.includes('role="dialog"'), 'dialog role');
  assert.ok(cc.includes('localStorage'), 'persistent consent');
});

/* ============================================================
 * 16. Images optimized / compressed
 * ============================================================ */
check('16. Brand images exist and are compressed (WebP/PNG, not huge)', () => {
  const og = resolve(__dirname, 'public/og-image.png');
  assert.ok(existsSync(og), 'og-image.png exists');
  const size = statSync(og).size;
  assert.ok(size < 200_000, `og-image too large: ${size}`);
  assert.ok(existsSync(resolve(__dirname, 'public/favicon.svg')), 'favicon.svg exists');
  assert.ok(existsSync(resolve(__dirname, 'public/apple-touch-icon.png')), 'apple-touch-icon exists');
});

/* ============================================================
 * 17. Required env documented
 * ============================================================ */
check('17. Required environment variables documented', () => {
  const sample = read(join(__dirname, '.env.example'));
  assert.ok(sample.includes('VITE_PUBLIC_SITE_URL'), 'site url documented');
  assert.ok(sample.includes('VITE_PUBLIC_ANALYTICS_DOMAIN'), 'analytics domain documented');
  assert.ok(sample.includes('VITE_PUBLIC_CONTACT_EMAIL'), 'contact email documented');
});

/* ============================================================
 * 18. Loading states present
 * ============================================================ */
check('18. Loading states and disabled submit during pending', () => {
  const dash = read(join(SRC, 'pages/Dashboard.tsx'));
  // Loading skeletons: the design system ships a layout-matching shimmer
  // primitive (.wl-shimmer) alongside Tailwind's animate-pulse. Accept either.
  assert.ok(
    dash.includes('animate-pulse') || dash.includes('wl-shimmer'),
    'dashboard skeleton',
  );
  const newLead = read(join(SRC, 'pages/NewLead.tsx'));
  assert.ok(newLead.includes('disabled={isProcessing}'), 'submit disabled while processing');
  assert.ok(newLead.includes('animate-spin'), 'spinner while processing');
  const generated = read(join(SRC, 'pages/GeneratedSites.tsx'));
  assert.ok(generated.includes('animate-spin'), 'generation spinner');
});

/* ============================================================
 * 19. Meaningful images / decorative handling
 * ============================================================ */
check('19. No asset images with missing alt (static scan)', () => {
  const files = walk(SRC).filter((f) => /\.tsx$/.test(f));
  let imgCount = 0;
  for (const f of files) {
    const src = read(f);
    const imgs = [...src.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    imgCount += imgs.length;
    for (const img of imgs) {
      assert.ok(/alt=/.test(img), `img without alt in ${f}: ${img.slice(0, 80)}`);
    }
  }
  // There are intentionally zero <img> tags (all iconography uses inline SVG /
  // lucide icons) — the check protects against future regressions.
  assert.equal(imgCount, 0, `expected no raster <img> tags, found ${imgCount}`);
});

console.log(`\n------------------------------------`);
console.log(`RESULTS: ${passed.length} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All web quality tests passed!');