import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.ts',
      'scripts/**',
      'release/**',
    ],
  },

  // 基础 JS/TS 推荐规则
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 通用规则调整
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // 前端 canvas-web：浏览器环境 + React Hooks
  {
    files: ['packages/canvas-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // 后端 bridge-server：Node 环境
  {
    files: ['packages/bridge-server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
