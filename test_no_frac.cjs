const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Replace frac calls with their Unicode escape equivalent
let testSource = source
  .replace(/frac\('([^']+)', '([^']+)'\)/g, "'$1\\u002F$2'");

transform(testSource, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS without frac calls")).catch((error) => {
  console.error("ERROR:", error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
