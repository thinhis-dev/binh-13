import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Card as CardType } from '@binh-13/shared'
import { Card } from '@/components/card/Card'
import { cn } from '@/lib/utils'

type HandAreaProps = {
  cards: CardType[]
  selectedCardId: string | null
  onCardClick: (card: CardType) => void
  isOver?: boolean
}

function HandAreaComponent({
  cards,
  selectedCardId,
  onCardClick,
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
        shouldHighlightDrop && 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/50',
      )}
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Hand</h2>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {cards.map((card) => (
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
