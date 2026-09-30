---
phase: 4
title: "Chi-by-chi reveal"
status: completed
priority: P2
effort: "3h"
dependencies: [3]
---

# Phase 4: Chi-by-chi reveal

## Goal

The result page reveals the rows one at a time, as Mau Binh apps do.

## Scout first

Read `apps/web/src/pages/Result.tsx`, `components/game/ResultGroupDisplay.tsx`, `ResultCardRow.tsx`, their tests, `docs/result-card-display.md`, and `apps/e2e/tests/result.spec.ts`.

## Requirements

- [x] The reveal order is Front (group3), then Middle (group2), then Back (group1). One constant `REVEAL_STEP_MS` sets the step time. The default is 5000 ms, from the research report.
- [x] Before a row is revealed, both players' cards in that row show as card backs, and no hand name shows.
- [x] A running score updates after each step. The win, lose, or draw banner shows after the last step.
- [x] A Skip button reveals all rows at once and shows the banner.
- [x] A surrender result and an instant-win result skip the reveal and show everything at once.
- [x] A foul result uses the reveal. The foul rows show "Foul".
- [x] Rematch buttons stay available during the reveal.
- [x] The component clears its timer on unmount.

## Files

Modify:
- `apps/web/src/pages/Result.tsx`. A small `useRevealSteps` hook next to it is fine to keep the page short.
- `apps/web/src/components/game/ResultGroupDisplay.tsx` (a `revealed` prop)
- Their tests, and `apps/e2e/tests/result.spec.ts`

## Test matrix (write first)

Use the fake timers of Vitest.

| Test | Expected |
|---|---|
| At start | No row is revealed. No banner. |
| After 1, 2, and 3 steps | Front, then Middle, then Back are revealed. The score updates. The banner shows after step 3. |
| Skip | All rows and the banner show at once. |
| Surrender result | Everything shows at once. |
| Instant-win result | Everything shows at once. |
| Unmount during the reveal | No timer runs after unmount. |
| e2e full round | Skip works, and the banner shows. |

## Verification

```bash
pnpm --filter @binh-13/web test
pnpm typecheck && pnpm lint
```

## Risks

- e2e specs that read the banner right after the round now wait up to 15 s. Those specs click Skip first.

## Rollback

Revert the phase commit. Client only.
