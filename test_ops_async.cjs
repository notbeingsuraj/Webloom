const { transform } = require("esbuild");
const fs = require("fs");

const file = "apps/web/src/pages/Operations.tsx";
const source = fs.readFileSync(file, "utf8");

async function test() {
  try {
    await transform(source, {
      loader: "tsx",
      jsx: "automatic",
      sourcefile: file
    });
    console.log("PASS");
  } catch (error) {
    console.error("ERROR:", error.message);
    if (error.errors) {
      error.errors.forEach(e => {
        console.error("Error detail:", e);
        if (e.location) {
          console.error("Location:", e.location);
          if (e.location.lineText) {
            console.error("Line text:", e.location.lineText);
          }
        }
      });
    }
    process.exitCode = 1;
  }
}

test();
