// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prototype/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The simulation must stay pure: no DOM, no timers, no Math.random.
    files: ['src/sim/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
        'performance',
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG from rng.ts inside sim/.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'The simulation must be deterministic.',
        },
      ],
    },
  },
  {
    // Every balance number lives in data.ts. Elsewhere in sim/, name your constants.
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/data.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.ts', 'src/main.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'src/server/**/*.ts', 'tests/server-*.test.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
