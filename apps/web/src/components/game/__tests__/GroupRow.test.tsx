import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GroupRow } from '@/components/game/GroupRow'
import { MOCK_HAND } from '@/lib/mockCards'

describe('groupRow', () => {
  it('shows the label, the hand name, and one card for each card in the row', () => {
    render(<GroupRow groupKey="group1" label="Back (5)" cards={MOCK_HAND.slice(0, 5)} handName="Straight" />)

    const row = screen.getByTestId('group-row-group1')
    expect(within(row).getByText('Back (5)')).toBeInTheDocument()
    expect(within(row).getByText('Straight')).toBeInTheDocument()
    expect(within(row).getAllByTestId('playing-card')).toHaveLength(5)
    expect(within(row).queryByTestId('empty-slot')).toBeNull()
  })

  it('renders the cards as draggable handles in deal order', () => {
    render(<GroupRow groupKey="group3" label="Front (3)" cards={MOCK_HAND.slice(10, 13)} handName={null} />)

    const cards = screen.getAllByRole('button')
    expect(cards.map(card => card.getAttribute('data-card-id'))).toEqual(['4D', '3C', '2S'])
    expect(screen.queryByTestId('row-hand-name')).toBeNull()
  })
})
