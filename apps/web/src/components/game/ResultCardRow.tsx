import type { Card } from '@binh-13/shared'
import { Card as CardComponent } from '@/components/card/Card'
import { sortCards } from '@/lib/cards'

type ResultCardRowProps = {
  cards: Card[]
  highlightedIds: Set<string>
  outcome: 'win' | 'lose' | 'draw'
}

export function ResultCardRow({
  cards,
  highlightedIds,
  outcome,
}: ResultCardRowProps) {
  const sorted = sortCards(cards)

  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((card) => {
        const highlight =
          outcome !== 'draw' && highlightedIds.has(card.id)
            ? outcome
            : undefined

        return (
          <CardComponent
            key={card.id}
            card={card}
            size="sm"
            highlight={highlight}
          />
        )
      })}
    </div>
  )
}
