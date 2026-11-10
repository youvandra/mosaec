import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { flatConfigs as importX } from 'eslint-plugin-import-x';
import globals from 'globals';
import { configs as tsConfigs } from 'typescript-eslint';

/**
 * Shared flat config for every TypeScript and JavaScript file in the monorepo.
 *
 * @param {string} rootDir Absolute path of the repository root.
 */
export function createConfig(rootDir) {
  return defineConfig(
    {
      ignores: [
        '**/node_modules/',
        '**/.next/',
        '**/.turbo/',
        '**/dist/',
        '**/coverage/',
        '**/next-env.d.ts',
        'contracts/',
        'vendor/',
      ],
    },
    js.configs.recommended,
    tsConfigs.strictTypeChecked,
    tsConfigs.stylisticTypeChecked,
    importX.recommended,
    importX.typescript,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDir,
        },
      },
      settings: {
        'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        // TypeScript checks these already, and the plugin misreads CommonJS default exports.
        'import-x/default': 'off',
        'import-x/named': 'off',
        'import-x/namespace': 'off',
        'import-x/no-named-as-default-member': 'off',
        'import-x/no-cycle': 'error',
        'import-x/no-duplicates': 'error',
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
            pathGroups: [{ pattern: '@mosaec/**', group: 'internal' }],
            pathGroupsExcludedImportTypes: ['type'],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tsConfigs.disableTypeChecked],
    },
    {
      files: [
        'packages/*/src/**',
        'packages/config/*.ts',
        'apps/api/src/**',
        'apps/indexer/src/**',
      ],
      rules: {
        'import-x/no-default-export': 'error',
      },
    },
    {
      files: ['apps/web/**'],
      plugins: { '@next/next': nextPlugin },
      languageOptions: { globals: globals.browser },
      settings: { next: { rootDir: 'apps/web' } },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
    prettierConfig,
  );
}
