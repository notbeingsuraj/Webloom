/**
 * Generates Webloom brand images:
 *   apps/web/public/og-image.png       1200x630 Open Graph / Twitter card
 *   apps/web/public/favicon-32x32.png  standard favicon
 *   apps/web/public/apple-touch-icon.png 180x180
 *
 * Run: node scripts/generate-brand-images.mjs  (from repo root)
 * Docs: see WEBSITE-GENERATION-ARCHITECTURE.md (brand assets are committed,
 * never generated at query time).
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../apps/web/public');
mkdirSync(outDir, { recursive: true });

const W = 1200;
const H = 630;

/**
 * Render the Webloom "W" mark as an SVG path group, re-used across sizes.
 */
function wMark(x, y, scale, stroke) {
  const s = (v) => v * scale;
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M0 48 L14 0 L32 34 L50 0 L64 48" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 48 L21 30" fill="none" stroke="#818CF8" stroke-width="6" stroke-linecap="round"/>
      <path d="M50 48 L43 30" fill="none" stroke="#818CF8" stroke-width="6" stroke-linecap="round"/>
    </g>`;
}

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.2" r="0.9">
      <stop offset="0%" stop-color="#15151B"/>
      <stop offset="100%" stop-color="#09090B"/>
    </radialGradient>
    <linearGradient id="accentFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <!-- subtle grid -->
  <g stroke="#1A1A20" stroke-width="1">
    ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${H}"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${W}" y2="${i * 100}"/>`).join('')}
  </g>
  <!-- brand mark -->
  ${wMark(80, 210, 4.2, '#6366F1')}
  <!-- title -->
  <text x="250" y="300" font-family="Inter, SF Pro Display, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#FAFAFA" letter-spacing="-2">Webloom</text>
  <text x="252" y="368" font-family="Inter, -apple-system, sans-serif" font-size="30" font-weight="500" fill="#A1A1AA" letter-spacing="0.5">AI-Powered Web Intelligence</text>
  <!-- line -->
  <rect x="252" y="412" width="420" height="3" rx="1.5" fill="url(#accentFade)"/>
  <!-- tagline -->
  <text x="252" y="470" font-family="Inter, -apple-system, sans-serif" font-size="24" font-weight="400" fill="#71717A">Verified business data · structured extraction ·</text>
  <text x="252" y="506" font-family="Inter, -apple-system, sans-serif" font-size="24" font-weight="400" fill="#71717A">conversion-ready websites</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(resolve(outDir, 'og-image.png'));
console.log('og-image.png written');

// favicon-32x32
const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#09090B"/>
  <path d="M14 44 L22 20 L32 38 L42 20 L50 44" fill="none" stroke="#6366F1" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 44 L26 34" fill="none" stroke="#818CF8" stroke-width="4" stroke-linecap="round"/>
  <path d="M42 44 L38 34" fill="none" stroke="#818CF8" stroke-width="4" stroke-linecap="round"/>
</svg>`;
await sharp(Buffer.from(faviconSvg)).png().toFile(resolve(outDir, 'favicon-32x32.png'));
console.log('favicon-32x32.png written');

// apple-touch-icon 180x180 (rendered from 180 canvas, crisp)
const appleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#09090B"/>
  <rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="#27272A" stroke-width="1.5"/>
  <path d="M14 44 L22 20 L32 38 L42 20 L50 44" fill="none" stroke="#6366F1" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 44 L26 34" fill="none" stroke="#818CF8" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M42 44 L38 34" fill="none" stroke="#818CF8" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
await sharp(Buffer.from(appleSvg)).png().toFile(resolve(outDir, 'apple-touch-icon.png'));
console.log('apple-touch-icon.png written');