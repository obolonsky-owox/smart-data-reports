import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'ui/vendor'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'indexedDB'],
    },
  },
  {
    files: ['ui/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['react', 'react-dom', 'react/*'], message: 'ui/lib stays free of React.' }] },
      ],
    },
  },
  { files: ['scripts/**/*.mjs', '*.config.{js,ts}'], languageOptions: { globals: { ...globals.node } } },
);
