# Session Clear (Logout) Feature

## Overview

Allows users to clear their session from the Home page without manually clearing localStorage. A "Not {name}? Change" text link triggers a full server + client session teardown.

---

## Architecture

```
Client (Home.tsx)                    Server (roomEvents.ts)
─────────────────                    ──────────────────────
Click "Change"
  → emit SESSION_DESTROY {playerId}  → Validate payload (Zod)
                                     → Assert session exists
                                     → If in room: leaveRoom() + emit ROOM_LEFT
                                     → deleteSession(playerId) [transaction]
                                     → emit SESSION_DESTROYED
  ← receive SESSION_DESTROYED        → socket.disconnect(true)
  → clearSession() (zustand store)
  → UI resets to name input
```

---

## Socket Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `session:destroy` | Client → Server | `{ playerId: number }` | Request session deletion |
| `session:destroyed` | Server → Client | (none) | Confirm deletion completed |

Defined in `packages/shared/src/events.ts` as `EVENTS.SESSION_DESTROY` and `EVENTS.SESSION_DESTROYED`.

---

## Server Implementation

### `deleteSession(playerId)` — `apps/server/src/session/sessionManager.ts`

Wraps all DELETEs in a single SQLite transaction:

```typescript
export function deleteSession(playerId: number): void {
  const db = getDb()
  const del = db.transaction(() => {
    db.prepare('DELETE FROM arrangements WHERE player_id = ?').run(playerId)
    db.prepare('DELETE FROM hands WHERE player_id = ?').run(playerId)
    db.prepare('DELETE FROM room_players WHERE player_id = ?').run(playerId)
    db.prepare('DELETE FROM rooms WHERE created_by = ?').run(playerId)
    db.prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId)
  })
  del()
}
```

**Why this order matters:**
- `arrangements`, `hands`, `room_players` reference `sessions(player_id)` with NO CASCADE
- `rooms.created_by` references `sessions(player_id)` with NO CASCADE
- Deleting `rooms` first cascades to `room_players`/`hands`/`arrangements` for those rooms (via `room_code` FK with CASCADE)
- Remaining rows for rooms NOT created by this player are cleaned by the first 3 DELETEs

### `SESSION_DESTROY` handler — `apps/server/src/rooms/roomEvents.ts`

```typescript
socket.on(EVENTS.SESSION_DESTROY, (payload) => {
  const data = parsePayload(socket, playerSchema, payload)  // Zod validation
  if (!data) return
  if (!getSession(data.playerId)) { emitError(...); return }

  // Force-leave room if in one
  const room = getRoomByPlayer(data.playerId)
  if (room) {
    leaveRoom(room.code, data.playerId)
    socket.leave(room.code)
    io.to(room.code).emit(EVENTS.ROOM_LEFT, { playerId: data.playerId })
    // Emit updated room state to remaining players
    const updatedRoom = getRoom(room.code)
    if (updatedRoom) emitRoomState(io, room.code)
  }

  deleteSession(data.playerId)
  socket.emit(EVENTS.SESSION_DESTROYED)
  socket.disconnect(true)
})
```

---

## Client Implementation

### `useSocket.ts` — new `destroySession` callback

```typescript
const destroySession = useCallback((playerId: number) => {
  ensureSocketConnected()
  socket.emit(EVENTS.SESSION_DESTROY, { playerId })
}, [])
```

### `Home.tsx` — UI and listener

**Listener** (in useEffect):
```typescript
const handleSessionDestroyed = () => {
  clearSession()
  setPendingAction(null)
}
socket.on(EVENTS.SESSION_DESTROYED, handleSessionDestroyed)
```

**UI** (subtle text link below welcome message):
```tsx
<div className="text-center text-xs text-muted-foreground">
  Not {storedName}?{' '}
  <button type="button" className="underline hover:text-foreground transition-colors"
    onClick={handleClearSession}>
    Change
  </button>
</div>
```

---

## Database Impact

### FK Constraint Map

```
sessions(player_id)
  ← rooms.created_by        (NO ACTION)
  ← room_players.player_id  (NO ACTION)
  ← hands.player_id         (NO ACTION)
  ← arrangements.player_id  (NO ACTION)

rooms(code)
  ← room_players.room_code  (ON DELETE CASCADE)
  ← hands.room_code         (ON DELETE CASCADE)
  ← arrangements.room_code  (ON DELETE CASCADE)
```

**Effect of `deleteSession`:**
- If player created a room → room is deleted → CASCADE cleans room_players/hands/arrangements for ALL players in that room
- If player joined someone else's room → only their room_players/hands/arrangements rows are deleted
- Other players' sessions are never affected

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Player not in any room | Session deleted immediately |
| Player in a waiting room | Force-leave, opponent sees `ROOM_LEFT`, session deleted |
| Player mid-game (arranging) | Force-leave (equivalent to disconnect/forfeit), session deleted |
| Invalid playerId | Server emits `error` event, no changes |
| Player already disconnected | No-op (session not found by socket) |
| Room creator destroys session | Room is deleted (CASCADE), other player loses room context |

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/events.ts` | Added `SESSION_DESTROY`, `SESSION_DESTROYED` |
| `apps/server/src/session/sessionManager.ts` | Added `deleteSession()` |
| `apps/server/src/rooms/roomEvents.ts` | Added `SESSION_DESTROY` handler, imported `deleteSession` |
| `apps/web/src/hooks/useSocket.ts` | Added `destroySession` callback |
| `apps/web/src/pages/Home.tsx` | Added "Not X? Change" link, `SESSION_DESTROYED` listener |

---

## Tests

| File | Tests | Type |
|------|-------|------|
| `apps/server/src/session/__tests__/deleteSession.test.ts` | 6 | Unit |
| `apps/server/src/session/__tests__/sessionDestroy.integration.test.ts` | 4 | Integration |
| `apps/web/src/pages/__tests__/Home.test.tsx` | 4 | Component |

**Unit tests cover:** basic delete, dependent row cleanup (room_players, hands, arrangements), isolation from other players, no-op for missing ID.

**Integration tests cover:** destroy + emit confirmation, force-leave room (opponent sees ROOM_LEFT), socket disconnect after destroy, error on invalid playerId.

**Component tests cover:** "Not X? Change" renders with session, hidden without session, emits SESSION_DESTROY on click, clears store on SESSION_DESTROYED.
