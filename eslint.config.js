import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'playground-dist/**',
      'node_modules/**',
      'coverage/**',
      'tests/architecture/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    // Shipped library code must not touch runtime-specific globals. Runtime
    // integrations live under src/runtimes/ and are exempt.
    files: ['src/**/*.ts'],
    ignores: ['src/runtimes/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'self',
          'Buffer',
          'process',
          'require',
          'module',
          '__dirname',
          '__filename',
          'Blob',
          'File',
          'HTMLCanvasElement',
          'OffscreenCanvas',
          'TextEncoder',
          'TextDecoder',
          'console',
        ].map((name) => ({
          name,
          message: `Use of "${name}" is only allowed in src/runtimes/*. Universal modules must not assume it exists.`,
        })),
      ],
    },
  },
  {
    // Boundary validation: values typed as literals are still checked at runtime because
    // callers may be plain JavaScript, so "unnecessary" conditions are intentional here.
    files: [
      'src/application/normalize.ts',
      'src/application/colors.ts',
      'src/registry/registry.ts',
      'src/public/kit.ts',
      'src/testing/index.ts',
      'src/runtimes/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-unnecessary-condition': 'off' },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.mjs', 'bench/**/*.mjs', 'examples/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
  },
  {
    // The playground is browser code that imports the built package from dist/.
    files: ['playground/js/**/*.js'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
    languageOptions: {
      globals: Object.fromEntries(
        [
          'window',
          'document',
          'navigator',
          'location',
          'history',
          'localStorage',
          'matchMedia',
          'performance',
          'console',
          'setTimeout',
          'clearTimeout',
          'URL',
          'Blob',
          'Image',
          'DOMParser',
          'ClipboardItem',
          'FileReader',
          'TextEncoder',
          'TextDecoder',
          'createImageBitmap',
          'fetch',
          'btoa',
          'atob',
          'globalThis',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
  {
    files: ['playground/serve.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { module: 'writable', require: 'readonly' } },
  },
);
