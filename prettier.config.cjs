// prettier.config.cjs
module.exports = {
  // ensure plugin is explicitly loaded
  plugins: [require.resolve('prettier-plugin-ejs')],
  // local formatting rules (tweak to taste)
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'es5',
  singleQuote: false,
  semi: true,
  useTabs: false,
  // tell Prettier to use ejs parser for .ejs files
  overrides: [
    {
      files: ['**/*.ejs'],
      options: {
        parser: 'ejs'
      }
    }
  ]
};
