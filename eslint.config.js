// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Dates are formatted in an explicit zone through core/time (Req 13.6).
const datePipePath = {
  name: '@angular/common',
  importNames: ['DatePipe'],
  message: 'DatePipe formats in the browser zone. Use formatInZone from core/time.',
};

export default defineConfig(
  globalIgnores([
    'dist',
    '.angular',
    'coverage',
    'playwright-report',
    'test-results',
    'node_modules',
    'src/app/core/api/generated',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  // No date parsing or formatting outside core/time (Req 13.6).
  {
    files: ['src/**/*.ts'],
    ignores: ['src/app/core/time/**', 'src/**/*.spec.ts', 'src/testing/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length>0]",
          message:
            'Use parseUtc/fromEpochMs from core/time. new Date(<value>) is only allowed in core/time.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
          message: 'Use parseUtc from core/time. Date.parse is only allowed in core/time.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]',
          message: 'Use formatInZone from core/time so a time zone is always explicit.',
        },
      ],
      'no-restricted-imports': ['error', { paths: [datePipePath] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
  // Layering: features -> shared, core; shared -> core; core imports neither.
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [datePipePath],
          patterns: [
            { group: ['**/shared/**', '@app/shared/**'], message: 'core must not import shared.' },
            { group: ['**/features/**'], message: 'core must not import features.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [datePipePath],
          patterns: [{ group: ['**/features/**'], message: 'shared must not import features.' }],
        },
      ],
    },
  },
  // Spartan helm components are generated: hlm/brn prefixes and their own conventions.
  {
    files: ['src/app/shared/ui/**/src/**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': 'off',
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/no-input-rename': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
);
