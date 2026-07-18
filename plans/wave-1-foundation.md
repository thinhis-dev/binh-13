# Wave 1 — Foundation: Migrations, Persistent Identity, Profile & Stats

> **Status:** Ready for implementation · **Date:** 2026-07-18
> **Parent:** [enhancement-roadmap.md](./enhancement-roadmap.md) — items **P-1**, **A-1**, **A-3**, and **A-2 (stretch)**
> **Method:** Strict TDD — for every work item, write the listed tests first (red), then implement (green), then refactor. No implementation lands before its tests exist and fail for the right reason.

---

## Table of Contents

1. [Scope & Goals](#1-scope--goals)
2. [Current-State Findings](#2-current-state-findings)
3. [Target Data Model](#3-target-data-model)
4. [Work Item P-1 — Versioned Migrations](#4-work-item-p-1--versioned-migrations)
5. [Work Item A-1 — Persistent Guest Identity](#5-work-item-a-1--persistent-guest-identity)
6. [Work Item A-3 — Profile & Stats](#6-work-item-a-3--profile--stats)
7. [Work Item A-2 (Stretch) — Claimable Accounts](#7-work-item-a-2-stretch--claimable-accounts)
8. [Event Contract Summary](#8-event-contract-summary)
9. [File Changes Summary](#9-file-changes-summary)
10. [Implementation Order & TDD Loop](#10-implementation-order--tdd-loop)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Scope & Goals

| ID | Goal | Definition of done |
| --- | --- | --- |
| P-1 | DB survives server restarts | Versioned incremental migrations; restart loses no data; tests keep wipe-per-run behavior |
| A-1 | Player identity survives refresh & revisit | Signed token in `localStorage` restores the same `players` row; identity is bound to the socket server-side |
| A-3 | Profile page with real stats | Round results recorded durably; profile shows name/avatar + games/wins/losses/draws/fouls/sweeps; name & avatar editable |
| A-2 | (Stretch) Same identity across devices | Username+password claim on profile page; login form; scrypt hashing; no email/reset |

Each work item is independently shippable in the order listed. A-2 can slip without affecting anything else.

---

## 2. Current-State Findings

Facts about the codebase that shape this design (verified 2026-07-18):

1. **`runMigrations` in `apps/server/src/db.ts` drops every table on every `initDb()`** — the DB is a clean slate on each server start. `resetDb()` (used by tests) calls the same function.
2. **There is no durable "player"** — the `sessions` table *is* the identity: `sessions.player_id` (AUTOINCREMENT) is the PK that `rooms.created_by`, `room_players`, `hands`, and `arrangements` all reference. Destroying a session destroys the identity.
3. **There is no token verification anywhere.** `SESSION_CREATE` returns a raw `playerId`; every later payload includes `playerId` and the server trusts it (`playerSchema` in `roomEvents.ts` only checks it's a positive int). Any client can act as any player by sending their id. AGENTS.md's "JWT tokens are verified on every event" is aspirational — not implemented. **A-1 closes this hole.**
4. `apps/web/src/stores/sessionStore.ts` already persists `playerId`/`name` in `localStorage` (`binh13-session`), but the server wipe makes the persisted id dangle — this is why `SESSION_DESTROY` had to be made idempotent (commit `b42956a`).
5. Round results are computed and emitted in `apps/server/src/game/gameEvents.ts` (`GAME_RESULT`, including the surrender path). They are never persisted beyond the (cascade-deleted) `arrangements` rows → this is where A-3 hooks in.
6. Integration tests run a real Socket.io server against `DATABASE_PATH=:memory:` and rely on `resetDb()` wiping state between tests — this behavior must be preserved *for tests only*.
7. **No production data exists.** Because the DB has always been wiped, the baseline migration can define the *new* schema directly — there is no data-migration problem in Wave 1. Developers delete their local `dev.db` once (document in PR description).

---

## 3. Target Data Model

The identity concept splits in two: **`players` is durable** (who you are), **`sessions` is ephemeral** (a live connection). All game FKs re-point to `players`.

```sql
-- durable identity (never auto-deleted)
CREATE TABLE players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  avatar        TEXT    NOT NULL DEFAULT 'default',   -- preset key, client-rendered
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  -- A-2 (added by its own migration, nullable until claimed):
  username      TEXT    UNIQUE,
  password_hash TEXT
);

-- ephemeral connection record (replaces old sessions-as-identity)
CREATE TABLE sessions (
  player_id    INTEGER PRIMARY KEY REFERENCES players(id),
  socket_id    TEXT    NOT NULL DEFAULT '',
  connected_at INTEGER NOT NULL
);

-- rooms / room_players / hands / arrangements: unchanged shape,
-- but every `REFERENCES sessions(player_id)` becomes `REFERENCES players(id)`.

-- A-3: durable round outcomes (survives room deletion — no FK to rooms on purpose)
CREATE TABLE match_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code     TEXT    NOT NULL,          -- plain text, room row may be gone
  round         INTEGER NOT NULL,
  p1_id         INTEGER NOT NULL REFERENCES players(id),
  p2_id         INTEGER NOT NULL REFERENCES players(id),
  winner        TEXT    NOT NULL,          -- 'p1' | 'p2' | 'draw'
  p1_score      INTEGER NOT NULL,          -- 0–3 groups won
  p2_score      INTEGER NOT NULL,
  p1_fouled     INTEGER NOT NULL DEFAULT 0,
  p2_fouled     INTEGER NOT NULL DEFAULT 0,
  surrendered_by INTEGER,                  -- player id or NULL
  finished_at   INTEGER NOT NULL
);
CREATE INDEX idx_match_results_p1 ON match_results(p1_id);
CREATE INDEX idx_match_results_p2 ON match_results(p2_id);
```

**Why no FK from `match_results` to `rooms`:** rooms are deleted when players leave (and cascade-delete hands/arrangements). Stats must outlive the room — same reasoning as the timer-vs-deleted-room bug class (commit `053915a`), solved here by *not coupling* instead of coupling carefully.

---

## 4. Work Item P-1 — Versioned Migrations

### 4.1 What needs to be done

Replace drop-and-recreate with an ordered, versioned migration runner in `apps/server/src/db.ts` (or a new `apps/server/src/migrations.ts` imported by it):

```ts
interface Migration { version: number, name: string, up: (db: Database.Database) => void }

const migrations: Migration[] = [
  { version: 1, name: 'baseline-players-sessions-rooms', up: (db) => { /* full Section 3 schema minus A-2/A-3 columns */ } },
  // version 2 added by A-3 (match_results), version 3 by A-2 (username/password_hash) …
]
```

Runner behavior (all inside one `db.transaction()` per migration):

1. `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`.
2. Read max applied version; apply every migration with a higher version, in ascending order; record each.
3. Throw (and refuse to start) if the DB contains a *higher* version than the code knows — protects against running old code on a newer DB file.
4. Schema changes append a new `Migration` entry — **never edit an already-shipped migration**.

Test-reset behavior: `resetDb()` becomes explicitly test-only — it drops all tables (including `schema_migrations`) and re-runs all migrations from zero. Add a guard: `resetDb()` throws unless `DATABASE_PATH === ':memory:'` or `NODE_ENV === 'test'`, so it can never wipe a real DB.

Pre-versioning DB files (a `dev.db` with tables but no `schema_migrations`): detect and throw with a clear message ("delete dev.db — schema is now versioned"). No auto-adoption logic; there is no data worth preserving yet.

### 4.2 Acceptance criteria

- **AC-P1-1** — Given a fresh DB file, when the server starts, then all migrations apply in order and `schema_migrations` records each with a timestamp.
- **AC-P1-2** — Given a DB at the latest version, when the server restarts, then no migration re-runs and **all existing rows are still present**.
- **AC-P1-3** — Given a DB at version N and code that ships version N+1, when the server starts, then only N+1 runs.
- **AC-P1-4** — Given a migration whose `up` throws midway, then the transaction rolls back: no partial schema, no `schema_migrations` row for it, and `initDb` rethrows.
- **AC-P1-5** — Given a DB at a version higher than the code knows, then `initDb` throws with a descriptive error.
- **AC-P1-6** — Given a non-test `DATABASE_PATH`, when `resetDb()` is called, then it throws. Given `:memory:`, it wipes and remigrates (existing integration tests stay green unchanged).
- **AC-P1-7** — Given a pre-versioning `dev.db` (tables exist, no `schema_migrations`), then `initDb` throws telling the developer to delete the file.

### 4.3 Test plan — write these FIRST (`apps/server/src/__tests__/db.test.ts`, extend existing if present)

Unit tests against a temp-file DB (not `:memory:` — restart-survival requires reopening the same file; use a path under the OS tmpdir, cleaned in `afterEach`):

1. fresh DB → all migrations applied, `schema_migrations` rows in order *(AC-P1-1)*
2. insert a `players` row → `closeDb()` → `initDb()` same path → row still there, no duplicate migration rows *(AC-P1-2 — the headline test of P-1)*
3. runner with a fake migrations array `[v1]` applied, then array `[v1, v2]` → only v2 runs (spy/flag inside fake `up`) *(AC-P1-3)*
4. fake v2 `up` throws after a partial `CREATE TABLE` → table absent after rollback, no v2 row, error propagates *(AC-P1-4)*
5. `schema_migrations` contains v99 → `initDb` throws *(AC-P1-5)*
6. `resetDb()` with file-backed path + non-test env → throws; with `:memory:` → tables emptied *(AC-P1-6)*
7. file DB with a `sessions` table but no `schema_migrations` → `initDb` throws with the delete-your-dev-db message *(AC-P1-7)*

Then implement until green. Finally run the full existing suite — **every existing integration test must pass unmodified**; if any fails, the reset behavior contract was broken, fix the runner not the tests.

---

## 5. Work Item A-1 — Persistent Guest Identity

### 5.1 What needs to be done

**Token issuance.** Add JWT signing (`jsonwebtoken`, `JWT_SECRET` env — already listed in AGENTS.md env vars; dev fallback `'dev-secret'` with a `logger.warn`). Token payload: `{ playerId }`, expiry 365d. New module `apps/server/src/auth/token.ts` with `signPlayerToken(playerId)` / `verifyPlayerToken(token): number | null`.

**Server events** (follow the AGENTS.md new-event checklist — shared constant + type, Zod schema, handler in `roomEvents.ts`, web wrapper):

- `SESSION_CREATE` (existing, extended): payload stays `{ name }`. Handler now: insert `players` row → insert `sessions` row → sign token → reply `SESSION_CREATED { playerId, name, token }`.
- `SESSION_RESTORE` (new, `'session:restore'`): payload `{ token }`. Verify signature → load `players` row → update `last_seen_at`, upsert `sessions` with current socket → reply `SESSION_RESTORED { playerId, name, avatar }`. Invalid/expired token or missing player row → reply `SESSION_RESTORE_FAILED` (client then falls back to the name-entry flow; **not** the generic `ERROR` event, because this is an expected path, e.g. after a test-DB wipe).
- `SESSION_DESTROY` (existing, reinterpreted): deletes the `sessions` row and force-leaves rooms as today, but **never deletes the `players` row** — logout ≠ identity deletion. Client additionally discards its token (explicit "forget me" stays possible client-side by clearing storage).

**Socket identity binding — the security fix.** On successful `SESSION_CREATE`/`SESSION_RESTORE`, set `socket.data.playerId`. Add one helper used by *every* handler that today trusts `payload.playerId`:

```ts
function requireIdentity(socket: Socket, claimedId: number): boolean // false → emit EVENTS.ERROR('not authenticated' | 'playerId mismatch')
```

Apply it in every `roomEvents.ts` / `gameEvents.ts` / `rematchEvents.ts` handler that receives a `playerId`. Payload shapes don't change (no client churn); the server just stops trusting them.

**Web.** `sessionStore` gains `token: string | null` (persisted). App boot (`useSocket`/`App.tsx`): if token exists → emit `SESSION_RESTORE`; on `SESSION_RESTORED` hydrate store and continue; on `SESSION_RESTORE_FAILED` clear the stored session and show Home. `SESSION_CREATED` handler stores the token. `lib/socket.ts` gains the typed wrappers.

### 5.2 Acceptance criteria

- **AC-A1-1** — Given a new visitor creating a session, then the reply contains a token, and a `players` row + `sessions` row exist.
- **AC-A1-2** — Given a stored token, when the client reconnects and emits `SESSION_RESTORE`, then the *same* `playerId` and name come back and `last_seen_at` is updated — across server restarts too (file DB).
- **AC-A1-3** — Given a garbage/expired/foreign-signed token, then `SESSION_RESTORE_FAILED` is emitted (not `ERROR`), and the client lands on the name-entry flow with cleared local session.
- **AC-A1-4** — Given `SESSION_DESTROY`, then the `sessions` row is gone but the `players` row remains; a later `SESSION_RESTORE` with the same token still works.
- **AC-A1-5** — Given socket X authenticated as player 1, when X sends any identity-bearing event with `playerId: 2`, then the server rejects with `ERROR` and performs no action.
- **AC-A1-6** — Given a socket that never created/restored a session, when it sends `ROOM_CREATE`/`ROOM_JOIN`/`GAME_SUBMIT`, then the server rejects with `ERROR`.
- **AC-A1-7** — A full round (create room → join → deal → submit → result) still works end-to-end with the new identity flow (regression).

### 5.3 Test plan — write these FIRST

Unit (`apps/server/src/auth/__tests__/token.test.ts`):

1. sign → verify roundtrip returns the playerId
2. verify rejects: tampered payload, wrong secret, malformed string, expired token (sign with `-1s` expiry) → all return `null`, never throw

Integration (`apps/server/src/rooms/__tests__/session.integration.test.ts`, real socket + `:memory:` per repo convention):

3. `SESSION_CREATE` → reply has `{ playerId, name, token }`; `players` and `sessions` rows exist *(AC-A1-1)*
4. create → disconnect → new socket `SESSION_RESTORE(token)` → same `playerId`/name *(AC-A1-2)*
5. restore with garbage token → `SESSION_RESTORE_FAILED` *(AC-A1-3)*
6. `SESSION_DESTROY` → `players` row survives, `sessions` row gone; restore afterwards succeeds *(AC-A1-4)*
7. **impersonation:** two sockets, two sessions; socket A emits `ROOM_CREATE` with B's playerId → `ERROR`, no room created *(AC-A1-5)*
8. unauthenticated socket emits `ROOM_CREATE` → `ERROR` *(AC-A1-6)*
9. run the existing full-round integration flow with token-based sessions *(AC-A1-7 — mostly updating existing helpers in `apps/server/src/__tests__/helpers/` to authenticate; existing tests then double as regression coverage)*

Web (`apps/web/src/stores/__tests__/sessionStore.test.ts` + `apps/web/src/hooks/__tests__/useSocket.test.ts`):

10. store persists/clears `token` alongside `playerId`/`name`
11. boot with stored token emits `SESSION_RESTORE`; `SESSION_RESTORE_FAILED` clears the store; `SESSION_CREATED` saves the token

### 5.4 Migration

No new migration — the `players`/`sessions` split ships in P-1's baseline (v1), since P-1 and A-1 land in the same wave and nothing depends on the old shape.

---

## 6. Work Item A-3 — Profile & Stats

### 6.1 What needs to be done

**Migration v2** — `match_results` table + two indexes (Section 3).

**Recording** — new module `apps/server/src/game/matchResults.ts`: `recordRoundResult(roomCode, round, result: RoundResult, p1Id, p2Id)`. Called from `gameEvents.ts` at every point a `GAME_RESULT` is emitted (normal resolution, timer auto-resolve, surrender). One INSERT; deriving `p1_fouled`/`p2_fouled`/`surrendered_by` from the existing `RoundResult` fields.

**Stats query** — `getPlayerStats(playerId)` in the same module, single SQL aggregate over `match_results` (player may be p1 *or* p2):

- `games` (count), `wins`, `losses`, `draws`, `fouls` (times *this player* fouled), `sweeps` (this player won 3–0)

**Events:**

- `PROFILE_GET` `{ playerId }` → `PROFILE_DATA { playerId, name, avatar, createdAt, stats }`. Guarded by `requireIdentity` (own profile only in Wave 1 — viewing others' profiles arrives with F-x social features).
- `PROFILE_UPDATE` `{ playerId, name?, avatar? }` → `PROFILE_UPDATED { name, avatar }` broadcast back; name re-uses the existing 1–20-char Zod rule from `sessionCreateSchema`; avatar validated against a fixed preset list in `packages/shared` (e.g. `AVATARS = ['default', 'fox', 'panda', 'owl', …]` — final list is the implementer's choice, but it must live in shared so client and server agree).

**Web** — new `apps/web/src/pages/Profile.tsx` (route `/profile`, linked from Home): avatar picker (preset grid), editable name, stats panel. Extend `sessionStore` with `avatar`. Result/Lobby screens may later show avatars — out of scope now.

### 6.2 Acceptance criteria

- **AC-A3-1** — Given a completed round (normal path), then exactly one `match_results` row exists with correct winner/scores/foul flags, and it **remains after the room is deleted** (both players leave).
- **AC-A3-2** — Given a surrender, then the row has `surrendered_by` = the surrendering player and scores 3–0 to the opponent.
- **AC-A3-3** — Given a timer expiry with one player unsubmitted, then the recorded row matches whatever `GAME_RESULT` said (forfeit/foul semantics unchanged — recording never alters game logic).
- **AC-A3-4** — Given a player with a known mix of results as both p1 and p2 (win, loss, draw, own foul, opponent foul, 3-0 sweep), then `PROFILE_GET` returns exactly the right six numbers.
- **AC-A3-5** — Given `PROFILE_UPDATE` with a valid name/avatar, then the `players` row updates and subsequent `SESSION_RESTORE` returns the new values; invalid avatar (not in preset list) or invalid name → `ERROR`, no change.
- **AC-A3-6** — Given socket A authenticated as player 1 requesting `PROFILE_GET`/`PROFILE_UPDATE` for player 2 → `ERROR` (identity guard).
- **AC-A3-7** — A brand-new player's stats are all zeros (not an error).

### 6.3 Test plan — write these FIRST

Unit (`apps/server/src/game/__tests__/matchResults.test.ts`, `:memory:` DB):

1. `recordRoundResult` maps a normal `RoundResult` → row fields (winner, scores, fouls) correctly
2. surrender-shaped result → `surrendered_by` set *(AC-A3-2)*
3. `getPlayerStats` over a seeded fixture: player appears as p1 in some rows and p2 in others; expected `{games: 6, wins: 2, losses: 3, draws: 1, fouls: 1, sweeps: 1}`-style assertion *(AC-A3-4 — this is the business-critical test; get the fixture reviewed against the rules before implementing)*
4. stats for an id with no rows → all zeros *(AC-A3-7)*

Integration (`apps/server/src/game/__tests__/matchResults.integration.test.ts`):

5. play a full round over real sockets → one row; then both players leave (room cascade-deletes) → row still present *(AC-A3-1)*
6. surrender flow end-to-end → row recorded *(AC-A3-2)*
7. `PROFILE_GET` after two played rounds returns aggregated stats; `PROFILE_UPDATE` roundtrip; cross-player access rejected *(AC-A3-4/5/6)*

Web:

8. `Profile.tsx` test: renders stats from store/socket mock, name edit emits `PROFILE_UPDATE`, avatar grid marks selection (mirror the existing page-test style in `pages/__tests__/`)

---

## 7. Work Item A-2 (Stretch) — Claimable Accounts

> Only start after A-1 and A-3 are green. Scope contract from the roadmap: **no email, no password reset, no OAuth.** UI states plainly: *"Forgotten passwords can't be recovered — it's a game account."*

### 7.1 What needs to be done

**Migration v3** — `ALTER TABLE players ADD COLUMN username TEXT` + `ADD COLUMN password_hash TEXT` + `CREATE UNIQUE INDEX idx_players_username ON players(username) WHERE username IS NOT NULL` (partial index — many NULLs must coexist).

**Hashing** — `node:crypto` scrypt (zero new dependencies): `hashPassword(pw)` → `scrypt$N$r$p$salt$hash` string; `verifyPassword(pw, stored)` with `timingSafeEqual`. Module `apps/server/src/auth/password.ts`.

**Events:**

- `AUTH_REGISTER` `{ playerId, username, password }` (identity-guarded — binds credentials to the *current* guest row): validate username `3–20 chars, [a-z0-9_]`, password `min 8`; reject if this player already has a username or the username is taken → `AUTH_REGISTERED { username }` | `ERROR`.
- `AUTH_LOGIN` `{ username, password }` (unauthenticated by nature): verify → issue a fresh token for that player row → `AUTH_LOGGED_IN { playerId, name, avatar, token }`. The client replaces its stored identity with this one. Failure → generic `ERROR('invalid credentials')` — same message for unknown username vs wrong password (no user enumeration).
- **Rate limit:** in-memory sliding counter keyed by `socket.handshake.address` + username, e.g. 5 failures/60s → `ERROR('too many attempts')`. Lives in `apps/server/src/auth/rateLimit.ts`; a plain `Map` with timestamps is sufficient.

**Web** — Profile page gains a "Claim your account" card (register form) or "Signed in as `username`" state. Home gains a small "Sign in" link → login form. On successful login, `sessionStore` fully replaces `{playerId, name, avatar, token}`.

**Edge to decide at implementation time** (flagging, not prescribing): logging in *while in a room* — simplest rule is to force `ROOM_LEAVE` of the old identity first; document whichever is chosen in the handler.

### 7.2 Acceptance criteria

- **AC-A2-1** — Guest registers → same `players.id`, now with username; stats accumulated as guest are retained.
- **AC-A2-2** — Registering a taken username, an invalid username/password shape, or on an already-claimed row → `ERROR`, row unchanged.
- **AC-A2-3** — Login with correct credentials from a fresh socket/device → token for the original row; `SESSION_RESTORE` with that token works thereafter.
- **AC-A2-4** — Wrong password and unknown username return the *identical* error message.
- **AC-A2-5** — 6th failed login within 60s → rate-limit error even with correct credentials; succeeds after the window passes (use fake timers).
- **AC-A2-6** — Password hashes are scrypt-formatted, unique per identical password (random salt), and never appear in any emitted payload or log line.

### 7.3 Test plan — write these FIRST

Unit (`apps/server/src/auth/__tests__/password.test.ts`, `rateLimit.test.ts`):

1. hash → verify roundtrip; wrong password fails; two hashes of the same password differ *(AC-A2-6)*
2. stored-format tampering (wrong part count, bad base64) → verify returns false, never throws
3. rate limiter: 5 failures allowed, 6th blocked, window expiry unblocks (fake timers) *(AC-A2-5)*

Integration (`apps/server/src/auth/__tests__/auth.integration.test.ts`):

4. guest → play a round → register → login from a second socket → `PROFILE_GET` shows the pre-registration stats *(AC-A2-1 + AC-A2-3 — the headline test)*
5. duplicate username / claimed row / bad shapes → `ERROR`, DB unchanged *(AC-A2-2)*
6. wrong-password vs unknown-user → byte-identical error payloads *(AC-A2-4)*
7. assert no emitted payload in the whole suite contains `password_hash` (helper that inspects captured emissions) *(AC-A2-6)*

Web: register/login form tests (validation messages, emit payloads, store replacement on login).

---

## 8. Event Contract Summary

| Constant | Value | Direction | Payload → Reply |
| --- | --- | --- | --- |
| `SESSION_CREATE` | `session:create` | C→S | `{ name }` → `SESSION_CREATED { playerId, name, token }` *(token is new)* |
| `SESSION_RESTORE` | `session:restore` | C→S | `{ token }` → `SESSION_RESTORED { playerId, name, avatar }` \| `SESSION_RESTORE_FAILED` |
| `PROFILE_GET` | `profile:get` | C→S | `{ playerId }` → `PROFILE_DATA { playerId, name, avatar, createdAt, stats }` |
| `PROFILE_UPDATE` | `profile:update` | C→S | `{ playerId, name?, avatar? }` → `PROFILE_UPDATED { name, avatar }` |
| `AUTH_REGISTER` | `auth:register` | C→S | `{ playerId, username, password }` → `AUTH_REGISTERED { username }` |
| `AUTH_LOGIN` | `auth:login` | C→S | `{ username, password }` → `AUTH_LOGGED_IN { playerId, name, avatar, token }` |

All new constants go in `packages/shared/src/events.ts`; payload/reply types in `packages/shared/src/types.ts` (add `PlayerStats`, `PlayerProfile`, `AVATARS`). Every C→S payload gets a Zod schema server-side. Never raw strings.

---

## 9. File Changes Summary

| File | P-1 | A-1 | A-3 | A-2 |
| --- | :-: | :-: | :-: | :-: |
| `apps/server/src/db.ts` (+ new `migrations.ts`) | ✏️ | | | |
| `packages/shared/src/events.ts` / `types.ts` | | ✏️ | ✏️ | ✏️ |
| `apps/server/src/auth/token.ts` | | ➕ | | |
| `apps/server/src/auth/password.ts`, `rateLimit.ts` | | | | ➕ |
| `apps/server/src/rooms/roomEvents.ts` (session handlers, `requireIdentity` on all handlers) | | ✏️ | | |
| `apps/server/src/rooms/roomManager.ts` (`createSession` → players+sessions split) | | ✏️ | | |
| `apps/server/src/game/gameEvents.ts` (identity guard; call `recordRoundResult`) | | ✏️ | ✏️ | |
| `apps/server/src/game/rematchEvents.ts` (identity guard) | | ✏️ | | |
| `apps/server/src/game/matchResults.ts` | | | ➕ | |
| `apps/server/src/auth/authEvents.ts` (register in `createRealtimeServer`) | | | | ➕ |
| `apps/server/src/__tests__/helpers/*` (authenticated test clients) | | ✏️ | | |
| `apps/web/src/lib/socket.ts` (typed wrappers) | | ✏️ | ✏️ | ✏️ |
| `apps/web/src/stores/sessionStore.ts` (`token`, `avatar`) | | ✏️ | ✏️ | ✏️ |
| `apps/web/src/hooks/useSocket.ts` / `App.tsx` (restore-on-boot) | | ✏️ | | |
| `apps/web/src/pages/Profile.tsx` (+ route) | | | ➕ | ✏️ |
| `apps/web/src/pages/Home.tsx` (profile link; A-2 sign-in link) | | | ✏️ | ✏️ |

Env: `JWT_SECRET` required in prod (dev fallback + warn). New dependency: `jsonwebtoken` only (password hashing uses `node:crypto`).

---

## 10. Implementation Order & TDD Loop

Strict sequence — each numbered step is one red→green→refactor cycle, committed separately:

1. **P-1a** — migration-runner unit tests (§4.3 tests 1–7) → implement runner with baseline v1 = *current* schema shape → full suite green.
2. **P-1b** — change baseline v1 to the players/sessions split (§3). Existing integration tests will break where they touch `sessions` directly — update helpers, keep assertions.
3. **A-1a** — token unit tests → `token.ts`.
4. **A-1b** — session integration tests (§5.3 tests 3–6) → new/changed handlers + store split in `roomManager`.
5. **A-1c** — impersonation + unauthenticated tests (§5.3 tests 7–8) → `requireIdentity` across all handlers. Then the full existing integration suite as regression *(AC-A1-7)*.
6. **A-1d** — web store/hook tests → client restore flow.
7. **A-3a** — migration v2 + `matchResults` unit tests (fixture-first: write the stats fixture and expected numbers *before* the SQL) → implement.
8. **A-3b** — recording integration tests → wire `recordRoundResult` into all three `GAME_RESULT` paths.
9. **A-3c** — profile events + web Profile page.
10. **A-2** (stretch) — password/rateLimit units → migration v3 → auth events integration → web forms.

Per repo rules: co-located tests in the same change, integration tests never mock DB/transport, `pnpm test` + `pnpm typecheck` green before each commit, no `test.skip` without a `// TODO:`.

**Definition of done for the wave:** all ACs demonstrably covered by a named test; restart a locally-running server mid-session and confirm (manually, once) that refresh restores identity and the profile still shows pre-restart stats.

---

## 11. Out of Scope (deliberately)

- Viewing *other* players' profiles (arrives with F-2 friends)
- Recent-games list UI (D-2 — but `match_results` already stores everything it needs)
- Avatars in Lobby/Game/Result screens (cheap follow-up once A-3 lands)
- Email, password reset, OAuth, account deletion UI, `expires_at` stale-session cleanup (revisit with B-1 lobby, where stale public rooms actually matter)
- Any change to game rules, comparison, or timer logic — A-3 recording is observe-only
