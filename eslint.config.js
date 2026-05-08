import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // process used in a few Vite-defined env checks
        process: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // ── Real bugs: keep as errors ─────────────────────────────────────
      // react-hooks/rules-of-hooks stays error (from recommended preset)

      // ── Dead code: warn only ──────────────────────────────────────────
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': 'warn',
      'no-useless-escape': 'warn',

      // ── HMR hint — not a runtime bug ─────────────────────────────────
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── React Compiler diagnostics — downgrade to warn ───────────────
      // These fire on patterns the compiler can't optimise; not runtime bugs.
      'react-hooks/static-components':              'warn',
      'react-hooks/purity':                         'warn',
      'react-hooks/set-state-in-effect':            'warn',
      'react-hooks/immutability':                   'warn',
      'react-hooks/preserve-manual-memoization':    'warn',
      'react-hooks/hooks':                          'warn',
      'react-hooks/use-memo':                       'warn',
      'react-hooks/void-use-memo':                  'warn',
      'react-hooks/set-state-in-render':            'warn',
    },
  },
])
