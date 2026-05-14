import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Card } from '@binh-13/shared'
import { ResultCardRow } from '../ResultCardRow'

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

// 5 cards deliberately out of rank order: 3, A, 9, K, 6
const fiveCards: Card[] = [
  makeCard('3', 'D'),
  makeCard('A', 'S'),
  makeCard('9', 'H'),
  makeCard('K', 'C'),
  makeCard('6', 'S'),
]

describe('ResultCardRow', () => {
  it('renders all cards in the row', () => {
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={new Set()}
        outcome="win"
      />,
    )
    expect(screen.getAllByTestId('playing-card')).toHaveLength(5)
  })

  it('cards are sorted descending by rank (A first, 3 last)', () => {
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={new Set()}
        outcome="win"
      />,
    )
    const cards = screen.getAllByTestId('playing-card')
    // First card = Ace of Spades, last = 3 of Diamonds
    expect(cards[0]).toHaveAttribute('aria-label', 'A of Spades')
    expect(cards[4]).toHaveAttribute('aria-label', '3 of Diamonds')
  })

  it('highlighted cards get highlight="win" when outcome is win', () => {
    const highlightedIds = new Set(['AS', 'KC'])
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={highlightedIds}
        outcome="win"
      />,
    )
    const aceOfSpades = screen.getByRole('img', { name: /a of spades/i })
    const kingOfClubs = screen.getByRole('img', { name: /k of clubs/i })
    expect(aceOfSpades).toHaveClass('ring-green-500')
    expect(kingOfClubs).toHaveClass('ring-green-500')
  })

  it('highlighted cards get highlight="lose" when outcome is lose', () => {
    const highlightedIds = new Set(['AS', 'KC'])
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={highlightedIds}
        outcome="lose"
      />,
    )
    const aceOfSpades = screen.getByRole('img', { name: /a of spades/i })
    expect(aceOfSpades).toHaveClass('ring-red-500')
  })

  it('no cards are highlighted when outcome is draw', () => {
    const highlightedIds = new Set(['AS', 'KC'])
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={highlightedIds}
        outcome="draw"
      />,
    )
    const allCards = screen.getAllByTestId('playing-card')
    for (const card of allCards) {
      expect(card).not.toHaveClass('ring-green-500')
      expect(card).not.toHaveClass('ring-red-500')
    }
  })

  it('cards not in highlighted set have no highlight class', () => {
    const highlightedIds = new Set(['AS', 'KC'])
    render(
      <ResultCardRow
        cards={fiveCards}
        highlightedIds={highlightedIds}
        outcome="win"
      />,
    )
    const nineOfHearts = screen.getByRole('img', { name: /9 of hearts/i })
    const sixOfSpades = screen.getByRole('img', { name: /6 of spades/i })
    expect(nineOfHearts).not.toHaveClass('ring-green-500')
    expect(sixOfSpades).not.toHaveClass('ring-green-500')
  })

  it('works with 3-card groups', () => {
    const threeCards: Card[] = [
      makeCard('7', 'S'),
      makeCard('7', 'H'),
      makeCard('7', 'D'),
    ]
    render(
      <ResultCardRow
        cards={threeCards}
        highlightedIds={new Set()}
        outcome="win"
      />,
    )
    expect(screen.getAllByTestId('playing-card')).toHaveLength(3)
  })
})
