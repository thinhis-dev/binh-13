# Surrender (Exit Game) Feature

## Overview

Allow a player to surrender during an active game (status: `arranging`). The surrendering player loses immediately, and the opponent wins all 3 groups. Both players are shown a result screen indicating the surrender.

---

## 1. Design

### 1.1 New Socket Event

| Constant | Value | Direction | Payload |
|----------|-------|-----------|---------|
| `GAME_SURRENDER` | `'game:surrender'` | Client → Server | `{ playerId: number, code: string }` |
| `GAME_SURRENDERED` | `'game:surrendered'` | Server → Room | `{ surrenderedBy: number, winner: 'p1' \| 'p2' }` |

### 1.2 Server Logic

When `GAME_SURRENDER` is received:

1. Validate payload with Zod (playerId + code).
2. Verify the session token matches the playerId.
3. Verify a game exists for that room code and is in `arranging` status.
4. Verify the player is actually in the game.
5. Determine the winner (the OTHER player).
6. Emit `GAME_SURRENDERED` to the room with `{ surrenderedBy, winner }`.
7. Emit `GAME_RESULT` with a special `RoundResult` where:
   - The surrendering player loses all 3 groups.
   - `winner` = opponent side.
   - `p1Score` / `p2Score` = 0/3 or 3/0.
   - `surrendered: true` flag in result.
   - Arrangements: use actual submissions if any, or forfeit arrangements.
8. Update room status to `'finished'`.
9. End the game (clear timer, remove instance).

### 1.3 Updated Types

Add to `RoundResult`:
```typescript
surrendered?: boolean
surrenderedBy?: number // playerId who surrendered
```

### 1.4 Client UI

#### Surrender Button
- Shown on `Game.tsx` page (inside `GameBoard` or as overlay).
- Red/destructive button labeled "Surrender".
- On click → opens a **confirmation modal** (shadcn `AlertDialog`).

#### Confirmation Modal
- Title: "Surrender?"
- Description: "You will lose this round immediately. Your opponent wins all 3 groups."
- Actions: "Cancel" (secondary) | "Surrender" (destructive)
- On confirm → emit `GAME_SURRENDER` event.

#### Result Screen for Surrender
- On `Result.tsx`, detect `result.surrendered === true`.
- If current player surrendered → show "You Surrendered" banner (red).
- If opponent surrendered → show "Opponent Surrendered — You Win!" banner (green).
- Skip the group-by-group breakdown (no meaningful card comparison).
- Still show Rematch / Leave buttons.

---

## 2. File Changes Summary

| File | Change |
|------|--------|
| `packages/shared/src/events.ts` | Add `GAME_SURRENDER`, `GAME_SURRENDERED` |
| `packages/shared/src/types.ts` | Add `surrendered?`, `surrenderedBy?` to `RoundResult` |
| `apps/server/src/game/gameEvents.ts` | Add surrender handler, `handleSurrender()` |
| `apps/server/src/game/gameManager.ts` | No change (uses existing `endGame`) |
| `apps/web/src/lib/socket.ts` | Add emit helper for surrender |
| `apps/web/src/stores/gameStore.ts` | No schema change (result already stored) |
| `apps/web/src/pages/Game.tsx` | Add surrender button + modal |
| `apps/web/src/pages/Result.tsx` | Add surrender-specific banners |
| `apps/web/src/components/game/SurrenderDialog.tsx` | New component: button + AlertDialog |

---

## 3. TDD Test Plan

All tests are written **before** implementation. Tests follow Vitest conventions.

### 3.1 Shared Package Tests

**File:** `packages/shared/src/__tests__/events.test.ts`

| # | Test Case | Assert |
|---|-----------|--------|
| 1 | `EVENTS.GAME_SURRENDER` exists | equals `'game:surrender'` |
| 2 | `EVENTS.GAME_SURRENDERED` exists | equals `'game:surrendered'` |

### 3.2 Server Unit Tests

**File:** `apps/server/src/game/__tests__/surrender.test.ts`

#### 3.2.1 Validation Tests

