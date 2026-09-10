module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'supabase/functions/**', 'palette-backup/**'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    '@typescript-eslint/no-explicit-any': 'off',
    // while (true) { ... break ... } is a deliberate pagination pattern
    // used across the data-fetching hooks — still catch accidental
    // `if (true)` / constant-assignment conditions elsewhere.
    'no-constant-condition': ['error', { checkLoops: false }],
    // Deliberate best-effort localStorage writes ("don't crash the app
    // over a quota/private-browsing failure") use bare `catch {}` in
    // several places — still catch a genuinely empty `if`/`else`/etc.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
}
