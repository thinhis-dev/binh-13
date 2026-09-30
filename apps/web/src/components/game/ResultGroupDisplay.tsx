import type { Card, GroupComparison } from '@binh-13/shared'
import { getHighlightedCardIds } from '@binh-13/shared'
import { CardBack } from '@/components/card/CardBack'
import { ResultCardRow } from './ResultCardRow'

interface ResultGroupDisplayProps {
  groupLabel: string
  comparison: GroupComparison
  myCards: Card[]
  opponentCards: Card[]
  mySide: 'p1' | 'p2'
  /** Before the row is revealed, both players' cards show as card backs, without results. */
  revealed?: boolean
}

function FaceDownRow({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: count }, (_, index) => (
        <CardBack key={`back-${index}`} size="sm" />
      ))}
    </div>
  )
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
  revealed = true,
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
        {revealed && (
          <span aria-label={label} className={`font-bold ${color}`}>
            {symbol}
          </span>
        )}
        <span className="text-sm font-semibold">{groupLabel}</span>
        {revealed && (
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <span>{myHand}</span>
            <span className="mx-1">vs</span>
            <span>{opponentHand}</span>
          </div>
        )}
      </div>

      {/* My cards */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">You</p>
        {revealed
          ? (
              <ResultCardRow
                cards={myCards}
                highlightedIds={myHighlightedIds}
                outcome={myOutcome}
              />
            )
          : <FaceDownRow count={myCards.length} />}
      </div>

      {/* Opponent's cards */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Opponent
        </p>
        {revealed
          ? (
              <ResultCardRow
                cards={opponentCards}
                highlightedIds={opponentHighlightedIds}
                outcome={opponentOutcome}
              />
            )
          : <FaceDownRow count={opponentCards.length} />}
      </div>
    </section>
  )
}
