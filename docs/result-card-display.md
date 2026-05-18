# Document: Visual Card Display on Result Screen

**Feature:** Display card groups with highlighted hand-forming cards on the result screen  
**Version:** 1.0.0

---

## 1. Feature Overview

After a round ends, the Result screen shows both players' card arrangements visually. Each group (Back, Middle, Front) displays both players' actual cards. Cards that form the hand rank (e.g., the paired cards in "One Pair") are highlighted with a colored border:

- **Green ring** — cards in a group the player **won**
- **Red ring** — cards in a group the player **lost**
- **No ring** — draw, or cards not part of the hand rank

Cards within each group are sorted by rank descending (Ace highest), then by suit (Spades > Hearts > Diamonds > Clubs).

---

## 2. Component Hierarchy

```
Result (page)
├── Banner (win/lose/draw)
├── Score Summary
├── ResultGroupDisplay (×3: Back, Middle, Front)
│   ├── Group header (label + hand descriptions + win/lose icon)
│   ├── ResultCardRow (Your cards)
│   │   └── Card (×5 or ×3, with optional highlight)
│   └── ResultCardRow (Opponent's cards)
│       └── Card (×5 or ×3, with optional highlight)
├── Rematch Button
└── Leave Button
```

---

## 3. Test Cases

### 3.1 `packages/shared/src/__tests__/handHighlight.test.ts`

#### 3.1.1 Five-Card Highlight Detection (`getHighlightedCardIds`)

| #   | Test Case                                     | Input Cards      | Expected Highlighted IDs |
| --- | --------------------------------------------- | ---------------- | ------------------------ |
| 1   | Highlights all 5 cards for a Royal Flush      | `AS KS QS JS TS` | All 5 IDs                |
| 2   | Highlights all 5 cards for a Straight Flush   | `9H 8H 7H 6H 5H` | All 5 IDs                |
| 3   | Highlights 4 cards for Four of a Kind         | `7S 7H 7D 7C 2S` | `7S 7H 7D 7C`            |
| 4   | Highlights all 5 cards for a Full House       | `QS QH QD 9S 9H` | All 5 IDs                |
| 5   | Highlights all 5 cards for a Flush            | `AS TS 7S 4S 2S` | All 5 IDs                |
| 6   | Highlights all 5 cards for a Straight         | `9H 8S 7D 6C 5H` | All 5 IDs                |
| 7   | Highlights 3 cards for Three of a Kind        | `5S 5H 5D KS 2C` | `5S 5H 5D`               |
| 8   | Highlights 4 cards for Two Pair               | `KS KH 4D 4C 2S` | `KS KH 4D 4C`            |
| 9   | Highlights 2 cards for One Pair               | `AS AH 9D 6C 3S` | `AS AH`                  |
| 10  | Highlights 1 card (highest) for High Card     | `AS KD 9H 6C 3S` | `AS`                     |
| 11  | Throws error when given wrong number of cards | 4 cards          | `Error`                  |
| 12  | Throws error when given wrong number of cards | 6 cards          | `Error`                  |

#### 3.1.2 Three-Card Highlight Detection (`getHighlightedCardIds`)

| #   | Test Case                                  | Input Cards | Expected Highlighted IDs |
| --- | ------------------------------------------ | ----------- | ------------------------ |
| 13  | Highlights all 3 cards for Three of a Kind | `7S 7H 7D`  | All 3 IDs                |
| 14  | Highlights 2 cards for One Pair            | `KS KH 3D`  | `KS KH`                  |
| 15  | Highlights 1 card (highest) for High Card  | `AH 9D 4C`  | `AH`                     |
| 16  | Throws error for 2 cards                   | 2 cards     | `Error`                  |
| 17  | Throws error for 4 cards                   | 4 cards     | `Error`                  |

#### 3.1.3 Edge Cases

| #   | Test Case                                           | Input Cards      | Expected      |
| --- | --------------------------------------------------- | ---------------- | ------------- |
| 18  | Four of a Kind with ace kicker — only 4 highlighted | `AA AH AD AC KS` | `AS AH AD AC` |
| 19  | Two Pair with high kicker — kicker not highlighted  | `AS AH KS KH QD` | `AS AH KS KH` |
| 20  | Pair of twos — lowest pair still highlights 2 cards | `2S 2H AH KD QC` | `2S 2H`       |

---

### 3.2 `apps/web/src/components/card/__tests__/Card.test.tsx` (additions)

