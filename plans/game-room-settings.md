# Game Room Settings — Implementation Plan

## Overview

Add configurable game settings that the **room owner** can modify before the game starts. Settings are persisted server-side so that the second player sees them upon joining. Settings are displayed in a modal (shadcn Dialog) with Switch toggles.

---

## 1. Proposed Settings

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `timerSeconds` | `number` (select) | `60` | Arrangement timer: 30s, 60s, 90s, 120s, 300s, unlimited (0) |
| `autoStart` | `boolean` | `true` | Auto-start game when 2nd player joins |
| `allowFoul` | `boolean` | `true` | Allow foul submissions (if off, server rejects foul arrangements) |
| `showHandStrength` | `boolean` | `true` | Show real-time hand evaluation preview while arranging |
| `revealOnSubmit` | `boolean` | `false` | Reveal your arrangement to opponent immediately upon submit (before both submit) |

---

## 2. Shared Types (`packages/shared/src/types.ts`)

```ts
export interface RoomSettings {
  timerSeconds: number       // 0 = unlimited
  autoStart: boolean
  allowFoul: boolean
  showHandStrength: boolean
  revealOnSubmit: boolean
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  timerSeconds: 60,
  autoStart: true,
  allowFoul: true,
  showHandStrength: true,
  revealOnSubmit: false,
}
```

Add `settings?: RoomSettings` to the existing `Room` interface.

---

## 3. Shared Events (`packages/shared/src/events.ts`)

Add two new event constants:

```ts
ROOM_SETTINGS_UPDATE: 'room:settings_update',   // client → server (owner only)
ROOM_SETTINGS_UPDATED: 'room:settings_updated', // server → room (broadcast)
```

---

## 4. Database Schema (`apps/server/src/db.ts`)

Add a `settings_json` column to the `rooms` table:

```sql
CREATE TABLE IF NOT EXISTS rooms (
  code          TEXT    PRIMARY KEY,
  status        TEXT    NOT NULL DEFAULT 'waiting',
  created_by    INTEGER NOT NULL REFERENCES sessions(player_id),
  created_at    INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT    NOT NULL DEFAULT '{}'
);
```

The column stores JSON-serialized `RoomSettings`. Default `'{}'` means "use DEFAULT_ROOM_SETTINGS" — the server merges stored JSON over defaults at read time so new settings added later auto-apply without migration.

---

## 5. Room Manager (`apps/server/src/rooms/roomManager.ts`)

### New functions:

```ts
export function getRoomSettings(code: string): RoomSettings { ... }
export function updateRoomSettings(code: string, settings: Partial<RoomSettings>): RoomSettings { ... }
```

### Changes to `getRoom` / `toPublicRoom`:

- `RoomState` gains a `settings: RoomSettings` field.
- `toPublicRoom()` includes `settings` in the returned `Room` object.
- On read, merge `JSON.parse(settings_json)` over `DEFAULT_ROOM_SETTINGS`.

---

## 6. Room Events (`apps/server/src/rooms/roomEvents.ts`)

### New handler: `ROOM_SETTINGS_UPDATE`

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

