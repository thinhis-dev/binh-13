import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@binh-13/shared': path.resolve(
        __dirname,
        '../../packages/shared/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/stores/**/*.ts',
        'src/lib/cards.ts',
        'src/lib/utils.ts',
        'src/hooks/useSocket.ts',
        // TODO Phase 2: add 'src/hooks/useArrangement.ts' once dnd-kit
        // drag-drop state and live foul evaluation are implemented.
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
