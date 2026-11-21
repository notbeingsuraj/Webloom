const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Try first 100 lines
const lines = source.split('\n');
const part1 = lines.slice(0, 100).join('\n');

try {
  transform(part1, {
    loader: "tsx",
    jsx: "automatic",
    sourcefile: "test.tsx"
  });
  console.log("First 100 lines: PASS");
} catch (e) {
  console.error("First 100 lines: FAIL", e.message);
}
