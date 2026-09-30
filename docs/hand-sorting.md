# Row Sorting and Deal Order

**Implemented by:** Plan [hand-sorting.md](../plans/hand-sorting.md), changed for the swap board by [plans/260930-1657-mau-binh-swap-board](../plans/260930-1657-mau-binh-swap-board/plan.md)

---

## Summary

The game screen has no separate hand. The client deals the 13 cards straight into the three rows: Back (cards 1 to 5), Middle (cards 6 to 10), and Front (cards 11 to 13). Two controls change the card order:

- The **Sort** button sorts the cards inside each row. Cards never move to another row.
- The **Sorted deal** switch in the game header is a device preference. It sets the order in which the cards fill the rows at the deal: `raw` (server deal order, the default) or `sorted`. A change applies from the next deal, and the current board does not change.

The sort order is **descending by rank** (Ace highest, 2 lowest), with a **secondary sort by suit** (Spades > Hearts > Diamonds > Clubs).

---

## Architecture

```
cards.ts              → sortCards()                   Pure utility, no side effects
dealOrder.ts          → readDealOrder() / writeDealOrder() / layoutDeal()
    ↓
useArrangement.ts     → layoutDeal() at the deal, sortRows() on Sort
    ↓
GameBoard.tsx         → Sort button, Sorted deal switch
```

### Data flow of Sort

1. The player clicks **Sort**.
2. `GameBoard` calls `sortRows()` from `useArrangement`.
3. `sortRows()` calls `sortCards()` on each of `group1`, `group2`, and `group3`.
4. 300 ms later, `GameBoard` sends the new board as a draft (`game:draft`), so that a timeout can use it.

### Data flow of the deal order

1. On mount, `GameBoard` reads the preference with `readDealOrder()`.
2. `useArrangement` lays out the dealt cards with `layoutDeal(cards, order)`.
3. The switch calls `writeDealOrder()`. The next deal uses the new value.

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
  if (rankDiff !== 0)
    return rankDiff
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

### `sortRows(): void`

**Location:** `apps/web/src/hooks/useArrangement.ts` (returned from `useArrangement`)

Sorts the cards inside each row. The set of cards in each row does not change.

### `readDealOrder(): DealOrder` and `writeDealOrder(order): void`

**Location:** `apps/web/src/lib/dealOrder.ts`

Read and write the `binh13.dealOrder` key in `localStorage`. Each call sits in `try/catch`. If storage is empty, holds an unknown value, or is blocked, `readDealOrder()` returns `raw`.

### `layoutDeal(cards, order): BoardRows`

**Location:** `apps/web/src/lib/dealOrder.ts`

Splits the dealt cards 5 / 5 / 3 into `group1`, `group2`, and `group3`. With `sorted`, it sorts all 13 cards with `sortCards()` first.

---

## UI Behavior

| Control        | Where               | Effect                                                      |
| -------------- | ------------------- | ----------------------------------------------------------- |
| Sort           | Below the board     | Sorts each row. Sends a draft 300 ms later.                 |
| Sorted deal    | Game header (switch) | Stores the preference. Help text: "Applies from the next deal." |

---

## Immutability Guarantee

The `sortCards` function uses `Array.prototype.toSorted()` which returns a new array, leaving the original untouched. React state is never mutated directly.
