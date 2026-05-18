# Game UI — Layout Fixes + Drag-and-Drop

**Scope:** Three focused changes to the Game screen.  
**Builds on:** `plans/game-ui-arrangement.md` (completed).

---

## 1. Opponent Area — demote to a compact strip

### Problem

`OpponentArea` sits inside the same `flex-col` flow as the main play area, making it visually equal to the player's hand and groups. The opponent's face-down cards are not actionable — they should be secondary context, not compete for attention.

### Solution

Redesign `OpponentArea` as a narrow status bar pinned to the very top of `GameBoard`. Key changes:

- Add an `xs` size to `CardBack` (`h-12 w-8` — about half the current `sm` size).
- Render the 13 face-down cards as tightly-overlapping chips using a negative margin (`-ml-2`). At `xs` size with overlap, the full 13-card strip is ~120px wide — fits in a single line next to the opponent's name.
- The whole component becomes a single slim horizontal bar (no card border, just a subtle background strip), sitting above the main layout but visually subordinate.

**Before (current):**

```
┌─────── Opponent ──────────────────────────────────────────┐  ← prominent box
│ [■][■][■][■][■][■][■][■][■][■][■][■][■]                  │  ← big cards
└───────────────────────────────────────────────────────────┘
┌─────── Hand ──────────────────────────────────────────────┐
...
```

**After:**

```
Opponent  [■■■■■■■■■■■■■]   ← tight single-line strip, small cards, no heavy border
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────── Hand ──────────────────────────────────────────────┐
...
```

### Files to change

| File                               | Change                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `components/card/CardBack.tsx`     | Add `xs: 'h-12 w-8'` to `sizeClass`, update `CardBackProps` |
| `components/game/OpponentArea.tsx` | Rewrite as compact strip; use `xs` size + overlap layout    |

---

## 2. Hand area — no scroll, wrap to multiple rows

### Problem

`HandArea` uses `overflow-x-auto` + `flex` so the 13 cards spill off-screen and require horizontal scrolling. All cards should always be visible.

### Solution

Replace the inner `flex` row with `flex flex-wrap gap-2`. Cards are `w-[5.5rem]` (88px). On a typical laptop screen (1280px+) all 13 fit on one row. On a tablet or phone the row wraps naturally to 2–3 rows. No scrollbar at any viewport size.

Remove `overflow-x-auto` from the wrapper and `min-h-36` from the card container (height becomes content-driven).

Optionally, add a subtle card overlap for a more natural poker-hand feel:

- Use `flex flex-wrap` with each card having a slight negative left margin (`-ml-2`) — this gives the hand a fanned look without hiding any card.
- This is a visual polish option, not required for the fix.

### Files to change

| File                           | Change                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| `components/game/HandArea.tsx` | Remove `overflow-x-auto`, change inner div to `flex flex-wrap gap-2` |

---

## 3. Drag and Drop with dnd-kit

### Install

```bash
pnpm --filter web add @dnd-kit/core @dnd-kit/utilities
```

`@dnd-kit/sortable` is not needed for this phase — cards don't reorder within a group.

### Concept map

```
DndContext (in GameBoard)
│
├── useDraggable  — applied to every Card rendered in HandArea and GroupSlot
│     data: { card: Card, source: 'hand' | GroupKey }
│
└── useDroppable  — applied to each GroupSlot (id = 'group1' | 'group2' | 'group3')
                  — applied to HandArea (id = 'hand')
```

On `DragEndEvent`:

```
const { active, over } = event
if (!over || active.id === over.id) return

const { card, source } = active.data.current
const destination = over.id  // 'group1' | 'group2' | 'group3' | 'hand'

if (source === 'hand' && destination !== 'hand') → assignToGroup(destination, card)
if (source !== 'hand' && destination === 'hand') → removeFromGroup(source, card)
if (source !== 'hand' && destination !== 'hand' && source !== destination)
  → removeFromGroup(source, card) then assignToGroup(destination, card)
```

The existing click-to-assign interaction is **kept** — dnd is additive.

### Drag overlay

Use `DragOverlay` from `@dnd-kit/core` to render a floating copy of the card under the pointer while dragging. Without it, the card disappears from its origin while dragging and there is no visual feedback.

```tsx
// In GameBoard
const [activeCard, setActiveCard] = useState<CardType | null>(null)

// onDragStart → setActiveCard(event.active.data.current.card)
// onDragEnd   → setActiveCard(null) + call hook actions
// onDragCancel → setActiveCard(null)

<DragOverlay>
  {activeCard ? <Card card={activeCard} size="md" /> : null}
</DragOverlay>
```

### Droppable visual feedback

When a card is being dragged over a group slot, highlight it. `useDroppable` returns `isOver` — pass it as a prop to `GroupSlot` alongside the existing `isActive`:

```tsx
// GroupSlot already has isActive (card selected via click)
// Add: isOver?: boolean  →  different highlight colour (e.g. green tint)
```

### Accessibility

dnd-kit handles keyboard DnD by default. No extra work needed. Ensure all draggable items have meaningful `aria-label` (already done via `Card`'s label prop).

### Component changes summary

| File                             | Change                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `components/game/GameBoard.tsx`  | Wrap in `DndContext`, add `DragOverlay`, handle `onDragStart/End/Cancel`, pass `isOver` to `GroupPanel` |
| `components/game/GroupPanel.tsx` | Accept and forward `isOver` per group key to `GroupSlot`                                                |
| `components/game/GroupSlot.tsx`  | Wrap section in `useDroppable`, add `isOver` prop for green highlight                                   |
| `components/game/HandArea.tsx`   | Wrap area in `useDroppable(id='hand')`, pass `isOver` for return-to-hand highlight                      |
| `components/card/Card.tsx`       | Wrap interactive variant in `useDraggable`, pass `data: { card, source }`                               |
| `hooks/useArrangement.ts`        | No changes needed — actions already support the required transitions                                    |

### Type safety for drag data

Define a type in `useArrangement.ts` or a new `dnd.ts` util file:

```ts
export interface DragData {
  card: Card
  source: 'hand' | GroupKey
}
```

Cast in the event handler:

```ts
const data = active.data.current as DragData
```

### Testing notes

dnd-kit drag events are pointer-event based and do not work with `fireEvent` in jsdom. Use `@testing-library/user-event` pointer APIs or mock the dnd-kit hooks. Recommended approach:

- **Unit-test the hook** (`useArrangement`) for all state transitions — already done.
- **Integration-test `GameBoard`** using userEvent for the click path (already done).
- For DnD-specific visual states (`isOver`, `DragOverlay`), write one smoke test that mocks `useDraggable`/`useDroppable` to return fixed values, asserting the correct CSS class is applied.
- Do **not** attempt to simulate full drag sequences in jsdom — it is unreliable and tests the library, not your code.

---

## Implementation order

1. **CardBack `xs` size + OpponentArea strip** — pure visual, no logic, no risk.
2. **HandArea wrap** — one-line CSS change.
3. **Install dnd-kit**.
4. **`DragData` type** — shared type, no deps.
5. **Make `Card` draggable** — add `useDraggable` to the interactive branch only.
6. **Make `GroupSlot` droppable** — add `useDroppable`, `isOver` prop.
7. **Make `HandArea` droppable** — add `useDroppable`.
8. **`GameBoard` wiring** — `DndContext`, `DragOverlay`, `onDragEnd` handler.
9. **`GroupPanel`** — forward `isOver` per slot.
10. **Tests** — mock-based smoke tests for hover states.
