const { transform } = require("esbuild");

const source = `
import React from 'react';
const cls = (...classes) => classes.filter(Boolean).join(' ');

const Test = ({ logs }) => (
  <div>
    {logs.length === 0 ? (
      <tr><td>Empty</td></tr>
    ) : (
      logs.map((log, index) => (
        <tr key={index} className={cls('hover:bg-secondary/50')}>
          <td>{log.message}</td>
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
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