| # | Test Case | Setup | Assert |
|---|-----------|-------|--------|
| 1 | Rejects invalid payload (missing code) | emit with `{ playerId: 1 }` | receives `ERROR` event |
| 2 | Rejects invalid payload (missing playerId) | emit with `{ code: 'ABC123' }` | receives `ERROR` event |
| 3 | Rejects if no active game for room | emit valid payload, no game started | receives `ERROR` with message "No active game" |
| 4 | Rejects if game not in `arranging` status | game in `finished` status | receives `ERROR` |
| 5 | Rejects if player not in the game | valid game, wrong playerId | receives `ERROR` |

#### 3.2.2 Core Logic Tests

| # | Test Case | Setup | Assert |
|---|-----------|-------|--------|
| 6 | Surrender by P1 makes P2 the winner | P1 emits surrender | `GAME_RESULT` has `winner: 'p2'`, `p2Score: 3`, `p1Score: 0` |
| 7 | Surrender by P2 makes P1 the winner | P2 emits surrender | `GAME_RESULT` has `winner: 'p1'`, `p1Score: 3`, `p2Score: 0` |
| 8 | Result includes `surrendered: true` | Either player surrenders | `result.surrendered === true` |
| 9 | Result includes `surrenderedBy` matching the surrendering player | P1 surrenders | `result.surrenderedBy === p1Id` |
| 10 | Game timer is cleared after surrender | Game has active timer | Timer handle is null, no more timer events |
| 11 | Room status updated to `finished` | Player surrenders | DB room status is `'finished'` |
| 12 | Game instance is removed from memory | Player surrenders | `getGame(roomCode)` returns `undefined` |
| 13 | `GAME_SURRENDERED` event emitted to room | P1 surrenders | Both sockets receive `{ surrenderedBy: p1Id, winner: 'p2' }` |

#### 3.2.3 Edge Cases

| # | Test Case | Setup | Assert |
|---|-----------|-------|--------|
| 14 | Cannot surrender after already submitted | P1 submitted arrangement, then surrenders | receives `ERROR` — "Cannot surrender after submitting" |
| 15 | Cannot surrender twice | P1 surrenders, then surrenders again | Second emit receives `ERROR` — game no longer exists |
| 16 | Arrangements in result use forfeit for surrenderer | P1 surrenders (no submission) | `result.arrangements.p1` is a valid forfeit arrangement |
| 17 | If opponent already submitted, their arrangement is preserved | P2 submitted, P1 surrenders | `result.arrangements.p2` matches P2's submission |

### 3.3 Server Integration Tests

**File:** `apps/server/src/game/__tests__/surrender.integration.test.ts`

| # | Test Case | Setup | Assert |
|---|-----------|-------|--------|
| 1 | Full surrender flow: join room → game starts → P1 surrenders → both get result | Two clients connect, join room, game auto-starts | Both receive `GAME_RESULT` with `surrendered: true`, `winner: 'p2'` |
| 2 | After surrender, room can start a new game (rematch) | Complete surrender flow, then re-join | Game starts again normally |
| 3 | Surrender with authenticated session | Full flow with JWT session | No auth errors, result delivered |

### 3.4 Client Unit Tests

**File:** `apps/web/src/components/game/__tests__/SurrenderDialog.test.tsx`

| # | Test Case | Assert |
|---|-----------|--------|
| 1 | Renders surrender button | Button with text "Surrender" is visible |
| 2 | Button click opens confirmation dialog | AlertDialog content visible after click |
| 3 | Dialog shows warning message | Contains "lose this round immediately" text |
| 4 | Cancel button closes dialog without emitting | Dialog closes, socket emit NOT called |
| 5 | Confirm button calls `onSurrender` callback | `onSurrender` handler invoked |
| 6 | Button is disabled when `disabled` prop is true | Button has `disabled` attribute |

**File:** `apps/web/src/pages/__tests__/Result.test.tsx` (extend existing)

| # | Test Case | Assert |
|---|-----------|--------|
| 7 | Shows "You Surrendered" when current player surrendered | Banner text matches |
| 8 | Shows "Opponent Surrendered" when opponent surrendered | Banner text matches |
| 9 | Hides group breakdown when `surrendered` is true | `ResultGroupDisplay` not rendered |
| 10 | Still shows Rematch and Leave buttons on surrender result | Both buttons visible |

**File:** `apps/web/src/pages/__tests__/Game.test.tsx` (extend existing)