Logic:
1. Validate payload with Zod.
2. Assert session exists.
3. Assert player is room creator (`room.createdBy === playerId`).
4. Assert room status is `'waiting'` (can't change settings mid-game).
5. Call `updateRoomSettings(code, settings)`.
6. Broadcast `ROOM_SETTINGS_UPDATED` with full merged settings to room.
7. Also emit updated `ROOM_STATE` so all clients stay in sync.

---

## 7. Game Manager Integration

### `startGame()` changes:

- Read `room.settings.timerSeconds` instead of hardcoded default.
- If `autoStart` is `false`, don't call `triggerGameStart` on second-player join. Instead emit a "ready" state and wait for explicit `GAME_START` event from owner.
- If `allowFoul` is `false`, reject foul arrangements in `submitArrangement()`.

### New event (if `autoStart` is off):

```ts
GAME_START: 'game:start'  // owner-only, manual start
```

---

## 8. Frontend — Settings Modal (`apps/web/src/components/game/RoomSettingsModal.tsx`)

### UI:
- Trigger: "Settings" button in Lobby header (visible to owner only).
- shadcn `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle`.
- Each setting rendered as a labeled `Switch` (shadcn) or `Select` (for timer).
- Changes emit `ROOM_SETTINGS_UPDATE` on toggle (optimistic local update + server confirmation).
- Non-owner players see a read-only "Game Settings" section in the lobby (no modal, just a summary card).

### Component structure:
```
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline"><Settings icon /> Settings</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Game Settings</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <SettingRow label="Timer" control={<Select ... />} />
      <SettingRow label="Auto-start" control={<Switch ... />} />
      <SettingRow label="Allow foul" control={<Switch ... />} />
      <SettingRow label="Show hand strength" control={<Switch ... />} />
      <SettingRow label="Reveal on submit" control={<Switch ... />} />
    </div>
  </DialogContent>
</Dialog>
```

---

## 9. Game Store (`apps/web/src/stores/gameStore.ts`)

- Add `settings: RoomSettings | null` to the game store.
- Update on `ROOM_STATE` and `ROOM_SETTINGS_UPDATED` events.
- Game page reads `settings.showHandStrength` to conditionally show evaluator preview.

---

## 10. Lobby Page (`apps/web/src/pages/Lobby.tsx`)

- Import and render `<RoomSettingsModal>` next to existing buttons (owner only).
- Add a read-only settings summary card below the seats grid for non-owners.
- Listen to `ROOM_SETTINGS_UPDATED` to update local state.

---

## 11. Testing

### Server unit tests:
- `roomManager.test.ts`: `getRoomSettings` returns defaults when no settings stored, `updateRoomSettings` merges partial updates, rejects invalid values, handles empty JSON gracefully.
- `gameManager.test.ts`: `startGame` reads `timerSeconds` from room settings, `submitArrangement` rejects foul when `allowFoul` is `false`.

### Server integration tests (`roomEvents.integration.test.ts`):
- **Owner can update settings:** Connect as owner → emit `ROOM_SETTINGS_UPDATE` → receive `ROOM_SETTINGS_UPDATED` with merged settings + updated `ROOM_STATE`.
- **Non-owner is rejected:** Connect as non-owner → emit `ROOM_SETTINGS_UPDATE` → receive `ERROR` with "Only the room creator can change settings".
- **Settings locked during game:** Start a game → owner emits `ROOM_SETTINGS_UPDATE` → receive `ERROR` with "Cannot change settings while game is in progress".
- **Joining player receives settings:** Owner updates settings → 2nd player joins → receives `ROOM_STATE` with correct settings.
- **Auto-start disabled:** Owner sets `autoStart: false` → 2nd player joins → game does NOT auto-deal → owner emits `GAME_START` → both receive `GAME_DEALT`.
- **Allow foul disabled:** Owner sets `allowFoul: false` → game starts → player submits foul arrangement → server rejects with error.
- **Timer setting propagates:** Owner sets `timerSeconds: 120` → game starts → `GAME_DEALT` payload contains `timerSeconds: 120`.

### Frontend unit tests:
- `RoomSettingsModal.test.tsx`: renders all settings with correct defaults, emits socket event on toggle, Select changes timer value, modal not rendered for non-owner.
- `gameStore.test.ts`: settings state initializes as null, updates on `ROOM_STATE`, updates on `ROOM_SETTINGS_UPDATED`, resets on room clear.
- `Lobby.test.tsx`: owner sees Settings button, non-owner sees read-only settings summary, settings update reflected in UI.

---

## 12. Implementation Order

1. **Shared types** — Add `RoomSettings`, `DEFAULT_ROOM_SETTINGS` to `packages/shared/src/types.ts`
2. **Shared events** — Add `ROOM_SETTINGS_UPDATE`, `ROOM_SETTINGS_UPDATED` (+ optionally `GAME_START`)
3. **DB migration** — Add `settings_json` column to `rooms` table
4. **Room manager** — `getRoomSettings()`, `updateRoomSettings()`, update `getRoom`/`toPublicRoom`
5. **Room events** — Register `ROOM_SETTINGS_UPDATE` handler with Zod validation + owner check
6. **Game manager** — Read settings from room, respect `timerSeconds`, `allowFoul`, `autoStart`
7. **Frontend store** — Add settings to `gameStore`
8. **Frontend modal** — Build `RoomSettingsModal` with shadcn Dialog/Switch/Select
9. **Lobby integration** — Wire modal into Lobby page, add read-only view for non-owners
10. **Tests** — Unit + integration tests for all new logic

---

## 13. Security Considerations

- Only room creator can modify settings (enforced server-side, not just UI).
- Settings can only be changed while room status is `'waiting'`.
- All setting values validated with Zod (bounded ranges, boolean types).
- `settings_json` is never exposed raw — always parsed and merged over defaults.
- No user-supplied strings stored in settings (prevents XSS via serialized data).
