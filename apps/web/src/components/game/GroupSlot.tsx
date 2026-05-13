import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Card as CardType } from '@binh-13/shared'
import { Card } from '@/components/card/Card'
import { cn } from '@/lib/utils'
import type { GroupKey } from '@/hooks/useArrangement'

type GroupSlotProps = {
  groupKey: GroupKey
  label: string
  capacity: 5 | 3
  cards: CardType[]
  onCardClick: (card: CardType) => void
  onSlotClick: () => void
  isActive: boolean
  isOver?: boolean
}

function GroupSlotComponent({
  groupKey,
  label,
  capacity,
  cards,
  onCardClick,
  onSlotClick,
  isActive,
  isOver,
}: GroupSlotProps) {
  const { setNodeRef, isOver: droppableIsOver } = useDroppable({
    id: groupKey,
    disabled: cards.length >= capacity,
  })
  const shouldHighlightDrop = isOver ?? droppableIsOver
  const placeholders = Array.from(
    { length: capacity - cards.length },
    (_, index) => index,
  )

  function handleSlotClick() {
    if (isActive) onSlotClick()
  }

  return (
    <section
      ref={setNodeRef}
      data-testid={`group-slot-${groupKey}`}
      className={cn(
        'rounded-md border bg-card p-3 transition',
        isActive && 'border-primary/70 bg-primary/5 ring-1 ring-primary/40',
        shouldHighlightDrop && 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/50',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">
          {cards.length} / {capacity} cards
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            size="sm"
            dragSource={groupKey}
            onClick={() => onCardClick(card)}
          />
        ))}
        {placeholders.map((placeholder) => (
          <button
            key={placeholder}
            type="button"
            aria-label={`Empty ${label} slot`}
            data-testid="empty-slot"
            onClick={handleSlotClick}
            className={cn(
              'h-24 w-16 rounded-md border border-dashed border-border bg-background/70 transition',
              isActive && 'border-primary/60 bg-primary/10',
            )}
          />
        ))}
      </div>
    </section>
  )
}

export const GroupSlot = memo(GroupSlotComponent)
