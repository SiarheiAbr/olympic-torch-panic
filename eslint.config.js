import js from '@eslint/js';

const LOGIC_FOLDERS = ['app/js/core/**/*.js', 'app/js/systems/**/*.js'];

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AudioContext: 'readonly',
      },
    },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Hard boundary from conventions.md: logic folders are DOM-free and deterministic.
    files: LOGIC_FOLDERS,
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'location',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random' },
        { object: 'Date', property: 'now' },
        { object: 'performance', property: 'now' },
      ],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { process: 'readonly', globalThis: 'readonly' },
    },
  },
];
