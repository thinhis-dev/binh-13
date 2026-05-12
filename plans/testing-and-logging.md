# Testing Infrastructure + Logging System

> **Status:** Draft v1.0 · Planned May 12, 2026  
> Covers: unit tests, integration tests, >90% coverage enforcement, pino logging

---

## Overview

**Goal:** Establish quality gates before the game engine is built. Three workstreams run in parallel:

1. Vitest unit + integration tests across all packages with enforced ≥90% coverage thresholds
2. Structured `pino` logging on the server to replace scattered `console.log`
3. `AGENTS.md` rules so all future AI-generated code ships with tests

**Stack additions:**

- Server: `pino`, `pino-pretty` (dev), `socket.io-client` (test), `@vitest/coverage-v8`
- Web: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
- Shared: `vitest`, `@vitest/coverage-v8`

---

## Phase 1 — Server Unit Tests

### 1.1 Install dependencies

```bash
pnpm --filter @binh-13/server add -D @vitest/coverage-v8
```

### 1.2 Create `apps/server/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
})
```

### 1.3 Create `apps/server/src/__tests__/setup.ts`

- Set `process.env.DATABASE_PATH = ':memory:'` before all tests
- Call `initDb()` in `beforeAll`
- Re-run migrations in `beforeEach` for a clean slate per test (drop + recreate tables)

### 1.4 Unit test files

| File                                       | What to cover                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rooms/__tests__/roomManager.test.ts`      | `createRoom`, `joinRoom` (new / existing / full), `leaveRoom` (last player auto-clears), `clearRoom`, `getRoom`, `getRoomByPlayer`, `toPublicRoom` |
| `session/__tests__/sessionManager.test.ts` | `createSession`, `updateSocketId`, `getSession`, `getSessionBySocketId` (hit + miss)                                                               |
| `game/__tests__/engine.test.ts`            | `shuffle` (52 unique cards), `deal` (13 per player, no duplicates)                                                                                 |
| `game/__tests__/evaluator.test.ts`         | All 5-card hand types via pokersolver wrapper                                                                                                      |
| `game/__tests__/foulCheck.test.ts`         | Valid arrangements, each foul condition                                                                                                            |
| `game/__tests__/compareRound.test.ts`      | win/lose/draw/double-foul scenarios                                                                                                                |

### 1.5 Update `apps/server/package.json` scripts

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"test:watch": "vitest"
```

---

## Phase 2 — Server Integration Tests

### 2.1 Install dependencies

```bash
pnpm --filter @binh-13/server add -D socket.io-client
```

### 2.2 Create `apps/server/src/__tests__/helpers/createTestServer.ts`

- Bootstraps full Hono + Socket.io stack on **port 0** (OS assigns random port)
- Uses in-memory SQLite (`DATABASE_PATH=':memory:'`)
- Returns `{ port, closeServer }` — each test suite gets an isolated instance
- Call `closeServer()` in `afterAll`

### 2.3 Create `apps/server/src/__tests__/helpers/socketClient.ts`

- Wraps `socket.io-client` with a `waitForEvent(socket, event, timeoutMs?)` helper
- Returns a typed `Promise` that resolves with the event payload or rejects on timeout

### 2.4 Create `rooms/__tests__/roomEvents.integration.test.ts`

Scenarios to cover:

| Scenario                                                | Expected outcome                               |
| ------------------------------------------------------- | ---------------------------------------------- |
| `SESSION_CREATE` with valid name                        | `SESSION_CREATED` with numeric `playerId`      |
| `SESSION_CREATE` with empty name                        | `error` emitted (Zod validation)               |
| `ROOM_CREATE` → `ROOM_CREATED` + `ROOM_STATE`           | 1 player, status `waiting`                     |
| `ROOM_JOIN` (2nd client) → `ROOM_JOINED` + `ROOM_STATE` | 2 players                                      |
| `ROOM_JOIN` on full room                                | `error` emitted                                |
| `ROOM_LEAVE` (non-last player)                          | `ROOM_LEFT` emitted                            |
| `ROOM_LEAVE` (last player)                              | Room auto-deleted                              |
| `ROOM_CLEAR` by creator                                 | `ROOM_CLEARED` broadcast                       |
| `ROOM_CLEAR` by non-creator                             | `error` emitted                                |
| `ROOM_MESSAGE`                                          | Broadcast to all sockets in room               |
| `disconnect`                                            | Room state updated, remaining players notified |
| Invalid payload (any event)                             | `error` with Zod message                       |

---

## Phase 3 — Frontend Unit Tests

### 3.1 Install dependencies

```bash
pnpm --filter @binh-13/web add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

