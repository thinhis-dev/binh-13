import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Card, GroupComparison } from '@binh-13/shared'
import { ResultGroupDisplay } from '../ResultGroupDisplay'

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

const fiveCards: Card[] = [
  makeCard('A', 'S'),
  makeCard('K', 'S'),
  makeCard('Q', 'S'),
  makeCard('J', 'S'),
  makeCard('T', 'S'),
]

const opponentFiveCards: Card[] = [
  makeCard('9', 'H'),
  makeCard('8', 'H'),
  makeCard('7', 'H'),
  makeCard('6', 'H'),
  makeCard('5', 'H'),
]

const threeCards: Card[] = [
  makeCard('7', 'S'),
  makeCard('7', 'H'),
  makeCard('7', 'D'),
]

const opponentThreeCards: Card[] = [
  makeCard('A', 'H'),
  makeCard('9', 'D'),
  makeCard('4', 'C'),
]

function makeComparison(
  overrides: Partial<GroupComparison> = {},
): GroupComparison {
  return {
    result: 'p1',
    p1Hand: 'Royal Flush',
    p2Hand: 'Straight Flush',
    p1Foul: false,
    p2Foul: false,
    ...overrides,
  }
}

describe('ResultGroupDisplay', () => {
  it('renders group label', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison()}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    expect(screen.getByText('Back (5)')).toBeInTheDocument()
  })

  it('renders hand descriptions for both players', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison({
          p1Hand: 'Royal Flush',
          p2Hand: 'Straight Flush',
        })}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    expect(screen.getByText('Royal Flush')).toBeInTheDocument()
    expect(screen.getByText('Straight Flush')).toBeInTheDocument()
  })

  it('shows ✓ icon for winning group (mySide wins)', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison({ result: 'p1' })}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    const icon = screen.getByLabelText('Won')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-green-600')
  })

  it('shows ✗ icon for losing group (mySide loses)', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison({ result: 'p2' })}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    const icon = screen.getByLabelText('Lost')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('text-red-500')
  })

  it('shows — icon for drawn group', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison({ result: 'draw' })}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    const icon = screen.getByLabelText('Draw')
    expect(icon).toBeInTheDocument()
  })

  it('renders "You" and "Opponent" labels', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison()}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Opponent')).toBeInTheDocument()
  })

  it('renders correct number of cards for 5-card group', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison()}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    expect(screen.getAllByTestId('playing-card')).toHaveLength(10)
  })

  it('renders correct number of cards for 3-card group', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Front (3)"
        comparison={makeComparison({
          p1Hand: 'Three of a Kind',
          p2Hand: 'High Card',
        })}
        myCards={threeCards}
        opponentCards={opponentThreeCards}
        mySide="p1"
      />,
    )
    expect(screen.getAllByTestId('playing-card')).toHaveLength(6)
  })

  it('cards are displayed with sm size (h-24 w-16)', () => {
    render(
      <ResultGroupDisplay
        groupLabel="Back (5)"
        comparison={makeComparison()}
        myCards={fiveCards}
        opponentCards={opponentFiveCards}
        mySide="p1"
      />,
    )
    const allCards = screen.getAllByTestId('playing-card')
    for (const card of allCards) {
      expect(card).toHaveClass('h-24')
      expect(card).toHaveClass('w-16')
    }
  })
})
