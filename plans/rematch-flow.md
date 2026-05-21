# Rematch Flow

## Overview

After a round finishes (status: `finished`), either player can request a rematch. Both players must accept before a new round is dealt. If both players click "Rematch" independently, it counts as mutual acceptance — no separate "accept" action needed.

---

## 1. Design

### 1.1 New Socket Events

| Constant | Value | Direction | Payload |
|----------|-------|-----------|---------|
| `GAME_REMATCH_REQUEST` | `'game:rematch_request'` | Client → Server | `{ playerId: number, code: string }` |
| `GAME_REMATCH_REQUESTED` | `'game:rematch_requested'` | Server → Room | `{ requestedBy: number }` |
| `GAME_REMATCH_ACCEPTED` | `'game:rematch_accepted'` | Server → Room | `{}` (both agreed, new round starting) |
| `GAME_REMATCH_DECLINED` | `'game:rematch_declined'` | Client → Server | `{ playerId: number, code: string }` |
| `GAME_REMATCH_CANCELLED` | `'game:rematch_cancelled'` | Server → Room | `{ declinedBy: number, reason: 'declined' \| 'disconnected' \| 'left' }` |

### 1.2 Behavior Rules

1. **Request:** Player A clicks "Rematch" → server records A as requesting → emits `GAME_REMATCH_REQUESTED` to the room so Player B sees the request.
2. **Accept (explicit):** Player B clicks "Accept" on the banner → server receives `GAME_REMATCH_REQUEST` from B → both have now requested → triggers rematch.
3. **Accept (implicit):** Player B also clicks "Rematch" button (same `GAME_REMATCH_REQUEST` event) before seeing the banner → server detects both have requested → triggers rematch immediately.
4. **Decline:** Player B clicks "Decline" → `GAME_REMATCH_DECLINED` → server clears rematch state → emits `GAME_REMATCH_CANCELLED` so Player A sees the request was declined.
5. **Both accept → new round:** Server emits `GAME_REMATCH_ACCEPTED`, resets room status to `playing`, deals new cards, emits `GAME_DEALT` to each player. Full game flow restarts.
6. **Idempotent:** If a player sends `GAME_REMATCH_REQUEST` twice, it's a no-op (already recorded).
7. **Guard:** Rematch is only valid when room status is `finished`. Requests in any other state are ignored with an error event.

### 1.3 Server-Side State

Add a `rematchRequests: Set<number>` to track which player IDs have requested a rematch for the current finished round.

```typescript
// In-memory map, keyed by room code
const rematchState = new Map<string, Set<number>>()
```

This is cleared when:
- A new game starts (rematch accepted)
- A player declines
- A player leaves the room
- Room is cleared/deleted

### 1.4 Server Logic — `game:rematch_request`

```
1. Validate payload with Zod (playerId, code)
2. Verify session token matches playerId
3. Verify room exists and status === 'finished'
4. Verify player is in the room
5. Add playerId to rematchState[code]
6. If rematchState[code].size === 2 (both players):
   a. Clear rematchState[code]
   b. Emit GAME_REMATCH_ACCEPTED to room
   c. Update room status to 'playing'
   d. Start a new game (deal cards, start timer)
   e. Emit GAME_DEALT to each player with their hand
7. Else:
   a. Emit GAME_REMATCH_REQUESTED to room with { requestedBy: playerId }
```

### 1.5 Server Logic — `game:rematch_declined`

```
1. Validate payload with Zod (playerId, code)
2. Verify session token matches playerId
3. Verify room exists and status === 'finished'
4. Clear rematchState[code]
5. Emit GAME_REMATCH_CANCELLED to room with { declinedBy: playerId, reason: 'declined' }
```

### 1.6 Server Logic — On Player Leave/Disconnect (guard for stale accepts)

```
1. If rematchState[code] contains the leaving player's ID:
   a. Clear rematchState[code]
   b. Emit GAME_REMATCH_CANCELLED to room with { declinedBy: playerId, reason: 'left' | 'disconnected' }
2. When processing GAME_REMATCH_REQUEST:
   a. After adding player to set, check if BOTH players are still connected and in room
   b. If the other player has left/disconnected:
      - Emit ERROR to requesting player: "Opponent has left the room"
      - Clear rematchState[code]
      - Do NOT start new game
```

### 1.6 Updated Types

Add to `packages/shared/src/types.ts`:
```typescript
export interface RematchState {
  requested: boolean       // whether current player has requested
  opponentRequested: boolean // whether opponent has requested
}
```

