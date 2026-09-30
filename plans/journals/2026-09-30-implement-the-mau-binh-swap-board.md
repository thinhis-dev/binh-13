---
title: Implement the Mau Binh swap board
date: 2026-09-30
summary: "All 5 phases of the swap board plan are done: swap board, draft and Hint, instant wins, row reveal, docs."
---

# Implement the Mau Binh swap board

## What happened

The plan `plans/260930-1657-mau-binh-swap-board` is done in all 5 phases. The game deals the 13 cards into a Front, Middle, and Back pyramid, and the player swaps cards by drag. The client sends a draft 300 ms after each change. At timeout, the server uses the last usable draft, else a greedy auto-arrangement, so a timeout never forfeits. A Hint button shows the same auto-arrangement. The five instant-win hands score 3-0 and override a foul. The result page reveals Front, Middle, and Back with a Skip button.

Checks at the end: typecheck clean, lint 0 errors, unit tests 76 + 277 + 232 pass, e2e 32 pass on repeated runs.

## Problems found

- The dnd-kit KeyboardSensor adds its keydown listener in a `setTimeout(0)` after the drag starts. Chromium can run an input event first, so the first arrow key was lost. The e2e helper now waits for a page `setTimeout(0)` after `aria-pressed="true"`.
- The keyboard sensor scrolled the page with a smooth animation, and the next key press read a position in the middle of it. The board now sets `scrollBehavior: 'auto'`.
- The 100 ms `autoArrange` timing test failed under the parallel test run (161 ms to 719 ms), but a warm call takes about 20 ms. The test now measures CPU time with `process.cpuUsage`.
- Python text-mode edits changed `packages/shared/src/types.ts` and `events.ts` from CRLF to LF. The CRLF endings were restored.

## Decisions

- `detectInstantWin` takes only the board, because the hand is the cards of the board.
- The `saveDraft` and `requestHint` wrappers are in `apps/web/src/hooks/useSocket.ts`, next to the other emit wrappers.

## Next steps

- The e2e foul-warning spec can fail on a rare deal with a whole-hand instant win (for example Six pairs), because submit is then enabled.
- No commit was made.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
