# Plan: Visual Card Display on Result Screen

**Status:** Planned  
**Priority:** Medium  
**Approach:** TDD — tests first, then implementation

---

## 1. Problem Statement

Currently the Result page shows only text descriptions of each group (e.g. "Royal Flush", "One Pair"). Players cannot see the actual cards or understand which cards formed the winning combination. We need to:

1. Display both players' cards visually in each group on the result screen
2. Highlight the cards that form the hand rank (e.g., the pair cards in a One Pair)
3. Use green borders for winning groups, red borders for losing groups, neutral for draws
4. Sort cards within each group by rank descending (highest first)

---

## 2. Architecture Overview

### 2.1 New Shared Utility: Hand Highlight Detection

**Location:** `packages/shared/src/handHighlight.ts`

A pure function that takes an array of cards and returns which card IDs should be highlighted — i.e., which cards form the "hand rank" combination.

**Why shared?** The logic is pure (no server or client dependencies), and could theoretically be used on both sides. Keeping it in `packages/shared` follows the existing pattern for `evaluator.ts` and `foulCheck.ts`.

**For 5-card groups (Back/Middle):**

| Hand Rank       | Highlighted Cards                       |
| --------------- | --------------------------------------- |
| Royal Flush     | All 5                                   |
| Straight Flush  | All 5                                   |
| Four of a Kind  | 4 cards of matching rank                |
| Full House      | All 5 (3 + 2 are both part of the hand) |
| Flush           | All 5                                   |
| Straight        | All 5                                   |
| Three of a Kind | 3 cards of matching rank                |
| Two Pair        | 4 cards (2 + 2 matching ranks)          |
| One Pair        | 2 cards of matching rank                |
| High Card       | 1 card (highest rank only)              |

**For 3-card groups (Front):**

| Hand Rank       | Highlighted Cards          |
| --------------- | -------------------------- |
| Three of a Kind | All 3                      |
| One Pair        | 2 cards of matching rank   |
| High Card       | 1 card (highest rank only) |

**Function signature:**

```ts
export function getHighlightedCardIds(cards: Card[]): Set<string>
```

### 2.2 New Component: `ResultGroupDisplay`

**Location:** `apps/web/src/components/game/ResultGroupDisplay.tsx`

Displays a single group's comparison between two players:

- Group label (Back/Middle/Front) + hand descriptions
- Win/loss/draw indicator
- Both players' card rows, sorted descending by rank
- Highlighted cards (border) based on hand rank
- Green highlight ring for winning group, red for losing, neutral for draw

**Props:**

```ts
type ResultGroupDisplayProps = {
  groupLabel: string
  comparison: GroupComparison
  myCards: Card[]
  opponentCards: Card[]
  mySide: 'p1' | 'p2'
}
```

### 2.3 New Component: `ResultCardRow`

**Location:** `apps/web/src/components/game/ResultCardRow.tsx`

Renders a row of cards with highlight support. Each card that is in the highlighted set gets a colored ring.

**Props:**

```ts
type ResultCardRowProps = {
  cards: Card[]
  highlightedIds: Set<string>
  outcome: 'win' | 'lose' | 'draw'
}
```

### 2.4 Updated Card Component

The existing `Card` component needs a new optional prop for the highlight ring color, OR we create a wrapper `ResultCard` that adds the border. **Preferred approach:** Add an optional `highlight` prop to the existing `Card` component to avoid wrapper proliferation.

```ts
highlight?: 'win' | 'lose' | null
```

- `'win'` → green ring (`ring-green-500`)
- `'lose'` → red ring (`ring-red-500`)
- `null` / omitted → no highlight ring

### 2.5 Updated Result Page

Replace the text-only group breakdown section with `ResultGroupDisplay` components. Keep the existing banner, score summary, and action buttons.

---

## 3. Implementation Order (TDD)

### Phase 1: Shared — Hand Highlight Detection

1. **Write tests** `packages/shared/src/__tests__/handHighlight.test.ts`
2. **Implement** `packages/shared/src/handHighlight.ts`
3. **Export** from `packages/shared/src/index.ts`

### Phase 2: Card Component — Highlight Prop

1. **Write tests** in `apps/web/src/components/card/__tests__/Card.test.tsx` (add new test cases for highlight prop)
2. **Update** `apps/web/src/components/card/Card.tsx` — add `highlight` prop with green/red ring styles

### Phase 3: ResultCardRow Component

1. **Write tests** `apps/web/src/components/game/__tests__/ResultCardRow.test.tsx`
2. **Implement** `apps/web/src/components/game/ResultCardRow.tsx`

### Phase 4: ResultGroupDisplay Component

1. **Write tests** `apps/web/src/components/game/__tests__/ResultGroupDisplay.test.tsx`
2. **Implement** `apps/web/src/components/game/ResultGroupDisplay.tsx`

### Phase 5: Result Page Integration

1. **Update tests** in `apps/web/src/pages/__tests__/Result.test.tsx` — add new tests for card display, adjust existing tests as needed
2. **Update** `apps/web/src/pages/Result.tsx` — integrate new components

### Phase 6: Verify & Cleanup

1. Run full test suite (`pnpm test`)
2. Type check (`pnpm typecheck`)
3. Manual visual verification

---

## 4. Files Changed / Created

| Action     | File                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| **Create** | `packages/shared/src/handHighlight.ts`                                       |
| **Create** | `packages/shared/src/__tests__/handHighlight.test.ts`                        |
| **Modify** | `packages/shared/src/index.ts` (re-export)                                   |
| **Modify** | `apps/web/src/components/card/Card.tsx` (add `highlight` prop)               |
| **Modify** | `apps/web/src/components/card/__tests__/Card.test.tsx` (add highlight tests) |
| **Create** | `apps/web/src/components/game/ResultCardRow.tsx`                             |
| **Create** | `apps/web/src/components/game/__tests__/ResultCardRow.test.tsx`              |
| **Create** | `apps/web/src/components/game/ResultGroupDisplay.tsx`                        |
| **Create** | `apps/web/src/components/game/__tests__/ResultGroupDisplay.test.tsx`         |
| **Modify** | `apps/web/src/pages/Result.tsx` (integrate visual cards)                     |
| **Modify** | `apps/web/src/pages/__tests__/Result.test.tsx` (add visual card tests)       |

---

## 5. Card Sorting in Result Display

Cards within each group are sorted descending by rank (Ace high), then by suit (Spades > Hearts > Diamonds > Clubs), using the existing `sortCards()` utility from `apps/web/src/lib/cards.ts`. This sorting is applied at render time in `ResultCardRow` — the original arrangement data is not mutated.

---

## 6. Design Decisions

1. **Highlight detection is pure logic in shared** — no dependency on pokersolver. It uses frequency counting on card ranks, same approach as `evaluateThreeCard`.
2. **Cards use small size (`sm`)** on the result screen to fit both players' hands.
3. **No drag-and-drop on result cards** — they are display-only (`Card` without `onClick` or `dragSource`).
4. **Both players' cards are always visible** — the result screen reveals the opponent's hand.
5. **Foul groups**: When a player fouls, all their groups show red highlight regardless. The opponent's groups all show green.

---

## 7. Risks & Mitigations

| Risk                                                 | Mitigation                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| pokersolver doesn't expose which cards form the hand | We don't use pokersolver for highlight detection — we use our own frequency-based logic in shared |
| Card component changes break existing tests          | Add highlight prop as optional with default `undefined` — backwards compatible                    |
| Result page layout gets crowded with cards           | Use `sm` size cards, responsive grid                                                              |
