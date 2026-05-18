# Plan: Real-time Session & Room Functionality

**Goal:** By the end of this phase, two browser tabs can identify themselves with a name, create or join a shared room via a 6-character code, send a simple chat/ping message that the other player sees in real time, and leave or clear the room. No game logic yet.

**Auth model:** No JWT. Each player gets a server-assigned integer ID (`playerId`) + their chosen name. This pair is stored in `localStorage` via Zustand persist so refreshes don't lose identity.

---

## Current State (what already exists)

| File                                        | State                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/shared/src/types.ts`              | Has `Player`, `Room`, `RoomStatus` types — good, may need minor tweaks                          |
| `packages/shared/src/events.ts`             | Has all event name constants — needs `ROOM_LEAVE` and `ROOM_MESSAGE` added                      |
| `apps/server/src/db.ts`                     | Schema has `sessions`, `rooms`, `room_players` tables — needs column changes for new auth model |
| `apps/server/src/index.ts`                  | Hono + Socket.io wired, `io.on('connection')` is bare                                           |
| `apps/server/src/session/sessionManager.ts` | Empty stub                                                                                      |
| `apps/server/src/rooms/roomManager.ts`      | Empty stub                                                                                      |
| `apps/server/src/rooms/roomEvents.ts`       | Empty stub                                                                                      |
| `apps/web/src/lib/socket.ts`                | Empty stub                                                                                      |
| `apps/web/src/hooks/useSocket.ts`           | Empty stub                                                                                      |
| `apps/web/src/stores/sessionStore.ts`       | Has `playerId`, `token`, `name` — `token` field needs to become optional/removed                |
| `apps/web/src/pages/Home.tsx`               | Shows health check + dummy buttons, no real wiring                                              |
| `apps/web/src/pages/Lobby.tsx`              | Placeholder stub                                                                                |

---

## Data Model Decisions

### Session (no JWT)

```sql
player_id  INTEGER  PRIMARY KEY AUTOINCREMENT
name       TEXT     NOT NULL
socket_id  TEXT     -- current socket.id, updated on reconnect
```

The `player_id` integer + `name` is the player's identity. Stored client-side in `localStorage`. No hashing, no tokens.

### Room

```sql
code          TEXT  PRIMARY KEY   -- 6-char uppercase alphanumeric e.g. "A3F9KZ"
status        TEXT                -- 'waiting' | 'playing' | 'finished'
created_by    INTEGER             -- player_id of creator
created_at    INTEGER
```

### Room Players (join table)

```sql
room_code   TEXT     FK → rooms.code
player_id   INTEGER  FK → sessions.player_id
seat        INTEGER  -- 1 or 2, assigned on join
connected   INTEGER  -- 0 or 1
PRIMARY KEY (room_code, player_id)
```

---

## Tasks

---

### Task 1 — Update shared types and events

**What:** Align `packages/shared` with the new no-JWT session model and add missing events.

**Changes:**

- In `types.ts`: change `Player.id` from `string` to `number`. Add `seat: 1 | 2` to `Player`. Add `RoomMessage` type `{ playerId: number; name: string; text: string; at: number }`.
- In `events.ts`: add `ROOM_LEAVE: 'room:leave'`, `ROOM_LEFT: 'room:left'`, `ROOM_MESSAGE: 'room:message'`, `ROOM_CLEARED: 'room:cleared'`.

**Acceptance criteria:**

- [ ] `Player.id` is `number`
- [ ] `Player` has `seat: 1 | 2`
- [ ] `RoomMessage` type is exported from `types.ts`
- [ ] Four new event constants exist in `events.ts`
- [ ] `pnpm typecheck` passes with no errors

**Output:** Updated `packages/shared/src/types.ts` and `events.ts`.

---

### Task 2 — Update DB schema for new auth model

**What:** Rewrite `db.ts` migrations to match the simplified session model. Drop `token_hash` and `expires_at` from `sessions`. Add `socket_id`. Add `seat` and fix foreign key type in `room_players`. Drop unused `hands` and `arrangements` tables (Phase 2 concern).

**New sessions DDL:**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  player_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  socket_id  TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
```

**New rooms DDL:**

