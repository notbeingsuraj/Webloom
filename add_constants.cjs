const fs = require("fs");
const file = "apps/web/src/pages/Operations.tsx";
let source = fs.readFileSync(file, "utf8");

const constants = `const API_HEALTH_AI_URL = "/health/ai?force=1";
const API_SCRAPER_HEALTH_URL = "/health/scraper";
const API_HEALTH_URL = "/health";
`;

// Insert after the imports (after line 12 or so)
const lines = source.split('\n');
lines.splice(12, 0, constants);
source = lines.join('\n');

fs.writeFileSync(file, source);
console.log("Done");
