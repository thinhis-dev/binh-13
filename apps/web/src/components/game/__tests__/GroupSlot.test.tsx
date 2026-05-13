import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GroupSlot } from '@/components/game/GroupSlot'
import { MOCK_HAND } from '@/lib/mockCards'

describe('GroupSlot', () => {
  it('shows capacity and empty placeholders', () => {
    render(
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={[]}
        onCardClick={vi.fn()}
        onSlotClick={vi.fn()}
        isActive
      />,
    )

    expect(screen.getByText('0 / 5 cards')).toBeInTheDocument()
    expect(screen.getAllByTestId('empty-slot')).toHaveLength(5)
  })

  it('calls slot click only while active', () => {
    const handleSlotClick = vi.fn()
    const { rerender } = render(
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={[]}
        onCardClick={vi.fn()}
        onSlotClick={handleSlotClick}
        isActive={false}
      />,
    )

    fireEvent.click(screen.getAllByLabelText('Empty Back (5) slot')[0])
    expect(handleSlotClick).not.toHaveBeenCalled()

    rerender(
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={[]}
        onCardClick={vi.fn()}
        onSlotClick={handleSlotClick}
        isActive
      />,
    )

    fireEvent.click(screen.getAllByLabelText('Empty Back (5) slot')[0])
    expect(handleSlotClick).toHaveBeenCalledTimes(1)
  })

  it('calls card click when a grouped card is clicked', () => {
    const handleCardClick = vi.fn()
    render(
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={[MOCK_HAND[0]]}
        onCardClick={handleCardClick}
        onSlotClick={vi.fn()}
        isActive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /a of spades/i }))

    expect(handleCardClick).toHaveBeenCalledWith(MOCK_HAND[0])
  })

  it('applies droppable hover styling', () => {
    render(
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={[]}
        onCardClick={vi.fn()}
        onSlotClick={vi.fn()}
        isActive={false}
        isOver
      />,
    )

    expect(screen.getByTestId('group-slot-group1')).toHaveClass(
      'border-emerald-500',
    )
  })
})
