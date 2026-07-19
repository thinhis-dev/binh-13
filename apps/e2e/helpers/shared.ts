import * as sharedModule from '@binh-13/shared'

/**
 * @binh-13/shared has no "type": "module" in its package.json, so Node resolves its .ts
 * entry as CommonJS. Playwright's Node-based test runner (unlike Vite/Vitest's bundler)
 * can't statically detect that module's named exports, so Node's interop nests the whole
 * CJS `module.exports` under `.default` instead of hoisting individual names. Re-export the
 * unwrapped values here once so other files can `import { RANK_VALUE } from './shared'`.
 */
const shared = (sharedModule as unknown as { default: typeof sharedModule }).default ?? sharedModule

export const { RANK_VALUE, quickFoulCheck } = shared
