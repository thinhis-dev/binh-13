import type { Card, GroupComparison } from '@binh-13/shared'
import { getHighlightedCardIds } from '@binh-13/shared'
import { ResultCardRow } from './ResultCardRow'

interface ResultGroupDisplayProps {
  groupLabel: string
  comparison: GroupComparison
  myCards: Card[]
  opponentCards: Card[]
  mySide: 'p1' | 'p2'
}

function groupIcon(
  comparison: GroupComparison,
  mySide: 'p1' | 'p2',
): { symbol: string, color: string, label: string } {
  if (comparison.result === mySide)
    return { symbol: '✓', color: 'text-green-600', label: 'Won' }
  if (comparison.result === 'draw')
    return { symbol: '—', color: 'text-muted-foreground', label: 'Draw' }
  return { symbol: '✗', color: 'text-red-500', label: 'Lost' }
}

export function ResultGroupDisplay({
  groupLabel,
  comparison,
  myCards,
  opponentCards,
  mySide,
}: ResultGroupDisplayProps) {
  const { symbol, color, label } = groupIcon(comparison, mySide)

  const myOutcome: 'win' | 'lose' | 'draw'
    = comparison.result === 'draw'
      ? 'draw'
      : comparison.result === mySide
        ? 'win'
        : 'lose'

  const opponentSide = mySide === 'p1' ? 'p2' : 'p1'
  const opponentOutcome: 'win' | 'lose' | 'draw'
    = comparison.result === 'draw'
      ? 'draw'
      : comparison.result === opponentSide
        ? 'win'
        : 'lose'

  const myHand = mySide === 'p1' ? comparison.p1Hand : comparison.p2Hand
  const opponentHand = mySide === 'p1' ? comparison.p2Hand : comparison.p1Hand

  const myHighlightedIds = getHighlightedCardIds(myCards)
  const opponentHighlightedIds = getHighlightedCardIds(opponentCards)

  return (
    <section className="rounded border px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span aria-label={label} className={`font-bold ${color}`}>
          {symbol}
        </span>
        <span className="text-sm font-semibold">{groupLabel}</span>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <span>{myHand}</span>
          <span className="mx-1">vs</span>
          <span>{opponentHand}</span>
        </div>
      </div>

      {/* My cards */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">You</p>
        <ResultCardRow
          cards={myCards}
          highlightedIds={myHighlightedIds}
          outcome={myOutcome}
        />
      </div>

      {/* Opponent's cards */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Opponent
        </p>
        <ResultCardRow
          cards={opponentCards}
          highlightedIds={opponentHighlightedIds}
          outcome={opponentOutcome}
        />
      </div>
    </section>
  )
}