Add to `packages/shared/src/events.ts`:
```typescript
GAME_REMATCH_REQUEST: 'game:rematch_request',
GAME_REMATCH_REQUESTED: 'game:rematch_requested',
GAME_REMATCH_ACCEPTED: 'game:rematch_accepted',
GAME_REMATCH_DECLINED: 'game:rematch_declined',
GAME_REMATCH_CANCELLED: 'game:rematch_cancelled',
```

### 1.7 Client-Side State (gameStore)

Add to `GameState`:
```typescript
rematchRequested: boolean        // I clicked rematch
rematchOpponentRequested: boolean // opponent clicked rematch
setRematchRequested: (v: boolean) => void
setRematchOpponentRequested: (v: boolean) => void
```

Reset both to `false` in `reset()` and when `GAME_REMATCH_CANCELLED` or `GAME_REMATCH_ACCEPTED` fires.

### 1.8 Client-Side UI (Result.tsx)

**States:**

| My State | Opponent State | UI |
|----------|---------------|----|
| Not requested | Not requested | Show "Rematch" button |
| Requested | Not requested | Show "Waiting for opponent..." (button disabled) |
| Not requested | Requested | Show banner: "Opponent wants a rematch!" with [Accept] [Decline] |
| Requested | Requested | N/A — server fires `GAME_REMATCH_ACCEPTED` instantly |

**On `GAME_REMATCH_ACCEPTED`:**
- Reset game state (hand, result, timer, submitted flags)
- Stay on `/room/:code` — the `GAME_DEALT` event will transition to the Game page

**On `GAME_REMATCH_CANCELLED`:**
- Reset rematch state
- Show brief toast: "Opponent declined rematch"

### 1.9 Edge Cases

- **Player disconnects after requesting rematch:** On `PLAYER_DISCONNECTED`, clear that player from rematchState. Emit `GAME_REMATCH_CANCELLED` to the room with `{ declinedBy: playerId, reason: 'disconnected' }`.
- **Player leaves room after requesting rematch:** Clear rematchState for that room on `ROOM_LEAVE`. Emit `GAME_REMATCH_CANCELLED` to the room with `{ declinedBy: playerId, reason: 'left' }`. The remaining player sees a toast: "Opponent left the room".
- **Opponent accepts after requester already left:** Server-side guard — when processing `GAME_REMATCH_REQUEST`, verify the other player is still in the room and connected. If not, emit `ERROR` to the accepting player with message "Opponent has left the room" and clear rematch state. This prevents a stale accept from succeeding.
- **Race condition — both click simultaneously:** Both send `GAME_REMATCH_REQUEST`. Server processes them sequentially (single-threaded Node.js). First one sets size=1, second sets size=2 → triggers rematch. No conflict.
- **Reconnect after requesting:** On reconnect, if room is `finished` and player is in rematchState, re-emit `GAME_REMATCH_REQUESTED` so the UI reflects the pending state.

---

## 2. Implementation Plan (TDD)

### Phase 1: Shared Types & Events

**Files:**
- `packages/shared/src/events.ts`
- `packages/shared/src/types.ts`

**Changes:** Add the 5 new event constants and `RematchState` type.

**Tests:** `packages/shared/src/__tests__/events.test.ts`
- Verify new event constants exist and have correct string values.

---

### Phase 2: Server — Rematch Manager (Unit Tests First)

**File:** `apps/server/src/game/rematchManager.ts`

```typescript
// Pure state management — no IO, no socket, easily testable
export function addRematchRequest(code: string, playerId: number): void
export function hasRematchRequest(code: string, playerId: number): boolean
export function isRematchReady(code: string, playerIds: [number, number]): boolean
export function clearRematch(code: string): void
export function getRematchRequests(code: string): Set<number>
```

**Test file:** `apps/server/src/game/__tests__/rematchManager.test.ts`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | `addRematchRequest` stores playerId for a room | `hasRematchRequest` returns true |
| 2 | Adding same player twice is idempotent | Set size stays 1 |
| 3 | `isRematchReady` returns false with 1 request | false |
| 4 | `isRematchReady` returns true with 2 requests | true |
| 5 | `clearRematch` removes all requests for a room | `getRematchRequests` returns empty set |
| 6 | Operations on non-existent room don't throw | graceful no-op |

---

### Phase 3: Server — Rematch Event Handlers (Unit + Integration Tests)

**File:** `apps/server/src/game/rematchEvents.ts`

Registers socket handlers for `GAME_REMATCH_REQUEST` and `GAME_REMATCH_DECLINED`.

**Zod schemas:**
```typescript
const rematchRequestSchema = z.object({
  playerId: z.number().int().positive(),
  code: z.string().trim().regex(/^[A-Z0-9]{6}$/i).transform(c => c.toUpperCase()),
})
```

