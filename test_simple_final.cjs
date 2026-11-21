const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Remove cls/frac import
let testSource = source.replace(/import \{ cls, frac \} from '\.\.\/lib\/cls';\n?/, '');

// Replace all cls(frac(...)) with simple string literals
testSource = testSource
  .replace(/cls\(frac\('hover:bg-secondary', '50'\)\)/g, "'hover:bg-secondary/50'")
  .replace(/cls\(frac\('hover:border-primary', '30'\)\)/g, "'hover:border-primary/30'")
  .replace(/cls\(frac\('bg-primary', '12'\), 'text-primary'\)/g, "'bg-primary/12 text-primary'")
  .replace(/cls\(frac\('bg-ai', '12'\), 'text-ai'\)/g, "'bg-ai/12 text-ai'")
  .replace(/cls\('wl-card', 'p-5', 'transition-all', frac\('hover:border-primary', '30'\)\)/g, "'wl-card p-5 transition-all hover:border-primary/30'")
  .replace(/cls\('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-ai', '5'\)\)/g, "'wl-card p-5 bg-gradient-to-br from-secondary via-card to-ai/5'")
  .replace(/cls\('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-ai', '12'\), 'text-ai'\)/g, "'flex h-10 w-10 items-center justify-center rounded-lg bg-ai/12 text-ai'")
  .replace(/cls\('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-ai', '5'\)\)/g, "'wl-card p-5 bg-gradient-to-br from-secondary via-card to-ai/5'")
  .replace(/cls\('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-ai', '12'\), 'text-ai'\)/g, "'flex h-10 w-10 items-center justify-center rounded-lg bg-ai/12 text-ai'")
  .replace(/cls\('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-primary', '5'\)\)/g, "'wl-card p-5 bg-gradient-to-br from-secondary via-card to-primary/5'")
  .replace(/cls\('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-primary', '12'\), 'text-primary'\)/g, "'flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary'")
  .replace(/cls\('flex', 'h-8', 'w-8', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-ai', '12'\), 'text-ai'\)/g, "'flex h-8 w-8 items-center justify-center rounded-lg bg-ai/12 text-ai'")
  .replace(/cls\('flex', 'h-8', 'w-8', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-primary', '12'\), 'text-primary'\)/g, "'flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary'")
  .replace(/cls\('flex', 'h-8', 'w-8', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-verified', '12'\), 'text-verified'\)/g, "'flex h-8 w-8 items-center justify-center rounded-lg bg-verified/12 text-verified'")
  .replace(/cls\('wl-card', 'p-5', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-primary', '5'\)\)/g, "'wl-card p-5 bg-gradient-to-br from-secondary via-card to-primary/5'")
  .replace(/cls\('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-lg', frac\('bg-primary', '12'\), 'text-primary'\)/g, "'flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary'")
  .replace(/cls\('inline-flex', 'items-center', 'gap-1', 'rounded-full', frac\('bg-verified', '10'\), 'px-2', 'py-0.5', 'text-\[10px\]', 'font-semibold', 'uppercase', 'tracking-\[0\.1em\]', 'text-verified'\)/g, "'inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-verified'")
  .replace(/cls\('rounded-xl', 'border', 'border-border', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-primary', '5'\), 'p-5'\)/g, "'rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-5'")
  .replace(/cls\('flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-xl', frac\('bg-primary', '12'\), 'text-primary'\)/g, "'flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary'")
  .replace(/cls\('rounded-xl', 'border', 'border-border', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-verified', '5'\), 'p-5'\)/g, "'rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-5'")
  .replace(/cls\('flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-xl', frac\('bg-verified', '12'\), 'text-verified'\)/g, "'flex h-12 w-12 items-center justify-center rounded-xl bg-verified/12 text-verified'")
  .replace(/cls\('rounded-xl', 'border', 'border-border', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-ai', '5'\)\)/g, "'rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-5'")
  .replace(/cls\('flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-xl', frac\('bg-ai', '12'\), 'text-ai'\)/g, "'flex h-12 w-12 items-center justify-center rounded-xl bg-ai/12 text-ai'")
  .replace(/cls\('rounded-xl', 'border', 'border-border', 'bg-gradient-to-br', 'from-secondary', 'via-card', frac\('to-opportunity', '5'\), 'p-5'\)/g, "'rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-opportunity/5 p-5'")
  .replace(/cls\('flex', 'h-12', 'w-12', 'items-center', 'justify-center', 'rounded-xl', frac\('bg-opportunity', '12'\), 'text-opportunity'\)/g, "'flex h-12 w-12 items-center justify-center rounded-xl bg-opportunity/12 text-opportunity'")
  .replace(/cls\('relative', 'mt-8', 'flex', 'flex-wrap', 'gap-2', 'border-t', frac\('border-border', '70'\), 'pt-5'\)/g, "'relative mt-8 flex flex-wrap gap-2 border-t border-border/70 pt-5'")
  .replace(/cls\(frac\('hover:bg-secondary', '70'\)\)/g, "'hover:bg-secondary/70'")
  .replace(/cls\('flex', 'h-10', 'w-10', 'items-center', 'justify-center', 'rounded-xl', frac\('bg-primary', '12'\), 'text-primary'\)/g, "'flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary'");

const { transform } = require("esbuild");
transform(testSource, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: "Operations.tsx"
}).then(() => console.log("PASS without cls/frac")).catch((error) => {
  console.error("ERROR:", error.message);
});
