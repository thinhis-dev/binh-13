# Plan: Hand Sorting Feature

**Status:** Planning  
**Priority:** Medium  
**Depends on:** Game UI (game-ui-arrangement), Card utilities (`apps/web/src/lib/cards.ts`)

---

## 1. Overview

Add a sorting function to the game screen that lets a player sort their 13-card hand. The primary sort is by **rank** (Ace highest → 2 lowest). A secondary sort by **suit** breaks ties for cards of the same rank.

The feature surfaces as:

1. A pure utility function `sortCards` in `apps/web/src/lib/cards.ts`.
2. A `sortHand` action inside the `useArrangement` hook.
3. A **"Sort"** button rendered in the `HandArea` component.

---

## 2. Sort Specification

### 2.1 Rank Order (primary key, descending)

| Rank | Value |
| ---- | ----- |
| A    | 14    |
| K    | 13    |
| Q    | 12    |
| J    | 11    |
| T    | 10    |
| 9    | 9     |
| 8    | 8     |
| 7    | 7     |
| 6    | 6     |
| 5    | 5     |
| 4    | 4     |
| 3    | 3     |
| 2    | 2     |

Uses the existing `RANK_VALUE` map from `apps/web/src/lib/cards.ts`.

### 2.2 Suit Order (secondary key, descending — conventional bridge order)

| Suit | Symbol | Value |
| ---- | ------ | ----- |
| S    | ♠      | 4     |
| H    | ♥      | 3     |
| D    | ♦      | 2     |
| C    | ♣      | 1     |

A new `SUIT_VALUE` map will be added to `apps/web/src/lib/cards.ts`.

### 2.3 Algorithm

```
sortCards(cards: Card[]): Card[]
  return cards.toSorted((a, b) => {
    const rankDiff = RANK_VALUE[b.rank] - RANK_VALUE[a.rank]   // descending
    if (rankDiff !== 0) return rankDiff
    return SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit]             // descending
  })
```

- Uses `toSorted()` for immutability (never mutates the input array).
- Returns a **new array** — safe with React state.

---

## 3. Affected Files

| File                                                       | Change                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `apps/web/src/lib/cards.ts`                                | Add `SUIT_VALUE` constant, add `sortCards()` function |
| `apps/web/src/lib/__tests__/cards.test.ts`                 | Add/create tests for `sortCards()`                    |
| `apps/web/src/hooks/useArrangement.ts`                     | Add `sortHand()` action                               |
| `apps/web/src/hooks/__tests__/useArrangement.test.ts`      | Add tests for `sortHand()`                            |
| `apps/web/src/components/game/HandArea.tsx`                | Add Sort button, accept `onSort` prop                 |
| `apps/web/src/components/game/__tests__/HandArea.test.tsx` | Add tests for Sort button                             |
| `apps/web/src/components/game/GameBoard.tsx`               | Wire `sortHand` to `HandArea`                         |

---

## 4. Test Plan (TDD)

All tests are written **before** the implementation they cover.

### Phase 1 — Unit: `sortCards()` in `cards.test.ts`

| #   | Test Case                           | Input                             | Expected Output                      |
| --- | ----------------------------------- | --------------------------------- | ------------------------------------ |
| 1   | Empty array                         | `[]`                              | `[]`                                 |
| 2   | Single card                         | `[{id:'AS', rank:'A', suit:'S'}]` | same                                 |
| 3   | Two cards, different ranks          | `2H, AH`                          | `AH, 2H`                             |
| 4   | Two cards, same rank different suit | `AD, AS`                          | `AS, AD`                             |
| 5   | Full 13-card hand sorted            | mixed 13 cards                    | highest rank+suit first, lowest last |
| 6   | All same rank                       | `2S, 2H, 2D, 2C`                  | `2S, 2H, 2D, 2C` (by suit desc)      |
| 7   | Already sorted input                | pre-sorted cards                  | same order (stable)                  |
| 8   | Immutability                        | original array                    | original array is not mutated        |
| 9   | Face cards ordering                 | `TH, JD, QC, KS, AS`              | `AS, KS, QC, JD, TH`                 |

