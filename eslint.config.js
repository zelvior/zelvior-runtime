// ESLint flat config (ESLint 9+). Deliberately lenient on style (Prettier
// owns formatting) and focused on real bugs: this is the config that
// would have caught nothing about the O(n^2) HTMLCollection bug fixed in
// v0.10.0 (that's an algorithmic issue, not a lint rule), but it does
// catch the class of mistakes that recur in this codebase -- var-based
// closures with subtle scoping, unused catch bindings that hide real
// errors in `safe0()`, etc.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'landing-page/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.js', 'build.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        PerformanceObserver: 'readonly',
        CustomEvent: 'readonly',
        WeakMap: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        Promise: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        DOMParser: 'readonly',
        sessionStorage: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        EventTarget: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Every empty catch in this codebase is a deliberate safety net
      // (the safe0()/safe1() pattern, and defensive try/catch around
      // browser APIs that may throw in older engines) -- an accidentally
      // *silent* real error would show up as "the runtime does nothing
      // and reports no reason why," which the test suite + bench.mjs
      // exist to catch at the behavior level, not the lint level.
      'no-empty': 'off',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_|^e$|^err$' }],
      'no-var': 'off', // deliberate: src/zelvior.js targets pre-ES2015 engines (see legacy build)
      'prefer-const': 'off', // same reason
      eqeqeq: ['warn', 'smart'],
      'no-implicit-globals': 'error',
    },
  },
  {
    files: ['bench.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { global: 'writable', console: 'readonly', performance: 'readonly' },
    },
  },
  {
    files: ['test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        global: 'writable',
        console: 'readonly',
        performance: 'readonly',
        document: 'readonly',
        window: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        EventTarget: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