| #   | Test Case                                     | Props                          | Expected                                         |
| --- | --------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| 21  | Applies green ring when `highlight="win"`     | `highlight="win"`              | `ring-green-500` class present                   |
| 22  | Applies red ring when `highlight="lose"`      | `highlight="lose"`             | `ring-red-500` class present                     |
| 23  | No highlight ring when `highlight` is omitted | no highlight prop              | Neither `ring-green-500` nor `ring-red-500`      |
| 24  | Highlight ring coexists with selected ring    | `highlight="win"` + `selected` | Both `ring-green-500` and `ring-primary` present |

---

### 3.3 `apps/web/src/components/game/__tests__/ResultCardRow.test.tsx`

| #   | Test Case                                                     | Props                                    | Expected                                   |
| --- | ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| 25  | Renders all cards in the row                                  | 5 cards, empty highlight set             | 5 `playing-card` elements rendered         |
| 26  | Cards are sorted descending by rank                           | Unsorted 5 cards                         | First card is highest rank, last is lowest |
| 27  | Highlighted cards get `highlight="win"` when outcome is win   | 5 cards, 2 highlighted, `outcome="win"`  | 2 cards have green ring, 3 don't           |
| 28  | Highlighted cards get `highlight="lose"` when outcome is lose | 5 cards, 2 highlighted, `outcome="lose"` | 2 cards have red ring, 3 don't             |
| 29  | No cards are highlighted when outcome is draw                 | 5 cards, 2 highlighted, `outcome="draw"` | No cards have colored rings                |
| 30  | Works with 3-card groups                                      | 3 cards                                  | 3 `playing-card` elements rendered         |
| 31  | Cards not in highlight set have no highlight prop             | 5 cards, 2 in set                        | 3 cards without colored ring               |

---

### 3.4 `apps/web/src/components/game/__tests__/ResultGroupDisplay.test.tsx`

| #   | Test Case                                        | Props                         | Expected                          |
| --- | ------------------------------------------------ | ----------------------------- | --------------------------------- |
| 32  | Renders group label                              | `groupLabel="Back (5)"`       | "Back (5)" text visible           |
| 33  | Renders hand descriptions for both players       | comparison with p1Hand/p2Hand | Both hand names visible           |
| 34  | Shows ✓ icon for winning group (mySide wins)     | `result="p1"`, `mySide="p1"`  | Green ✓ icon                      |
| 35  | Shows ✗ icon for losing group (mySide loses)     | `result="p2"`, `mySide="p1"`  | Red ✗ icon                        |
| 36  | Shows — icon for drawn group                     | `result="draw"`               | Neutral — icon                    |
| 37  | Renders "You" and "Opponent" labels              | any                           | "You" and "Opponent" text present |
| 38  | Renders correct number of cards for 5-card group | 5 my cards + 5 opponent cards | 10 `playing-card` elements        |
| 39  | Renders correct number of cards for 3-card group | 3 my cards + 3 opponent cards | 6 `playing-card` elements         |
| 40  | Cards are displayed with `sm` size               | any                           | Cards have `h-24 w-16` classes    |

---

### 3.5 `apps/web/src/pages/__tests__/Result.test.tsx` (additions)

| #   | Test Case                                              | Setup                         | Expected                                     |
| --- | ------------------------------------------------------ | ----------------------------- | -------------------------------------------- |
| 41  | Displays cards for all three groups when result exists | Full result with arrangements | 26 `playing-card` elements (5+5+5+5+3+3)     |
| 42  | Cards in winning group have green highlight            | P1 wins group1                | Green-ringed cards in group1 my cards        |
| 43  | Cards in losing group have red highlight               | P1 loses group2               | Red-ringed cards in group2 my cards          |
| 44  | Foul player's groups show red highlight                | P1 fouls                      | All P1 groups show red highlight             |
| 45  | Opponent foul groups show green highlight for winner   | P2 fouls                      | All P1 groups show green highlight           |
| 46  | Cards are sorted within each group display             | Any result                    | Cards in each row are sorted descending      |
| 47  | Both players' hand descriptions remain visible         | Any result                    | Hand description text visible for each group |

---

## 4. Implementation Details

### 4.1 Hand Highlight Detection (`packages/shared/src/handHighlight.ts`)

```ts
import type { Card } from './types'
import { RANK_VALUE } from './evaluator'

/**
 * Determines which cards form the hand rank in a group.
 * Works for both 3-card and 5-card groups.
 * Returns a Set of card IDs that should be highlighted.
 */
export function getHighlightedCardIds(cards: Card[]): Set<string> {
  if (cards.length === 3)
    return getThreeCardHighlight(cards)
  if (cards.length === 5)
    return getFiveCardHighlight(cards)
  throw new Error(`Expected 3 or 5 cards, got ${cards.length}`)
}
```

**Algorithm for 5-card hands:**