```sql
CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT    PRIMARY KEY,
  status     TEXT    NOT NULL DEFAULT 'waiting',
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

**New room_players DDL:**

```sql
CREATE TABLE IF NOT EXISTS room_players (
  room_code TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES sessions(player_id),
  seat      INTEGER NOT NULL,  -- 1 or 2
  connected INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (room_code, player_id)
);
```

**Note:** Because this is dev and the schema changes are breaking, add a `DROP TABLE IF EXISTS` before each `CREATE` in the migration so a clean re-run always works. In production this would be a proper migration version.

**Acceptance criteria:**

- [ ] `initDb()` runs without error on a fresh `dev.db`
- [ ] `sessions` table has no `token_hash`, no `expires_at`, has `socket_id`
- [ ] `rooms` table has `created_by`, no `mode_json`, no `expires_at`
- [ ] `room_players` has `seat` column
- [ ] `pnpm typecheck` on server passes

**Output:** Updated `apps/server/src/db.ts`.

---

### Task 3 — Server: session manager

**What:** Implement `sessionManager.ts` — pure functions over the DB for creating and looking up sessions. No socket logic here.

**Functions to implement:**

```ts
// Creates a new row, returns the new integer player_id
createSession(name: string, socketId: string): number

// Updates socket_id when a player reconnects
updateSocketId(playerId: number, socketId: string): void

// Returns session row or undefined
getSession(playerId: number): { playerId: number; name: string; socketId: string } | undefined

// Returns session by current socket.id (useful on disconnect)
getSessionBySocketId(socketId: string): { playerId: number; name: string } | undefined
```

**Acceptance criteria:**

- [ ] `createSession` inserts a row and returns the AUTOINCREMENT id
- [ ] `getSession` returns `undefined` for unknown ids (does not throw)
- [ ] `getSessionBySocketId` returns `undefined` for unknown socket ids
- [ ] No socket.io imports in this file — pure DB layer
- [ ] TypeScript types on all function signatures

**Output:** Implemented `apps/server/src/session/sessionManager.ts`.

---

### Task 4 — Server: room manager

**What:** Implement `roomManager.ts` — pure DB functions for room lifecycle. No socket logic.

**Functions to implement:**

```ts
// Generates a 6-char uppercase code, inserts room, inserts creator as seat 1
createRoom(createdBy: number): string  // returns room code

// Inserts player as seat 2. Returns false if room is full or not found.
joinRoom(code: string, playerId: number): boolean

// Sets connected=0 for this player. If both players disconnected, deletes room.
leaveRoom(code: string, playerId: number): void

// Deletes the room (creator only — validated at event layer)
clearRoom(code: string): void

// Returns full room state: room row + player rows joined with session names
getRoom(code: string): RoomState | undefined

// Returns the room a given player is currently in (if any)
getRoomByPlayer(playerId: number): RoomState | undefined
```

**`RoomState` type** (server-internal, not in shared):

```ts
interface RoomState {
  code: string
  status: string
  createdBy: number
  players: Array<{
    playerId: number
    name: string
    seat: 1 | 2
    connected: boolean
  }>
}
```

**Room code generation:** Random 6-char from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars like O/0, I/1). Retry if collision (extremely rare).

**Acceptance criteria:**

- [ ] `createRoom` returns a 6-char code and room exists in DB with creator as seat 1
- [ ] `joinRoom` returns `false` if room already has 2 players
- [ ] `joinRoom` returns `false` if code does not exist
- [ ] `leaveRoom` marks player disconnected; does not delete room if other player still there
- [ ] `clearRoom` deletes the room and cascades to `room_players`
- [ ] `getRoom` returns `undefined` for unknown code
- [ ] No socket.io imports in this file

**Output:** Implemented `apps/server/src/rooms/roomManager.ts`.

---

### Task 5 — Server: socket event handlers

**What:** Implement `roomEvents.ts` — register all socket event handlers. This is the only file that touches `socket` and `io`. It calls session and room managers, then emits back to clients.

**Events to handle:**

| Client emits                              | Server does                                                                                 | Server emits back                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `session:create` `{ name }`               | Validates name (1–20 chars, no profanity check needed). Creates session. Updates socket_id. | `session:created` `{ playerId, name }` to sender only                                   |
| `room:create` `{ playerId }`              | Validates session exists. Creates room.                                                     | `room:created` `{ code }` to sender. Then `room:state` `{ room }` to sender             |
| `room:join` `{ playerId, code }`          | Validates session. Calls `joinRoom`. Emits state to both.                                   | `room:joined` `{ code }` to sender. `room:state` `{ room }` to **both players in room** |
| `room:leave` `{ playerId, code }`         | Calls `leaveRoom`. Notifies remaining player.                                               | `room:left` `{ playerId }` broadcast to room. `room:state` to remaining player          |
| `room:message` `{ playerId, code, text }` | Validates player is in room. Trims text (max 200 chars).                                    | `room:message` `{ playerId, name, text, at }` broadcast to **both** players             |
| `room:clear` `{ playerId, code }`         | Validates caller is room creator. Calls `clearRoom`.                                        | `room:cleared` `{ code }` to both players                                               |

**Zod validation schemas** — define one schema per incoming event payload and validate before any DB call. Emit `error` event with a message string if validation fails.

**Socket room management:** Use Socket.io's built-in rooms. `socket.join(code)` when a player joins, `socket.leave(code)` on leave/clear. Use `io.to(code).emit(...)` to broadcast to both players.

**Acceptance criteria:**

- [ ] All 6 events are handled
- [ ] Each handler validates its payload with Zod; invalid payloads emit `error` and return early
- [ ] `session:create` rejects empty names and names > 20 chars
- [ ] `room:join` emits `error` if room is full or not found
- [ ] `room:message` text is trimmed and capped at 200 chars
- [ ] `room:clear` emits `error` if caller is not the creator
- [ ] `io.to(code).emit(EVENTS.ROOM_STATE, ...)` is used for state broadcasts (not individual socket emits)
- [ ] No DB calls inline — all DB work goes through manager functions

**Output:** Implemented `apps/server/src/rooms/roomEvents.ts`. Updated `apps/server/src/index.ts` to call `registerRoomEvents(io)`.

---

### Task 6 — Server: wire everything into index.ts

**What:** Update `apps/server/src/index.ts` to import and call the event registration function.

**Change is small:**

```ts
// After io is created:
import { registerRoomEvents } from './rooms/roomEvents'

