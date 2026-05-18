import antfu from '@antfu/eslint-config'

export default antfu(
  {
    react: true,
    typescript: true,
    stylistic: {
      indent: 2,
      quotes: 'single',
    },

    ignores: [
      '**/dist/',
      '**/coverage/',
      '**/docs/',
      '**/node_modules/',
      '**/plans/',
      '**/scripts/',
    ],
  },

  {
    rules: {
      'no-console': 'warn',
      'antfu/top-level-function': 'off',
      'node/prefer-global/process': 'off',
      'react-refresh/only-export-components': 'off',
      'react/use-state': 'off',
    },
  },

  // Markdown — disable rules that don't apply
  {
    files: ['**/*.md'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'markdown/no-missing-link-fragments': 'off',
    },
  },

  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'ts/no-explicit-any': 'off',
      'ts/no-unsafe-assignment': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },
)
