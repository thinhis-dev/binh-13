---
phase: 5
title: "Docs"
status: completed
priority: P3
effort: "1h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Docs

## Goal

The docs describe the swap board, the new timeout rule, the new events, and the instant-win hands.

## Requirements

- [x] `PLAN.md` section 2 (Game Rules): the deal into rows, the swap, the timeout auto-arrange, and the instant-win table with its tie order.
- [x] `PLAN.md` section 7 (Game Board Layout): the pyramid layout, Front at the top.
- [x] `PLAN.md` section 9 (event contract): `game:draft`, `game:hint_request`, `game:hint`.
- [x] `docs/hand-sorting.md`: the Sort button now sorts inside each row, and the deal-order preference exists.
- [x] `docs/game-ui-arrangement-implementation.md`: replace the click and hand flow with the swap flow.
- [x] `docs/result-card-display.md`: the chi-by-chi reveal and Skip.
- [x] `docs/e2e-playwright.md`: the keyboard swap helper and the reason for it.
- [x] Each claim matches the code after phases 1 to 4.

## Files

Modify: `PLAN.md`, `docs/hand-sorting.md`, `docs/game-ui-arrangement-implementation.md`, `docs/result-card-display.md`, `docs/e2e-playwright.md`.

## Verification

- Read each changed section against the code.
- `grep -rn "forfeit" PLAN.md docs/` shows only the surrender path.
- `grep -rn "HandArea\|GroupSlot\|assignToGroup" PLAN.md docs/ AGENTS.md` shows no stale references.
