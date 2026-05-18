# Game UI — Card Arrangement Screen

**Scope:** Game page UI with card display, hand area, group slots, and submit.  
**Phase:** UI-only (no server integration, mocked hand, no ranking logic).  
**Depends on:** Existing `Card` type from `@binh-13/shared`, `useGameStore`, `cards.ts` helpers.

---

## What Changes

### 1. Lobby cleanup

- Remove the message input form and Send button from `Lobby.tsx`.
- Keep the seat display and Leave / Clear Room actions.

### 2. New component tree

```
pages/Game.tsx
└── components/game/GameBoard.tsx          ← assembles the full layout
    ├── components/game/OpponentArea.tsx   ← face-down cards row (static placeholder)
    ├── components/game/GroupPanel.tsx     ← the 3 group drop-zones (right / top)
    │   └── components/game/GroupSlot.tsx  ← single group (5-card or 3-card zone)
    ├── components/card/Card.tsx           ← single card visual (SVG)
    ├── components/card/CardBack.tsx       ← face-down card visual
    └── components/game/HandArea.tsx       ← horizontal row of unassigned cards
```

`SubmitArea` lives inline inside `GameBoard` — it is a one-liner button, not a separate component.

### 3. Arrangement state — `useArrangement` hook

`hooks/useArrangement.ts` (currently a placeholder) becomes the core state hook for this feature.

```ts
interface ArrangementState {
  hand: Card[] // unassigned cards remaining in hand
  group1: Card[] // Back   — 5 cards
  group2: Card[] // Middle — 5 cards
  group3: Card[] // Front  — 3 cards
  selectedCardId: string | null
}

interface ArrangementActions {
  init: (cards: Card[]) => void
  selectCard: (id: string | null) => void
  assignToGroup: (groupKey: GroupKey, card: Card) => void
  removeFromGroup: (groupKey: GroupKey, card: Card) => void
  isComplete: boolean // derived — true when all 3 groups are full
}
```

State lives **only in this hook** (not in `useGameStore`) — arrangement is local UI state until the player submits.

### 4. Mock data

`Game.tsx` calls `useArrangement().init()` with a fixed 13-card mock array on mount (so we can see the UI without a real socket event). The mock is replaced by `game:dealt` integration in the next ticket.

---

## Interaction Model (Click-based, DnD in next ticket)

1. **Select:** Click a card in the hand → it becomes selected (highlighted ring).
2. **Assign:** Click an open group slot → selected card moves from hand into that slot.  
   Clicking a slot that already has a card does nothing (slot is full).
3. **Return:** Click a card already inside a group → it moves back to hand.  
   This also clears the selected state.
4. **Re-select:** Click a different hand card while one is selected → switches selection.
5. **Submit:** Enabled only when `isComplete === true`. On click, `console.log` the full arrangement object.

---

## Component Specifications

### `components/card/Card.tsx`

```tsx
interface CardProps {
  card: Card
  selected?: boolean
  onClick?: () => void
  size?: 'sm' | 'md' // md = hand size, sm = group slot size
}
```

- Renders an inline SVG card with rank (top-left, bottom-right) and suit symbol centre.
- Red for H/D, default foreground for S/C.
- `selected` adds a ring/highlight border.
- Wrapped in `React.memo`.

### `components/card/CardBack.tsx`

```tsx
interface CardBackProps { size?: 'sm' | 'md' }
```

- Simple SVG with a decorative pattern (no rank/suit). Used for opponent placeholder.

### `components/game/HandArea.tsx`

```tsx
interface HandAreaProps {
  cards: Card[]
  selectedCardId: string | null
  onCardClick: (card: Card) => void
}
```

- Horizontal scrollable row of `Card` components.
- `React.memo` to avoid re-render when groups change but hand does not.

### `components/game/GroupSlot.tsx`

```tsx
interface GroupSlotProps {
  label: string // "Back (5)", "Middle (5)", "Front (3)"
  capacity: 5 | 3
  cards: Card[]
  onCardClick: (card: Card) => void // removes card from group
  onSlotClick: () => void // assigns selected card to this group
  isActive: boolean // true when a card is selected and slot has room
}
```

- Shows capacity indicator: "2 / 5 cards".
- Empty positions rendered as ghost/dashed placeholders.
- Cards rendered as `Card` components (size="sm").

### `components/game/GroupPanel.tsx`

```tsx
interface GroupPanelProps {
  group1: Card[]
  group2: Card[]
  group3: Card[]
  selectedCardId: string | null
  onSlotClick: (groupKey: GroupKey) => void
  onCardClick: (groupKey: GroupKey, card: Card) => void
}
```

- Stacks 3 `GroupSlot` components.
- Passes through click handlers from the hook.

### `components/game/GameBoard.tsx`

```tsx
interface GameBoardProps {
  initialCards: Card[] // 13 mocked cards
}
```

- Owns `useArrangement(initialCards)`.
- Composes `OpponentArea`, `GroupPanel`, `HandArea`, and the submit button.
- Submit `onClick` → `console.log({ group1, group2, group3 })`.
- Submit `disabled` when `!isComplete`.

---

## Layout Sketch