### 3.2 Create `apps/web/vitest.config.ts`

- Reuse vite `resolve.alias` (`@` → `./src`, `@binh-13/shared` → shared package)
- `environment: 'jsdom'`
- `setupFiles: ['./src/__tests__/setup.ts']`
- Coverage: provider `v8`, thresholds 90%, include `src/**/*.{ts,tsx}`, exclude `src/main.tsx`, `src/vite-env.d.ts`

### 3.3 Create `apps/web/src/__tests__/setup.ts`

```ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('@/lib/socket', () => ({
  socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), connected: false },
  ensureSocketConnected: vi.fn(),
}))
```

### 3.4 Unit test files

| File                                     | What to cover                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `stores/__tests__/sessionStore.test.ts`  | `setSession`, `setRoom`, `clearSession`, localStorage persistence        |
| `stores/__tests__/gameStore.test.ts`     | `setRoom`, `setHand`, `setArrangement`, `setResult`, `setTimer`, `reset` |
| `lib/__tests__/cards.test.ts`            | `SUIT_SYMBOL`, `RANK_VALUE`, card parsing helpers                        |
| `lib/__tests__/utils.test.ts`            | `cn()` and other utils                                                   |
| `hooks/__tests__/useArrangement.test.ts` | Group assignment state, live foul check, submit disabled on foul         |

### 3.5 Update `apps/web/package.json` scripts

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"test:watch": "vitest"
```

---

## Phase 4 — Shared Package Tests

### 4.1 Install dependencies

```bash
pnpm --filter @binh-13/shared add -D vitest @vitest/coverage-v8
```

### 4.2 Create `packages/shared/vitest.config.ts`

- `environment: 'node'`, coverage thresholds 90%

### 4.3 Create `packages/shared/src/__tests__/evaluator.test.ts`

- `evaluateThreeCard`: three-of-a-kind, one pair, high card inputs
- `compareThreeCard`: all win/lose/draw cases, multi-level tiebreaker resolution

### 4.4 Update `packages/shared/package.json` scripts

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

---

## Phase 5 — Coverage Enforcement

### 5.1 Vitest thresholds

All 3 packages have identical thresholds in their `vitest.config.ts`:

```ts
thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }
```

Vitest exits non-zero when below threshold — blocks CI automatically.

### 5.2 Root `package.json` scripts

```json
"test:coverage": "pnpm -r test:coverage"
```

### 5.3 CI step (GitHub Actions, future)

```yaml
- run: pnpm test:coverage
```

Fails the build if any package is below 90%.

### 5.4 `AGENTS.md` additions — Testing & Coverage Rules section

```markdown
## Testing & Coverage Rules

