import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/events.ts',
        // TODO Phase 2: add 'src/evaluator.ts' once evaluateThreeCard and
        // compareThreeCard are implemented and tested.
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
