const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");
const lines = source.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Look for regex-like patterns: /something/
  const regexPattern = /\/(?![\/*])[^/\n]+\//g;
  const matches = line.match(regexPattern);
  if (matches) {
    console.log(`Line ${i+1}: ${matches.join(', ')} | ${line.trim().substring(0, 80)}`);
  }
}
