# Game UI Arrangement Implementation

## Summary

The game screen is a Mau Binh style swap board. The client deals the 13 cards straight into three rows, and the player arranges them by a drag of one card onto another card. The design is in [plans/260930-1657-mau-binh-swap-board](../plans/260930-1657-mau-binh-swap-board/plan.md). It replaced the first version, which had a separate hand and empty group slots.

## Components

| File                                             | Role                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/web/src/components/game/GameBoard.tsx`     | `DndContext`, drop handler, submit rule, Sort, Hint, Sorted deal switch, draft sync |
| `apps/web/src/components/game/GroupPanel.tsx`    | Pyramid of three rows: Front, Middle, Back                                    |
| `apps/web/src/components/game/GroupRow.tsx`      | Row label, hand name, one line of swap cards                                  |
| `apps/web/src/components/card/Card.tsx`          | `dragSource` makes a card draggable. `dropTarget` makes it a droppable with a highlight. |
| `apps/web/src/hooks/useArrangement.ts`           | Board state and actions                                                       |
| `apps/web/src/lib/dealOrder.ts`                  | Deal-order preference and `layoutDeal`                                        |
| `apps/web/src/lib/dndKeyboard.ts`                | Keyboard drag that jumps from card to card                                    |

## Board state (`useArrangement`)

- State is `{ group1, group2, group3 }`. The rows always hold 5, 5, and 3 cards.
- `init(cards, order)` lays out a new deal.
- `swapCards(aId, bId)` swaps two cards, inside one row or across rows. A swap of a card with itself, or with an unknown id, keeps the same state object.
- `sortRows()` sorts inside each row.
- `applyArrangement(rows)` replaces the board with a hint. It ignores rows that do not hold exactly the current 13 cards.
- Derived values: `labels`, `hasFoulWarning` (`quickFoulCheck`), and `instantWin` (`detectInstantWin`). `labels` holds the hand name of each row. If the room hides hand strength, each label is `null`.

## Current Behavior

- A drag of card A onto card B swaps them. A drop on the same card, or outside any card, changes nothing. The card under the drag shows a green ring.
- Keyboard: Tab to a card, Space picks it up, each arrow key jumps to the next card in that direction, Space drops, and Escape cancels. The keyboard sensor scrolls the page instantly (`scrollBehavior: 'auto'`), so each jump ends before the next key press.
- Collision detection is `closestCenter`, so a drop lands on the nearest card.
- Submit is enabled unless the player submitted, the timer expired, or the foul warning shows. A board with an instant-win kind can be submitted with the foul warning on.
- 300 ms after each swap, sort, or hint, the client sends the board as `game:draft`. It sends no draft for the deal itself, after submit, or after the timer expires.
- The Hint button sends `game:hint_request`. The `game:hint` reply goes to the game store, and the board applies it once.
- At timeout, the banner says that the board was auto-arranged and submitted.

## Verification

- `pnpm --filter @binh-13/web test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e` (swap, Sort, Sorted deal, Hint, foul warning, and full-round specs in `apps/e2e/tests/game.spec.ts`)
