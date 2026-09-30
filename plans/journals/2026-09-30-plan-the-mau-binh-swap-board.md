---
title: Plan the Mau Binh swap board
date: 2026-09-30
summary: Planned a 5-phase change from the hand-plus-rows game screen to a Mau Binh style swap board.
---

# Plan the Mau Binh swap board

## What happened

The game screen wraps the 13-card hand onto two rows, and the player moves cards one at a time into empty rows (`plans/game-screen-ui.md`). Research on ZingPlay Mau Binh showed a different model: the game deals all cards into the three rows, and the player drags one card onto another to swap them. The user chose that model.

Plan: `plans/260930-1657-mau-binh-swap-board/` (mode `--deep --tdd`).

## Decisions

- Swap input is drag only. A keyboard drag path exists for accessibility and for e2e.
- Deal order is a device preference (raw by default, or sorted). A Sort button sorts inside each row.
- At timeout, the server uses the last valid draft (`game:draft`), else a greedy `autoArrange`. The forfeit stays for surrender only.
- The Hint button asks the server (`game:hint_request`). The server caches `autoArrange` for each player.
- Five instant-win hands score 3-0 and override a foul. Tie order: Dragon > Same color > Six pairs > Three flushes > Three straights.
- The result page reveals Front, Middle, then Back, with Skip.

## Red-team fixes

- A fouled Three flushes board was blocked by the client foul warning and by `allowFoul` off. Phase 3 lets instant-win boards through.
- Hint requests were a CPU flood risk. Phase 2 caches the result.
- Pointer drags in the e2e Chromium are unreliable after a drop. Phase 1 uses keyboard drags in the full-arrangement helper.

## Next steps

Run `/ak:cook plans/260930-1657-mau-binh-swap-board/plan.md`, starting with phase 1.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
