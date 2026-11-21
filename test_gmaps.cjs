const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/components/ui/GoogleMapsUrlParser.tsx";
const source = fs.readFileSync(file, "utf8");

transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: file
}).then(() => console.log("PASS")).catch((error) => {
  console.error("ERROR:", error.message);
});