**Test file:** `apps/server/src/game/__tests__/rematchEvents.test.ts`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Request rematch with invalid payload → error | Emits ERROR event |
| 2 | Request rematch when room not finished → error | Emits ERROR event |
| 3 | Request rematch when player not in room → error | Emits ERROR event |
| 4 | Valid request from P1 → emits GAME_REMATCH_REQUESTED | Room receives `{ requestedBy: p1Id }` |
| 5 | Duplicate request from P1 → no-op | No duplicate emission |
| 6 | P2 also requests → emits GAME_REMATCH_ACCEPTED | Room receives event |
| 7 | After both request, new game is dealt | Both players receive GAME_DEALT |
| 8 | Room status transitions from 'finished' → 'playing' → 'arranging' | DB updated |
| 9 | Decline rematch → emits GAME_REMATCH_CANCELLED | Room receives `{ declinedBy }` |
| 10 | Decline clears rematch state | Subsequent request starts fresh |
| 11 | Player disconnects after requesting → GAME_REMATCH_CANCELLED emitted | Opponent notified with reason 'disconnected' |
| 12 | Player leaves room after requesting → GAME_REMATCH_CANCELLED emitted | Opponent notified with reason 'left' |
| 13 | P2 accepts after P1 already left → ERROR emitted to P2 | P2 gets "Opponent has left the room", rematch state cleared |

**Integration test file:** `apps/server/src/game/__tests__/rematchEvents.integration.test.ts`

Tests with real Socket.io server + in-memory SQLite:

| # | Scenario | Verification |
|---|----------|--------------|
| 1 | Full happy path: play → finish → both rematch → new round | Both clients receive GAME_DEALT after GAME_REMATCH_ACCEPTED |
| 2 | P1 requests, P2 declines, P1 requests again | Fresh rematch flow works after decline |
| 3 | Simultaneous requests (P1 & P2 both emit before receiving) | GAME_REMATCH_ACCEPTED fires, no GAME_REMATCH_REQUESTED |
| 4 | Disconnect during pending rematch | GAME_REMATCH_CANCELLED sent to remaining player with reason 'disconnected' |
| 5 | P1 requests, P1 leaves, P2 accepts | P2 receives ERROR "Opponent has left the room", no new game starts |

---

### Phase 4: Client — Store Updates (Unit Tests)

**File:** `apps/web/src/stores/gameStore.ts` (modify)

**Test file:** `apps/web/src/stores/__tests__/gameStore.test.ts` (extend)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | `setRematchRequested(true)` | State has `rematchRequested: true` |
| 2 | `setRematchOpponentRequested(true)` | State has `rematchOpponentRequested: true` |
| 3 | `reset()` clears rematch state | Both fields false |

---

### Phase 5: Client — Socket Hook (Unit Tests)

**File:** `apps/web/src/hooks/useSocket.ts` (modify)

Add:
- `requestRematch(playerId, code)` — emits `GAME_REMATCH_REQUEST`
- `declineRematch(playerId, code)` — emits `GAME_REMATCH_DECLINED`
- Listener for `GAME_REMATCH_REQUESTED` → `setRematchOpponentRequested(true)`
- Listener for `GAME_REMATCH_ACCEPTED` → `reset()` (game will restart via GAME_DEALT)
- Listener for `GAME_REMATCH_CANCELLED` → `setRematchRequested(false)`, `setRematchOpponentRequested(false)`, show toast

**Test file:** `apps/web/src/hooks/__tests__/useSocket.test.ts` (extend)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | `requestRematch` emits correct event with payload | Socket emits verified |
| 2 | `declineRematch` emits correct event with payload | Socket emits verified |
| 3 | Receiving GAME_REMATCH_REQUESTED updates store | `rematchOpponentRequested` = true |
| 4 | Receiving GAME_REMATCH_ACCEPTED resets game state | Store reset called |
| 5 | Receiving GAME_REMATCH_CANCELLED resets rematch state | Both flags false |

---

### Phase 6: Client — Result Page UI (Component Tests)

**File:** `apps/web/src/pages/Result.tsx` (modify)

**Test file:** `apps/web/src/pages/__tests__/Result.test.tsx` (extend)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Default state: "Rematch" button visible | Button rendered |
| 2 | After clicking Rematch: button shows "Waiting..." and is disabled | UI reflects waiting |
| 3 | Opponent requested: banner appears with Accept/Decline buttons | Banner visible |
| 4 | Click Accept on banner → emits rematch request | Socket emit called |
| 5 | Click Decline on banner → emits decline | Socket emit called, banner disappears |
| 6 | GAME_REMATCH_CANCELLED with reason 'declined' → toast "Opponent declined" | State reset |
| 8 | GAME_REMATCH_CANCELLED with reason 'left' → toast "Opponent left the room" | State reset, Rematch button hidden |
| 7 | Leave button still works during pending rematch | Navigation + cleanup occurs |

