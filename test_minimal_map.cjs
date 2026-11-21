const { transform } = require("esbuild");

const source = `
import React from 'react';

const Test = ({ logs }) => (
  <div>
    {logs.map((log, index) => (
      <tr key={index}><td>{log.message}</td></tr>
    ))}
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
