const { transform } = require("esbuild");

const source = `
import React from 'react';

const Test = () => (
  <div>
    <div>
      <div>
        <div>
          <div>
            <table>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td>Empty</td></tr>
                ) : (() => {
                  const logRowClass = 'hover:bg-secondary/50';
                  return logs.map((log, index) => {
                    const variant = log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default';
                    return (
                      <tr key={index} className={logRowClass}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className={variant}>
                            {log.level.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default Test;
`;

transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: "test.tsx"
}).then(() => console.log("PASS")).catch((error) => {
  console.error("ERROR:", error.message);
});
