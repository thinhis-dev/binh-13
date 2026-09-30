import type { Card as CardType } from '@binh-13/shared'
import type { GroupKey } from '@/hooks/useArrangement'
import { memo } from 'react'
import { Card } from '@/components/card/Card'

interface GroupRowProps {
  groupKey: GroupKey
  label: string
  cards: CardType[]
  /** Live hand name, or null when the room hides hand strength. */
  handName: string | null
}

function GroupRowComponent({ groupKey, label, cards, handName }: GroupRowProps) {
  return (
    <section
      data-testid={`group-row-${groupKey}`}
      aria-label={label}
      className="flex flex-col items-center gap-1"
    >
      <div className="flex items-baseline gap-2 text-sm">
        <h3 className="font-semibold">{label}</h3>
        {handName && (
          <span data-testid="row-hand-name" className="text-muted-foreground">
            {handName}
          </span>
        )}
      </div>

      {/* One line at every width: on narrow screens the cards overlap. */}
      <div className="flex flex-nowrap sm:gap-2">
        {cards.map(card => (
          <div key={card.id} className="-ml-3 first:ml-0 sm:ml-0">
            <Card card={card} size="sm" dragSource={groupKey} dropTarget />
          </div>
        ))}
      </div>
    </section>
  )
}

export const GroupRow = memo(GroupRowComponent)
