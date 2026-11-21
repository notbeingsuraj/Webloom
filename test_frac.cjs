const { transform } = require("esbuild");

const source = `
import React from 'react';
const cls = (...classes) => classes.filter(Boolean).join(' ');
const frac = (n, d) => n + String.fromCharCode(0x2F) + d;

const Test = ({ logs }) => (
  <div>
    {logs.length === 0 ? (
      <tr><td>Empty</td></tr>
    ) : (() => {
      const logRowClass = cls('hover:bg-secondary/50');
      return logs.map((log, index) => {
        let variant;
        if (log.level === 'error') {
          variant = 'danger';
        } else if (log.level === 'warning') {
          variant = 'warning';
        } else {
          variant = 'default';
        }
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
});
