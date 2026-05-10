# binh-13 — AI Agent Instructions

Real-time 2-player card game (Chinese Poker variant). React+Vite frontend + Hono+Socket.io backend in a pnpm monorepo.

> Full architecture, game rules, data models, and event contracts are in [PLAN.md](./PLAN.md). Read it before making changes.

---

## Project Structure

```
apps/web/        → React + Vite SPA (served statically from server in prod)
apps/server/     → Hono + Socket.io game server (Node.js, deployed to Fly.io)
packages/shared/ → Shared TypeScript types, socket event constants, 3-card evaluator
```

## Key Conventions

- **Server is authoritative** — clients propose arrangements; server validates and compares. Never trust client-computed results.
- **Shared types** — `Card`, `Room`, `PlayerArrangement`, `RoundResult` all live in `packages/shared/src/types.ts`. Import from there in both apps.
- **Socket events** — use `EVENTS` constant from `packages/shared/src/events.ts`. Never use raw event name strings.
- **Validate all socket payloads** — use Zod schemas on the server side before processing any client event.
- **Card format** — internal card IDs are uppercase rank + uppercase suit (e.g. `"AS"`, `"TH"`, `"2C"`). Use `'T'` for 10, not `'10'`. Convert to pokersolver format (`"As"`) only inside `evaluator.ts`.
- **3-card evaluator** — lives in `packages/shared/src/evaluator.ts`. Use on both server (authoritative) and client (live UI preview). Do not duplicate.
- **5-card evaluation** — use `pokersolver` library. Do not write custom poker hand ranking logic.
- **Never send opponent's hand to clients** — only send `game:dealt` with the player's own cards. Reveal both arrangements only in `game:result`.

## Commands

```bash
# Install all dependencies
pnpm install

# Run everything in dev
pnpm dev

# Run only frontend
pnpm --filter web dev

# Run only server
pnpm --filter server dev

# Type check all packages
pnpm typecheck

# Run tests (Vitest)
pnpm test

# Build all
pnpm build

# Deploy (once fly.toml is configured)
fly deploy
```

## Environment Variables

```bash
# apps/server (Fly.io secrets in prod)
PORT=8080
JWT_SECRET=...
DATABASE_PATH=./dev.db   # in prod: /data/binh13.db (Fly.io volume)

# apps/web (Vite build-time, set in fly.toml [build.args] for prod)
VITE_SOCKET_URL=ws://localhost:8080
```

## Game Engine Rules (read before touching evaluator logic)

- **Group 1 (Back)** = 5 cards, poker ranking — must be strongest
- **Group 2 (Middle)** = 5 cards, poker ranking — must be weaker than Group 1
- **Group 3 (Front)** = 3 cards, simplified: Three of a Kind > One Pair > High Card. No flushes, no straights.
- **Foul** = Group 1 rank < Group 2 rank → player loses all 3 groups
- **Card ranks** (low to high): 2 3 4 5 6 7 8 9 T J Q K A
- **Ace is always high** — no ace-low straights in Group 3
- **Winner** = player who wins 2 or 3 of the 3 groups

See [PLAN.md § 2 Game Rules](./PLAN.md#2-game-rules-full-spec) and [§ 3 Card Comparison Algorithm](./PLAN.md#3-card-comparison-algorithm) for full detail.

## Adding a New Socket Event

1. Add the constant to `packages/shared/src/events.ts`
2. Add the payload type to `packages/shared/src/types.ts`
3. Add a Zod schema on the server in `apps/server/src/rooms/roomEvents.ts` or `game/`
4. Register the handler in `apps/server/src/index.ts`
5. Add the typed emit/on wrapper in `apps/web/src/lib/socket.ts`

## Adding a New Game Action or Rule Change

1. Write/update unit tests in `apps/server/src/game/__tests__/` first (Vitest)
2. Update `engine.ts`, `evaluator.ts`, `foulCheck.ts`, or `compareRound.ts`
3. Update `packages/shared/src/types.ts` if new fields are needed
4. Update client evaluator in `packages/shared/src/evaluator.ts` for UI preview parity

## Security Notes

- All socket event payloads must be validated with Zod before use — never trust raw client data
- JWT tokens are verified on every event that requires identity (room:create, room:join, game:submit)
- Room codes are validated as 6-character alphanumeric before any SQLite query
- All rows in `rooms` and `sessions` tables must have an `expires_at` value — run stale cleanup on server start and on a periodic interval
- Never emit another player's hand cards — only their count and submitted status