---

## 3. File Change Summary

| File | Action |
|------|--------|
| `packages/shared/src/events.ts` | Add 5 event constants |
| `packages/shared/src/types.ts` | Add `RematchState` interface |
| `apps/server/src/game/rematchManager.ts` | **New** — pure state management |
| `apps/server/src/game/rematchEvents.ts` | **New** — socket event handlers |
| `apps/server/src/index.ts` | Register rematch event handlers |
| `apps/server/src/rooms/roomEvents.ts` | Clear rematch state on leave/disconnect |
| `apps/web/src/stores/gameStore.ts` | Add rematch fields |
| `apps/web/src/hooks/useSocket.ts` | Add rematch emit + listeners |
| `apps/web/src/pages/Result.tsx` | Add rematch UI (banner, button states) |
| `apps/web/src/components/ui/toast.tsx` | May need toast component (if not existing) |

**Test files (new or extended):**

| File | Action |
|------|--------|
| `packages/shared/src/__tests__/events.test.ts` | Extend |
| `apps/server/src/game/__tests__/rematchManager.test.ts` | **New** |
| `apps/server/src/game/__tests__/rematchEvents.test.ts` | **New** |
| `apps/server/src/game/__tests__/rematchEvents.integration.test.ts` | **New** |
| `apps/web/src/stores/__tests__/gameStore.test.ts` | Extend |
| `apps/web/src/hooks/__tests__/useSocket.test.ts` | Extend |
| `apps/web/src/pages/__tests__/Result.test.tsx` | Extend |

---

## 4. Sequence Diagrams

### Happy Path — Player A requests, Player B accepts

```
Player A (Client)         Server                    Player B (Client)
      │                      │                            │
      │── GAME_REMATCH_REQ ─►│                            │
      │                      │── GAME_REMATCH_REQUESTED ─►│
      │                      │   { requestedBy: A }       │
      │                      │                            │
      │                      │◄── GAME_REMATCH_REQ ───────│  (B clicks Accept)
      │                      │                            │
      │                      │   [Both in set → trigger]  │
      │                      │                            │
      │◄─ GAME_REMATCH_ACC ──│── GAME_REMATCH_ACC ───────►│
      │◄─ GAME_DEALT ────────│── GAME_DEALT ─────────────►│
      │                      │                            │
```

### Simultaneous Requests

```
Player A (Client)         Server                    Player B (Client)
      │                      │                            │
      │── GAME_REMATCH_REQ ─►│                            │
      │                      │◄── GAME_REMATCH_REQ ───────│  (both click ~same time)
      │                      │                            │
      │                      │   [Process A: set={A}]     │
      │                      │   [Process B: set={A,B}]   │
      │                      │   [Both ready → trigger]   │
      │                      │                            │
      │◄─ GAME_REMATCH_ACC ──│── GAME_REMATCH_ACC ───────►│
      │◄─ GAME_DEALT ────────│── GAME_DEALT ─────────────►│
```

### Decline Flow

```
Player A (Client)         Server                    Player B (Client)
      │                      │                            │
      │── GAME_REMATCH_REQ ─►│                            │
      │                      │── GAME_REMATCH_REQUESTED ─►│
      │                      │                            │
      │                      │◄── GAME_REMATCH_DECLINED ──│  (B clicks Decline)
      │                      │                            │
      │◄─ GAME_REMATCH_CANC ─│── GAME_REMATCH_CANC ─────►│
      │                      │                            │
      │   [Rematch button    │                            │
      │    re-enabled]       │                            │
```

---

## 5. Implementation Order (TDD)

1. Write `rematchManager.test.ts` → implement `rematchManager.ts` → green
2. Add event constants to `events.ts` → update `events.test.ts` → green
3. Add `RematchState` to `types.ts`
4. Write `rematchEvents.test.ts` → implement `rematchEvents.ts` → green
5. Write `rematchEvents.integration.test.ts` → wire up in `index.ts` + `roomEvents.ts` → green
6. Extend `gameStore.test.ts` → update `gameStore.ts` → green
7. Extend `useSocket.test.ts` → update `useSocket.ts` → green
8. Extend `Result.test.tsx` → update `Result.tsx` → green
9. Run full `pnpm test` → all green
10. Manual smoke test with 2 browser tabs
