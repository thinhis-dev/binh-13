---
phase: 2
title: "Auto-arrange, draft sync, timeout, Hint"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Auto-arrange, draft sync, timeout, Hint

## Goal

A timeout never produces a forfeit, and the Hint button fills the board with the server auto-arrangement.

## Scout first

Run a scout pass before you start. Read these files:

- `AGENTS.md` (the recipe for a new socket event)
- `apps/server/src/game/gameEvents.ts`, `gameManager.ts`, `evaluator.ts`
- `apps/server/src/game/__tests__/timerExpiry.test.ts`, `gameEvents.integration.test.ts`
- `apps/web/src/lib/socket.ts`, `apps/web/src/hooks/useSocket.ts`, `apps/web/src/stores/gameStore.ts`

## Requirements

- [x] `autoArrange(hand)` on the server returns a `PlayerArrangement` that never fouls. Back is the strongest 5-card hand of the 13 cards. Middle is the strongest 5-card hand of the other 8 cards. Front is the last 3 cards.
- [x] New event `game:draft` (client to server) with the same payload and Zod schema as `game:submit`. The server runs the same identity, room, game-status, and card checks. It stores the draft in `GameInstance.drafts`. It sends no reply on success.
- [x] The client sends a draft 300 ms after the last swap, sort, or hint. It sends no draft after submit or after the timer expires.
- [x] At timeout, the arrangement for each player who did not submit is the first match of this list. First, the stored draft that passes `validateArrangement`. Second, the result of `autoArrange`.
- [x] Phase 3 extends the draft rule: a draft with an instant-win kind is also valid. Leave a clear place for that check.
- [x] `createForfeitArrangement` stays for the surrender path only.
- [x] New events `game:hint_request` (client to server, `{ playerId, code }`) and `game:hint` (server to that socket only, `{ arrangement: { group1, group2, group3 } }`). The server replies only while the game is `arranging` and the player did not submit.
- [x] The server computes `autoArrange` at most once for each player in a game and caches it in `GameInstance`. The dealt hand never changes, so a flood of hint requests costs no extra CPU.
- [x] The Hint button in `GameBoard` sends the request, and the reply goes to `applyArrangement` from phase 1. The button is disabled after submit and after the timer expires.
- [x] The timeout banner in `GameBoard.tsx` says that the board was auto-arranged and submitted. It does not say "forfeit".
- [x] New events use the `EVENTS` constant and typed wrappers, as `AGENTS.md` says. The wrappers `saveDraft` and `requestHint` sit in `apps/web/src/hooks/useSocket.ts`, next to the other emit wrappers, because `lib/socket.ts` holds only the socket instance.

## Files

Create:
- `apps/server/src/game/autoArrange.ts`
- `apps/server/src/game/__tests__/autoArrange.test.ts`

Modify:
- `packages/shared/src/events.ts`: `GAME_DRAFT`, `GAME_HINT_REQUEST`, `GAME_HINT`.
- `packages/shared/src/types.ts`: payload types for the three events.
- `apps/server/src/game/gameManager.ts`: `drafts: Map<number, PlayerArrangement>` in `GameInstance`, plus `saveDraft()`.
- `apps/server/src/game/gameEvents.ts`: draft and hint handlers, new timeout rule. Move the shared submit checks into one helper so that submit and draft do not repeat them.
- `apps/server/src/game/__tests__/timerExpiry.test.ts`, `gameManager.test.ts`, `gameEvents.integration.test.ts`
- `apps/web/src/lib/socket.ts`, `apps/web/src/hooks/useSocket.ts`, `apps/web/src/stores/gameStore.ts`, `apps/web/src/components/game/GameBoard.tsx` and their tests.
- `apps/e2e/tests/game.spec.ts`: a Hint spec.

## Test matrix (write first)

| Layer | Test | Expected |
|---|---|---|
| server unit | `autoArrange` with 20 seeded random hands | 13 unique cards from the hand. `validateArrangement` is true. |
| server unit | `autoArrange` with a hand that holds four of a kind | Back holds the four of a kind. |
| server unit | timeout with a valid draft | The resolved arrangement equals the draft. |
| server unit | timeout with a foul draft | The resolved arrangement equals `autoArrange(hand)`. |
| server unit | timeout with no draft | The resolved arrangement equals `autoArrange(hand)`. No player has `pXFoul` true. |
| integration | `game:draft` with foreign cards | `error` event. No draft is stored. |
| integration | `game:draft` after submit | Ignored or `error`. The submission does not change. |
| integration | `game:hint_request` | Only the requester gets `game:hint`. The cards match the dealt hand. |
| server unit | two hint requests from one player | `autoArrange` runs once. |
| integration | surrender | Still uses the forfeit arrangement. |
| web | 300 ms after a swap | One `game:draft` emit with the current board. |
| web | Hint reply | The board equals the hint arrangement. |
| e2e | Hint | After a click, the board changes to a non-foul arrangement, and submit is enabled. |

## Verification

```bash
pnpm --filter @binh-13/server test src/game/__tests__/autoArrange.test.ts
pnpm --filter @binh-13/server test
pnpm --filter @binh-13/web test
pnpm typecheck && pnpm lint
```

## Risks

- `autoArrange` compares 1,287 plus 56 candidate hands with pokersolver. Measure it in the unit test. If one call takes more than 100 ms, report it before you optimize.
- A draft emit on every swap can flood the socket. The 300 ms debounce keeps the rate low. The server stores only the latest draft for each player.

## Rollback

Revert the phase commit. The old client ignores the new events. If no draft exists, the server uses `autoArrange`.