```
┌────────────────────────────────────────────────────────┐
│ Opponent (face-down)  [■][■][■][■][■] [■][■][■][■][■] [■][■][■]  │
├──────────────────────────────┬─────────────────────────┤
│                              │ Back (5)   [  ][  ][  ] │
│   Hand (scrollable)          │            [  ][  ]      │
│ [A♠][K♥][Q♦]...             │ Middle (5) [  ][  ][  ] │
│                              │            [  ][  ]      │
│                              │ Front (3)  [  ][  ][  ] │
├──────────────────────────────┴─────────────────────────┤
│              [ Submit Arrangement ]                     │
└────────────────────────────────────────────────────────┘
```

On mobile the groups panel collapses above the hand (flex-col).

---

## Mock Data

```ts
// apps/web/src/lib/mockCards.ts
export const MOCK_HAND: Card[] = [
  { id: 'AS', rank: 'A', suit: 'S' },
  { id: 'KH', rank: 'K', suit: 'H' },
  { id: 'QD', rank: 'Q', suit: 'D' },
  { id: 'JC', rank: 'J', suit: 'C' },
  { id: 'TS', rank: 'T', suit: 'S' },
  { id: '9H', rank: '9', suit: 'H' },
  { id: '8D', rank: '8', suit: 'D' },
  { id: '7C', rank: '7', suit: 'C' },
  { id: '6S', rank: '6', suit: 'S' },
  { id: '5H', rank: '5', suit: 'H' },
  { id: '4D', rank: '4', suit: 'D' },
  { id: '3C', rank: '3', suit: 'C' },
  { id: '2S', rank: '2', suit: 'S' },
]
```

---

## Files to Create / Modify

| File                                          | Action                                       |
| --------------------------------------------- | -------------------------------------------- |
| `apps/web/src/pages/Lobby.tsx`                | Remove message form + button                 |
| `apps/web/src/pages/Game.tsx`                 | Rewrite — compose `GameBoard` with mock data |
| `apps/web/src/lib/mockCards.ts`               | **Create** — 13 mock cards constant          |
| `apps/web/src/hooks/useArrangement.ts`        | **Rewrite** — full state hook                |
| `apps/web/src/components/card/Card.tsx`       | **Create**                                   |
| `apps/web/src/components/card/CardBack.tsx`   | **Create**                                   |
| `apps/web/src/components/game/HandArea.tsx`   | **Create**                                   |
| `apps/web/src/components/game/GroupSlot.tsx`  | **Create**                                   |
| `apps/web/src/components/game/GroupPanel.tsx` | **Create**                                   |
| `apps/web/src/components/game/GameBoard.tsx`  | **Create**                                   |

---

## Unit Tests

All tests use Vitest + React Testing Library (already configured).

### `hooks/__tests__/useArrangement.test.ts`

| Test                                                   | Assert                        |
| ------------------------------------------------------ | ----------------------------- |
| `init` populates hand with 13 cards, groups are empty  | hand.length === 13            |
| `selectCard` sets selectedCardId                       | selectedCardId === id         |
| `selectCard(null)` clears selection                    | selectedCardId === null       |
| `assignToGroup` moves card from hand to group          | hand shrinks, group grows     |
| `assignToGroup` is a no-op when group is at capacity   | hand unchanged                |
| `removeFromGroup` returns card to hand                 | group shrinks, hand grows     |
| `isComplete` is false until all groups full            | false for partial arrangement |
| `isComplete` is true when group1=5, group2=5, group3=3 | true                          |
| Assigning same card twice is safe                      | no duplicates                 |

### `components/card/__tests__/Card.test.tsx`

| Test                                           | Assert                                    |
| ---------------------------------------------- | ----------------------------------------- |
| Renders rank and suit symbol                   | `getByText('A')`, `getByText('♠')`        |
| Red suit class applied for Hearts              | has red colour class                      |
| `selected` prop adds a highlight class         | class present                             |
| `onClick` fires when clicked                   | mock fn called                            |
| Does not re-render when unrelated props change | `React.memo` check with `renderCount` ref |

### `components/game/__tests__/GroupSlot.test.tsx`

| Test                                           | Assert             |
| ---------------------------------------------- | ------------------ |
| Shows capacity label                           | "0 / 5"            |
| Renders ghost placeholders for empty positions | n empty slots      |
| Clicking slot calls `onSlotClick`              | mock fn called     |
| Slot click is suppressed when not `isActive`   | mock fn not called |
| Clicking a card inside calls `onCardClick`     | mock fn called     |

### `components/game/__tests__/HandArea.test.tsx`

| Test                                | Assert               |
| ----------------------------------- | -------------------- |
| Renders all cards in hand           | 13 Card elements     |
| Clicking a card calls `onCardClick` | mock fn called       |
| Selected card shows highlight       | selected prop passed |

### `components/game/__tests__/GameBoard.test.tsx`

| Test                                                              | Assert               |
| ----------------------------------------------------------------- | -------------------- |
| Submit button is disabled initially                               | `button` is disabled |
| Submit button enables after filling all groups (via interactions) | `button` enabled     |
| Console.log called with arrangement on submit                     | spy on console.log   |

---

## Out of Scope (next ticket)

- dnd-kit drag-and-drop
- Live hand evaluation labels (e.g. "Royal Flush ✓")
- Foul validation (Group 1 ≥ Group 2)
- Real `game:dealt` socket event integration
- Timer countdown display
