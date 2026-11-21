const fs = require("fs");
const file = "apps/web/src/pages/Operations.tsx";
let source = fs.readFileSync(file, "utf8");

// Find the return statement and insert variable declarations before it
const returnIndex = source.indexOf('  return (');
if (returnIndex === -1) {
  console.log("Could not find return statement");
  process.exit(1);
}

// Extract the map callbacks as variables before the return
const variables = `
  const logRows = logs.map((log, index) => (
    <tr key={index} className={cls(frac('hover:bg-secondary', '50'))}>
      <td className="p-3 font-mono text-xs text-muted-foreground">
        {new Date(log.timestamp).toLocaleString()}
      </td>
      <td className="p-3">
        <Chip 
          variant={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default'} 
          size="sm"
        >
          {log.level.toUpperCase()}
        </Chip>
      </td>
      <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
    </tr>
  ));

  const capabilityRows = [
    { key: 'business_extraction', label: 'Business extraction', mercury: true, nvidia: true },
    { key: 'business_research', label: 'Business research', mercury: true, nvidia: true },
    { key: 'entity_resolution', label: 'Entity resolution', mercury: true, nvidia: true },
    { key: 'review_analysis', label: 'Review analysis', mercury: true, nvidia: true },
    { key: 'sentiment_classification', label: 'Sentiment classification', mercury: true, nvidia: true },
    { key: 'competitor_analysis', label: 'Competitor analysis', mercury: true, nvidia: true },
    { key: 'trend_classification', label: 'Trend classification', mercury: true, nvidia: true },
    { key: 'report_generation', label: 'Report generation', mercury: true, nvidia: true },
    { key: 'structured_output', label: 'Structured output', mercury: true, nvidia: false },
  ].map((row) => (
    <tr key={row.key} className={cls(frac('hover:bg-secondary', '50'))}>
      <td className="p-3 font-medium text-foreground">{row.label}</td>
      <td className="text-center p-3">
        {row.mercury ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
      </td>
      <td className="text-center p-3">
        {row.nvidia ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
      </td>
    </tr>
  ));
`;

const newSource = source.slice(0, returnIndex) + variables + '\n' + source.slice(returnIndex);

// Replace the inline map callbacks with the variables
source = newSource;

// Replace the logs inline map with logRows variable
source = source.replace(
  `logs.map((log, index) => (
                      <tr key={index} className={cls(frac('hover:bg-secondary', '50'))}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <Chip 
                            variant={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default'} 
                            size="sm"
                          >
                            {log.level.toUpperCase()}
                          </Chip>
                        </td>
                        <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
                      </tr>
                    )))}`,
  `logRows`
);

// Replace the capabilities table inline map with capabilityRows variable
source = source.replace(
  `].map((row) => (
                      <tr key={row.key} className={cls(frac('hover:bg-secondary', '50'))}>
                        <td className="p-3 font-medium text-foreground">{row.label}</td>
                        <td className="text-center p-3">
                          {row.mercury ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
                        </td>
                        <td className="text-center p-3">
                          {row.nvidia ? <CheckCircle2 className="mx-auto h-4 w-4 text-verified" /> : <X className="mx-auto h-4 w-4 text-muted-foreground" />}
                        </td>
                      </tr>
                    )))}`,
  `capabilityRows`
);

fs.writeFileSync(file, source);
console.log("Fixed Operations.tsx");
