import type { Card as CardType } from '@binh-13/shared'
import { useDroppable } from '@dnd-kit/core'
import { memo } from 'react'
import { Card } from '@/components/card/Card'
import { cn } from '@/lib/utils'

interface HandAreaProps {
  cards: CardType[]
  selectedCardId: string | null
  onCardClick: (card: CardType) => void
  onSort?: () => void
  isOver?: boolean
}

function HandAreaComponent({
  cards,
  selectedCardId,
  onCardClick,
  onSort,
  isOver,
}: HandAreaProps) {
  const { setNodeRef, isOver: droppableIsOver } = useDroppable({ id: 'hand' })
  const shouldHighlightDrop = isOver ?? droppableIsOver

  return (
    <section
      ref={setNodeRef}
      data-testid="hand-area"
      className={cn(
        'min-w-0 rounded-md border bg-card transition',
        shouldHighlightDrop
        && 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/50',
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Hand</h2>
        {cards.length > 0 && onSort && (
          <button
            type="button"
            onClick={onSort}
            className="rounded px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            Sort
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {cards.map(card => (
            <Card
              key={card.id}
              card={card}
              selected={selectedCardId === card.id}
              dragSource="hand"
              onClick={() => onCardClick(card)}
            />
          ))}
          {cards.length === 0 && (
            <div className="flex min-h-32 flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              All cards assigned
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export const HandArea = memo(HandAreaComponent)
