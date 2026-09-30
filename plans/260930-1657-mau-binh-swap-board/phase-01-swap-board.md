---
phase: 1
title: "Swap board"
status: completed
priority: P1
effort: "7h"
dependencies: []
---

# Phase 1: Swap board

## Goal

The game deals the 13 cards into three rows. The player arranges them only by a drag of one card onto another card.

## Context

- `apps/web/src/hooks/useArrangement.ts` holds a `hand` plus three groups, with select, assign, remove, and move actions.
- `apps/web/src/components/game/HandArea.tsx` shows the hand with `flex-wrap`. `GroupSlot.tsx` shows each group with empty placeholders.
- `apps/web/src/components/card/Card.tsx` makes a card draggable (`useDraggable`) only through `InteractiveCard`, which needs `onClick`.
- `GameBoard.tsx` owns the `DndContext`, the drop logic, and the submit rule (`isComplete`, `hasFoulWarning`, `timerExpired`, `submitted`).
- `packages/shared/src/foulCheck.ts` has a private `estimateCategory` (rough 5-card category, no pokersolver).
- The room setting `showHandStrength` exists in `packages/shared/src/types.ts`. Scout where the web client reads room settings before you use it.
- The server contract does not change in this phase. `game:submit` still takes `{ group1, group2, group3 }`.

## Requirements

- [x] At deal, the board splits the chosen order into rows. `group1` (Back) gets cards 1 to 5. `group2` (Middle) gets cards 6 to 10. `group3` (Front) gets cards 11 to 13.
- [x] Deal order comes from a device preference: `raw` (default, server deal order) or `sorted` (`sortCards` from `apps/web/src/lib/cards.ts`). The preference applies at each deal.
- [x] The board shows the rows as a pyramid: Front at the top, then Middle, then Back. Each row stays on one line at 375 px, 1280 px, and 1920 px widths.
- [x] A drag of card A onto card B swaps A and B. This works inside a row and across rows. A drop on the same card or outside any card changes nothing.
- [x] The drop-target card shows a highlight during the drag.
- [x] The keyboard sensor moves the dragged card from card to card with the arrow keys. Space picks up and drops, and Escape cancels.
- [x] A Sort button sorts the cards inside each row with `sortCards`. Cards never move between rows.
- [x] If `showHandStrength` is on, each row shows its hand name. Back and Middle use the shared 5-card estimate. Front uses `evaluateThreeCard`.
- [x] The foul warning keeps the current rule (`quickFoulCheck`).
- [x] Submit is enabled unless the player submitted, the timer expired, or the foul warning shows.
- [x] The device preference control sits in the game header as a labeled switch "Sorted deal". Its help text says that it applies from the next deal.
- [x] Every `localStorage` read and write sits in `try/catch`. Without storage, the preference falls back to `raw`.

## Files

Create:
- `apps/web/src/lib/dealOrder.ts`: `DealOrder` type, `readDealOrder()`, `writeDealOrder()`, `layoutDeal(cards, order)`.
- `apps/web/src/lib/__tests__/dealOrder.test.ts`
- `apps/web/src/lib/dndKeyboard.ts`: a keyboard coordinate getter that jumps to the nearest card droppable in the arrow direction.
- `apps/web/src/lib/__tests__/dndKeyboard.test.ts`
- `apps/web/src/components/game/GroupRow.tsx`: row label, hand name, and one line of swap cards.
- `apps/web/src/components/game/__tests__/GroupRow.test.tsx`
- `packages/shared/src/__tests__/handEstimate.test.ts` (if the estimator moves to its own file)

Modify:
- `packages/shared/src/foulCheck.ts`: export `estimateFiveCardCategory` and a `FIVE_CARD_CATEGORY_NAME` map. Keep `quickFoulCheck` behavior the same.
- `apps/web/src/hooks/useArrangement.ts`: state is `{ group1, group2, group3 }`. Actions are `init(cards, order)`, `swapCards(aId, bId)`, `sortRows()`, `applyArrangement(arrangement)`. Derived values are `labels` and `hasFoulWarning`. Delete `hand`, `selectedCardId`, `originalOrder`, `selectCard`, `assignToGroup`, `removeFromGroup`, `moveToGroup`, `sortHand`, and `isComplete`.
- `apps/web/src/hooks/__tests__/useArrangement.test.ts`: rewrite for the swap model.
- `apps/web/src/lib/dnd.ts`: `DragData` becomes `{ card, row }`. Add a `DropData` type `{ card }` for card droppables.
- `apps/web/src/components/card/Card.tsx`: a card with `dragSource` is draggable without `onClick`. A new `dropTarget` prop adds `useDroppable({ id: card.id, data: { card } })` and the highlight.
- `apps/web/src/components/game/GroupPanel.tsx`: pyramid layout with three `GroupRow`s in the order group3, group2, group1.
- `apps/web/src/components/game/GameBoard.tsx`: remove `HandArea`. The drop handler calls `swapCards`. Add the Sort button and the "Sorted deal" switch. Update the submit rule. Pass the keyboard coordinate getter to `KeyboardSensor`.
- `apps/web/src/components/game/__tests__/GameBoard.test.tsx`: rewrite for the swap model.
- `apps/e2e/helpers/selectors.ts`, `apps/e2e/helpers/arrange.ts`, `apps/e2e/tests/game.spec.ts`, and every spec that uses `assignArrangementByClick` or `playFullRound`.