### Phase 2 — Unit: `sortHand()` in `useArrangement.test.ts`

| #   | Test Case                  | Description                                                                          |
| --- | -------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Sorts remaining hand cards | After init with 13 cards, call `sortHand()` → hand is sorted by rank desc, suit desc |
| 2   | Does not affect groups     | Cards already assigned to group1/group2/group3 stay unchanged                        |
| 3   | Works with partial hand    | Remove some cards to groups, then `sortHand()` → remaining hand sorted               |
| 4   | Works on empty hand        | When all 13 cards are assigned, `sortHand()` is a no-op                              |
| 5   | Clears selection           | If a card is selected, `sortHand()` clears `selectedCardId`                          |

### Phase 3 — Component: Sort button in `HandArea.test.tsx`

| #   | Test Case                     | Description                                        |
| --- | ----------------------------- | -------------------------------------------------- |
| 1   | Renders Sort button           | Button with accessible label "Sort" is visible     |
| 2   | Calls onSort on click         | Clicking Sort button fires `onSort` callback       |
| 3   | Button hidden when hand empty | When `cards` is empty, Sort button is not rendered |

### Phase 4 — Integration: `GameBoard.test.tsx`

| #   | Test Case         | Description                                             |
| --- | ----------------- | ------------------------------------------------------- |
| 1   | Sort button wired | Clicking Sort in GameBoard results in hand being sorted |

---

## 5. Implementation Plan (step by step)

### Step 1 — `SUIT_VALUE` + `sortCards()` utility

**File:** `apps/web/src/lib/cards.ts`

```ts
export const SUIT_VALUE: Record<Suit, number> = {
  S: 4,
  H: 3,
  D: 2,
  C: 1,
}

export function sortCards(cards: Card[]): Card[] {
  return cards.toSorted((a, b) => {
    const rankDiff = RANK_VALUE[b.rank] - RANK_VALUE[a.rank]
    if (rankDiff !== 0) return rankDiff
    return SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit]
  })
}
```

### Step 2 — `sortHand()` action in `useArrangement`

**File:** `apps/web/src/hooks/useArrangement.ts`

Add a new `sortHand` callback:

```ts
import { sortCards } from '@/lib/cards'

const sortHand = useCallback(() => {
  setState((current) => ({
    ...current,
    hand: sortCards(current.hand),
    selectedCardId: null,
  }))
}, [])
```

Return `sortHand` from the hook.

### Step 3 — Sort button in `HandArea`

**File:** `apps/web/src/components/game/HandArea.tsx`

- Add `onSort?: () => void` to `HandAreaProps`.
- Render a Sort button in the header area, next to the "Hand" title.
- Hide button when `cards.length === 0`.

```tsx
{
  cards.length > 0 && onSort && (
    <button onClick={onSort} className="text-xs ...">
      Sort
    </button>
  )
}
```

### Step 4 — Wire in `GameBoard`

**File:** `apps/web/src/components/game/GameBoard.tsx`

Pass `onSort={sortHand}` to `<HandArea>`.

---

## 6. Edge Cases & Decisions

| Decision                                         | Rationale                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Sort is **descending** (A first, 2 last)         | Matches natural "strongest first" reading order for poker-style games                   |
| Suit order is Spades > Hearts > Diamonds > Clubs | Standard bridge convention; consistent secondary tiebreak                               |
| `toSorted()` over `[...arr].sort()`              | Immutable; avoids mutating React state; per project React best practices                |
| Sort only affects **hand**, not groups           | Groups are player-arranged strategically; sorting them would undo intentional placement |
| Sort clears card selection                       | Prevents stale selection index after reorder                                            |
| No sort for group panels                         | Groups are manually arranged; auto-sort would interfere with strategy                   |

---

## 7. Future Considerations

- **Toggle sort direction** — could add ascending sort (2→A) behind a second click.
- **Sort by suit first** — alternative mode grouping all spades, hearts, etc.
- **Auto-sort on deal** — optional preference to sort on initial deal.
- **Keyboard shortcut** — bind `S` key to trigger sort.

These are out of scope for this iteration.
