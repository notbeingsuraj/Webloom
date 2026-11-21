const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Add space before /> in self-closing tags
let testSource = source.replace(/(<[^>]+)(\/>)/g, '$1 />');

transform(testSource, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS with spaced self-closing tags")).catch((error) => {
  console.error("ERROR:", error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