Delete:
- `apps/web/src/components/game/HandArea.tsx` and `__tests__/HandArea.test.tsx`
- `apps/web/src/components/game/GroupSlot.tsx` and `__tests__/GroupSlot.test.tsx`

## Test matrix (write first)

| Layer | Test | Expected |
|---|---|---|
| shared | `estimateFiveCardCategory` for each category | Same category numbers as today. `quickFoulCheck` tests stay green. |
| web lib | `layoutDeal(cards, 'raw')` | Rows are cards 0-4, 5-9, 10-12 in deal order. |
| web lib | `layoutDeal(cards, 'sorted')` | Rows come from `sortCards(cards)`, split 5 / 5 / 3. |
| web lib | `readDealOrder` with no value, a bad value, and a throwing storage | Returns `raw`. |
| web lib | keyboard getter with the arrow keys | Returns the center of the next card in that direction, or `undefined` at the edge. |
| hook | `swapCards` inside one row | The two cards trade positions. Other cards stay. |
| hook | `swapCards` across rows | Row lengths stay 5 / 5 / 3. |
| hook | `swapCards(a, a)` and an unknown id | State object does not change. |
| hook | `sortRows` | Each row is sorted. The set of cards in each row does not change. |
| hook | `applyArrangement` with a foreign or duplicate card | Ignored. |
| hook | `labels` | Correct names. `null` for all rows with `showHandStrength` off. |
| component | `GroupRow` | Label, hand name, and one `playing-card` for each card. No empty slot. |
| component | `GameBoard` | Rows render in the order Front, Middle, Back. Submit is enabled at deal for a non-foul deal. The Sort button and the switch render. |
| e2e | deal | 3 / 5 / 5 cards in the rows. No hand area. |
| e2e | pointer drag swap | Two cards trade places across rows. |
| e2e | keyboard drag swap | Two cards trade places. |
| e2e | Sort | Each row is sorted by rank. |
| e2e | preference `sorted` set before the deal | The rows match `sortCards` order. |
| e2e | foul warning | Swaps that make Middle stronger than Back show the warning and disable submit. |
| e2e | full round | Both players arrange a valid board by swaps, submit, and reach the result page. |

## Steps

1. Write the shared estimator tests. Export `estimateFiveCardCategory` and `FIVE_CARD_CATEGORY_NAME`. Run `pnpm --filter @binh-13/shared test`.
2. Write `dealOrder.test.ts`, then implement `dealOrder.ts`.
3. Write the new `useArrangement.test.ts`, then rewrite the hook. `swapCards` finds the row and index of each card, swaps them in one `setState`, and returns the same state object for a no-op.
4. Write `dndKeyboard.test.ts`, then implement the coordinate getter. It reads the droppable rects from the dnd-kit `context.droppableContainers` and picks the nearest card center in the arrow direction.
5. Update `Card.tsx` for `dragSource` without `onClick` and for `dropTarget`. Update the `Card` tests.
6. Write `GroupRow.test.tsx`, then build `GroupRow.tsx`. Cards sit in one flex row with `flex-nowrap`. On small screens a negative margin makes them overlap, so each row fits at 375 px.
7. Rewrite `GroupPanel.tsx` and `GameBoard.tsx`. Use `closestCenter` collision detection so a drop lands on the nearest card. Keep the `DragOverlay`.
8. Delete `HandArea` and `GroupSlot` with their tests. Run `pnpm --filter @binh-13/web test`.
9. Update the e2e helpers. `readBoard(page)` returns the card ids of each row. `swapByPointer(page, a, b)` reuses `dragBetween`. `swapByKeyboard(page, a, b)` focuses card a, presses Space, presses the arrows until card b is the target, and presses Space. `arrangeBySwaps(page, target)` walks the 13 positions and swaps the wanted card into each position with `swapByKeyboard` (at most 12 swaps).
10. Rewrite `apps/e2e/tests/game.spec.ts` for the test matrix. Update `playFullRound` and every other spec that arranged cards through the hand.
11. Run the full verification below.

## Verification

```bash
pnpm --filter @binh-13/shared test
pnpm --filter @binh-13/web test
pnpm typecheck
pnpm lint
pnpm test:e2e
```

## Risks

- Pointer drags in the e2e Chromium are unreliable after a previous drop. The full-arrangement helper uses the keyboard path. Only one spec uses a pointer drag. If that spec is flaky, report it and do not add a sleep.
- `closestCenter` can pick a card in the next row at the edge of a row. The e2e swap spec covers a cross-row swap to catch this.

## Rollback

Revert the phase commit. The server contract does not change in this phase, so the old client works with the same server.
