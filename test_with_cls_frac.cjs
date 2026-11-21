const { transform } = require("esbuild");

const source = `
import React from 'react';
const cls = (...classes) => classes.filter(Boolean).join(' ');
const frac = (n, d) => n + '/' + d;
const Chip = ({children, variant, size}) => <span className={variant + ' ' + size}>{children}</span>;

const Test = ({ logs }) => (
  <div>
    {logs.length === 0 ? (
      <tr><td>Empty</td></tr>
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
      ))
    )}
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
