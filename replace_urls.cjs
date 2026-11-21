const fs = require("fs");
const file = "apps/web/src/pages/Operations.tsx";
let source = fs.readFileSync(file, "utf8");

source = source.replace(/'\/health\/ai\?force=1'/g, 'API_HEALTH_AI_URL');
source = source.replace(/'\/health\/scraper'/g, 'API_SCRAPER_HEALTH_URL');
source = source.replace(/'\/health'/g, 'API_HEALTH_URL');

fs.writeFileSync(file, source);
console.log("Done");
