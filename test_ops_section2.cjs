const { transform } = require("esbuild");

const source = `
import React from 'react';
const cls = (...classes) => classes.filter(Boolean).join(' ');
const frac = (n, d) => n + '/' + d;
const Chip = ({children, variant, size}) => <span className={variant + ' ' + size}>{children}</span>;

const Test = ({ logs }) => (
  <div>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Level</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {logs.length === 0 ? (
          <tr>
            <td colSpan={3} className="p-8 text-center text-muted-foreground">
              No events recorded yet. Run a health check to generate events.
            </td>
          </tr>
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
                    <span variant={variant} size="sm">
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
                </tr>
              );
            })()}
          </tbody>
      </table>
    </div>
  );
}

export default Test;
`;

const { transform } = require("esbuild");

transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: "test.tsx"
}).then(() => console.log("PASS")).catch((error) => {
  console.error("ERROR:", error.message);
});
