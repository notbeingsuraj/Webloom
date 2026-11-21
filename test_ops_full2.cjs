const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Try to transform just the last 200 lines
const lines = source.split('\n');
const part = lines.slice(-200).join('\n');

console.log("Testing last 200 lines...");

transform(lines.slice(-200).join('\n'), {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS")).catch((error) => {
  console.error("ERROR:", error.message);
});
