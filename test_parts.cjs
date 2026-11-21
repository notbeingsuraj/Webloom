const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");
const lines = source.split('\n');

for (let i = 100; i <= lines.length; i += 50) {
  const part = lines.slice(0, i).join('\n');
  try {
    transform(part, {
      loader: "tsx",
      jsx: "automatic",
      sourcefile: "test.tsx"
    });
    console.log(`First ${i} lines: PASS`);
  } catch (e) {
    console.error(`First ${i} lines: FAIL - ${e.message}`);
    break;
  }
}
