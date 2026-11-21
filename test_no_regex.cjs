const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

// Remove all comments and strings to find regex
let testSource = source.replace(/\/\/.*$/gm, '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

transform(testSource, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS without strings")).catch((error) => {
  console.error("ERROR:", error.message);
});
