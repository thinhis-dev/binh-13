# Game Room Settings — Implementation Guide

**Version:** 1.0  
**Last updated:** 2026-05-19  
**Plan:** [plans/game-room-settings.md](../plans/game-room-settings.md)

---

## Table of Contents

1. [What Are Room Settings?](#1-what-are-room-settings)
2. [How It Works (Big Picture)](#2-how-it-works-big-picture)
3. [Available Settings](#3-available-settings)
4. [Data Flow](#4-data-flow)
5. [Database Storage](#5-database-storage)
6. [Shared Types & Events](#6-shared-types--events)
7. [Server-Side Logic](#7-server-side-logic)
8. [Frontend UI](#8-frontend-ui)
9. [Game Manager Integration](#9-game-manager-integration)
10. [Testing Strategy](#10-testing-strategy)
11. [Security Rules](#11-security-rules)
12. [Common Questions (FAQ)](#12-common-questions-faq)

---

## 1. What Are Room Settings?

Room settings let the **room owner** (the player who created the room) configure how the game will be played. Think of it like setting house rules before dealing cards.

**Key points:**
- Only the owner can change settings.
- Settings can only be changed while waiting for the game to start (room status = `'waiting'`).
- Settings are saved on the server so the second player sees them when they join.
- Non-owners see the settings in read-only mode.

---

## 2. How It Works (Big Picture)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ROOM SETTINGS FLOW                                   │
│                                                                              │
│  Owner clicks "Settings"          Server stores settings                     │
│  in Lobby UI                      in SQLite rooms table                      │
│         │                                  │                                 │
│         ▼                                  ▼                                 │
│  ┌─────────────────┐   socket    ┌─────────────────────┐   socket           │
│  │ Settings Modal  │───────────► │ room:settings_update │──────────┐         │
│  │ (Dialog + Switch)│            │ handler (server)     │          │         │
│  └─────────────────┘             └─────────────────────┘          │         │
│                                          │                        │         │
│                                          │ validate + save        │         │
│                                          ▼                        ▼         │
│                                  ┌──────────────────┐   ┌────────────────┐  │
│                                  │ rooms table      │   │ Broadcast to   │  │
│                                  │ settings_json    │   │ all in room    │  │
│                                  └──────────────────┘   │ (ROOM_STATE +  │  │
│                                                         │  SETTINGS_     │  │
│                                                         │  UPDATED)      │  │
│                                                         └────────────────┘  │
│                                                                │             │
│                                         ┌──────────────────────┘             │
│                                         ▼                                    │
│                                  ┌──────────────────┐                        │
│                                  │ Both players see │                        │
│                                  │ updated settings │                        │
│                                  └──────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Available Settings

| Setting | What it does | Type | Default |
|---------|-------------|------|---------|
| **Timer** | How long players have to arrange their cards | Select (30s / 60s / 90s / 120s / 300s / Unlimited) | 60 seconds |
| **Auto-start** | Automatically deal cards when 2nd player joins | On/Off switch | On |
| **Allow foul** | Whether the server accepts a foul arrangement | On/Off switch | On |
| **Show hand strength** | Show live hand evaluation while arranging | On/Off switch | On |
| **Reveal on submit** | Show your arrangement to opponent before both submit | On/Off switch | Off |

### What each setting means in detail:

**Timer (`timerSeconds`):**  
After cards are dealt, players have this many seconds to arrange their hand. When it hits 0, the server auto-submits whatever arrangement the player currently has. A value of `0` means unlimited time.

**Auto-start (`autoStart`):**  
- **On (default):** The moment the 2nd player joins, the server deals cards immediately.
- **Off:** Both players sit in the lobby. The owner must click a "Start Game" button to begin.

**Allow foul (`allowFoul`):**  
- **On (default):** Players can submit any arrangement, even a foul (where Group 1 is weaker than Group 2). A foul means the player loses all 3 groups.
- **Off:** The server rejects foul arrangements and asks the player to fix it before submitting.

**Show hand strength (`showHandStrength`):**  
- **On (default):** While arranging, the UI shows the evaluated hand name (e.g., "Full House", "Two Pair") under each group.
- **Off:** Players arrange blind without seeing evaluations until results.

**Reveal on submit (`revealOnSubmit`):**  
- **Off (default):** Arrangements are hidden until both players have submitted.
- **On:** As soon as one player submits, their arrangement is revealed to the opponent.

---

## 4. Data Flow

Here's what happens step by step when the owner changes a setting:

```
1. Owner toggles "Allow foul" OFF in the modal
       │
       ▼
2. Frontend emits socket event:
   socket.emit('room:settings_update', {
     playerId: 42,
     code: 'ABC123',
     settings: { allowFoul: false }    ← only the changed field
   })
       │
       ▼
3. Server receives event, runs checks:
   ✓ Is payload valid? (Zod schema)
   ✓ Does session exist?
   ✓ Is player the room creator?
   ✓ Is room status 'waiting'?
       │
       ▼
4. Server merges new value into stored settings:
   stored:  { timerSeconds: 60, autoStart: true, allowFoul: true, ... }
   update:  { allowFoul: false }
   result:  { timerSeconds: 60, autoStart: true, allowFoul: false, ... }
       │
       ▼
5. Server saves merged JSON to rooms.settings_json column
       │
       ▼
6. Server broadcasts to everyone in the room:
   io.to('ABC123').emit('room:settings_updated', {
     settings: { timerSeconds: 60, autoStart: true, allowFoul: false, ... }
   })
   io.to('ABC123').emit('room:state', { room: { ... settings included ... } })
       │
       ▼
7. Both clients update their local store → UI reflects new settings
```

---

## 5. Database Storage

Settings are stored as a JSON string in the `rooms` table:

```sql
CREATE TABLE IF NOT EXISTS rooms (
  code          TEXT    PRIMARY KEY,
  status        TEXT    NOT NULL DEFAULT 'waiting',
  created_by    INTEGER NOT NULL REFERENCES sessions(player_id),
  created_at    INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT    NOT NULL DEFAULT '{}'    ← NEW COLUMN
);
```

### Why JSON and not separate columns?

- **Easy to extend:** Adding a new setting later doesn't require a DB migration — just add a new key to the defaults.
- **Merge strategy:** On read, the server merges stored JSON over `DEFAULT_ROOM_SETTINGS`. If a key is missing from the stored JSON (because it was added after the room was created), the default value applies automatically.
- **Simple storage:** One column, one read, one write.

### Example stored value:

```json
{"timerSeconds":120,"autoStart":false}
```

This means: "timer is 120s and auto-start is off; everything else uses defaults."

---

## 6. Shared Types & Events

### Types (`packages/shared/src/types.ts`)

```ts
// The shape of room settings
export interface RoomSettings {
  timerSeconds: number       // 0 means unlimited
  autoStart: boolean
  allowFoul: boolean
  showHandStrength: boolean
  revealOnSubmit: boolean
}

// Default values — used as the base for merge
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  timerSeconds: 60,
  autoStart: true,
  allowFoul: true,
  showHandStrength: true,
  revealOnSubmit: false,
}
```

The existing `Room` interface gains a new optional field:

```ts
export interface Room {
  code: string
  status: RoomStatus
  createdBy: number
  players: Player[]
  settings?: RoomSettings   // ← NEW
  // ... other fields
}
```

### Events (`packages/shared/src/events.ts`)

```ts
export const EVENTS = {
  // ... existing events ...

  // Room settings
  ROOM_SETTINGS_UPDATE: 'room:settings_update',     // client → server
  ROOM_SETTINGS_UPDATED: 'room:settings_updated',   // server → room

  // Manual game start (when autoStart is off)
  GAME_START: 'game:start',                          // client → server (owner only)
}
```

---

## 7. Server-Side Logic

### Room Manager (`apps/server/src/rooms/roomManager.ts`)

Two new functions:

```ts
/**
 * Reads the settings for a room, merging stored values over defaults.
 * If the room has no stored settings, returns DEFAULT_ROOM_SETTINGS.
 */
export function getRoomSettings(code: string): RoomSettings {
  const db = getDb()
  const row = db.prepare('SELECT settings_json FROM rooms WHERE code = ?')
    .get(normalizeCode(code)) as { settings_json: string } | undefined

  if (!row) return { ...DEFAULT_ROOM_SETTINGS }

  const stored = JSON.parse(row.settings_json)
  return { ...DEFAULT_ROOM_SETTINGS, ...stored }
}

/**
 * Merges partial settings into the stored JSON for a room.
 * Returns the full merged settings after update.
 */
export function updateRoomSettings(
  code: string,
  partial: Partial<RoomSettings>
): RoomSettings {
  const current = getRoomSettings(code)
  const merged = { ...current, ...partial }

  getDb().prepare('UPDATE rooms SET settings_json = ? WHERE code = ?')
    .run(JSON.stringify(merged), normalizeCode(code))

  return merged
}
```

The existing `getRoom()` function is updated to include settings:

```ts
export interface RoomState {
  code: string
  status: string
  createdBy: number
  settings: RoomSettings       // ← NEW
  players: Array<{ ... }>
}
```

And `toPublicRoom()` includes it in the output:

```ts
export function toPublicRoom(room: RoomState): Room {
  return {
    code: room.code,
    status: room.status as Room['status'],
    createdBy: room.createdBy,
    settings: room.settings,   // ← NEW
    players: room.players.map(...)
  }
}
```

### Room Events Handler (`apps/server/src/rooms/roomEvents.ts`)

New socket event handler:

```ts
socket.on(EVENTS.ROOM_SETTINGS_UPDATE, (payload) => {
  // 1. Validate with Zod
  const data = parsePayload(socket, roomSettingsSchema, payload)
  if (!data) return

  // 2. Check session exists
  if (!assertSession(socket, data.playerId)) return

  // 3. Check room exists
  const room = getRoom(data.code)
  if (!room) {
    emitError(socket, 'Room not found')
    return
  }

  // 4. Check player is the owner
  if (room.createdBy !== data.playerId) {
    emitError(socket, 'Only the room creator can change settings')
    return
  }

  // 5. Check room is in waiting state
  if (room.status !== 'waiting') {
    emitError(socket, 'Cannot change settings while game is in progress')
    return
  }

  // 6. Update settings in DB
  const updatedSettings = updateRoomSettings(data.code, data.settings)

  // 7. Broadcast to all clients in the room
  io.to(data.code).emit(EVENTS.ROOM_SETTINGS_UPDATED, {
    settings: updatedSettings,
  })
  emitRoomState(io, data.code)
})
```

Zod schema for validation:

```ts
const roomSettingsSchema = z.object({
  playerId: z.number().int().positive(),
  code: roomCodeSchema,
  settings: z.object({
    timerSeconds: z.number().int().min(0).max(600).optional(),
    autoStart: z.boolean().optional(),
    allowFoul: z.boolean().optional(),
    showHandStrength: z.boolean().optional(),
    revealOnSubmit: z.boolean().optional(),
  }),
})
```

---

## 8. Frontend UI

### Settings Modal Component

Located at: `apps/web/src/components/game/RoomSettingsModal.tsx`

This uses shadcn UI components:
- `Dialog` — the modal wrapper
- `Switch` — for on/off toggles
- `Select` — for the timer dropdown

```
┌─────────────────────────────────────────────┐
│  Game Settings                         [X]  │
│─────────────────────────────────────────────│
│                                             │
│  Timer           [ 60 seconds       ▼ ]    │
│                                             │
│  Auto-start              ┌──────────────┐  │
│  Deal cards when 2nd     │  ████████ ON │  │
│  player joins            └──────────────┘  │
│                                             │
│  Allow foul              ┌──────────────┐  │
│  Accept foul             │  ████████ ON │  │
│  arrangements            └──────────────┘  │
│                                             │
│  Show hand strength      ┌──────────────┐  │
│  Show evaluation         │  ████████ ON │  │
│  while arranging         └──────────────┘  │
│                                             │
│  Reveal on submit        ┌──────────────┐  │
│  Show arrangement        │  OFF ████████│  │
│  before both submit      └──────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

### How the modal works:

1. Owner clicks "Settings" button in the Lobby header.
2. Modal opens showing all current settings.
3. When a switch is toggled or select is changed, the component immediately emits the socket event with only the changed field.
4. The server validates, saves, and broadcasts the update.
5. All clients (including the owner) receive `ROOM_SETTINGS_UPDATED` and update their local state.

### Non-owner view:

Non-owners don't see the "Settings" button. Instead, they see a **read-only settings summary card** below the player seats in the lobby:

```
┌─────────────────────────────────────────────┐
│  Game Settings                              │
│  Timer: 60s · Auto-start · Foul allowed     │
│  Hand strength visible · Hidden until both   │
└─────────────────────────────────────────────┘
```

### Game Store (`apps/web/src/stores/gameStore.ts`)

The Zustand store gets a new `settings` field:

```ts
interface GameState {
  room: Room | null
  settings: RoomSettings | null    // ← NEW
  hand: Card[] | null
  // ...
}
```

Settings are updated when:
- `ROOM_STATE` event arrives (extract `room.settings`)
- `ROOM_SETTINGS_UPDATED` event arrives (direct update)
- Room is cleared/left (reset to `null`)

### Lobby Page changes:

```tsx
// In Lobby.tsx header buttons (owner only)
{isCreator && <RoomSettingsModal settings={settings} code={code} playerId={playerId} />}

// Below the seats grid (everyone sees this)
<SettingsSummaryCard settings={settings} />
```

---

## 9. Game Manager Integration

The game manager reads room settings at key moments:

### When dealing cards (`triggerGameStart`):

```ts
// In roomEvents.ts, when 2nd player joins:
const room = getRoom(data.code)
const settings = getRoomSettings(data.code)

// Only auto-start if setting allows it
if (settings.autoStart) {
  triggerGameStart(io, data.code, room.players)
}
// Otherwise, wait for owner to emit GAME_START
```

### When starting the timer:

```ts
// In gameEvents.ts:
const settings = getRoomSettings(roomCode)
const game = startGame(roomCode, playerIds, settings.timerSeconds)
// timerSeconds = 0 means no timer is started
```

### When validating submissions:

```ts
// In gameEvents.ts, inside game:submit handler:
const settings = getRoomSettings(roomCode)

if (!settings.allowFoul) {
  const isFoul = checkFoul(arrangement)
  if (isFoul) {
    emitError(socket, 'Foul arrangements are not allowed in this room')
    return
  }
}
```

### Manual start (when `autoStart` is off):

```ts
socket.on(EVENTS.GAME_START, (payload) => {
  // Validate: owner only, room has 2 players, status is 'waiting'
  const room = getRoom(data.code)
  if (room.createdBy !== data.playerId) {
    emitError(socket, 'Only the room creator can start the game')
    return
  }
  if (room.players.length < 2) {
    emitError(socket, 'Need 2 players to start')
    return
  }
  triggerGameStart(io, data.code, room.players)
})
```

---

## 10. Testing Strategy

### Unit Tests (fast, isolated, no network)

**Where:** `apps/server/src/rooms/__tests__/roomManager.test.ts`

| Test | What it checks |
|------|---------------|
| `getRoomSettings` returns defaults when settings_json is `'{}'` | Merge logic works with empty stored data |
| `getRoomSettings` merges stored partial over defaults | Only overridden keys change |
| `updateRoomSettings` saves merged result to DB | Write + re-read gives correct data |
| `updateRoomSettings` with empty object changes nothing | Edge case: no-op update |
| `getRoom` includes settings in returned state | Integration between room read and settings |

**Where:** `apps/server/src/game/__tests__/gameManager.test.ts`

| Test | What it checks |
|------|---------------|
| `startGame` uses provided timerSeconds | Timer config propagates |
| `submitArrangement` rejects foul when allowFoul is off | Foul setting enforcement |

### Integration Tests (real socket connections, real SQLite)

**Where:** `apps/server/src/rooms/__tests__/roomSettings.integration.test.ts`

These tests spin up a real Socket.io server on port `0` with an in-memory SQLite database. They use actual socket clients to simulate players.

| Test | Steps |
|------|-------|
| **Owner can update settings** | Create room → emit `room:settings_update` → verify `room:settings_updated` received with correct values → verify `room:state` has updated settings |
| **Non-owner is rejected** | Create room → join as 2nd player → 2nd player emits `room:settings_update` → verify `error` event received |
| **Settings locked during game** | Create room → start game → owner emits `room:settings_update` → verify `error` event received |
| **Joining player sees settings** | Create room → owner changes timer to 120s → 2nd player joins → verify `room:state` has `timerSeconds: 120` |
| **Auto-start disabled** | Owner sets `autoStart: false` → 2nd player joins → verify `game:dealt` NOT emitted → owner emits `game:start` → verify `game:dealt` IS emitted |
| **Allow foul disabled** | Owner sets `allowFoul: false` → game starts → player submits foul → verify error response |
| **Timer propagates** | Owner sets `timerSeconds: 120` → game starts → verify `game:dealt` payload has `timerSeconds: 120` |

### Frontend Unit Tests (component rendering, store logic)

**Where:** `apps/web/src/components/game/__tests__/RoomSettingsModal.test.tsx`

| Test | What it checks |
|------|---------------|
| Renders all 5 settings with correct default values | UI matches defaults |
| Emitting socket event on switch toggle | Socket called with correct payload |
| Select changes timer value | Dropdown works correctly |
| Not rendered when user is not owner | Access control in UI |

**Where:** `apps/web/src/stores/__tests__/gameStore.test.ts`

| Test | What it checks |
|------|---------------|
| Settings starts as null | Initial state |
| Updates on ROOM_STATE event | Settings extracted from room |
| Updates on ROOM_SETTINGS_UPDATED | Direct settings update |
| Resets on room clear | Cleanup works |

---

## 11. Security Rules

These are enforced **on the server** — the frontend hides UI for convenience, but the real protection is server-side:

1. **Owner-only:** Only `room.createdBy === playerId` can change settings. Anyone else gets an error.
2. **Waiting-only:** Settings can only change when `room.status === 'waiting'`. Once the game starts, settings are locked.
3. **Validated values:** Every setting value is checked by Zod:
   - `timerSeconds`: integer between 0 and 600
   - All booleans: must be actual `true`/`false`
4. **No raw JSON exposure:** The server always parses `settings_json` and merges over defaults before sending to clients. Malformed JSON in the DB won't crash the server.
5. **No user strings:** Settings are all numbers/booleans — no text fields that could be used for XSS.

---

## 12. Common Questions (FAQ)

### Q: What happens if I add a new setting later?

The merge strategy handles this automatically. When you add a new key to `DEFAULT_ROOM_SETTINGS`, all existing rooms that don't have that key in their `settings_json` will use the default value. No database migration needed.

### Q: Can settings be changed mid-game?

No. The server rejects any `room:settings_update` event when the room status is anything other than `'waiting'`.

### Q: What if the owner disconnects?

Settings remain in the database. When the owner reconnects, they can still change settings (as long as the game hasn't started). The room doesn't lose its settings on disconnect.

### Q: What does `timerSeconds: 0` mean?

Unlimited time. No countdown timer is shown, and the server will not auto-submit. Players take as long as they want.

### Q: Why partial updates instead of sending the full settings object?

Sending only the changed field reduces payload size and makes it clear what changed. The server always merges partials over the current state, so there's no risk of accidentally resetting other settings.

### Q: Where do I find the relevant source files?

| Layer | File |
|-------|------|
| Types & defaults | `packages/shared/src/types.ts` |
| Event constants | `packages/shared/src/events.ts` |
| Database schema | `apps/server/src/db.ts` |
| Room manager | `apps/server/src/rooms/roomManager.ts` |
| Socket handler | `apps/server/src/rooms/roomEvents.ts` |
| Game manager | `apps/server/src/game/gameManager.ts` |
| Frontend modal | `apps/web/src/components/game/RoomSettingsModal.tsx` |
| Game store | `apps/web/src/stores/gameStore.ts` |
| Lobby page | `apps/web/src/pages/Lobby.tsx` |

### Q: What shadcn components do I need to install?

```bash
# If not already installed:
pnpm --filter web dlx shadcn@latest add dialog switch select
```
