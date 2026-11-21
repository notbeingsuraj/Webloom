const { transform } = require("esbuild");

const source = `
import React from 'react';

const Test = () => (
  <div>
    <div>
      <table>
        <tbody>
          {logs.map((log, index) => (
            <tr key={index} className="hover:bg-secondary-50">
              <td className="p-3 font-mono text-xs text-muted-foreground">
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td className="p-3">
                <span className={log.level === 'error' ? 'danger' : 'default'}>
                  {log.level.toUpperCase()}
                </span>
              </td>
              <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
            </tr>
          )}
        </tbody>
      </table>
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
