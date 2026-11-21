const { transform } = require("esbuild");

const source = `
import React from 'react';

const Test = () => (
  <div>
    <div>Hello</div>
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
