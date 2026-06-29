import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", ".npm-bootstrap/**", "node_modules/**", "coverage/**", "dist/**"]
  },
  ...nextVitals,
  ...nextTypescript
];

export default eslintConfig;
