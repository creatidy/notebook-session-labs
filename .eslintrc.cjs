module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "node"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:node/recommended",
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    "node/no-unsupported-features/es-syntax": [
      "error",
      {
        version: ">=18.0.0",
        ignores: ["modules"],
      },
    ],
    "node/no-missing-import": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
  settings: {
    node: {
      tryExtensions: [".js", ".json", ".node", ".ts"],
    },
  },
  ignorePatterns: ["dist/", "node_modules/", "*.d.ts", ".eslintrc.cjs"],
};