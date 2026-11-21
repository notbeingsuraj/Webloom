const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then((result) => {
  console.log("PASS");
  console.log("Output length:", result.code.length);
}).catch((error) => {
  console.error("ERROR:", error.message);
  console.error("Location:", error.location);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
  process.exitCode = 1;
});
