// Crash-guard lint — runs in `prebuild` so a build fails fast on the one
// class of bug Vite silently ships: references to undefined variables and
// undefined JSX components (e.g. the LayoutGrid crash). Intentionally narrow
// — only the rules that map to a runtime ReferenceError. Stylistic rules live
// in eslint.config.js and run via `npm run lint`.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'electron', 'playwright', 'tests', '*.config.js']),
  {
    files: ['src/**/*.{js,jsx}'],
    // Inline eslint-disable directives reference stylistic rules this narrow
    // config doesn't enable — don't flag them as unused here.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    // react-hooks registered (rules off) so inline eslint-disable directives
    // naming its rules resolve instead of erroring as "rule not found".
    plugins: { js, react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, process: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
])
