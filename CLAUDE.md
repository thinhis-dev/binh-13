# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative docs

Two hand-written docs carry the full spec — read them before non-trivial work:

- **[AGENTS.md](./AGENTS.md)** — conventions, security rules, and step-by-step recipes for adding socket events / game rules. Everything there applies; this file does not repeat it.
- **[PLAN.md](./PLAN.md)** — complete game rules, card comparison algorithm, data models, and event contracts.
- `docs/` — per-feature design notes (session/room realtime, hand sorting, result display, room settings, etc.).

Binh 13 is a real-time 2-player Chinese Poker variant. Players share a 6-char room code, are dealt 13 cards each, arrange them into 3 groups (Back 5 / Middle 5 / Front 3), and the server compares. Win 2 of 3 groups to win. A **foul** (Back weaker than Middle) loses all 3.

## Commands

```bash
pnpm install            # install workspace deps (postinstall sets git hooksPath to .githooks)
pnpm dev                # run server + web in parallel (server :8080, web :5173)
pnpm --filter @binh-13/server dev   # server only
pnpm --filter @binh-13/web dev      # web only
pnpm typecheck          # tsc --noEmit across all packages
pnpm test               # vitest run across all packages
pnpm test:coverage      # with v8 coverage
pnpm lint               # eslint (antfu config); lint:fix to autofix
pnpm build              # builds shared first, then server + web
```

Run a single test file or test from within a package (vitest lives per-package):

```bash
pnpm --filter @binh-13/server test src/game/__tests__/engine.test.ts
pnpm --filter @binh-13/server exec vitest run -t "deal"   # by test name
pnpm --filter @binh-13/server test:watch                  # watch mode
```

## Architecture

pnpm monorepo, three packages (`apps/*`, `packages/*`), all TypeScript ESM:

- **`packages/shared`** — the contract between client and server. Consumed as `@binh-13/shared` via `workspace:*`, resolved **directly from `src/*.ts`** (no build step; its "build" is just `tsc --noEmit`). Holds `types.ts`, the `EVENTS` constant + `GAME_TIMER_SECONDS` (`events.ts`), the 3-card `evaluator.ts`, `foulCheck.ts`, and `handHighlight.ts`. The 3-card evaluator and foul check are deliberately shared so client UI preview and authoritative server comparison never diverge — do not fork them.
- **`apps/server`** — Hono (HTTP, just `/health` + logging) + Socket.io on the **same** `httpServer` (`server.ts`). `createRealtimeServer()` wires up three event-handler groups registered against the `io` instance: `rooms/roomEvents.ts`, `game/gameEvents.ts`, `game/rematchEvents.ts`. `index.ts` is only the port bootstrap.
- **`apps/web`** — React 19 + Vite SPA. Page-per-phase (`Home` → `Lobby` → `Game` → `Result`). State in Zustand stores (`stores/gameStore.ts`, `stores/sessionStore.ts`); a single shared Socket.io client in `lib/socket.ts`; drag-and-drop arrangement via `@dnd-kit` (`hooks/useArrangement.ts`, `lib/dnd.ts`). UI primitives in `components/ui/` are Radix + Tailwind v4 (shadcn-style).

### Server state model — two tiers, and they can diverge

- **SQLite (`db.ts`)** is the *durable* store: `sessions`, `rooms`, `room_players`, `hands`, `arrangements`. **`runMigrations` runs `DROP TABLE IF EXISTS` for every table on each `initDb()`** — i.e. the database is wiped clean on every server start. There are no incremental migrations; schema changes go directly in that one `exec` block. Foreign keys are ON and several tables cascade on `rooms` delete.
- **In-memory (`game/gameManager.ts`)** holds live `GameInstance`s keyed by room code, including the **round timer** (`setInterval`). This is *not* in SQLite. The classic bug class here: a room row gets deleted (both players disconnect / leave / clear) but the in-memory timer keeps running and fires `resolveRound`, which then INSERTs against a missing FK. Whenever a room is torn down, the timer must be cancelled — `endGame()` is called from the disconnect, `ROOM_LEAVE`, and `ROOM_CLEAR` paths for exactly this reason (see commit `053915a`).

### Socket event flow

Client emits are typed wrappers in `apps/web/src/lib/socket.ts`; server handlers Zod-validate every payload before touching the DB. Never use raw event-name strings — always the `EVENTS` constant. Adding an event touches shared (`events.ts` + `types.ts`), a server handler + Zod schema, and the web wrapper — the exact checklist is in AGENTS.md.

## Card format

Internal card IDs are uppercase `rank + suit`, e.g. `"AS"`, `"TH"`, `"2C"` — `'T'` means 10 (never `'10'`). Ace is always high. Conversion to pokersolver's format (`"As"`) happens only inside the evaluators. 5-card hands use the `pokersolver` library; 3-card groups use the custom shared evaluator (Trips > Pair > High Card, no straights/flushes).

## Tests

Vitest everywhere. Unit tests are co-located in sibling `__tests__/` folders; integration tests use the `.integration.test.ts` suffix and run a **real** Socket.io server on port `0` against **in-memory SQLite** (`DATABASE_PATH=:memory:`) — do not mock the DB or transport in those. Helpers live in `apps/server/src/__tests__/helpers/`. New logic ships with tests in the same change; `test.skip` requires a `// TODO:` explaining why.

## Git hooks

`core.hooksPath` is set to `.githooks/` by the `prepare` script on install. The `pre-commit` hook strips coverage output from the index (`pnpm clean:coverage`) so coverage artifacts never get committed.
