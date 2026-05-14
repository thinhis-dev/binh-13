# Hand Sorting Feature

**Implemented by:** Plan [hand-sorting.md](../plans/hand-sorting.md)

---

## Summary

The hand sorting feature lets a player re-order their remaining hand cards on the game screen. Cards are sorted **descending by rank** (Ace highest, 2 lowest) with a **secondary sort by suit** (Spades > Hearts > Diamonds > Clubs).

Sorting only affects the **hand zone** — cards already placed into the three arrangement groups (Back, Middle, Front) are not affected.

---

## Architecture

```
cards.ts              → sortCards()          Pure utility, no side effects
    ↓
useArrangement.ts     → sortHand()          Hook action, updates hand state
    ↓
HandArea.tsx          → <Sort button>        UI trigger
    ↓
GameBoard.tsx         → wires sortHand       Connects hook to component
```

### Data Flow

1. Player clicks **Sort** button in `HandArea`.
2. `GameBoard` calls `sortHand()` from `useArrangement`.
3. `sortHand()` calls `sortCards(current.hand)` and replaces `hand` in state.
4. React re-renders `HandArea` with the sorted order.

No network events are involved — sorting is a purely client-side UI convenience.

---

## Sort Algorithm

### Rank Value Table

```
A=14  K=13  Q=12  J=11  T=10  9=9  8=8  7=7  6=6  5=5  4=4  3=3  2=2
```

### Suit Value Table (bridge convention)

```
♠ Spades=4   ♥ Hearts=3   ♦ Diamonds=2   ♣ Clubs=1
```

### Comparator

```ts
;(a, b) => {
  const rankDiff = RANK_VALUE[b.rank] - RANK_VALUE[a.rank] // descending
  if (rankDiff !== 0) return rankDiff
  return SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit] // descending
}
```

**Example result:** `A♠ A♥ A♦ A♣ K♠ K♥ … 3♣ 2♠ 2♥ 2♦ 2♣`

---

## API Reference

### `sortCards(cards: Card[]): Card[]`

**Location:** `apps/web/src/lib/cards.ts`

Pure function. Returns a new sorted array without mutating the input. Uses `toSorted()` for immutability.

### `SUIT_VALUE: Record<Suit, number>`

**Location:** `apps/web/src/lib/cards.ts`

Maps each suit to a numeric value for sort comparison.

### `sortHand(): void`

**Location:** `apps/web/src/hooks/useArrangement.ts` (returned from `useArrangement`)

Sorts the hand cards in-place within state. Also clears `selectedCardId`.

---

## UI Behavior

| State                        | Sort Button               |
| ---------------------------- | ------------------------- |
| Hand has cards               | Visible, enabled          |
| Hand is empty (all assigned) | Hidden                    |
| Cards in groups              | Not affected by sort      |
| Card selected                | Selection cleared on sort |

The Sort button is rendered in the `HandArea` header bar, next to the "Hand" title.

---

## Immutability Guarantee

The `sortCards` function uses `Array.prototype.toSorted()` which returns a new array, leaving the original untouched. This is critical for React's state model — we never mutate state directly.

If browser support for `toSorted()` is a concern, the fallback is `[...cards].sort(comparator)`.

---

## Relationship to Original Deal Order

The `useArrangement` hook tracks `originalOrder` (the card IDs in deal order) to restore cards to their dealt position when removed from groups. After the player presses Sort, the hand is re-ordered by rank/suit. If a card is later removed from a group, it is inserted back into the hand in **original deal order** (existing behavior) — the player can press Sort again to re-sort.

This is intentional: deal-order restoration after group removal is a separate concern from explicit user-initiated sorting.
