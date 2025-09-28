// CommonJS ESLint config for Node server app
module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true
  },
  parserOptions: {
    ecmaVersion: 2021
  },
  plugins: ["node", "import", "promise", "unused-imports"],
  extends: [
    "eslint:recommended",
    "plugin:node/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:promise/recommended",
    "prettier"
  ],
  rules: {
    "no-console": "off",
    "no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      { "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" }
    ],
    "import/no-unresolved": "off",
    "node/no-unsupported-features/es-syntax": ["error", { "ignores": ["modules"] }],
    "node/no-missing-require": "off"
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".json", ".cjs"]
      }
    }
  }
};