1. Count frequency of each rank value
2. Check for flush (all same suit) and straight (sequential values, 5 unique)
3. Based on the hand category:
   - Flush/Straight/StraightFlush/RoyalFlush/FullHouse → all 5 card IDs
   - Four of a Kind → 4 card IDs matching the quad rank
   - Three of a Kind → 3 card IDs matching the trip rank
   - Two Pair → 4 card IDs matching both pair ranks
   - One Pair → 2 card IDs matching the pair rank
   - High Card → 1 card ID (highest rank)

**Algorithm for 3-card hands:**

1. Count frequency of each rank value
2. Three of a Kind → all 3 IDs
3. One Pair → 2 IDs matching the pair rank
4. High Card → 1 ID (highest rank)

### 4.2 Card Component Highlight Prop

Add optional `highlight?: 'win' | 'lose'` prop to `CardProps`. Apply conditional classes:

```ts
highlight === 'win' && 'ring-2 ring-green-500'
highlight === 'lose' && 'ring-2 ring-red-500'
```

These classes are applied alongside (not replacing) the existing `selected` ring.

### 4.3 ResultCardRow Component

- Accepts `cards`, `highlightedIds: Set<string>`, `outcome: 'win' | 'lose' | 'draw'`
- Sorts cards using `sortCards()` from `@/lib/cards`
- For each card, computes `highlight` prop:
  - If `outcome === 'draw'` → no highlight
  - If card ID in `highlightedIds` → `outcome` ('win' or 'lose')
  - Otherwise → no highlight
- Renders `<Card>` components with `size="sm"` and no `onClick` / `dragSource`

### 4.4 ResultGroupDisplay Component

- Accepts `groupLabel`, `comparison: GroupComparison`, `myCards`, `opponentCards`, `mySide`
- Computes outcome for each side from `comparison.result`
- Computes highlighted card IDs using `getHighlightedCardIds()`
- Renders group header with icon and descriptions
- Renders two `ResultCardRow`s (one for each player)

### 4.5 Result Page Integration

Replace the `<div>` elements in the group breakdown `map()` with `<ResultGroupDisplay>` components. The group cards come from `result.arrangements.p1` / `result.arrangements.p2`.

---

## 5. Visual Design

### Group Display Layout

```
┌─────────────────────────────────────────────────┐
│  ✓ Back (5) — Royal Flush vs Straight Flush     │
│                                                   │
│  You:                                             │
│  [A♠] [K♠] [Q♠] [J♠] [T♠]  ← all green ringed  │
│                                                   │
│  Opponent:                                        │
│  [9♥] [8♥] [7♥] [6♥] [5♥]  ← all red ringed     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ✗ Middle (5) — One Pair vs Two Pair            │
│                                                   │
│  You:                                             │
│  [A♠] [A♥] [9♦] [6♣] [3♠]  ← A♠,A♥ red ringed  │
│                                                   │
│  Opponent:                                        │
│  [K♠] [K♥] [4♦] [4♣] [2♠]  ← K,K,4,4 green     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ✓ Front (3) — Three of a Kind vs High Card     │
│                                                   │
│  You:                                             │
│  [7♠] [7♥] [7♦]  ← all green ringed              │
│                                                   │
│  Opponent:                                        │
│  [A♥] [9♦] [4♣]  ← A♥ red ringed                 │
└─────────────────────────────────────────────────┘
```

### Card Highlight Styles (Tailwind)

| Outcome | Highlighted Card                      | Non-highlighted Card |
| ------- | ------------------------------------- | -------------------- |
| Win     | `ring-2 ring-green-500 ring-offset-1` | No ring              |
| Lose    | `ring-2 ring-red-500 ring-offset-1`   | No ring              |
| Draw    | No ring                               | No ring              |

---

## 6. Accessibility

- Cards use existing `aria-label` (e.g., "A of Spades")
- Group displays use semantic `<section>` elements with heading labels
- Win/lose icons use `aria-label` attributes ("Won", "Lost", "Draw")
- Color is not the only indicator — icons (✓/✗/—) provide text cues

---

## 7. Testing Strategy

### Unit Tests

- `handHighlight.test.ts` — all hand categories for 3-card and 5-card, edge cases
- `Card.test.tsx` — highlight prop rendering
- `ResultCardRow.test.tsx` — sorting, highlight delegation, outcome mapping
- `ResultGroupDisplay.test.tsx` — composition, icon display, card count

### Integration Tests

- `Result.test.tsx` — full page rendering with card display, highlight verification

### Manual Verification

- Visual check of card colors on different screen sizes
- Verify highlight visibility in both light and dark modes
- Verify that foul scenarios display correctly
