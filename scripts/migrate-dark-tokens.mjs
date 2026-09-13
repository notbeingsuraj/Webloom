/**
 * One-time mechanical migration of light-theme utility tokens → dark webloom
 * tokens across the web app. Run from repo root:
 *   node scripts/migrate-dark-tokens.mjs
 *
 * Only applies exact token strings listed in TOKEN_MAP (never freeform).
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');

const TOKEN_MAP = [
  // Surfaces / borders
  ['bg-white/80', 'bg-webloom-surface/80'],
  ['bg-white', 'bg-webloom-surface'],
  ['bg-[#F5F5F7]', 'bg-webloom-surface'],
  ['bg-[#F7F7F8]', 'bg-webloom-raised'],
  ['bg-[#111111]', 'bg-webloom-raised'],
  ['bg-[#FAFAFA]', 'bg-webloom-text'],
  // Text
  ['text-[#111111]', 'text-webloom-text'],
  ['text-[#FAFAFA]', 'text-webloom-text'],
  ['text-[#6E6E73]', 'text-webloom-muted'],
  ['text-[#A1A1AA]', 'text-webloom-muted'],
  ['text-[#8E8E93]', 'text-webloom-muted'],
  // Accent (blue → primary indigo)
  ['text-[#0A84FF]', 'text-primary-400'],
  ['hover:text-[#0077ED]', 'hover:text-primary-300'],
  ['border-[#0A84FF]', 'border-primary-500'],
  ['bg-[#0A84FF]', 'bg-primary-600'],
  ['hover:bg-[#0077ED]', 'hover:bg-primary-500'],
  ['focus:border-[#0A84FF]', 'focus:border-primary-500'],
  ['focus:bg-white', 'focus:bg-webloom-hover'],
  // Borders
  ['border-[#E5E5EA]', 'border-webloom-border'],
  ['border-[#D2D2D7]', 'border-webloom-border'],
  ['divide-[#E5E5EA]', 'divide-webloom-border'],
  ['border-[#E5E5EA]/60', 'border-webloom-border/60'],
  // Tinted status colors → dark equivalents
  ['text-[#B42318]', 'text-red-400'],
  ['border-[#F0C5C2]', 'border-red-800/50'],
  ['bg-[#FDECEC]', 'bg-red-900/30'],
  ['hover:bg-[#FBE2E2]', 'hover:bg-red-900/50'],
  ['text-[#067647]', 'text-emerald-400'],
  ['border-[#BAF0C4]', 'border-emerald-800/60'],
  ['bg-[#ECFDF5]', 'bg-emerald-900/40'],
  ['bg-[#EBF3FF]', 'bg-primary-900/30'],
  ['border-[#D8E9FF]', 'border-primary-800/50'],
  ['bg-[#FFF7ED]', 'bg-amber-900/30'],
  ['text-[#C2410C]', 'text-amber-300'],
  ['border-[#FBD4A8]', 'border-amber-800/50'],
  ['bg-[#F5F3FF]', 'bg-purple-900/30'],
  ['text-[#6D28D9]', 'text-purple-300'],
  ['border-[#DDD6FE]', 'border-purple-800/50'],
  // Shadows (light shadows are invisible on dark)
  ['shadow-[0_12px_30px_rgba(17,17,17,0.03)]', 'shadow-[0_12px_30px_rgba(0,0,0,0.3)]'],
  ['shadow-[0_15px_40px_rgba(17,17,17,0.02)]', 'shadow-[0_15px_40px_rgba(0,0,0,0.3)]'],
  ['shadow-[0_18px_50px_rgba(17,17,17,0.03)]', 'shadow-[0_18px_50px_rgba(0,0,0,0.25)]'],
  // Legacy light accents that slip through in text-heavy files
  ['text-[#1A1A1A]', 'text-webloom-text'],
  ['bg-\[\#F5F5F7\],', 'bg-webloom-surface'],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walk(p));
    } else if (name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.jsx')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(join(ROOT, 'apps/web/src'));
let totalReplacements = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of TOKEN_MAP) {
    if (!from || !src.includes(from)) continue;
    const count = src.split(from).length - 1;
    src = src.split(from).join(to);
    totalReplacements += count;
    changed = true;
  }
  if (changed) writeFileSync(file, src);
}
console.log(`Migrated ${totalReplacements} token(s) across ${files.length} file(s)`);