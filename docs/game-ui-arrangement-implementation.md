# Game UI Arrangement Implementation

## Summary

Implemented the UI-only card arrangement screen from `plans/game-ui-arrangement.md`.

## What Changed

- Removed the lobby message panel and send form from `apps/web/src/pages/Lobby.tsx`.
- Replaced the placeholder game page with `GameBoard` using a fixed mocked 13-card hand.
- Added local arrangement state in `apps/web/src/hooks/useArrangement.ts`.
- Added card visuals:
  - `Card.tsx`
  - `CardBack.tsx`
- Added game board UI:
  - `OpponentArea.tsx`
  - `HandArea.tsx`
  - `GroupPanel.tsx`
  - `GroupSlot.tsx`
  - `GameBoard.tsx`
- Added `apps/web/src/lib/mockCards.ts` for the UI-only mocked hand.
- Added focused hook and component tests for card rendering, slot behavior, hand display, and full submit flow.
- Added `packages/shared` build script so the documented root `pnpm build` command works.
- Added RTL cleanup in the web test setup to isolate component tests.
- Added `useArrangement.ts` to the web coverage gate.

## Current Behavior

- Click a hand card to select it.
- Click an empty group slot to move the selected card into that group.
- Click a grouped card to return it to the hand.
- Submit is disabled until Back has 5 cards, Middle has 5 cards, and Front has 3 cards.
- Submitting logs `{ group1, group2, group3 }` to the browser console.

## Verification

- `corepack pnpm --filter @binh-13/web test`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm --filter @binh-13/web test:coverage`
