const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");
const lines = source.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Look for regex-like patterns: /pattern/ or /pattern/flags
  // but not paths, imports, JSX closing tags, or comments
  const regexPattern = /\/(?![\/*])[^/\n]+\/[gimuy]*/g;
  const matches = line.match(regexPattern);
  if (matches) {
    // Filter out false positives
    const filtered = matches.filter(m => 
      !m.startsWith('/components/') && 
      !m.startsWith('/lib/') && 
      !m.startsWith('/hooks/') && 
      !m.startsWith('/services/') &&
      !m.startsWith('/components/') &&
      !m.startsWith('/hooks/') &&
      !m.startsWith('/services/') &&
      !m.includes('.toLocaleString()') &&
      !m.startsWith('</') &&
      !m.startsWith('/localhost:') &&
      !m.startsWith('/O') &&
      !m.startsWith('/s') &&
      !m.startsWith('/webloom.db')
    );
    if (filtered.length > 0) {
      console.log(`Line ${i+1}: ${filtered.join(', ')} | ${line.trim().substring(0, 80)}`);
    }
  }
}
