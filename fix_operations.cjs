const fs = require("fs");
const file = "apps/web/src/pages/Operations.tsx";
let source = fs.readFileSync(file, "utf8");

// Find the logs section and restructure it
const oldSection = `{logs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        No events recorded yet. Run a health check to generate events.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, index) => (
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
                    )))}
                  </tbody>`;

const newSection = `const logRows = logs.map((log, index) => (
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

                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        No events recorded yet. Run a health check to generate events.
                      </td>
                    </tr>
                  ) : (
                    logRows
                  )}
                  </tbody>`;

if (source.includes(oldSection)) {
  source = source.replace(oldSection, newSection);
  fs.writeFileSync(file, source);
  console.log("Fixed Operations.tsx logs section");
} else {
  console.log("Could not find the section to replace");
}
