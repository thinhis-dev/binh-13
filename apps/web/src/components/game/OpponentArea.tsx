import { memo } from 'react'
import { CardBack } from '@/components/card/CardBack'

type OpponentAreaProps = {
  opponentSubmitted?: boolean
}

function OpponentAreaComponent({ opponentSubmitted }: OpponentAreaProps) {
  return (
    <section className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
      <h2 className="shrink-0 text-sm font-semibold">Opponent</h2>
      {opponentSubmitted && (
        <span className="shrink-0 text-xs text-green-600">✓ Submitted</span>
      )}
      <div
        aria-label="Opponent has 13 cards"
        className="flex min-w-0 flex-1 items-center overflow-hidden"
      >
        {Array.from({ length: 13 }, (_, index) => (
          <div key={`back-${index}`} className={index === 0 ? '' : '-ml-2'}>
            <CardBack size="xs" />
          </div>
        ))}
      </div>
    </section>
  )
}

export const OpponentArea = memo(OpponentAreaComponent)
