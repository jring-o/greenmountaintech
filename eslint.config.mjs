import nextPlugin from '@next/eslint-plugin-next';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import-x';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ──────────────────────────────────────────────────
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // ── Base: TypeScript files ──────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@next/next': nextPlugin,
      'import-x': importPlugin,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      // ── @typescript-eslint/recommended ────────────────────────────
      ...tseslint.configs.recommended.rules,

      // ── @next/next core-web-vitals rules ──────────────────────────
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // ── import ordering ───────────────────────────────────────────
      'import-x/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/newline-after-import': 'warn',

      // ── no-restricted-syntax: block new Date() outside lib/tz.ts & tests ──
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Use the helpers in lib/tz.ts instead of raw new Date(). ' +
            'Direct Date construction is only allowed in lib/tz.ts and tests/**.',
        },
      ],
    },
  },

  // ── Override: allow new Date() in lib/tz.ts, adapters, queries, scripts & tests ──
  {
    files: [
      'lib/tz.ts',
      'lib/log.ts',
      'lib/adapters/ical.ts',
      'lib/adapters/rss.ts',
      'lib/ingest/dedupe.ts',
      'lib/ingest/normalize.ts',
      'lib/ingest/runner.ts',
      'lib/rate-limit.ts',
      'lib/backup/**',
      'lib/db/queries/events-schema.ts',
      'lib/db/queries/events.ts',
      'lib/db/queries/runs.ts',
      'lib/db/queries/dashboard.ts',
      'lib/validation/schemas.ts',
      'app/**/admin/**',
      'app/api/admin/**',
      'app/api/cron/backup/**',
      'app/api/submissions/**',
      'components/admin/**',
      'components/public/SubmissionForm.tsx',
      'scripts/**',
      'tests/**',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