registerRoomEvents(io)
```

Also add a `zod` install check — `zod` must be in `apps/server/package.json` dependencies (it already is).

**Acceptance criteria:**

- [ ] Server starts without error (`pnpm dev` in `apps/server`)
- [ ] `GET /health` still returns `{ status: 'ok' }`
- [ ] Socket.io connection log still prints on connect

**Output:** Updated `apps/server/src/index.ts`.

---

### Task 7 — Client: socket singleton

**What:** Implement `apps/web/src/lib/socket.ts` — a single shared socket.io-client instance. The socket should **not** auto-connect on import; it connects explicitly when the player submits their name.

**API to expose:**

```ts
import { io } from 'socket.io-client'

// Lazy singleton — call connect() to open the connection
export const socket = io(import.meta.env.VITE_SOCKET_URL ?? '', {
  autoConnect: false,
  transports: ['websocket'],
})
```

One exported `socket` object. Components import and use it directly. No wrapper class needed.

**Acceptance criteria:**

- [ ] Importing `socket` does not open a connection (autoConnect: false)
- [ ] `socket.connect()` can be called explicitly
- [ ] In dev, connects to Vite proxy (empty string URL falls back to same origin, which Vite proxies to `:8080`)
- [ ] No duplicate socket instances (module-level singleton pattern)

**Output:** Implemented `apps/web/src/lib/socket.ts`.

---

### Task 8 — Client: useSocket hook

**What:** Implement `apps/web/src/hooks/useSocket.ts` — a React hook that wraps the socket singleton. Components use this to listen to events and track connection state.

**API:**

```ts
function useSocket(): {
  connected: boolean
  // Typed emit helpers
  createSession: (name: string) => void
  createRoom: (playerId: number) => void
  joinRoom: (playerId: number, code: string) => void
  leaveRoom: (playerId: number, code: string) => void
  clearRoom: (playerId: number, code: string) => void
  sendMessage: (playerId: number, code: string, text: string) => void
}
```

The hook subscribes to `connect` / `disconnect` to track `connected` state. It does **not** subscribe to incoming events — individual components do that with `useEffect` + `socket.on(...)` to avoid prop drilling.

**Acceptance criteria:**

- [ ] `connected` reflects real socket connection state
- [ ] All 6 emit helpers are typed (correct event names from `EVENTS`)
- [ ] Hook is safe to call from multiple components (does not create new sockets)
- [ ] Cleans up event listeners on unmount

**Output:** Implemented `apps/web/src/hooks/useSocket.ts`.

---

### Task 9 — Client: update sessionStore

**What:** Simplify `sessionStore.ts` to match the new no-token model. Remove `token` field. Add `roomCode` to track which room the player is currently in.

**New store shape:**

```ts
interface SessionState {
  playerId: number | null
  name: string | null
  roomCode: string | null
  setSession: (playerId: number, name: string) => void
  setRoom: (code: string | null) => void
  clearSession: () => void
}
```

**Acceptance criteria:**

- [ ] No `token` field anywhere in the store
- [ ] `playerId` is `number | null` (not string)
- [ ] `roomCode` is persisted alongside `playerId` and `name`
- [ ] `clearSession` resets all three fields to null
- [ ] `pnpm typecheck` on web passes

**Output:** Updated `apps/web/src/stores/sessionStore.ts`.

---

### Task 10 — Client: Home page

**What:** Wire up `Home.tsx` with a real name-entry flow. This is the most visible UI work in the phase.

**Flow:**

1. If `sessionStore` already has a `playerId` (returning player), skip name entry — show "Welcome back, {name}" + create/join buttons immediately.
2. Otherwise show a name input + "Start" button.
3. On "Start": emit `session:create { name }`. On `session:created` response, call `setSession(playerId, name)` and show create/join UI.
4. "Create Room" button: emit `room:create { playerId }`. On `room:created { code }`, call `setRoom(code)` and navigate to `/room/:code`.
5. "Join Room" button: shows a 6-char code input. On submit, emit `room:join { playerId, code }`. On `room:joined`, navigate to `/room/:code`.
6. Listen for `error` event and show the message inline (red text, not a modal).

**UI requirements (minimal, functional):**

- Name input: `maxLength={20}`, `required`
- Room code input: uppercase-forced, `maxLength={6}`
- Buttons disabled while a request is in-flight
- No need for animations or polish yet

**Acceptance criteria:**

- [ ] Returning player (has stored session) skips name input
- [ ] Empty name cannot be submitted (browser validation + disabled button)
- [ ] After `session:created`, create/join UI appears without page reload
- [ ] Navigating to `/room/:code` happens after `room:created` or `room:joined` (not before)
- [ ] Error messages from server are displayed inline
- [ ] `socket.connect()` is called exactly once (when name is submitted)

**Output:** Updated `apps/web/src/pages/Home.tsx`.

---

### Task 11 — Client: Lobby page

**What:** Implement `Lobby.tsx` — the waiting room screen. Shows both players, a message log, and action buttons.

**What to display:**

- Room code (large, copyable)
- Player list: seat 1 and seat 2 slots — show name when filled, "Waiting…" when empty
- A simple scrollable message log (the `room:message` stream)
- A text input + Send button to post a message
- "Leave" button (all players)
- "Clear Room" button (creator only — shown only if `playerId === room.createdBy`)

**Data flow:**

- On mount: read `roomCode` from sessionStore. Subscribe to `EVENTS.ROOM_STATE` to hydrate room. Subscribe to `EVENTS.ROOM_MESSAGE` to append messages. Subscribe to `EVENTS.ROOM_CLEARED` and `EVENTS.ROOM_LEFT` to handle remote actions.
- If `roomCode` is null, redirect to `/`.
- On `room:cleared` or own `room:left`: call `setRoom(null)` and navigate to `/`.

**Acceptance criteria:**

- [ ] Both player slots render correctly when one or two players are present
- [ ] Messages appear for both players in real time without page reload
- [ ] "Clear Room" button only visible to creator
- [ ] Leaving navigates back to Home and clears `roomCode` in store
- [ ] If opponent leaves, their slot shows "Disconnected" not "Waiting…"
- [ ] Page handles browser back-button: if navigated away from lobby, room state is not corrupted

**Output:** Updated `apps/web/src/pages/Lobby.tsx`.

---

## End-to-End Milestone Test

When all tasks are complete, manually verify this sequence works:

1. **Tab A:** Open `http://localhost:5173`. Enter name "Alice". Click "Create Room". See lobby with code e.g. `A3F9KZ` and Alice in seat 1.
2. **Tab B:** Open `http://localhost:5173`. Enter name "Bob". Click "Join Room". Enter `A3F9KZ`. Both tabs now show Alice (seat 1) + Bob (seat 2).
3. **Tab A:** Type a message "Hello Bob" and send. Both tabs see it instantly.
4. **Tab B:** Type "Hi Alice" and send. Both tabs see it.
5. **Tab B:** Click "Leave". Tab B goes to Home. Tab A shows Bob's slot as "Disconnected".
6. **Tab A:** Click "Clear Room". Tab A goes to Home. Room is deleted from DB.
7. **Refresh Tab A:** Returns to Home with "Welcome back, Alice" (session persisted in localStorage).

---

## What This Phase Does NOT Include

- Game logic, card dealing, hand evaluation
- Reconnection on page refresh (socket ID changes on refresh — handled in Phase 3)
- Timer
- Arrangement submission
- Mobile layout
- Animations
