const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Replace all cls(frac(...)) with simple strings to test
let testSource = source
  .replace(/cls\(frac\('([^']+)', '([^']+)'\)\)/g, "'$1/$2'")
  .replace(/cls\(frac\('([^']+)', '([^']+)'\),/g, "'$1/$2',");

transform(testSource, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS with simple strings")).catch((error) => {
  console.error("ERROR:", error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
