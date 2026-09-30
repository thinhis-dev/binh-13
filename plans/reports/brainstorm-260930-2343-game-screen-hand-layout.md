# Brainstorm: Game screen hand layout

Source request: `plans/game-screen-ui.md`. Screenshot: `plans/assets/screenshot-1.png`.

## Current state

`apps/web/src/components/game/HandArea.tsx` renders the hand as `flex flex-wrap gap-2`. Each card is `md` size (`h-32 w-[5.5rem]`, 88 px wide) from `apps/web/src/components/card/Card.tsx`. The hand shares a row with `GroupPanel` on `lg` screens (`GameBoard.tsx`), so the hand gets about half the width. At 1920 px, only 7 cards fit in one row, and the other cards wrap to a second row. The player must scan two rows, and the order of the sorted hand breaks across the wrap.

Tests select the hand by `data-testid="hand-area"` and `data-testid="playing-card"` only. No test depends on `flex-wrap` or on the card position, so a layout change does not break the existing tests.

## How card games show a hand

This section uses general knowledge of popular card game clients. No live web research ran for this report.

- Mau Binh apps (for example ZingPlay Mau Binh) and Pusoy apps: the game deals the 13 cards directly into the three rows (3 / 5 / 5). No separate hand exists. The player drags one card onto another card to swap them. The app shows the hand strength of each row live.
- Tien Len, Big Two, poker, and solitaire clients: the hand is one horizontal row at the bottom of the screen. The cards overlap, so only the left strip of each card shows. The strip holds the rank and suit corner. A tapped or selected card rises up by a few pixels.
- Hearthstone and other collectible card games: the hand is an arc (a fan). Each card rotates a little. A hovered card grows and comes to the front.
- Open Face Chinese Poker clients: the three rows sit in the center as a pyramid. The cards not yet placed sit in one row below the pyramid.

Common rule: if the space is small, all these games keep the hand in one row and overlap the cards instead of a wrap.

## Contract

Outcome: the player sees all unassigned cards in one row and can drag or tap any card easily, on desktop and on a phone.

Constraints:
- Keep the current `useArrangement` state, the tap-to-select flow, the drag-and-drop flow with `@dnd-kit`, and the submit contract.
- Keep `data-testid` values so unit tests and Playwright e2e tests keep working.
- Every card must show its rank and suit corner, and every card must have a clickable area.
- Tailwind v4 and the existing `Card` component. No new dependency.

Non-goals:
- No change to server events, to the shared package, or to the game rules.
- No card animations beyond a simple lift on hover or selection.
- No reorder of cards inside the hand by drag (the Sort button already exists).

Acceptance criteria:
- With 13 cards in the hand, the hand shows one row at 1920 px, 1280 px, and 375 px widths, with no horizontal page scroll.
- Each card shows its rank and suit corner.
- A click on the visible strip of any card selects that card, and a drag from that strip moves that card.
- A hovered or selected card comes to the front and rises.
- `pnpm --filter @binh-13/web test`, `pnpm typecheck`, `pnpm lint`, and the Playwright e2e suite pass.

## Options

### A. Overlapping single row, hand moved to full width at the bottom (recommended)

Put the three group rows at the top, in the order of the physical table (Front 3, Middle 5, Back 5). Put the hand below them at full width. Show the hand as one row of overlapping cards. A CSS grid with `grid-template-columns: repeat(n - 1, minmax(0, <card width>)) <card width>` lets the columns shrink. If space is free, the cards spread out. If space is small, the cards overlap. On a phone, the hand uses the `sm` card size.

- Depends most on: the visible strip (about 22 px at 375 px width) being large enough to tap.
- Fails first: on very narrow phones (below 340 px), where the strip gets too small. Tap-to-select still works because a selected card rises.
- Cost: changes in `HandArea.tsx`, `GameBoard.tsx`, and possibly the order in `GroupPanel.tsx`. Small.

### B. Arc fan like Hearthstone

Rotate each card along an arc and grow the hovered card.

- Depends most on: `@dnd-kit` transforms that work together with the rotation. The drag transform replaces the rotation transform unless the rotation goes on a wrapper.
- Fails first: hit-testing, because rotated cards overlap in a non-rectangular way and the wrong card gets the click.
- Cost: medium, with a worse usability result than A on a phone. Not recommended.

### C. Mau Binh style: deal into the three rows, swap to arrange

Remove the hand. The game deals the 13 cards into Back, Middle, and Front at the start. The player drags one card onto another card to swap them.

- Depends most on: players who know the Mau Binh convention. Vietnamese players do.
- Fails first: the current "Submit is disabled until groups are full" rule and the auto-forfeit logic. With pre-filled rows, the arrangement is always complete, so the submit and timeout behavior changes. That is a game-flow change, not a layout change.
- Cost: large. It changes `useArrangement` (swap instead of assign and remove), `GroupSlot`, `HandArea` (deleted), unit tests, e2e tests, and `docs/game-ui-arrangement-implementation.md`.

## Trade-offs

- A keeps every current contract and fixes the reported problem. It still needs two actions (pick, then place) for each card.
- B looks like a game but makes the tap target worse, which is the exact problem the user reported.
- C matches the genre best and needs the fewest actions, but it changes the game flow and the timeout rule. It is a product decision, not only a UI fix.

## Better approaches

Option C is the genre convention and can be better for experienced players. The evidence is that Mau Binh and Pusoy clients use it. The cost of a switch is a rewrite of the arrangement hook and its tests. Recommendation: do A now. If the user wants the Mau Binh feel, treat C as a separate feature.

## Recommended direction

Option A. Hand to hand-off: `/ak:plan` with this report, then `/ak:cook`.

## Unresolved questions

- Choose A only, or A now and C later as a separate feature.
- Group row order: keep Back at the top (current order), or put Front at the top as on a physical table.