| # | Test Case | Assert |
|---|-----------|--------|
| 11 | Surrender button visible when hand is dealt | Button in document |
| 12 | Surrender button NOT visible when hand is empty (waiting) | Button not in document |
| 13 | Surrender button disabled after player has submitted | Button disabled |

### 3.5 Socket Emit Tests

**File:** `apps/web/src/hooks/__tests__/useSocket.test.ts` (extend existing)

| # | Test Case | Assert |
|---|-----------|--------|
| 1 | `surrender(playerId, code)` emits `EVENTS.GAME_SURRENDER` | socket.emit called with correct event and payload |

---

## 4. Implementation Order

Following TDD — write tests first, then implement to make them pass.

### Phase 1: Shared Types & Events
1. Write test for new events (3.1)
2. Add `GAME_SURRENDER` and `GAME_SURRENDERED` to `events.ts`
3. Add `surrendered?` and `surrenderedBy?` to `RoundResult` in `types.ts`

### Phase 2: Server Logic
1. Write unit tests (3.2) — all should fail
2. Write integration tests (3.3) — all should fail
3. Add Zod schema for surrender payload in `gameEvents.ts`
4. Implement `handleSurrender()` in `gameEvents.ts`
5. Register event handler in socket setup
6. Run tests — all should pass

### Phase 3: Client Socket
1. Write useSocket test (3.5)
2. Add `surrender()` method to `useSocket` hook / socket helpers
3. Run test — should pass

### Phase 4: Client UI
1. Write `SurrenderDialog` component tests (3.4 #1-6)
2. Write Result page surrender tests (3.4 #7-10)
3. Write Game page surrender tests (3.4 #11-13)
4. Implement `SurrenderDialog.tsx` component (shadcn AlertDialog)
5. Update `Game.tsx` to include `SurrenderDialog`
6. Update `Result.tsx` to handle surrender banners
7. Run all tests — should pass

### Phase 5: Final Validation
1. `pnpm typecheck` — no errors
2. `pnpm test` — all pass
3. Manual smoke test: join room → surrender → verify result screen

---

## 5. Component Design

### SurrenderDialog.tsx

```tsx
// Props
interface SurrenderDialogProps {
  onSurrender: () => void
  disabled?: boolean
}
```

Uses shadcn `AlertDialog` with:
- `AlertDialogTrigger` → destructive `Button` ("Surrender")
- `AlertDialogContent` → title, description, footer with Cancel/Confirm
- Confirm button is `variant="destructive"`

### Result.tsx Changes

```tsx
// Add before group breakdown:
{result.surrendered && (
  <div className="text-center">
    {result.surrenderedBy === playerId ? (
      <h1 className="text-3xl font-bold text-red-500">You Surrendered</h1>
    ) : (
      <h1 className="text-3xl font-bold text-green-600">
        Opponent Surrendered — You Win! 🎉
      </h1>
    )}
  </div>
)}

// Conditionally hide group breakdown:
{!result.surrendered && (
  <>{/* existing group comparison UI */}</>
)}
```

---

## 6. Security Considerations

- **Validate session JWT** before processing surrender — prevent impersonation.
- **Validate player is in the game** — prevent interfering with others' games.
- **Zod schema validation** on all inputs — prevent injection.
- **Idempotency** — second surrender attempt returns error gracefully (game already ended).
- **No race condition** — check game status atomically before processing.

---

## 7. Follow-up: Disconnect Reconnection Grace Period

> **Not in scope for this ticket.** Tracked here for future improvement.

Currently, closing the tab triggers an immediate `disconnect` → `leaveRoom()` → `endGame()`. This is too punitive for accidental disconnects (network blip, tab refresh).

**Planned improvement:**
- On disconnect during an active game, start a **reconnection grace timer** (e.g. 30–60s configurable via room settings).
- Pause the arrangement timer while waiting.
- Notify the remaining player with a "Waiting for opponent to reconnect…" overlay + countdown.
- If the player reconnects within the window → resume game, restore hand from DB.
- If the grace period expires → auto-forfeit the disconnected player (flagged as `disconnectForfeit`, distinct from intentional `surrendered`).
- Leverage the existing `ROOM_REJOIN` / `PLAYER_RECONNECTED` events.

This is a separate, more complex feature that should be its own plan/ticket.
