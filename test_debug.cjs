const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file,
  // Disable jsx transform to see if it's a JSX issue
  jsx: "preserve"
}).then(() => {
  console.log("PASS with jsx: preserve");
}).catch((error) => {
  console.error("ERROR with jsx: preserve:", error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
