---
phase: 3
title: "Instant-win hands"
status: completed
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 3: Instant-win hands

## Goal

The game detects the five Mau Binh instant-win hands (Mau binh toi trang). It scores them 3-0 and shows them on the board and the result page.

## Scout first

Read `apps/server/src/game/compareRound.ts`, `__tests__/compareRound.test.ts`, `packages/shared/src/types.ts` (`RoundResult`), `apps/web/src/pages/Result.tsx`, and the phase 2 timeout code. Source for the hand list: [Wikipedia (vi): Mau binh](https://vi.wikipedia.org/wiki/M%E1%BA%ADu_binh).

## Hand definitions

The list is in rank order, strongest first.

| Kind id | Display name | Rule | Scope |
|---|---|---|---|
| `dragon` | Dragon (Sanh rong) | 13 different ranks, 2 to A. | All 13 cards |
| `same_color` | Same color (Dong mau) | 12 or 13 cards of one color. Red is H and D. Black is S and C. | All 13 cards |
| `six_pairs` | Six pairs (Luc phe bon) | The sum of `floor(count / 2)` over all ranks is 6 or more. Trips count as one pair. Four of a kind counts as two pairs. | All 13 cards |
| `three_flushes` | Three flushes (3 thung) | Back is a flush, Middle is a flush, and the 3 Front cards have one suit. | Arrangement |
| `three_straights` | Three straights (3 sanh) | Back and Middle are straights (A-2-3-4-5 counts). The 3 Front ranks are consecutive (A-2-3 and Q-K-A count). | Arrangement |

A straight flush counts as a flush and as a straight for these rules.

## Requirements

- [x] `detectInstantWin(board)` in `packages/shared` returns the strongest kind or `null`. It takes only the board, because the 13 cards of the hand are the cards of the board. It needs no pokersolver, so the client and the server share it.
- [x] `compareRound` runs the detector first for both players. The instant-win rule overrides the foul check.
- [x] One player has a kind: that player wins 3-0. Every group result goes to that player.
- [x] Both players have a kind: the stronger kind wins 3-0. An equal kind is a draw at 0-0.
- [x] `RoundResult` gets `p1InstantWin: InstantWinKind | null` and `p2InstantWin: InstantWinKind | null`. Every place that builds a `RoundResult` sets them, including the surrender path (always `null`).
- [x] For an instant-win result, each `GroupComparison` hand name shows the kind display name. `p1Foul` and `p2Foul` are `false` for the instant winner.
- [x] The phase 2 timeout rule also accepts a draft with an instant-win kind. A foul does not block that draft.
- [x] The client enables submit for a board with an instant-win kind, even with the foul warning on. The warning text says that the instant win overrides the foul.
- [x] With the room setting `allowFoul` off, the server accepts a foul arrangement that has an instant-win kind.
- [x] Surrender still beats an instant win. The surrender path does not change.
- [x] If the current board has a kind, the board shows a badge with the kind name.
- [x] The result page shows the kind in the banner, for example "Dragon (Sanh rong): instant win".

## Files

Create:
- `packages/shared/src/instantWin.ts`: `InstantWinKind`, `INSTANT_WIN_ORDER`, `INSTANT_WIN_NAME`, `detectInstantWin`.
- `packages/shared/src/__tests__/instantWin.test.ts`

Modify:
- `packages/shared/src/index.ts`, `packages/shared/src/types.ts`
- `apps/server/src/game/compareRound.ts` and its tests
- `apps/server/src/game/gameEvents.ts` (timeout draft rule, surrender result fields)
- `apps/web/src/hooks/useArrangement.ts` (derived `instantWin`), `GameBoard.tsx`, `pages/Result.tsx`, and their tests

## Test matrix (write first)

| Layer | Test | Expected |
|---|---|---|
| shared | a hand for each kind | The right kind. |
| shared | a hand with Dragon and Same color | `dragon`. |
| shared | 11 red cards | `null`. |
| shared | five pairs plus a single trips | `six_pairs`. |
| shared | two four-of-a-kinds plus two pairs | `six_pairs`. |
| shared | wheel straight Back, normal straight Middle, A-2-3 Front | `three_straights`. |
| shared | three flushes, but the arrangement fouls | `three_flushes`. |
| shared | ordinary hand | `null`. |
| server | p1 kind, p2 none, p2 valid | p1 wins 3-0. `p1InstantWin` is set. |
| server | p1 kind with a foul arrangement | p1 wins 3-0. `p1Foul` is false. |
| server | both kinds, different | The stronger kind wins 3-0. |
| server | both kinds, the same | Draw at 0-0. |
| integration | `allowFoul` off, fouled three-flushes submit | Accepted. |
| web | fouled three-flushes board | Submit is enabled. |
| server | timeout with a fouled three-flushes draft | The draft is used, and the player wins. |
| web | board with a Dragon deal | The badge shows "Dragon (Sanh rong)". |
| web | result with `p1InstantWin` | The banner names the kind. |

## Verification

```bash
pnpm --filter @binh-13/shared test
pnpm --filter @binh-13/server test
pnpm --filter @binh-13/web test
pnpm typecheck && pnpm lint
```

## Risks

- `RoundResult` is shared by the server, the web client, and stored JSON in `arrangements`. Change all users in one commit.
- Stats count an instant win as a sweep because the score is 3. This matches decision 5 in `plan.md`.

## Rollback

Revert the phase commit. No database schema changes.
