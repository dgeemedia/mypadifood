// eslint.config.cjs
module.exports = [
  // Primary JS config (Node server + scripts)
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    // Do not lint files in node_modules, public assets or EJS views here
    ignores: ["node_modules/**", "public/**", "views/**"],

    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      // Provide Node globals so "no-undef" doesn't trigger on require/process/etc.
      globals: {
        // Common Node globals
        require: "readonly",
        module: "writable", // module.exports will be used
        exports: "writable",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
        Buffer: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly"
      }
    },

    // Basic rules to start with. Keep them conservative; you can expand later.
    rules: {
      // stylistic / useful defaults
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
      "no-undef": "error",
      "no-console": "off",
      // prefer const/let - but allow var if you have legacy code
      "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }]
    }
  },

  // Optional overrides for scripts that may use top-level await or ESM style
  {
    files: ["scripts/**", "bin/**"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        require: "readonly",
        process: "readonly",
        console: "readonly",
        module: "writable",
        __dirname: "readonly",
        __filename: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];