- All new logic (functions, event handlers, stores) MUST have co-located unit tests in the same change.
- New socket events and DB operations MUST have integration tests in `*.integration.test.ts` files.
- Run `pnpm test:coverage` before marking work complete. All packages must report ≥90% lines/functions/branches and exit 0.
- Never commit a failing test.
- Never use `test.skip` without a `// TODO:` comment explaining why and a plan to remove it.
- Unit tests live in `__tests__/` sibling to the module under test.
- Integration tests use the suffix `.integration.test.ts`.
- Never mock the database or socket transport in integration tests — use in-memory SQLite and a real Socket.io server on port 0.
```

---

## Phase 6 — Structured Logging (pino)

### 6.1 Install dependencies

```bash
pnpm --filter @binh-13/server add pino
pnpm --filter @binh-13/server add -D pino-pretty
```

### 6.2 Create `apps/server/src/lib/logger.ts`

```ts
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context)
}
```

**Log levels by use case:**

| Level   | When to use                                                      |
| ------- | ---------------------------------------------------------------- |
| `debug` | Incoming socket events, DB reads, session lookups                |
| `info`  | Server start, room created/joined/cleared, HTTP requests         |
| `warn`  | Zod validation errors, rejected actions (full room, non-creator) |
| `error` | Caught exceptions in event handlers                              |
| `fatal` | Unhandled rejections / uncaught exceptions                       |

**Structured fields convention:**

Every log line at or above `info` should include relevant context fields:

```ts
log.info({ socketId, playerId, roomCode, event }, 'player joined room')
```

### 6.3 Replace `console.log` in each server file

**`apps/server/src/index.ts`**

- Server start: `logger.info({ port }, 'Server running')`
- Add HTTP request logging middleware (before routes):
  ```ts
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      'http',
    )
  })
  ```
- Add unhandled rejection handler:
  ```ts
  process.on('unhandledRejection', (err) =>
    logger.fatal({ err }, 'unhandledRejection'),
  )
  ```

**`apps/server/src/db.ts`**

- `logger.info({ dbPath }, 'Database initialized')`

**`apps/server/src/rooms/roomEvents.ts`**

- Per-connection child logger:
  ```ts
  const log = createChildLogger({ socketId: socket.id })
  log.info('Client connected')
  ```
- Each event handler logs at `debug` on entry, `info` on success, `warn` on rejection

**`apps/server/src/rooms/roomManager.ts`**

- Room state changes at `debug` level

**`apps/server/src/session/sessionManager.ts`**

- Session creation at `debug` level

---

## New Files Summary

```
apps/server/
  vitest.config.ts
  src/
    lib/
      logger.ts
    __tests__/
      setup.ts
      helpers/
        createTestServer.ts
        socketClient.ts
    rooms/__tests__/
      roomManager.test.ts
      roomEvents.integration.test.ts
    session/__tests__/
      sessionManager.test.ts
    game/__tests__/
      engine.test.ts
      evaluator.test.ts
      foulCheck.test.ts
      compareRound.test.ts

apps/web/
  vitest.config.ts
  src/
    __tests__/
      setup.ts
    stores/__tests__/
      sessionStore.test.ts
      gameStore.test.ts
    lib/__tests__/
      cards.test.ts
      utils.test.ts
    hooks/__tests__/
      useArrangement.test.ts

packages/shared/
  vitest.config.ts
  src/__tests__/
    evaluator.test.ts
```

## Modified Files Summary

```
apps/server/package.json          — add deps + test:coverage script
apps/web/package.json             — add deps + test scripts
packages/shared/package.json      — add deps + test scripts
package.json (root)               — add test:coverage script
apps/server/src/index.ts          — replace console.log, add HTTP middleware
apps/server/src/db.ts             — replace console.log
apps/server/src/rooms/roomEvents.ts   — replace with pino child logger
apps/server/src/rooms/roomManager.ts  — replace console.log
apps/server/src/session/sessionManager.ts — replace console.log
AGENTS.md                         — add Testing & Coverage Rules section
```

---

## Verification Checklist

- [ ] `pnpm test` passes with zero failures across all packages
- [ ] `pnpm test:coverage` exits 0 and shows ≥90% lines/functions/branches for all 3 packages
- [ ] Manually lower one threshold → `pnpm test:coverage` exits non-zero
- [ ] Integration test: two socket clients complete SESSION_CREATE → ROOM_CREATE → ROOM_JOIN and receive correct events
- [ ] `pnpm --filter server dev` → pino-pretty colorized output visible on connect/event/HTTP
- [ ] `NODE_ENV=production node apps/server/dist/index.js` → plain JSON lines to stdout

---

## Decisions

| Decision                   | Choice                        | Reason                                                    |
| -------------------------- | ----------------------------- | --------------------------------------------------------- |
| Coverage tool              | `@vitest/coverage-v8`         | Built into Vitest, no Babel/Istanbul needed               |
| Logger                     | `pino`                        | 5–10× faster than winston, ships own TS types, JSON-first |
| Integration test DB        | In-memory SQLite (`:memory:`) | No file cleanup, fast, isolated per test suite            |
| Integration test transport | Real Socket.io on port 0      | High-fidelity; avoids mock drift                          |
| Frontend test env          | `jsdom`                       | Best compatibility with `@testing-library/react`          |
| E2E scope                  | Out of scope                  | Separate future phase (Playwright)                        |
