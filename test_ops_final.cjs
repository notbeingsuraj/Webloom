const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Try to transform with jsx: preserve to see if it's a JSX issue
try {
  transform(source, {
    loader: "tsx",
    jsx: "preserve",
    sourcefile: file
  });
  console.log("PASS with jsx: preserve");
} catch (error) {
  console.error("ERROR with jsx: preserve:", error.message);
}
