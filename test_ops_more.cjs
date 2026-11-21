const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Try to transform progressively more lines
const lines = source.split('\n');
for (let i = 200; i <= lines.length; i += 100) {
  const part = lines.slice(-i).join('\n');
  try {
    transform(part, {
      loader: "tsx",
      jsx: "automatic",
      sourcefile: file
    });
    console.log(`Last ${i} lines: PASS`);
  } catch (e) {
    console.error(`Last ${i} lines: FAIL - ${e.message}`);
    break;
  }
}
